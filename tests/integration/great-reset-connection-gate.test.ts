import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  acquireRunnerLock,
  closeConnectionGate,
  connectionGatePreflight,
  openConnectionGate,
  releaseRunnerLock,
  type ControlIdentity,
} from "../../src/modules/maintenance/repository/great-reset-connection-gate";

/*
  Bağlantı kapısının gerçek PostgreSQL kanıtı (tasarım v20 madde 6). Kapı, üretimdeki gibi
  hedef DB'nin sahibi olan rolle kapatılıp açılır; bu rol süper kullanıcı olmayabilir. Hedef, diğer
  test dosyalarının ortak DB'sini kapatmamak için ayrı bir scratch DB'dir. Scratch DB'yi yalnız
  fixture yönetici rolü (`TEST_ADMIN_DATABASE_URL`, yoksa `TEST_DATABASE_URL`) açar ve düşürür;
  kapı işlemlerine karışmaz, yalnız "başka rolün backend'i" senaryosunda bağlantı açar.
  `GREAT_RESET_REQUIRE_NON_SUPERUSER=1` iken sahip rolün süper kullanıcı olmadığı da doğrulanır.
*/
const ownerUrl = new URL(
  process.env.TEST_DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/agent_sozluk_test",
);
const adminUrl = new URL(process.env.TEST_ADMIN_DATABASE_URL ?? ownerUrl.toString());
const databaseName = `great_reset_gate_${randomBytes(4).toString("hex")}_test`;

function urlFor(base: URL, path: string, limit = "1"): string {
  const url = new URL(base.toString());
  url.pathname = `/${path}`;
  url.search = "";
  url.searchParams.set("connection_limit", limit);
  url.searchParams.set("connect_timeout", "5");
  return url.toString();
}

const admin = new PrismaClient({ datasourceUrl: urlFor(adminUrl, "postgres"), log: [] });
const clients: PrismaClient[] = [];

function client(url: string): PrismaClient {
  const created = new PrismaClient({ datasourceUrl: url, log: [] });
  clients.push(created);
  return created;
}

let identity: ControlIdentity;

beforeAll(async () => {
  const owner = decodeURIComponent(ownerUrl.username);
  if (!/^[a-z_][a-z0-9_]*$/u.test(owner)) throw new Error("TEST_OWNER_INVALID");
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}" OWNER "${owner}"`);
  const control = client(urlFor(ownerUrl, "postgres"));
  const [row] = await control.$queryRaw<
    { user: string; host: string | null; cluster: string; superuser: boolean }[]
  >`
    SELECT current_user AS user, host(inet_server_addr()) AS host,
      (SELECT system_identifier::text FROM pg_control_system()) AS cluster,
      (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS superuser`;
  if (!row?.host) throw new Error("TEST_CONTROL_IDENTITY_UNAVAILABLE");
  if (process.env.GREAT_RESET_REQUIRE_NON_SUPERUSER === "1") expect(row.superuser).toBe(false);
  identity = { clusterId: row.cluster, user: row.user, serverAddresses: [row.host] };
}, 60_000);

afterAll(async () => {
  for (const created of clients) await created.$disconnect().catch(() => undefined);
  await admin.$executeRawUnsafe(`ALTER DATABASE "${databaseName}" WITH ALLOW_CONNECTIONS true`);
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin.$disconnect();
}, 60_000);

async function allowed(): Promise<boolean | undefined> {
  const [row] = await admin.$queryRaw<{ allowed: boolean }[]>`
    SELECT datallowconn AS allowed FROM pg_database WHERE datname = ${databaseName}`;
  return row?.allowed;
}

async function canConnect(url: string): Promise<boolean> {
  const probe = new PrismaClient({ datasourceUrl: url, log: [] });
  try {
    await probe.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await probe.$disconnect().catch(() => undefined);
  }
}

describe("great reset bağlantı kapısı, hedef DB sahibi rolle", () => {
  it("önkontrol sahip rolde temiz; kapı yalnız pinli backend varken kapanır ve açılır", async () => {
    const control = client(`${urlFor(ownerUrl, "postgres")}&max_idle_connection_lifetime=7200`);
    expect(await connectionGatePreflight(control, databaseName)).toEqual([]);
    const target = client(urlFor(ownerUrl, databaseName));
    await acquireRunnerLock(control, databaseName);
    try {
      await target.$transaction(
        async (tx) => {
          const [backend] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
          await closeConnectionGate(control, identity, databaseName, backend!.pid);
          expect(await allowed()).toBe(false);
          // Kapı kapalıyken yeni bağlantı (sahip rolden bile) giremez.
          expect(await canConnect(urlFor(ownerUrl, databaseName))).toBe(false);
        },
        { timeout: 60_000 },
      );
    } finally {
      await openConnectionGate(control, identity, databaseName);
      await releaseRunnerLock(control, databaseName);
    }
    // Sonraki senaryoya açık sahip bağlantısı taşınmaz (Astra, PR #237 P2).
    await target.$disconnect();
    await control.$disconnect();
    expect(await allowed()).toBe(true);
    expect(await canConnect(urlFor(ownerUrl, databaseName))).toBe(true);
  }, 120_000);

  it("başka rolün açık backend'i varsa kapıyı fail-closed reddeder ve yeniden açar", async () => {
    const control = client(`${urlFor(ownerUrl, "postgres")}&max_idle_connection_lifetime=7200`);
    const target = client(urlFor(ownerUrl, databaseName));
    const other = client(urlFor(adminUrl, databaseName));
    await other.$queryRaw`SELECT 1`;
    await acquireRunnerLock(control, databaseName);
    try {
      await expect(
        target.$transaction(
          async (tx) => {
            const [backend] = await tx.$queryRaw<{ pid: number }[]>`
              SELECT pg_backend_pid() AS pid`;
            // Pinli backend dışında tek backend var ve o da BAŞKA roldedir: kapı onu sahip rolün
            // görünürlüğüyle yakalamalı (önceki testten kalan sahip bağlantısı yanlış güven verirdi).
            const sessions = await admin.$queryRaw<{ pid: number; role: string }[]>`
              SELECT pid, usename::text AS role FROM pg_stat_activity
              WHERE datname = ${databaseName} AND pid <> ${backend!.pid}`;
            expect(sessions).toHaveLength(1);
            if (decodeURIComponent(adminUrl.username) !== identity.user)
              expect(sessions[0]!.role).not.toBe(identity.user);
            await closeConnectionGate(control, identity, databaseName, backend!.pid);
          },
          { timeout: 60_000 },
        ),
      ).rejects.toThrow("GREAT_RESET_GATE_OTHER_BACKEND");
    } finally {
      await openConnectionGate(control, identity, databaseName);
      await releaseRunnerLock(control, databaseName);
      await Promise.all([target.$disconnect(), other.$disconnect(), control.$disconnect()]);
    }
    expect(await allowed()).toBe(true);
  }, 120_000);

  it("başka yürütücü kilidi tutarken ikinci yürütücü kapıya dokunmaz", async () => {
    const first = client(`${urlFor(ownerUrl, "postgres")}&max_idle_connection_lifetime=7200`);
    const second = client(`${urlFor(ownerUrl, "postgres")}&max_idle_connection_lifetime=7200`);
    await acquireRunnerLock(first, databaseName);
    try {
      await expect(acquireRunnerLock(second, databaseName)).rejects.toThrow(
        "GREAT_RESET_ANOTHER_RUN_ACTIVE",
      );
      expect(await allowed()).toBe(true);
    } finally {
      await releaseRunnerLock(first, databaseName);
    }
  }, 60_000);

  it("yanlış kimlikli kontrol bağlantısı ALTER DATABASE yapamaz", async () => {
    const control = client(`${urlFor(ownerUrl, "postgres")}&max_idle_connection_lifetime=7200`);
    await acquireRunnerLock(control, databaseName);
    try {
      await expect(
        closeConnectionGate(control, { ...identity, clusterId: "1" }, databaseName, 0),
      ).rejects.toThrow("GREAT_RESET_CONTROL_IDENTITY_MISMATCH");
      expect(await allowed()).toBe(true);
    } finally {
      await releaseRunnerLock(control, databaseName);
    }
  }, 60_000);
});

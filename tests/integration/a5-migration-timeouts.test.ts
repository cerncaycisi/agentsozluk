import { execFile } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { integrationDatabase } from "./database";

/*
  A5: migration'lı dağıtım, migration'dan hemen önce hedef veritabanına
  `ALTER DATABASE … SET lock_timeout / statement_timeout` koyar. Bu testler,
  gerçek `prisma migrate deploy` bağlantısının bu varsayılanları gerçekten
  miras aldığını ölçer (Astra, 23 Eylül). Her durum kendi test veritabanında.
*/

const execFileAsync = promisify(execFile);
const prisma = path.join(process.cwd(), "node_modules/.bin/prisma");

function databaseUrl(name: string): string {
  const url = new URL(process.env.TEST_DATABASE_URL ?? "");
  url.pathname = `/${name}`;
  return url.toString();
}

function migrationProject(migrations: Record<string, string>): string {
  const directory = mkdtempSync(path.join(tmpdir(), "a5-timeout-"));
  writeFileSync(
    path.join(directory, "schema.prisma"),
    'datasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}\n',
  );
  mkdirSync(path.join(directory, "migrations"));
  writeFileSync(
    path.join(directory, "migrations", "migration_lock.toml"),
    'provider = "postgresql"\n',
  );
  for (const [name, sql] of Object.entries(migrations)) {
    mkdirSync(path.join(directory, "migrations", name));
    writeFileSync(path.join(directory, "migrations", name, "migration.sql"), sql);
  }
  return directory;
}

async function migrateDeploy(
  project: string,
  url: string,
): Promise<{ ok: boolean; output: string; ms: number }> {
  const started = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(
      prisma,
      ["migrate", "deploy", "--schema", path.join(project, "schema.prisma")],
      { env: { ...process.env, DATABASE_URL: url }, timeout: 120_000 },
    );
    return { ok: true, output: `${stdout}${stderr}`, ms: Date.now() - started };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return {
      ok: false,
      output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
      ms: Date.now() - started,
    };
  }
}

const projects: string[] = [];

beforeAll(async () => {
  await integrationDatabase.$executeRaw`DROP DATABASE IF EXISTS "agent_sozluk_a5_lock_test" WITH (FORCE)`;
  await integrationDatabase.$executeRaw`DROP DATABASE IF EXISTS "agent_sozluk_a5_stmt_test" WITH (FORCE)`;
  await integrationDatabase.$executeRaw`CREATE DATABASE "agent_sozluk_a5_lock_test" TEMPLATE template0`;
  await integrationDatabase.$executeRaw`CREATE DATABASE "agent_sozluk_a5_stmt_test" TEMPLATE template0`;
  // Yük altındaki CI'da veritabanı açma/kapatma 10 sn'lik varsayılan kanca sınırını aştı.
}, 60_000);

afterAll(async () => {
  for (const project of projects) rmSync(project, { recursive: true, force: true });
  await integrationDatabase.$executeRaw`DROP DATABASE IF EXISTS "agent_sozluk_a5_lock_test" WITH (FORCE)`;
  await integrationDatabase.$executeRaw`DROP DATABASE IF EXISTS "agent_sozluk_a5_stmt_test" WITH (FORCE)`;
  await integrationDatabase.$disconnect();
}, 60_000);

describe("A5 migration zaman aşımları gerçek Prisma bağlantısında", () => {
  it("başka bağlantı kilidi tutarken FK'li migration lock_timeout ile düşer", async () => {
    const url = databaseUrl("agent_sozluk_a5_lock_test");
    const base = {
      "20260101000000_parent": 'CREATE TABLE "parent" ("id" UUID NOT NULL PRIMARY KEY);\n',
    };
    const first = migrationProject(base);
    projects.push(first);
    expect((await migrateDeploy(first, url)).ok).toBe(true);

    await integrationDatabase.$executeRaw`ALTER DATABASE "agent_sozluk_a5_lock_test" SET lock_timeout = '2s'`;
    const second = migrationProject({
      ...base,
      "20260101000001_child":
        'CREATE TABLE "child" ("id" UUID NOT NULL PRIMARY KEY, "parentId" UUID,\n' +
        '  CONSTRAINT "child_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "parent"("id")\n' +
        "  ON DELETE SET NULL ON UPDATE CASCADE);\n",
    });
    projects.push(second);

    // Kilidi tutan oturum ayrı bir istemci; ayar yeni bağlantılara uygulanır.
    const holder = new PrismaClient({ datasourceUrl: url });
    try {
      const result = await holder.$transaction(
        async (transaction) => {
          await transaction.$executeRaw`LOCK TABLE "parent" IN ACCESS EXCLUSIVE MODE`;
          return migrateDeploy(second, url);
        },
        { timeout: 90_000, maxWait: 10_000 },
      );
      expect(result.ok, result.output).toBe(false);
      expect(result.output).toMatch(/lock timeout/iu);
      expect(result.ms).toBeLessThan(60_000);
    } finally {
      await holder.$disconnect();
    }
  }, 120_000);

  it("kilit beklemeyen uzun ifade statement_timeout ile düşer", async () => {
    const url = databaseUrl("agent_sozluk_a5_stmt_test");
    await integrationDatabase.$executeRaw`ALTER DATABASE "agent_sozluk_a5_stmt_test" SET statement_timeout = '1s'`;
    const project = migrationProject({
      "20260101000000_slow": "SELECT pg_sleep(10);\n",
    });
    projects.push(project);
    const result = await migrateDeploy(project, url);
    expect(result.ok, result.output).toBe(false);
    expect(result.output).toMatch(/statement timeout/iu);
    expect(result.ms).toBeLessThan(60_000);
  }, 120_000);
});

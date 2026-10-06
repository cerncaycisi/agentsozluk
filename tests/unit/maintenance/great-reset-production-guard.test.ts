import { describe, expect, it } from "vitest";
import {
  productionResetTarget,
  productionShadowResetTarget,
  rehearsalResetTarget,
  assertResetContainerGeneration,
} from "@/modules/maintenance/domain/great-reset-production-guard";
const sha = "a".repeat(40);
const operationId = "550e8400-e29b-41d4-a716-446655440000";
const invocation = {
  hostname: "agent-sozluk-prod",
  cwd: `/opt/agent-sozluk/runtime/releases/${sha}`,
  releaseSha: sha,
  approvedSha: sha,
  databaseIp: "172.18.0.2",
};
const url = "postgresql://agent_sozluk:fixture@db:5432/agent_sozluk";
describe("stopped container eski yedek açılış sınırı", () => {
  const mount = {
    Type: "bind",
    Source: "/opt/agent-sozluk/reset/generation",
    Destination: "/run/agentsozluk-reset",
    RW: false,
  };
  const container = { restart: "no", generationEnvPresent: true, mounts: [mount] };
  it("yalnız kalıcı readonly generation mount ve restart=no ile ilerler", () => {
    expect(() => assertResetContainerGeneration(container)).not.toThrow();
  });
  it.each([
    { restart: "always" },
    { restart: "unless-stopped" },
    { generationEnvPresent: false },
    { mounts: [] },
    { mounts: [{ ...mount, RW: true }] },
    { mounts: [{ ...mount, Source: "/tmp/replayed-generation" }] },
  ])("recreate edilmemiş veya unsafe container'ı reddeder: %j", (patch) => {
    expect(() => assertResetContainerGeneration({ ...container, ...patch })).toThrow(
      "GREAT_RESET_CONTAINER_GENERATION_REQUIRED",
    );
  });
});
describe("separate production and rehearsal reset target guards", () => {
  it("derives exactly one target and same-host/role postgres control URL", () => {
    const target = productionResetTarget(url, invocation);
    const db = new URL(target.databaseUrl);
    const control = new URL(target.controlUrl);
    expect(db.hostname).toBe("172.18.0.2");
    expect(db.pathname).toBe("/agent_sozluk");
    expect(db.searchParams.get("connection_limit")).toBe("1");
    expect(control.pathname).toBe("/postgres");
    expect(control.hostname).toBe(db.hostname);
    expect(control.username).toBe(db.username);
  });
  it.each([
    { hostname: "agentic-server" },
    { cwd: "/opt/agent-sozluk/runtime/current" },
    { releaseSha: "a" },
    { approvedSha: undefined },
    { approvedSha: "b".repeat(40) },
    { databaseIp: "127.0.0.1" },
    { databaseIp: "46.225.20.177" },
    { databaseIp: "db" },
    { databaseIp: "::1" },
  ])("rejects altered physical/release/approval identity %j", (patch) =>
    expect(() => productionResetTarget(url, { ...invocation, ...patch })).toThrow(/^GREAT_RESET_/u),
  );
  it.each([
    "postgres://agent_sozluk:fixture@db:5432/agent_sozluk",
    "postgresql://agent:fixture@db:5432/agent_sozluk",
    "postgresql://agent_sozluk@db:5432/agent_sozluk",
    "postgresql://agent_sozluk:fixture@127.0.0.1:5432/agent_sozluk",
    "postgresql://agent_sozluk:fixture@db:5433/agent_sozluk",
    "postgresql://agent_sozluk:fixture@db:5432/postgres",
    `${url}?host=46.225.20.177`,
    `${url}?schema=elsewhere`,
    `${url}?options=-c%20session_replication_role%3Dreplica`,
    `${url}#fragment`,
    "postgresql://agent_sozluk:fixture@db:5432/%61gent_sozluk",
    "invalid",
  ])("rejects another URL without importing a DB client: %s", (value) =>
    expect(() => productionResetTarget(value, invocation)).toThrow(/^GREAT_RESET_/u),
  );
  it("allows only a new operation-owned rehearsal DB on the fixed operator cluster", () => {
    const name = `agent_sozluk_reset_${operationId.replaceAll("-", "")}_test`;
    const target = rehearsalResetTarget(
      `postgresql://agent@127.0.0.1:5432/${name}`,
      operationId,
      "agentic-server",
    );
    expect(target.databaseName).toBe(name);
    expect(target.identity.marker).toContain(operationId);
    expect(target.identity.clusterId).toBe("7689521646432264978");
  });
  it.each([
    "agent_sozluk",
    "agent_sozluk_np_test",
    "postgres",
    "agent_sozluk_reset_rehearsal_20261005223130_source_test",
  ])("rejects non-owned rehearsal DB %s", (name) => {
    expect(() =>
      rehearsalResetTarget(
        `postgresql://agent@127.0.0.1:5432/${name}`,
        operationId,
        "agentic-server",
      ),
    ).toThrow("GREAT_RESET_REHEARSAL_TARGET_REQUIRED");
  });
  it("never extends the rehearsal target to the production physical host", () => {
    expect(() => rehearsalResetTarget(url, operationId, "agent-sozluk-prod")).toThrow(
      "GREAT_RESET_REHEARSAL_HOST_REQUIRED",
    );
  });
});

describe("production shadow profile never accepts a free URL or canonical OID", () => {
  it("derives only the nonce database on the pinned production cluster", () => {
    const target = productionShadowResetTarget(url, invocation, operationId, "90000");
    expect(new URL(target.databaseUrl).pathname).toBe(
      "/agent_sozluk_reset_550e8400e29b41d4a716446655440000_test",
    );
    expect(new URL(target.controlUrl).pathname).toBe("/postgres");
    expect(target.identity.clusterId).toBe("7663503447447879713");
    expect(target.identity.marker).toBe(`agentsozluk:production-reset-shadow:${operationId}`);
  });
  it.each(["16385", "0", "", "1;DROP DATABASE agent_sozluk"])(
    "rejects unsafe/canonical OID %s",
    (oid) => expect(() => productionShadowResetTarget(url, invocation, operationId, oid)).toThrow(),
  );
  it("retains every canonical host/runtime/approval/URL gate", () => {
    expect(() =>
      productionShadowResetTarget(
        url,
        { ...invocation, hostname: "agentic-server" },
        operationId,
        "90000",
      ),
    ).toThrow();
    expect(() =>
      productionShadowResetTarget(
        url,
        { ...invocation, approvedSha: undefined },
        operationId,
        "90000",
      ),
    ).toThrow();
    expect(() =>
      productionShadowResetTarget(
        url.replace("/agent_sozluk", "/postgres"),
        invocation,
        operationId,
        "90000",
      ),
    ).toThrow();
  });
});

describe("repository production entrypoints recheck the real host before any connection", () => {
  it("rejects a forged canonical invocation outside the installed production cwd", async () => {
    const { runProductionReset } =
      await import("@/modules/maintenance/repository/great-reset-executor");
    expect(() =>
      runProductionReset(url, invocation, { mode: "MANIFEST", releaseSha: sha }),
    ).toThrow("GREAT_RESET_PRODUCTION_HOST_REQUIRED");
  });
  it("rejects a forged production shadow invocation before any connection", async () => {
    const { runProductionShadowReset } =
      await import("@/modules/maintenance/repository/great-reset-executor");
    expect(() =>
      runProductionShadowReset(url, invocation, operationId, "90000", {
        mode: "MANIFEST",
        releaseSha: sha,
      }),
    ).toThrow("GREAT_RESET_PRODUCTION_HOST_REQUIRED");
  });
});

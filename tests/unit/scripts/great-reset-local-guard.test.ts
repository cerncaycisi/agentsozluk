import { describe, expect, it } from "vitest";
import {
  localResetIdentity,
  localResetTarget,
  parseLocalResetArguments,
} from "../../../scripts/great-reset-local-guard";

const name = "agent_sozluk_reset_rehearsal_20260910120000_execution_test";
const base = `postgresql://gokhannihalgul@127.0.0.1:5432/${name}`;

describe("yerel great reset sınırı", () => {
  it("yalnız ayrılmış sentetik DB ve bilinen Mac'i kabul eder", () => {
    expect(localResetTarget(base, localResetIdentity.hostname).databaseName).toBe(name);
    expect(() => localResetTarget(base, "agent-sozluk-prod")).toThrow(
      "GREAT_RESET_LOCAL_HOST_REQUIRED",
    );
  });

  it.each([
    undefined,
    "invalid",
    "postgresql://agent_sozluk@46.225.20.177:5432/agent_sozluk",
    base.replace(name, "agent_sozluk"),
    base.replace(name, "agent_sozluk_test"),
    base.replace("127.0.0.1", "localhost"),
    base.replace("127.0.0.1", "46.225.20.177"),
    base.replace("5432", "6432"),
    base.replace("postgresql:", "postgres:"),
    base.replace("gokhannihalgul", "agent_sozluk"),
    `${base}?host=46.225.20.177`,
    `${base}?schema=other`,
    `${base}?host=/tmp`,
    `${base}#fragment`,
    `${base}/other_test`,
    base.replace(name, `agent_sozluk/${name}`),
    base.replace(name, `agent_sozluk%2F${name}`),
    base.replace(name, `${name}%00`),
  ])("yanlış/kararsız hedefi bağlantıdan önce reddeder: %s", (url) => {
    expect(() => localResetTarget(url, localResetIdentity.hostname)).toThrow(/GREAT_RESET_/u);
  });

  it("varsayılan dry-run; execute için DB ve tam plan hash'i zorunlu", () => {
    expect(parseLocalResetArguments([])).toEqual({ mode: "DRY_RUN" });
    expect(parseLocalResetArguments(["--dry-run"])).toEqual({ mode: "DRY_RUN" });
    expect(
      parseLocalResetArguments(["--execute", "--database", name, "--plan-sha256", "a".repeat(64)]),
    ).toEqual({ mode: "EXECUTE", databaseName: name, planSha256: "a".repeat(64) });
    for (const args of [
      ["--execute"],
      ["--force"],
      ["--dry-run", "--execute"],
      ["--execute", "--database", name, "--plan-sha256", "abc"],
      ["--execute", "--database", name, "--plan-sha256", "a".repeat(64), "--force"],
    ])
      expect(() => parseLocalResetArguments(args)).toThrow("GREAT_RESET_INVALID_ARGUMENTS");
  });

  it("arşivleme yalnız açık seçimle ve aynı plan onayıyla etkinleşir", () => {
    expect(parseLocalResetArguments(["--archive-outbox"])).toEqual({
      mode: "DRY_RUN",
      archiveOutbox: true,
    });
    expect(parseLocalResetArguments(["--dry-run", "--archive-outbox"])).toEqual({
      mode: "DRY_RUN",
      archiveOutbox: true,
    });
    expect(
      parseLocalResetArguments([
        "--execute",
        "--database",
        name,
        "--plan-sha256",
        "a".repeat(64),
        "--archive-outbox",
      ]),
    ).toEqual({
      mode: "EXECUTE",
      databaseName: name,
      planSha256: "a".repeat(64),
      archiveOutbox: true,
    });
    for (const args of [
      ["--archive-outbox", "--archive-outbox"],
      ["--archive-outbox", "--execute"],
      ["--execute", "--archive-outbox"],
    ])
      expect(() => parseLocalResetArguments(args)).toThrow("GREAT_RESET_INVALID_ARGUMENTS");
  });
});

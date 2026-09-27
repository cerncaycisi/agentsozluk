import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const operationId = "11111111-2222-4333-8444-555555555555";
const releaseSha = "a".repeat(40);
const dumpSha256 = "b".repeat(64);
const receipt = "c".repeat(64);
const directories: string[] = [];

function directory(): string {
  const created = mkdtempSync(join(tmpdir(), "great-reset-ledger-"));
  chmodSync(created, 0o700);
  directories.push(created);
  return created;
}

function run(file: string, ...args: string[]) {
  const result = spawnSync(
    "node_modules/.bin/tsx",
    ["scripts/great-reset-ledger.ts", "--file", file, ...args],
    { encoding: "utf8", timeout: 60_000 },
  );
  return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

afterEach(() => {
  for (const created of directories.splice(0)) rmSync(created, { recursive: true, force: true });
});

describe("great reset dış kayıt yazıcısı", () => {
  it("0600 dosyaya zincirli yazar, geçici dosya veya kilit bırakmaz", () => {
    const dir = directory();
    const file = join(dir, "ledger.jsonl");
    expect(run(file, "append", "PREPARED", operationId, releaseSha, dumpSha256, "-").status).toBe(
      0,
    );
    expect(
      run(file, "append", "COMMITTED_MAINTENANCE", operationId, releaseSha, dumpSha256, receipt)
        .status,
    ).toBe(0);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readdirSync(dir)).toEqual(["ledger.jsonl"]);
    expect(JSON.parse(run(file, "restore-check", operationId, dumpSha256, receipt).stdout)).toEqual(
      {
        eligible: true,
      },
    );
    expect(
      run(file, "append", "TRAFFIC_OPEN", operationId, releaseSha, dumpSha256, receipt).status,
    ).toBe(0);
    const closed = run(file, "restore-check", operationId, dumpSha256, receipt);
    expect(closed.status).toBe(3);
    expect(JSON.parse(closed.stdout)).toEqual({
      eligible: false,
      blockers: ["LEDGER_STATE_TRAFFIC_OPEN"],
    });
    expect(
      run(file, "append", "ROLLED_BACK", operationId, releaseSha, dumpSha256, receipt).stderr,
    ).toBe("GREAT_RESET_LEDGER_TRANSITION_FORBIDDEN");
  }, 120_000);

  it("başkasının okuyabildiği dosyayı/dizini, göreli yolu ve kalmış kilidi reddeder", () => {
    const dir = directory();
    const file = join(dir, "ledger.jsonl");
    expect(run(file, "append", "PREPARED", operationId, releaseSha, dumpSha256, "-").status).toBe(
      0,
    );
    chmodSync(file, 0o644);
    expect(run(file, "show").stderr).toBe("GREAT_RESET_LEDGER_PATH_MODE_INVALID");
    chmodSync(file, 0o600);
    chmodSync(dir, 0o755);
    expect(run(file, "show").stderr).toBe("GREAT_RESET_LEDGER_PATH_MODE_INVALID");
    chmodSync(dir, 0o700);
    expect(run("ledger.jsonl", "show").stderr).toBe("GREAT_RESET_LEDGER_ARGUMENTS_INVALID");
    writeFileSync(`${file}.lock`, "", { mode: 0o600 });
    expect(run(file, "append", "ABORTED", operationId, releaseSha, dumpSha256, "-").stderr).toBe(
      "GREAT_RESET_LEDGER_LOCKED",
    );
  }, 120_000);
});

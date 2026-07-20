import { chmod, link, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  MAX_ROLLOUT_EVIDENCE_BYTES,
  readRolloutEvidenceFile,
} from "../../../scripts/agent-rollout";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agent-rollout-evidence-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("production rollout evidence reader", () => {
  it("reads one bounded JSON object through a mode-0600 regular file", async () => {
    const directory = await temporaryDirectory();
    const evidencePath = path.join(directory, "evidence.json");
    await writeFile(evidencePath, JSON.stringify({ sampleIndex: 2, accepted: true }), {
      mode: 0o600,
    });

    await expect(readRolloutEvidenceFile(evidencePath)).resolves.toEqual({
      sampleIndex: 2,
      accepted: true,
    });
  });

  it("rejects a symlink instead of following it", async () => {
    const directory = await temporaryDirectory();
    const targetPath = path.join(directory, "target.json");
    const evidencePath = path.join(directory, "evidence.json");
    await writeFile(targetPath, "{}", { mode: 0o600 });
    await symlink(targetPath, evidencePath);

    await expect(readRolloutEvidenceFile(evidencePath)).rejects.toThrow(
      /could not be read securely \(ELOOP\)/,
    );
  });

  it("rejects hard links and permissions other than exactly 0600", async () => {
    const directory = await temporaryDirectory();
    const targetPath = path.join(directory, "target.json");
    const hardLinkPath = path.join(directory, "hard-link.json");
    await writeFile(targetPath, "{}", { mode: 0o600 });
    await link(targetPath, hardLinkPath);

    await expect(readRolloutEvidenceFile(hardLinkPath)).rejects.toThrow(
      "mode-0600 single-link regular file",
    );

    await rm(hardLinkPath);
    await chmod(targetPath, 0o400);
    await expect(readRolloutEvidenceFile(targetPath)).rejects.toThrow(
      "mode-0600 single-link regular file",
    );
  });

  it("rejects evidence larger than the fixed read bound", async () => {
    const directory = await temporaryDirectory();
    const evidencePath = path.join(directory, "evidence.json");
    await writeFile(evidencePath, Buffer.alloc(MAX_ROLLOUT_EVIDENCE_BYTES + 1, 0x20), {
      mode: 0o600,
    });

    await expect(readRolloutEvidenceFile(evidencePath)).rejects.toThrow(
      `exceeds ${MAX_ROLLOUT_EVIDENCE_BYTES} bytes`,
    );
  });

  it("does not echo invalid JSON contents in its error", async () => {
    const directory = await temporaryDirectory();
    const evidencePath = path.join(directory, "evidence.json");
    const marker = "do-not-echo-this-content";
    await writeFile(evidencePath, `{\"${marker}\":`, { mode: 0o600 });

    const result = readRolloutEvidenceFile(evidencePath);
    await expect(result).rejects.toThrow("must contain valid JSON");
    await expect(result).rejects.not.toThrow(marker);
  });
});

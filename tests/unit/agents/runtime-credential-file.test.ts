import { chmod, link, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadRuntimeCredentialFile } from "@/runtime/credential-file";

const temporaryRoots: string[] = [];
const credential = `agt_${"x".repeat(43)}`;

async function fixture(): Promise<{ root: string; credentialFile: string; ownership: object }> {
  const root = await realpath(
    await mkdtemp(path.join(tmpdir(), "agent-sozluk-runtime-credential-")),
  );
  temporaryRoots.push(root);
  await chmod(root, 0o750);
  const credentialFile = path.join(root, "credentials.json");
  await writeFile(credentialFile, JSON.stringify({ credentials: [credential] }), { mode: 0o600 });
  if (typeof process.getuid !== "function") throw new Error("POSIX uid is required for this test.");
  const uid = process.getuid();
  return { root, credentialFile, ownership: { directoryUid: uid, fileUid: uid } };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("runtime credential file boundary", () => {
  it("loads a normalized, single-link 0600 file from a trusted 0750 directory", async () => {
    const { credentialFile, ownership } = await fixture();

    await expect(loadRuntimeCredentialFile(credentialFile, ownership)).resolves.toEqual({
      credentialFile,
      credentials: [credential],
    });
  });

  it("fails closed on credential symlinks and hard links", async () => {
    const { root, credentialFile, ownership } = await fixture();
    const symlinkPath = path.join(root, "symlink.json");
    await symlink(credentialFile, symlinkPath);
    await expect(loadRuntimeCredentialFile(symlinkPath, ownership)).rejects.toThrow(/tek bağlı/iu);

    const hardLinkPath = path.join(root, "hard-link.json");
    await link(credentialFile, hardLinkPath);
    await expect(loadRuntimeCredentialFile(credentialFile, ownership)).rejects.toThrow(
      /tek bağlı/iu,
    );
  });

  it("fails closed unless file and directory modes match the production contract", async () => {
    const { root, credentialFile, ownership } = await fixture();
    await chmod(credentialFile, 0o640);
    await expect(loadRuntimeCredentialFile(credentialFile, ownership)).rejects.toThrow(/0600/u);

    await chmod(credentialFile, 0o600);
    await chmod(root, 0o770);
    await expect(loadRuntimeCredentialFile(credentialFile, ownership)).rejects.toThrow(/0750/u);
  });

  it("rejects relative or non-normalized credential paths before reading", async () => {
    await expect(loadRuntimeCredentialFile("credentials.json")).rejects.toThrow(
      /mutlak ve normalize/iu,
    );
  });
});

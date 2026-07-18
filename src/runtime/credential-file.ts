import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const credentialFileSchema = z
  .object({
    credentials: z
      .array(z.string().regex(/^agt_[A-Za-z0-9_-]{40,100}$/u))
      .min(1)
      .max(100),
  })
  .strict();

interface RuntimeCredentialFileOwnership {
  fileUid?: number;
  directoryUid?: number;
}

export async function loadRuntimeCredentialFile(
  inputPath: string,
  ownership: RuntimeCredentialFileOwnership = {},
): Promise<{ credentialFile: string; credentials: string[] }> {
  const credentialFile = path.resolve(inputPath);
  if (credentialFile !== inputPath)
    throw new Error("Runtime credential dosyası mutlak ve normalize bir yol kullanmalıdır.");
  if (typeof process.getuid !== "function")
    throw new Error("Runtime credential sahipliği bu işletim sisteminde doğrulanamıyor.");

  const credentialDirectory = path.dirname(credentialFile);
  const [directoryEntry, fileEntry] = await Promise.all([
    lstat(credentialDirectory),
    lstat(credentialFile),
  ]);
  if (
    !directoryEntry.isDirectory() ||
    directoryEntry.isSymbolicLink() ||
    (await realpath(credentialDirectory)) !== credentialDirectory
  )
    throw new Error("Runtime credential dizini gerçek bir dizin olmalıdır.");
  if ((directoryEntry.mode & 0o777) !== 0o750)
    throw new Error("Runtime credential dizini mode 0750 olmalıdır.");
  if (directoryEntry.uid !== (ownership.directoryUid ?? 0))
    throw new Error("Runtime credential dizininin sahibi root olmalıdır.");

  if (!fileEntry.isFile() || fileEntry.isSymbolicLink() || fileEntry.nlink !== 1)
    throw new Error("Runtime credential dosyası tek bağlı normal bir dosya olmalıdır.");
  if ((fileEntry.mode & 0o777) !== 0o600)
    throw new Error("Runtime credential dosyası mode 0600 olmalıdır.");
  if (fileEntry.uid !== (ownership.fileUid ?? process.getuid()))
    throw new Error("Runtime credential dosyasının sahibi runtime process olmalıdır.");
  if (fileEntry.gid !== directoryEntry.gid)
    throw new Error("Runtime credential dosyası runtime dizini grubunu kullanmalıdır.");

  return {
    credentialFile,
    credentials: credentialFileSchema.parse(JSON.parse(await readFile(credentialFile, "utf8")))
      .credentials,
  };
}

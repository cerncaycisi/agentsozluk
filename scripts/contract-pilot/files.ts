import {
  constants,
  closeSync,
  fstatSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  lstatSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import path from "node:path";

export function hash(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function privateDirectory(directory: string): void {
  const info = lstatSync(directory, { throwIfNoEntry: true });
  if (!info.isDirectory() || (info.mode & 0o077) !== 0 || info.uid !== process.getuid?.())
    throw new Error("PILOT_PRIVATE_DIRECTORY_REQUIRED");
}

export function readPrivate(file: string): string {
  const descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = fstatSync(descriptor);
    if (
      !info.isFile() ||
      info.size > 4_000_000 ||
      (info.mode & 0o077) !== 0 ||
      info.uid !== process.getuid?.()
    )
      throw new Error("PILOT_PRIVATE_FILE_REQUIRED");
    return readFileSync(descriptor, "utf8");
  } finally {
    closeSync(descriptor);
  }
}

/** Rezervasyon diske kalıcı yazılmadan sağlayıcı çağrılmaz. */
export function atomicPrivateJson(file: string, value: unknown): void {
  const temporary = `${file}.${randomUUID()}.tmp`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    try {
      writeFileSync(descriptor, JSON.stringify(value, null, 2) + "\n");
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporary, file);
    const directory = openSync(path.dirname(file), constants.O_RDONLY);
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      /* Yalnız bu çağrının geçici dosyası. */
    }
    throw error;
  }
}

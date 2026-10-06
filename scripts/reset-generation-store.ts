import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { constants, lstatSync, readFileSync, realpathSync } from "node:fs";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { z } from "zod";

const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const state = z.enum([
  "PREPARED",
  "COMMITTED_MAINTENANCE",
  "TRAFFIC_OPEN",
  "ROLLED_BACK",
  "ABORTED",
]);
const binding = z
  .object({
    operationId: z.string().uuid(),
    releaseSha: z.string().regex(/^[a-f0-9]{40}$/u),
    dumpSha256: hash,
    manifestSha256: hash,
    planSha256: hash,
    implementationSha256: hash,
    backupClass: z.literal("PRE_RESET_BIGINT"),
  })
  .strict();
const unsignedEvent = binding
  .extend({
    formatVersion: z.literal(1),
    sequence: z.number().int().positive(),
    previousHmac: hash,
    state,
    recordedAt: z.string().datetime(),
    protectedSha256: hash.optional(),
    restoredDatabaseOid: z
      .string()
      .regex(/^[1-9][0-9]*$/u)
      .optional(),
    clearedCounts: z
      .record(z.string().regex(/^[a-z_]+$/u), z.number().int().nonnegative())
      .optional(),
  })
  .strict();
const eventSchema = unsignedEvent.extend({ hmac: hash });
const journalSchema = z
  .object({ formatVersion: z.literal(1), events: z.array(eventSchema).min(1).max(5) })
  .strict();
export type ResetGenerationBinding = z.infer<typeof binding>;
export type ResetGenerationState = z.infer<typeof state>;
export type ResetGenerationEvent = z.infer<typeof eventSchema>;
export type ResetGenerationJournal = z.infer<typeof journalSchema>;
const zeroHash = "0".repeat(64);
const transitions: Record<ResetGenerationState, readonly ResetGenerationState[]> = {
  PREPARED: ["COMMITTED_MAINTENANCE", "ABORTED"],
  COMMITTED_MAINTENANCE: ["TRAFFIC_OPEN", "ROLLED_BACK"],
  TRAFFIC_OPEN: [],
  ROLLED_BACK: [],
  ABORTED: [],
};

/** HMAC girdisi alan sırasından bağımsız, yalnız strict JSON şeması içindedir. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("GREAT_RESET_GENERATION_FORMAT_INVALID");
  return encoded;
}
function sign(event: z.infer<typeof unsignedEvent>, key: Buffer): string {
  return createHmac("sha256", key).update(canonical(event)).digest("hex");
}
function bindingFields(event: ResetGenerationEvent): ResetGenerationBinding {
  return {
    operationId: event.operationId,
    releaseSha: event.releaseSha,
    dumpSha256: event.dumpSha256,
    manifestSha256: event.manifestSha256,
    planSha256: event.planSha256,
    implementationSha256: event.implementationSha256,
    backupClass: event.backupClass,
  };
}
function sameHash(a: string, b: string): boolean {
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
function fail(code: string): never {
  throw new Error(code);
}

export function verifyResetGeneration(value: unknown, key: Buffer): ResetGenerationJournal {
  if (key.length !== 32) return fail("GREAT_RESET_GENERATION_KEY_INVALID");
  const parsed = journalSchema.safeParse(value);
  if (!parsed.success) return fail("GREAT_RESET_GENERATION_FORMAT_INVALID");
  const journal = parsed.data;
  const first = journal.events[0]!;
  if (first.state !== "PREPARED") return fail("GREAT_RESET_GENERATION_TRANSITION_INVALID");
  for (let i = 0; i < journal.events.length; i++) {
    const event = journal.events[i]!;
    const { hmac, ...unsigned } = event;
    const prior = journal.events[i - 1];
    if (
      event.sequence !== i + 1 ||
      event.previousHmac !== (prior?.hmac ?? zeroHash) ||
      !sameHash(hmac, sign(unsigned, key))
    )
      return fail("GREAT_RESET_GENERATION_SIGNATURE_INVALID");
    if (canonical(bindingFields(event)) !== canonical(bindingFields(first)))
      return fail("GREAT_RESET_GENERATION_BINDING_MISMATCH");
    if (prior && !transitions[prior.state].includes(event.state))
      return fail("GREAT_RESET_GENERATION_TRANSITION_INVALID");
    if ((event.state === "ROLLED_BACK") !== (event.restoredDatabaseOid !== undefined))
      return fail("GREAT_RESET_GENERATION_RESTORE_OID_REQUIRED");
    if (
      (event.state === "PREPARED" || event.state === "ABORTED") &&
      (event.protectedSha256 || event.clearedCounts)
    )
      return fail("GREAT_RESET_GENERATION_COMMIT_PROOF_UNEXPECTED");
    if (event.state === "COMMITTED_MAINTENANCE" && (!event.protectedSha256 || !event.clearedCounts))
      return fail("GREAT_RESET_GENERATION_COMMIT_PROOF_REQUIRED");
    if (
      prior &&
      prior.state === "COMMITTED_MAINTENANCE" &&
      (event.protectedSha256 !== prior.protectedSha256 ||
        event.clearedCounts === undefined ||
        canonical(event.clearedCounts) !== canonical(prior.clearedCounts))
    )
      return fail("GREAT_RESET_GENERATION_BINDING_MISMATCH");
  }
  return journal;
}

function checkDirectory(path: string): void {
  if (!isAbsolute(path) || realpathSync(path) !== path)
    fail("GREAT_RESET_GENERATION_PRIVATE_PATH_REQUIRED");
  const owner = process.getuid?.();
  const leaf = lstatSync(path);
  if (
    !leaf.isDirectory() ||
    leaf.isSymbolicLink() ||
    leaf.uid !== owner ||
    (leaf.mode & 0o777) !== 0o700
  )
    fail("GREAT_RESET_GENERATION_PRIVATE_PATH_REQUIRED");
  for (let parent = dirname(path); ; parent = dirname(parent)) {
    const s = lstatSync(parent);
    if (
      !s.isDirectory() ||
      s.isSymbolicLink() ||
      s.mode & 0o022 ||
      (s.uid !== 0 && s.uid !== owner)
    )
      fail("GREAT_RESET_GENERATION_PRIVATE_PATH_REQUIRED");
    if (parent === "/") break;
  }
}
function readPrivate(path: string): Buffer {
  const s = lstatSync(path);
  if (
    !s.isFile() ||
    s.isSymbolicLink() ||
    s.uid !== process.getuid?.() ||
    (s.mode & 0o777) !== 0o600 ||
    s.size > 1_048_576
  )
    fail("GREAT_RESET_GENERATION_PRIVATE_FILE_REQUIRED");
  return readFileSync(path);
}
async function syncDirectory(path: string) {
  const directory = await open(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

/** Anahtar operator-private, dump dışında kalır; hiçbir API anahtar baytlarını döndürmez. */
export async function initializeResetGenerationStore(directory: string): Promise<void> {
  await mkdir(directory, { mode: 0o700 });
  checkDirectory(directory);
  const keyPath = join(directory, "key");
  const file = await open(
    keyPath,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await file.writeFile(randomBytes(32));
    await file.sync();
  } finally {
    await file.close();
  }
  await syncDirectory(directory);
}
function decodeJournal(bytes: Buffer, key: Buffer): ResetGenerationJournal {
  const text = bytes.toString("utf8");
  if (!text.endsWith("\n") || text.includes("\r"))
    return fail("GREAT_RESET_GENERATION_FORMAT_INVALID");
  try {
    const lines = text.slice(0, -1).split("\n");
    const events = lines.map((line) => {
      const event: unknown = JSON.parse(line);
      if (canonical(event) !== line) fail("GREAT_RESET_GENERATION_FORMAT_INVALID");
      return event;
    });
    return verifyResetGeneration({ formatVersion: 1, events }, key);
  } catch (error) {
    if (error instanceof Error && /^GREAT_RESET_/u.test(error.message)) throw error;
    return fail("GREAT_RESET_GENERATION_FORMAT_INVALID");
  }
}
export function readResetGenerationStore(directory: string): ResetGenerationJournal {
  return readResetGenerationProof(directory).journal;
}
export function readResetGenerationProof(directory: string): {
  journal: ResetGenerationJournal;
  journalSha256: string;
} {
  checkDirectory(directory);
  const bytes = readPrivate(join(directory, "journal.jsonl"));
  const journal = decodeJournal(bytes, readPrivate(join(directory, "key")));
  return { journal, journalSha256: createHash("sha256").update(bytes).digest("hex") };
}

/** fsync → atomic rename → directory fsync → reread/HMAC. Kilit veya hata için retry yok. */
export async function appendResetGeneration(
  directory: string,
  expectedPreviousHmac: string | null,
  value: ResetGenerationBinding & {
    state: ResetGenerationState;
    protectedSha256?: string;
    restoredDatabaseOid?: string;
    clearedCounts?: Record<string, number>;
  },
): Promise<{ journalSha256: string; event: ResetGenerationEvent }> {
  checkDirectory(directory);
  const key = readPrivate(join(directory, "key"));
  if (key.length !== 32) fail("GREAT_RESET_GENERATION_KEY_INVALID");
  const lockPath = join(directory, "write.lock");
  let lock;
  try {
    lock = await open(
      lockPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
  } catch {
    return fail("GREAT_RESET_GENERATION_BUSY");
  }
  const lockIdentity = await lock.stat();
  let temporary: string | null = null;
  try {
    let prior: ResetGenerationJournal | null = null;
    let exists = true;
    try {
      lstatSync(join(directory, "journal.jsonl"));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") exists = false;
      else throw error;
    }
    const prefix = exists ? readPrivate(join(directory, "journal.jsonl")) : Buffer.alloc(0);
    if (exists) prior = decodeJournal(prefix, key);
    const previous = prior?.events.at(-1);
    if ((previous?.hmac ?? null) !== expectedPreviousHmac)
      fail("GREAT_RESET_GENERATION_STALE_PREFIX");
    const unsigned = unsignedEvent.parse({
      ...value,
      formatVersion: 1,
      sequence: (previous?.sequence ?? 0) + 1,
      previousHmac: previous?.hmac ?? zeroHash,
      recordedAt: new Date().toISOString(),
    });
    const event = { ...unsigned, hmac: sign(unsigned, key) };
    const next = verifyResetGeneration(
      { formatVersion: 1, events: [...(prior?.events ?? []), event] },
      key,
    );
    const bytes = Buffer.concat([prefix, Buffer.from(`${canonical(event)}\n`)]);
    if (canonical(decodeJournal(bytes, key)) !== canonical(next))
      fail("GREAT_RESET_GENERATION_PREFIX_MISMATCH");
    temporary = join(directory, `journal.${randomUUID()}.tmp`);
    const file = await open(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, join(directory, "journal.jsonl"));
    temporary = null;
    await syncDirectory(directory);
    const reread = readResetGenerationStore(directory);
    if (canonical(reread) !== canonical(next)) fail("GREAT_RESET_GENERATION_REREAD_MISMATCH");
    return {
      journalSha256: createHash("sha256").update(bytes).digest("hex"),
      event: reread.events.at(-1)!,
    };
  } finally {
    if (temporary) await unlink(temporary);
    await lock.close();
    const current = lstatSync(lockPath);
    if (current.ino !== lockIdentity.ino || current.dev !== lockIdentity.dev)
      fail("GREAT_RESET_GENERATION_LOCK_CHANGED");
    await unlink(lockPath);
    await syncDirectory(directory);
  }
}

/** Yalnız dış nesil kapısı: DB/dump/gölge/identity kapıları ayrıca ölçülmek zorundadır. */
export function requirePreResetRestoreGeneration(
  directory: string,
  expected: ResetGenerationBinding,
): ResetGenerationEvent {
  const current = readResetGenerationStore(directory).events.at(-1)!;
  if (
    current.state !== "COMMITTED_MAINTENANCE" ||
    canonical(bindingFields(current)) !== canonical(binding.parse(expected))
  )
    return fail("GREAT_RESET_PRE_RESET_RESTORE_FORBIDDEN");
  return current;
}

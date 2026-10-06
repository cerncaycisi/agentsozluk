import { constants, lstatSync, readFileSync, realpathSync } from "node:fs";
import { open, rename, unlink } from "node:fs/promises";
import { hostname } from "node:os";
import {
  resetGenerationMirrorSchema,
  resetMirrorDatabaseOid,
  type ResetGenerationMirror,
} from "../src/modules/maintenance/domain/reset-generation-admission";
import { readResetGenerationProof } from "./reset-generation-store";
import { latchProductionResetCompose } from "./reset-production-boot-guard";

const latchSchema = resetGenerationMirrorSchema.omit({
  state: true,
  journalSha256: true,
  clearedCounts: true,
  restoredDatabaseOid: true,
});
export function resetGenerationLatchFromMirror(mirror: ResetGenerationMirror) {
  return latchSchema.strip().parse(mirror);
}
function same(value: unknown, other: unknown): boolean {
  return JSON.stringify(value) === JSON.stringify(other);
}
/** Payload yalnız HMAC doğrulanmış canlı operator store'dan türetilir; key dışarı çıkmaz. */
export function resetGenerationMirrorFromStore(
  directory: string,
  identity: Pick<ResetGenerationMirror, "databaseName" | "databaseOid" | "clusterId">,
): ResetGenerationMirror {
  const proof = readResetGenerationProof(directory);
  const current = proof.journal.events.at(-1)!;
  if (
    current.state !== "COMMITTED_MAINTENANCE" &&
    current.state !== "TRAFFIC_OPEN" &&
    current.state !== "ROLLED_BACK"
  )
    throw new Error("GREAT_RESET_GENERATION_MIRROR_STATE_INVALID");
  const mirror = resetGenerationMirrorSchema.parse({
    formatVersion: 1,
    ...identity,
    operationId: current.operationId,
    releaseSha: current.releaseSha,
    manifestSha256: current.manifestSha256,
    planSha256: current.planSha256,
    dumpSha256: current.dumpSha256,
    journalSha256: proof.journalSha256,
    state: current.state,
    clearedCounts: current.clearedCounts,
    ...(current.restoredDatabaseOid === undefined
      ? {}
      : { restoredDatabaseOid: current.restoredDatabaseOid }),
  });
  resetMirrorDatabaseOid(mirror);
  return mirror;
}
/** Root latch geri alınamaz; terminal durum veya binding değişimi yayımlanmaz. */
export function assertResetMirrorPublication(
  prior: ResetGenerationMirror | null,
  required: unknown | null,
  next: ResetGenerationMirror,
): void {
  resetMirrorDatabaseOid(next);
  if (required !== null && !same(latchSchema.parse(required), resetGenerationLatchFromMirror(next)))
    throw new Error("GREAT_RESET_GENERATION_BINDING_MISMATCH");
  if (!prior) {
    if (required !== null || next.state !== "COMMITTED_MAINTENANCE")
      throw new Error("GREAT_RESET_GENERATION_MIRROR_STATE_INVALID");
    return;
  }
  if (
    required === null ||
    !same(resetGenerationLatchFromMirror(prior), resetGenerationLatchFromMirror(next)) ||
    !same(prior.clearedCounts, next.clearedCounts)
  )
    throw new Error("GREAT_RESET_GENERATION_BINDING_MISMATCH");
  if (same(prior, next)) return;
  if (prior.state !== "COMMITTED_MAINTENANCE" || next.state === "COMMITTED_MAINTENANCE")
    throw new Error("GREAT_RESET_GENERATION_MIRROR_STATE_INVALID");
}
function rootFile(path: string): string {
  const stat = lstatSync(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.uid !== 0 ||
    stat.mode & 0o022 ||
    stat.size > 65536 ||
    realpathSync(path) !== path
  )
    throw new Error("GREAT_RESET_GENERATION_MIRROR_INVALID");
  return readFileSync(path, "utf8");
}
function optionalRootJson(path: string): unknown | null {
  try {
    return JSON.parse(rootFile(path));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}
async function syncDirectory(path: string) {
  const fd = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    await fd.sync();
  } finally {
    await fd.close();
  }
}
/** Çağıran DB admission'ı ve tam host freeze'i doğrular; burada yalnız sabit root yayını vardır. */
export async function publishProductionResetMirror(value: unknown): Promise<void> {
  const next = resetGenerationMirrorSchema.parse(value);
  const directory = "/opt/agent-sozluk/reset/generation";
  if (
    process.getuid?.() !== 0 ||
    hostname() !== "agent-sozluk-prod" ||
    process.cwd() !==
      `/opt/agent-sozluk/runtime/releases/${process.env.AGENT_SOZLUK_PRODUCTION_APPROVED_SHA}` ||
    next.databaseName !== "agent_sozluk" ||
    next.databaseOid !== "16385" ||
    next.clusterId !== "7663503447447879713"
  )
    throw new Error("GREAT_RESET_GENERATION_PUBLICATION_HOST_REQUIRED");
  for (const parent of ["/", "/opt", "/opt/agent-sozluk", "/opt/agent-sozluk/reset", directory]) {
    const stat = lstatSync(parent);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.uid !== 0 ||
      stat.mode & 0o022 ||
      realpathSync(parent) !== parent
    )
      throw new Error("GREAT_RESET_GENERATION_MIRROR_INVALID");
  }
  const lockPath = `${directory}/publish.lock`;
  const lock = await open(
    lockPath,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  const lockStat = await lock.stat();
  try {
    const priorValue = optionalRootJson(`${directory}/current.json`);
    const prior = priorValue === null ? null : resetGenerationMirrorSchema.parse(priorValue);
    const required = optionalRootJson(`${directory}/required.json`);
    assertResetMirrorPublication(prior, required, next);
    // Güç kesilirse required var/mirror yok durumu fail-closed'dur. Bu adım otomatik tekrarlanmaz.
    if (required === null) {
      const file = await open(
        `${directory}/required.json`,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o444,
      );
      try {
        await file.writeFile(JSON.stringify(resetGenerationLatchFromMirror(next)) + "\n");
        await file.chmod(0o444);
        await file.sync();
      } finally {
        await file.close();
      }
      await syncDirectory(directory);
    }
    const temporary = `${directory}/current.${next.journalSha256}.tmp`;
    const file = await open(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o444,
    );
    try {
      await file.writeFile(JSON.stringify(next) + "\n");
      await file.chmod(0o444);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, `${directory}/current.json`);
    await syncDirectory(directory);
    if (
      !same(
        resetGenerationMirrorSchema.parse(JSON.parse(rootFile(`${directory}/current.json`))),
        next,
      )
    )
      throw new Error("GREAT_RESET_GENERATION_REREAD_MISMATCH");
    await latchProductionResetCompose();
  } finally {
    await lock.close();
    const current = lstatSync(lockPath);
    if (current.ino !== lockStat.ino || current.dev !== lockStat.dev)
      throw new Error("GREAT_RESET_GENERATION_LOCK_CHANGED");
    await unlink(lockPath);
    await syncDirectory(directory);
  }
}
export const resetGenerationLatchSchema = latchSchema;

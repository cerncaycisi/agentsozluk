import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { hostname } from "node:os";
import { dirname } from "node:path";
import { parseEnv } from "node:util";
import { z } from "zod";
import { productionResetTarget } from "../src/modules/maintenance/domain/great-reset-production-guard";
import { resetImplementationHash } from "./reset-implementation-hash";
import { measureResetFreezeInventory, resetFreezeInventorySchema } from "./reset-freeze-inventory";
import { resetGenerationMirrorSchema } from "../src/modules/maintenance/domain/reset-generation-admission";
import { publishProductionResetMirror } from "./reset-generation-mirror";
import {
  installProductionResetBootGuard,
  releaseProductionResetBootHold,
} from "./reset-production-boot-guard";

const sha = z.string().regex(/^[a-f0-9]{40}$/u);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const uuid = z.string().uuid();
const context = z
  .object({
    operationId: uuid,
    releaseSha: sha,
    manifestSha256: hash,
    implementationSha256: hash,
    databaseOid: z.literal("16385"),
    clusterId: z.literal("7663503447447879713"),
  })
  .strict();
const requestSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("INSTALL_BOOT_GUARD"), releaseSha: sha, operationId: uuid }).strict(),
  z
    .object({
      mode: z.literal("RELEASE_BOOT_HOLD"),
      releaseSha: sha,
      operationId: uuid,
      mirror: resetGenerationMirrorSchema,
    })
    .strict(),
  z
    .object({
      mode: z.literal("PUBLISH_GENERATION"),
      releaseSha: sha,
      operationId: uuid,
      mirror: resetGenerationMirrorSchema,
    })
    .strict(),
  z.object({ mode: z.literal("MANIFEST"), releaseSha: sha, operationId: uuid }).strict(),
  z.object({ mode: z.literal("PREPARE_INTENT"), releaseSha: sha, operationId: uuid }).strict(),
  z.object({ mode: z.literal("INVALIDATE_INTENT"), releaseSha: sha, operationId: uuid }).strict(),
  z.object({ mode: z.literal("PREVIEW"), releaseSha: sha, context }).strict(),
  z.object({ mode: z.literal("EXECUTE"), releaseSha: sha, context, planSha256: hash }).strict(),
  z
    .object({
      mode: z.literal("EXPOSURE"),
      releaseSha: sha,
      operationId: uuid,
      journalSha256: hash,
    })
    .strict(),
]);
const envelopeSchema = z
  .object({
    implementationSha256: hash,
    request: requestSchema,
    profile: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("CANONICAL") }).strict(),
      z
        .object({
          kind: z.literal("PRODUCTION_SHADOW"),
          databaseOid: z
            .string()
            .regex(/^[1-9][0-9]*$/u)
            .refine((value) => value !== "16385"),
        })
        .strict(),
    ]),
    sourcePins: z
      .object({
        databaseContainerId: z.literal(
          "e6458148f76acf7eed221e81499f456bbad683f8711ef49e880bae3fa1661d92",
        ),
        databaseImageId: z.literal(
          "sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777",
        ),
        appContainerId: hash,
        appImageId: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
        freezeInventorySha256: hash,
      })
      .strict(),
  })
  .strict();

function privateFile(path: string, trustedUid = 0): string {
  const stat = lstatSync(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.uid !== trustedUid ||
    (stat.mode & 0o777) !== 0o600 ||
    realpathSync(path) !== path
  )
    throw new Error("GREAT_RESET_PRIVATE_FILE_REQUIRED");
  for (let parent = dirname(path); parent !== "/"; parent = dirname(parent)) {
    const directory = lstatSync(parent);
    if (
      !directory.isDirectory() ||
      directory.isSymbolicLink() ||
      (directory.uid !== 0 && directory.uid !== trustedUid) ||
      directory.mode & 0o022
    )
      throw new Error("GREAT_RESET_PRIVATE_PARENT_REQUIRED");
  }
  return readFileSync(path, "utf8");
}
function docker(id: string) {
  // Env/headers/credentials yok; yalnız pin, durum, ağ ve volume adları.
  const raw = execFileSync(
    "/usr/bin/docker",
    [
      "inspect",
      id,
      "--format",
      '{"id":{{json .Id}},"image":{{json .Image}},"running":{{json .State.Running}},"networks":{{json .NetworkSettings.Networks}},"mounts":{{json .Mounts}}}',
    ],
    { encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "pipe"] },
  );
  return z
    .object({
      id: z.string(),
      image: z.string(),
      running: z.boolean(),
      networks: z.record(z.string(), z.object({ IPAddress: z.string() })),
      mounts: z.array(
        z.object({ Type: z.string(), Name: z.string().optional(), Destination: z.string() }),
      ),
    })
    .parse(JSON.parse(raw));
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== "--release-sha" || args[2] !== "--request")
    throw new Error("GREAT_RESET_INVALID_ARGUMENTS");
  const releaseSha = sha.parse(args[1]);
  const file = args[3]!;
  const cwd = process.cwd();
  if (
    hostname() !== "agent-sozluk-prod" ||
    cwd !== `/opt/agent-sozluk/runtime/releases/${releaseSha}` ||
    realpathSync(cwd) !== cwd ||
    readFileSync(`${cwd}/.release-sha`, "utf8").trim() !== releaseSha ||
    process.env.AGENT_SOZLUK_PRODUCTION_APPROVED_SHA !== releaseSha
  )
    throw new Error("GREAT_RESET_PRODUCTION_RELEASE_REQUIRED");
  if (!/^\/opt\/agent-sozluk\/reset\/[a-f0-9-]{36}\/request\.[A-Z_]+\.json$/u.test(file))
    throw new Error("GREAT_RESET_PRIVATE_FILE_REQUIRED");
  const envelope = envelopeSchema.parse(JSON.parse(privateFile(file)));
  const request = envelope.request;
  const operationId = "context" in request ? request.context.operationId : request.operationId;
  if (
    file !== `/opt/agent-sozluk/reset/${operationId}/request.${request.mode}.json` ||
    request.releaseSha !== releaseSha
  )
    throw new Error("GREAT_RESET_CONFIRMATION_MISMATCH");
  if (
    resetImplementationHash(cwd) !== envelope.implementationSha256 ||
    ("context" in request && request.context.implementationSha256 !== envelope.implementationSha256)
  )
    throw new Error("GREAT_RESET_IMPLEMENTATION_CHANGED");
  const freezeBytes = privateFile(`/opt/agent-sozluk/reset/${operationId}/freeze-inventory.json`);
  const bootstrapSetup = request.mode === "INSTALL_BOOT_GUARD";
  const recordedInventory = resetFreezeInventorySchema.parse(JSON.parse(freezeBytes));
  if (
    createHash("sha256").update(freezeBytes).digest("hex") !==
      envelope.sourcePins.freezeInventorySha256 ||
    JSON.stringify(recordedInventory) !==
      JSON.stringify(measureResetFreezeInventory(bootstrapSetup))
  )
    throw new Error("GREAT_RESET_FREEZE_INVENTORY_CHANGED");
  if (
    !bootstrapSetup &&
    (recordedInventory.bootstrapHold?.operationId !== operationId ||
      recordedInventory.bootstrapHold.releaseSha !== releaseSha)
  )
    throw new Error("GREAT_RESET_BOOT_HOLD_INVALID");
  const db = docker(envelope.sourcePins.databaseContainerId);
  const app = docker(envelope.sourcePins.appContainerId);
  if (
    db.id !== envelope.sourcePins.databaseContainerId ||
    db.image !== envelope.sourcePins.databaseImageId ||
    !db.running ||
    app.id !== envelope.sourcePins.appContainerId ||
    app.image !== envelope.sourcePins.appImageId ||
    app.running ||
    !db.mounts.some(
      (m) =>
        m.Type === "volume" &&
        m.Name === "agent-sozluk_postgres_data" &&
        m.Destination === "/var/lib/postgresql/data",
    )
  )
    throw new Error("GREAT_RESET_CONTAINER_IDENTITY_MISMATCH");
  const label = execFileSync(
    "/usr/bin/docker",
    [
      "image",
      "inspect",
      app.image,
      "--format",
      '{{index .Config.Labels "org.opencontainers.image.revision"}}',
    ],
    { encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
  if (label !== releaseSha) throw new Error("GREAT_RESET_PRODUCTION_RELEASE_REQUIRED");
  const ips = Object.values(db.networks)
    .map((n) => n.IPAddress)
    .filter(Boolean);
  if (ips.length !== 1) throw new Error("GREAT_RESET_PRODUCTION_DATABASE_IP_REQUIRED");
  // .env tek credential kaynağı; shell DATABASE_URL, AGENT_DB_IP veya başka dosya yüklenmez.
  if (
    execFileSync("/usr/bin/id", ["-u", "deploy"], { encoding: "utf8", timeout: 5000 }).trim() !==
    "1000"
  )
    throw new Error("GREAT_RESET_CREDENTIAL_OWNER_CHANGED");
  const value = parseEnv(privateFile("/opt/agent-sozluk/app/.env", 1000)).DATABASE_URL;
  const invocation = {
    hostname: hostname(),
    cwd,
    releaseSha,
    approvedSha: process.env.AGENT_SOZLUK_PRODUCTION_APPROVED_SHA,
    databaseIp: ips[0]!,
  };
  productionResetTarget(value, invocation);
  const {
    runProductionReset,
    runProductionShadowReset,
    verifyProductionResetMirror,
    assertProductionResetFreeze,
  } = await import("../src/modules/maintenance/repository/great-reset-executor");
  if (request.mode === "INSTALL_BOOT_GUARD") {
    if (envelope.profile.kind !== "CANONICAL") throw new Error("GREAT_RESET_CONFIRMATION_MISMATCH");
    await assertProductionResetFreeze(value, invocation);
    await installProductionResetBootGuard(operationId, releaseSha);
    process.stdout.write(
      JSON.stringify({ event: "GREAT_RESET_BOOT_GUARD_INSTALLED", operationId, releaseSha }) + "\n",
    );
    return;
  }
  if (request.mode === "RELEASE_BOOT_HOLD") {
    if (
      envelope.profile.kind !== "CANONICAL" ||
      request.mirror.operationId !== operationId ||
      request.mirror.releaseSha !== releaseSha
    )
      throw new Error("GREAT_RESET_CONFIRMATION_MISMATCH");
    await verifyProductionResetMirror(value, invocation, request.mirror);
    await releaseProductionResetBootHold(request.mirror);
    process.stdout.write(
      JSON.stringify({
        event: "GREAT_RESET_BOOT_HOLD_RELEASED",
        operationId,
        state: request.mirror.state,
      }) + "\n",
    );
    return;
  }
  if (request.mode === "PUBLISH_GENERATION") {
    if (
      envelope.profile.kind !== "CANONICAL" ||
      request.mirror.operationId !== operationId ||
      request.mirror.releaseSha !== releaseSha
    )
      throw new Error("GREAT_RESET_CONFIRMATION_MISMATCH");
    await verifyProductionResetMirror(value, invocation, request.mirror);
    await publishProductionResetMirror(request.mirror);
    process.stdout.write(
      JSON.stringify({
        event: "GREAT_RESET_GENERATION_MIRROR_PUBLISHED",
        operationId,
        state: request.mirror.state,
        journalSha256: request.mirror.journalSha256,
      }) + "\n",
    );
    return;
  }
  const result =
    envelope.profile.kind === "CANONICAL"
      ? await runProductionReset(value, invocation, request)
      : await runProductionShadowReset(
          value,
          invocation,
          operationId,
          envelope.profile.databaseOid,
          request,
        );
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
void main().catch((error: unknown) => {
  const code =
    error instanceof Error && /^GREAT_RESET_[A-Z_]+$/u.test(error.message)
      ? error.message
      : "GREAT_RESET_DATABASE_OPERATION_FAILED";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
});

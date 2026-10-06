import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { constants, lstatSync, readFileSync, realpathSync } from "node:fs";
import { chmod, mkdir, open, rename, unlink } from "node:fs/promises";
import { hostname } from "node:os";
import { z } from "zod";
import {
  resetGenerationMirrorSchema,
  type ResetGenerationMirror,
} from "../src/modules/maintenance/domain/reset-generation-admission";

export const resetBootHoldPath = "/opt/agent-sozluk/reset/maintenance-hold";
export const resetGenerationComposePath = "/opt/agent-sozluk/runtime/reset-generation-compose.yaml";
export const resetBootDropInPath =
  "/etc/systemd/system/agent-sozluk.service.d/50-reset-generation.conf";
export const resetBootDropIn = `[Unit]\nConditionPathExists=!${resetBootHoldPath}\n\n[Service]\nExecStartPre=\nExecStartPre=/usr/bin/docker compose --env-file /opt/agent-sozluk/app/.env -f /opt/agent-sozluk/runtime/compose.production.yaml -f ${resetGenerationComposePath} config --quiet\nExecStart=\nExecStart=/usr/bin/docker compose --env-file /opt/agent-sozluk/app/.env -f /opt/agent-sozluk/runtime/compose.production.yaml -f ${resetGenerationComposePath} up -d --no-build --remove-orphans\nExecStop=\nExecStop=/usr/bin/docker compose --env-file /opt/agent-sozluk/app/.env -f /opt/agent-sozluk/runtime/compose.production.yaml -f ${resetGenerationComposePath} stop --timeout 60\n`;
export const resetBootHoldSchema = z
  .object({ operationId: z.string().uuid(), releaseSha: z.string().regex(/^[a-f0-9]{40}$/u) })
  .strict();
/** systemctl show, karmaşık Conditions alanını `[unprintable]` döndürebilir. */
export function assertLoadedResetBootHoldCondition(): void {
  try {
    const raw = execFileSync(
      "/usr/bin/busctl",
      [
        "--json=short",
        "get-property",
        "org.freedesktop.systemd1",
        "/org/freedesktop/systemd1/unit/agent_2dsozluk_2eservice",
        "org.freedesktop.systemd1.Unit",
        "Conditions",
      ],
      { encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "pipe"] },
    );
    const value = z
      .object({
        type: z.literal("a(sbbsi)"),
        data: z.array(
          z.tuple([z.string(), z.boolean(), z.boolean(), z.string(), z.number().int()]),
        ),
      })
      .strict()
      .parse(JSON.parse(raw));
    const actual = value.data.map(([kind, trigger, negate, parameter]) =>
      JSON.stringify([kind, trigger, negate, parameter]),
    );
    const expected = [
      ["ConditionPathExists", false, true, resetBootHoldPath],
      ["ConditionPathExists", false, false, "/opt/agent-sozluk/app/.env"],
      ["ConditionPathExists", false, false, "/opt/agent-sozluk/runtime/compose.production.yaml"],
    ].map((row) => JSON.stringify(row));
    // Son alan eski değerlendirme sonucudur; yüklenen tanımın yerine geçmez.
    if (JSON.stringify(actual.sort()) !== JSON.stringify(expected.sort()))
      throw new Error("GREAT_RESET_BOOT_HOLD_NOT_LOADED");
  } catch {
    throw new Error("GREAT_RESET_BOOT_HOLD_NOT_LOADED");
  }
}
/** Başka bir drop-in aynı ExecStart/condition korumasını sessizce geçersiz kılamaz. */
export function assertResetBootstrapConfiguration(installed: boolean): void {
  const show = (property: string) =>
    execFileSync(
      "/usr/bin/systemctl",
      ["show", "agent-sozluk.service", `--property=${property}`, "--value"],
      {
        encoding: "utf8",
        timeout: 10000,
        stdio: ["ignore", "pipe", "pipe"],
      },
    ).trim();
  if (
    show("FragmentPath") !== "/etc/systemd/system/agent-sozluk.service" ||
    show("NeedDaemonReload") !== "no" ||
    show("DropInPaths") !== (installed ? resetBootDropInPath : "")
  )
    throw new Error("GREAT_RESET_BOOTSTRAP_CONFIGURATION_CHANGED");
  if (installed) {
    const stat = lstatSync(resetBootDropInPath);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.uid !== 0 ||
      (stat.mode & 0o777) !== 0o444 ||
      realpathSync(resetBootDropInPath) !== resetBootDropInPath ||
      readFileSync(resetBootDropInPath, "utf8") !== resetBootDropIn
    )
      throw new Error("GREAT_RESET_BOOTSTRAP_CONFIGURATION_CHANGED");
  }
}
/** Apt çıktısı yalnız açık false ise bakım boyunca otomatik reboot kapalıdır. */
export function assertResetAutomaticRebootDisabled(value: string): void {
  if (value.trim() !== "RESET_REBOOT='false'")
    throw new Error("GREAT_RESET_AUTOMATIC_REBOOT_NOT_DISABLED");
}
export function resetGenerationCompose(required: boolean, terminal = false): string {
  if (terminal && !required) throw new Error("GREAT_RESET_GENERATION_COMPOSE_INVALID");
  return `services:\n  app:\n    restart: "${terminal ? "unless-stopped" : "no"}"\n    environment:\n      AGENT_SOZLUK_RESET_GENERATION_REQUIRED: "${required}"\n    volumes:\n      - type: bind\n        source: /opt/agent-sozluk/reset/generation\n        target: /run/agentsozluk-reset\n        read_only: true\n        bind:\n          create_host_path: false\n`;
}
function host() {
  if (
    process.getuid?.() !== 0 ||
    hostname() !== "agent-sozluk-prod" ||
    process.cwd() !==
      `/opt/agent-sozluk/runtime/releases/${process.env.AGENT_SOZLUK_PRODUCTION_APPROVED_SHA}`
  )
    throw new Error("GREAT_RESET_BOOT_GUARD_HOST_REQUIRED");
}
function trustedDirectory(path: string, uid = 0) {
  const s = lstatSync(path);
  if (
    !s.isDirectory() ||
    s.isSymbolicLink() ||
    s.uid !== uid ||
    s.mode & 0o022 ||
    realpathSync(path) !== path
  )
    throw new Error("GREAT_RESET_BOOT_GUARD_DIRECTORY_INVALID");
}
export function readResetBootHold() {
  const s = lstatSync(resetBootHoldPath);
  if (
    !s.isFile() ||
    s.isSymbolicLink() ||
    s.uid !== 0 ||
    (s.mode & 0o777) !== 0o600 ||
    realpathSync(resetBootHoldPath) !== resetBootHoldPath ||
    s.size > 4096
  )
    throw new Error("GREAT_RESET_BOOT_HOLD_INVALID");
  return resetBootHoldSchema.parse(JSON.parse(readFileSync(resetBootHoldPath, "utf8")));
}
async function sync(path: string) {
  const fd = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    await fd.sync();
  } finally {
    await fd.close();
  }
}
async function exclusiveFile(path: string, body: string, mode: number) {
  const file = await open(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    mode,
  );
  try {
    await file.writeFile(body);
    await file.chmod(mode);
    await file.sync();
  } finally {
    await file.close();
  }
}
/** Bootstrap oneshot'u stop etmek DB'yi de indirir. Root condition hold bunun yerine kurulur. */
export async function installProductionResetBootGuard(
  operationId: string,
  releaseSha: string,
): Promise<void> {
  host();
  const binding = resetBootHoldSchema.parse({ operationId, releaseSha });
  if (releaseSha !== process.env.AGENT_SOZLUK_PRODUCTION_APPROVED_SHA)
    throw new Error("GREAT_RESET_PRODUCTION_RELEASE_REQUIRED");
  assertResetBootstrapConfiguration(false);
  for (const path of [
    "/",
    "/opt",
    "/opt/agent-sozluk",
    "/opt/agent-sozluk/reset",
    "/etc",
    "/etc/systemd",
    "/etc/systemd/system",
  ])
    trustedDirectory(path);
  trustedDirectory("/opt/agent-sozluk/runtime", 1000);
  const base = "/etc/systemd/system/agent-sozluk.service";
  const s = lstatSync(base);
  if (
    !s.isFile() ||
    s.isSymbolicLink() ||
    s.uid !== 0 ||
    s.mode & 0o022 ||
    createHash("sha256").update(readFileSync(base)).digest("hex") !==
      "ef47dccff5dbff0dd4f34b19c378c2339155a8c164abd1d73d3fb5578d434d02"
  )
    throw new Error("GREAT_RESET_BOOTSTRAP_DEFINITION_CHANGED");
  await exclusiveFile(resetBootHoldPath, JSON.stringify(binding) + "\n", 0o600);
  await sync("/opt/agent-sozluk/reset");
  await mkdir("/opt/agent-sozluk/reset/generation", { mode: 0o755 });
  await chmod("/opt/agent-sozluk/reset/generation", 0o755);
  trustedDirectory("/opt/agent-sozluk/reset/generation");
  await sync("/opt/agent-sozluk/reset");
  await exclusiveFile(resetGenerationComposePath, resetGenerationCompose(false), 0o444);
  await sync("/opt/agent-sozluk/runtime");
  await mkdir("/etc/systemd/system/agent-sozluk.service.d", { mode: 0o755, recursive: true });
  trustedDirectory("/etc/systemd/system/agent-sozluk.service.d");
  await exclusiveFile(resetBootDropInPath, resetBootDropIn, 0o444);
  await sync("/etc/systemd/system/agent-sozluk.service.d");
  await sync("/etc/systemd/system");
  execFileSync("/usr/bin/systemctl", ["daemon-reload"], {
    timeout: 15000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  assertResetBootstrapConfiguration(true);
}
export async function latchProductionResetCompose(): Promise<void> {
  host();
  trustedDirectory("/opt/agent-sozluk/runtime", 1000);
  const stat = lstatSync(resetGenerationComposePath);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.uid !== 0 ||
    (stat.mode & 0o777) !== 0o444 ||
    realpathSync(resetGenerationComposePath) !== resetGenerationComposePath
  )
    throw new Error("GREAT_RESET_GENERATION_COMPOSE_INVALID");
  const actual = readFileSync(resetGenerationComposePath, "utf8");
  if (actual === resetGenerationCompose(true) || actual === resetGenerationCompose(true, true))
    return;
  if (actual !== resetGenerationCompose(false))
    throw new Error("GREAT_RESET_GENERATION_COMPOSE_INVALID");
  const temporary = `${resetGenerationComposePath}.latched`;
  await exclusiveFile(temporary, resetGenerationCompose(true), 0o444);
  await rename(temporary, resetGenerationComposePath);
  await sync("/opt/agent-sozluk/runtime");
}
/** Yalnız yayımlanmış terminal nesil açılır; pre-reset restore sonrasında ROLLED_BACK mümkündür. */
export async function releaseProductionResetBootHold(value: ResetGenerationMirror): Promise<void> {
  host();
  const mirror = resetGenerationMirrorSchema.parse(value);
  const hold = readResetBootHold();
  if (
    (mirror.state !== "TRAFFIC_OPEN" && mirror.state !== "ROLLED_BACK") ||
    mirror.operationId !== hold.operationId ||
    mirror.releaseSha !== hold.releaseSha
  )
    throw new Error("GREAT_RESET_BOOT_HOLD_RELEASE_FORBIDDEN");
  const path = "/opt/agent-sozluk/reset/generation/current.json";
  const stat = lstatSync(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.uid !== 0 ||
    stat.mode & 0o022 ||
    realpathSync(path) !== path ||
    JSON.stringify(resetGenerationMirrorSchema.parse(JSON.parse(readFileSync(path, "utf8")))) !==
      JSON.stringify(mirror) ||
    ![resetGenerationCompose(true), resetGenerationCompose(true, true)].includes(
      readFileSync(resetGenerationComposePath, "utf8"),
    )
  )
    throw new Error("GREAT_RESET_BOOT_HOLD_RELEASE_FORBIDDEN");
  // Terminal DB/mirror kanıtından sonra kalıcı restart politikası geri gelir.
  // Rename sonrası kesintide hold kalır; aynı exact terminal içerik tekrar okunur.
  trustedDirectory("/opt/agent-sozluk/runtime", 1000);
  const composition = lstatSync(resetGenerationComposePath);
  if (
    !composition.isFile() ||
    composition.isSymbolicLink() ||
    composition.uid !== 0 ||
    (composition.mode & 0o777) !== 0o444 ||
    realpathSync(resetGenerationComposePath) !== resetGenerationComposePath
  )
    throw new Error("GREAT_RESET_GENERATION_COMPOSE_INVALID");
  if (readFileSync(resetGenerationComposePath, "utf8") !== resetGenerationCompose(true, true)) {
    const temporary = `${resetGenerationComposePath}.terminal`;
    await exclusiveFile(temporary, resetGenerationCompose(true, true), 0o444);
    await rename(temporary, resetGenerationComposePath);
    await sync("/opt/agent-sozluk/runtime");
  }
  await unlink(resetBootHoldPath);
  await sync("/opt/agent-sozluk/reset");
}

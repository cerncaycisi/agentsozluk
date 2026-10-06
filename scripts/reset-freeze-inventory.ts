import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
  readResetBootHold,
  resetBootHoldPath,
  resetBootDropInPath,
  resetBootDropIn,
  resetBootHoldSchema,
  assertResetBootstrapConfiguration,
} from "./reset-production-boot-guard";

const hash = z.string().regex(/^[a-f0-9]{64}$/u);
export const resetFreezeInventorySchema = z
  .object({
    formatVersion: z.literal(1),
    hostname: z.literal("agent-sozluk-prod"),
    bootstrapHold: resetBootHoldSchema.nullable(),
    units: z
      .array(
        z
          .object({
            name: z.string().regex(/^agent-?sozluk[^/]*\.(service|timer|socket|path)$/u),
            load: z.enum(["loaded", "masked"]),
            active: z.enum(["inactive", "active"]),
            sub: z.string(),
            pid: z.literal("0"),
            enabled: z.enum(["disabled", "static", "masked", "enabled"]),
            unitSha256: hash,
          })
          .strict(),
      )
      .min(9),
    cronFiles: z.array(z.object({ path: z.string(), sha256: hash }).strict()),
    crontabs: z
      .array(z.object({ user: z.enum(["root", "deploy"]), sha256: hash }).strict())
      .length(2),
  })
  .strict();
const project = /agent[-_]?sozluk/iu;
const unitName = /^agent-?sozluk[^/]*\.(service|timer|socket|path)$/u;
function command(args: string[]): string {
  return execFileSync("/usr/bin/systemctl", args, {
    encoding: "utf8",
    timeout: 10000,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
function digest(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
/** Tüm project unit ve cron girişleri gerçek hosttan; ham unit/crontab/env çıktısı yok. */
export function measureResetFreezeInventory(bootstrapSetup = false) {
  if (process.getuid?.() !== 0 || hostname() !== "agent-sozluk-prod")
    throw new Error("GREAT_RESET_FREEZE_HOST_REQUIRED");
  let bootstrapHold = null;
  assertResetBootstrapConfiguration(!bootstrapSetup);
  if (!bootstrapSetup) {
    bootstrapHold = readResetBootHold();
    const s = lstatSync(resetBootDropInPath);
    if (
      !s.isFile() ||
      s.isSymbolicLink() ||
      s.uid !== 0 ||
      s.mode & 0o022 ||
      readFileSync(resetBootDropInPath, "utf8") !== resetBootDropIn ||
      !command(["show", "agent-sozluk.service", "--property=DropInPaths", "--value"])
        .split(/\s+/u)
        .includes(resetBootDropInPath) ||
      !command(["show", "agent-sozluk.service", "--property=Conditions", "--value"]).includes(
        resetBootHoldPath,
      )
    )
      throw new Error("GREAT_RESET_BOOT_HOLD_NOT_LOADED");
  }
  const names = new Set<string>();
  for (const args of [
    ["list-unit-files", "--all", "--no-legend", "--no-pager"],
    ["list-units", "--all", "--plain", "--no-legend", "--no-pager"],
  ])
    for (const line of command(args).trim().split("\n")) {
      const name = line.trim().split(/\s+/u)[0]!;
      if (unitName.test(name)) names.add(name);
    }
  for (const suffix of [
    "runtime.service",
    ...["maintenance", "alarm", "sayac", "backup"].flatMap((name) => [
      `${name}.service`,
      `${name}.timer`,
    ]),
  ])
    if (!names.has(`agent-sozluk-${suffix}`)) throw new Error("GREAT_RESET_FREEZE_UNIT_MISSING");
  const units = [...names].sort().map((name) => {
    const properties = Object.fromEntries(
      command([
        "show",
        name,
        "--property=LoadState,ActiveState,SubState,MainPID,UnitFileState,FragmentPath",
      ])
        .trim()
        .split("\n")
        .map((line) => {
          const i = line.indexOf("=");
          return [line.slice(0, i), line.slice(i + 1)];
        }),
    );
    const fragment = properties.FragmentPath!;
    let bytes = Buffer.alloc(0);
    if (fragment) {
      const s = lstatSync(fragment);
      if (!s.isFile() || s.isSymbolicLink() || s.uid !== 0 || s.mode & 0o022)
        throw new Error("GREAT_RESET_FREEZE_UNIT_UNTRUSTED");
      bytes = readFileSync(fragment);
    }
    // systemctl cat bütün drop-in'leri kapsar; environment body yalnız hash içinde kalır.
    const configuration = command(["cat", name, "--no-pager"]);
    const unit = {
      name,
      load: properties.LoadState,
      active: properties.ActiveState,
      sub: properties.SubState,
      pid: properties.MainPID ?? "0",
      enabled: properties.UnitFileState || "static",
      unitSha256: digest(Buffer.concat([bytes, Buffer.from(configuration)])),
    };
    if (name === "agent-sozluk.service") {
      if (
        unit.pid !== "0" ||
        !(
          (unit.active === "active" && unit.sub === "exited") ||
          (unit.active === "inactive" && unit.sub === "dead")
        )
      )
        throw new Error("GREAT_RESET_BOOTSTRAP_PROCESS_ACTIVE");
      if (digest(bytes) !== "ef47dccff5dbff0dd4f34b19c378c2339155a8c164abd1d73d3fb5578d434d02")
        throw new Error("GREAT_RESET_BOOTSTRAP_DEFINITION_CHANGED");
    } else if (unit.active !== "inactive" || unit.pid !== "0" || unit.enabled === "enabled")
      throw new Error("GREAT_RESET_PROJECT_SERVICE_ACTIVE");
    return unit;
  });
  const cronFiles: { path: string; sha256: string }[] = [];
  for (const parent of [
    "/etc/cron.d",
    "/etc/cron.hourly",
    "/etc/cron.daily",
    "/etc/cron.weekly",
    "/etc/cron.monthly",
  ]) {
    const stat = lstatSync(parent);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== 0 || stat.mode & 0o022)
      throw new Error("GREAT_RESET_FREEZE_CRON_UNTRUSTED");
    for (const name of readdirSync(parent).sort()) {
      const path = join(parent, name);
      const s = lstatSync(path);
      if (!s.isFile() || s.isSymbolicLink() || s.uid !== 0 || s.mode & 0o022)
        throw new Error("GREAT_RESET_FREEZE_CRON_UNTRUSTED");
      const body = readFileSync(path, "utf8");
      if (project.test(body)) throw new Error("GREAT_RESET_FREEZE_PROJECT_CRON_PRESENT");
      cronFiles.push({ path, sha256: digest(body) });
    }
  }
  const systemStat = lstatSync("/etc/crontab");
  if (
    !systemStat.isFile() ||
    systemStat.isSymbolicLink() ||
    systemStat.uid !== 0 ||
    systemStat.mode & 0o022
  )
    throw new Error("GREAT_RESET_FREEZE_CRON_UNTRUSTED");
  const systemBody = readFileSync("/etc/crontab", "utf8");
  if (project.test(systemBody)) throw new Error("GREAT_RESET_FREEZE_PROJECT_CRON_PRESENT");
  cronFiles.push({ path: "/etc/crontab", sha256: digest(systemBody) });
  const crontabs = ["root", "deploy"].map((user) => {
    const result = spawnSync("/usr/bin/crontab", ["-u", user, "-l"], {
      encoding: "utf8",
      env: { ...process.env, LC_ALL: "C" },
      timeout: 10000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (
      result.error ||
      (result.status !== 0 && result.status !== 1) ||
      (result.status === 1 && result.stderr.trim() !== `no crontab for ${user}`)
    )
      throw new Error("GREAT_RESET_FREEZE_CRON_UNREADABLE");
    const body = result.stdout || "";
    if (project.test(body)) throw new Error("GREAT_RESET_FREEZE_PROJECT_CRON_PRESENT");
    return { user, sha256: digest(body) };
  });
  return resetFreezeInventorySchema.parse({
    formatVersion: 1,
    hostname: hostname(),
    bootstrapHold,
    units,
    cronFiles,
    crontabs,
  });
}

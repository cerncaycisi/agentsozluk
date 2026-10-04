// Genel SQL denetçisi değildir. Yalnız ayrı incelenmiş, değişmez dosya kümesini kabul eder.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const profileName = "october-2026-v1";
const supportedProfiles = new Set(["october-2026-v1", "october-2026-v2"]);
function assertProfileName(name) {
  if (!supportedProfiles.has(name)) throw new Error("REVIEWED_PROFILE_UNKNOWN");
}
function readProfile(name) {
  assertProfileName(name);
  return JSON.parse(
    readFileSync(new URL(`./migration-profiles/${name}.json`, import.meta.url), "utf8"),
  );
}
export const profile = readProfile(profileName);

export function assertExtraCatalog(actual, name = profileName) {
  assertProfileName(name);
  const expected = JSON.parse(
    readFileSync(new URL(`./migration-profiles/${name}-extra.json`, import.meta.url), "utf8"),
  );
  const canonical = (value) =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, canonical(value[key])]),
          )
        : value;
  if (JSON.stringify(canonical(expected)) !== JSON.stringify(canonical(actual))) {
    throw new Error("REVIEWED_EXTRA_CATALOG_MISMATCH");
  }
}

export function verifyProfile(name, root, pending) {
  const profile = readProfile(name);
  const names = Object.keys(profile.migrations);
  if (JSON.stringify(pending) !== JSON.stringify(names)) {
    throw new Error("REVIEWED_PROFILE_SET_MISMATCH");
  }
  for (const migration of names) {
    const bytes = readFileSync(path.join(root, "prisma/migrations", migration, "migration.sql"));
    if (createHash("sha256").update(bytes).digest("hex") !== profile.migrations[migration]) {
      throw new Error("REVIEWED_PROFILE_CHECKSUM_MISMATCH");
    }
  }
  return profile.catalog;
}

// pg_dump'ın yalnız bu dört ek sütun satırı çıkarılır. Farklı tür/default/konum,
// yinelenen veya eksik ek sütun paketi hata verir; eski şema metni korunur.
export function normalizeProfileSchema(input, name = profileName) {
  const profile = readProfile(name);
  let inside = false;
  let seenTable = false;
  const seen = new Set();
  const lines = [];
  for (const line of input.split("\n")) {
    if (line === "CREATE TABLE public.agent_global_settings (") {
      if (seenTable) throw new Error("REVIEWED_SCHEMA_DUPLICATE_TABLE");
      inside = true;
      seenTable = true;
    }
    const match = line.match(
      /^    "(rewardMode|birthMode|lastBirthScanAt|lastBirthCandidateAt)" /u,
    );
    if (inside && match) {
      if (seen.has(match[1]) || line !== profile.newColumns[match[1]]) {
        throw new Error("REVIEWED_SCHEMA_COLUMN_MISMATCH");
      }
      seen.add(match[1]);
      continue;
    }
    if (inside && line === ");") inside = false;
    lines.push(line);
  }
  if (inside || (seen.size !== 0 && seen.size !== 4)) {
    throw new Error("REVIEWED_SCHEMA_PARTIAL_COLUMNS");
  }
  return lines.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, name, root, pendingFile] = process.argv.slice(2);
    assertProfileName(name);
    if (command === "verify") {
      const pending = readFileSync(pendingFile, "utf8").trim().split("\n");
      process.stdout.write(JSON.stringify(verifyProfile(name, root, pending)) + "\n");
    } else if (command === "normalize-schema") {
      process.stdout.write(normalizeProfileSchema(readFileSync(0, "utf8"), name));
    } else if (command === "verify-extra") {
      assertExtraCatalog(JSON.parse(readFileSync(root, "utf8")), name);
    } else {
      throw new Error("REVIEWED_PROFILE_COMMAND_INVALID");
    }
  } catch (error) {
    const code =
      error instanceof Error && /^REVIEWED_[A-Z_]+$/u.test(error.message)
        ? error.message
        : "REVIEWED_PROFILE_UNREADABLE";
    process.stderr.write(`${code}\n`);
    process.exitCode = 3;
  }
}

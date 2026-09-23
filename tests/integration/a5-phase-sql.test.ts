import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { integrationDatabase, resetIntegrationDatabase } from "./database";

/*
  A5 faz betiğinin SQL'i gerçek PostgreSQL'de, gerçek `psql`/`pg_dump` ile
  çalıştırılır. Sol'un 2. turu `sequence_safety`'nin boolean'ı `t` olarak basıp
  geçersiz SQL ürettiğini buldu; bu, SQL'i hiç gerçek veritabanında koşmadan
  yazılmış olmanın sonucuydu. Testler betiğin fonksiyonlarını değiştirmeden
  çağırır; yalnız `docker compose exec db …` yerel istemciye yönlendirilir.
*/

const phaseScript = path.join(process.cwd(), "scripts/production-migration-phase.sh");
const checker = path.join(process.cwd(), "scripts/check-additive-migration.mjs");
const contactMigration = path.join(
  process.cwd(),
  "prisma/migrations/20260922140000_contact_messages/migration.sql",
);

// libpq, Prisma'ya özgü `schema`/`connection_limit` parametrelerini reddeder.
function libpqUrl(): string {
  const url = new URL(process.env.TEST_DATABASE_URL ?? "");
  url.search = "";
  return url.toString();
}

const databaseName = new URL(libpqUrl()).pathname.slice(1);
const probeDatabase = "agent_sozluk_a5_probe_test";

function libpqUrlFor(name: string): string {
  const url = new URL(libpqUrl());
  url.pathname = `/${name}`;
  return url.toString();
}
let root = "";

function phase(body: string): { status: number; stdout: string; stderr: string } {
  const script = `
set -Eeuo pipefail
runtime_root="${root}/runtime"
state_dir="${root}/state"
app_root="${process.cwd()}"
candidate_sha=${"a".repeat(40)}
candidate_image=agent-sozluk:${"a".repeat(40)}
op_id=0123456789abcdef
approved_migrations=20260922140000_contact_messages
mkdir -p "$runtime_root" "$state_dir/migration"
url_for() {
  case "$1" in
    # Betik üretim adını sabit kullanır (agent_sozluk); testte o da test veritabanı.
    ${databaseName} | agent_sozluk) printf '%s' "${libpqUrl()}" ;;
    ${probeDatabase}) printf '%s' "${libpqUrlFor(probeDatabase)}" ;;
    *) return 1 ;;
  esac
}
compose_stub() {
  [[ "$1 $2 $3" == "exec -T db" ]] || return 99
  shift 3
  local command="$1" database=""
  shift
  local args=()
  while (($#)); do
    case "$1" in
      -U) shift 2 ;;
      -d) database="$2"; shift 2 ;;
      *) args+=("$1"); shift ;;
    esac
  done
  "$command" "\${args[@]}" -d "$(url_for "$database")"
}
compose=(compose_stub)
# Üretimde /usr/bin/node; CI makinesinde Node başka yerde.
host_node="$(command -v node)"
source "${phaseScript}"
db_psql() {
  local database="$1"
  shift
  psql -XAtq -v ON_ERROR_STOP=1 -d "$(url_for "$database")" "$@"
}
${body}
`;
  const result = spawnSync("bash", ["-c", script], { encoding: "utf8" });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

beforeAll(async () => {
  // CI'da istemci yoksa sessizce atlanmasın: bu test A5'in SQL kanıtıdır.
  execFileSync("psql", ["--version"]);
  execFileSync("pg_dump", ["--version"]);
  // Önceki dosyaların bıraktığı, açık kimlikli satırlar sequence'i geride gösterebilir.
  await resetIntegrationDatabase();
  root = mkdtempSync(path.join(tmpdir(), "a5-sql-"));
}, 60_000);

afterAll(async () => {
  rmSync(root, { recursive: true, force: true });
  await integrationDatabase.$executeRaw`DROP DATABASE IF EXISTS "agent_sozluk_a5_probe_test" WITH (FORCE)`;
  await integrationDatabase.$executeRaw`DROP TABLE IF EXISTS "a5_seq_probe"`;
  await integrationDatabase.$disconnect();
});

describe("A5 faz SQL'i gerçek PostgreSQL'de", () => {
  it("parmak izi deterministik, bütün tabloları ve sequence'leri kapsar, içerik değişince değişir", async () => {
    const first = phase(
      `db_fingerprint ${databaseName} "${root}/f1"; db_fingerprint ${databaseName} "${root}/f2"`,
    );
    expect(first.status, first.stderr).toBe(0);
    const f1 = readFileSync(path.join(root, "f1"), "utf8");
    expect(f1).toBe(readFileSync(path.join(root, "f2"), "utf8"));
    expect(f1).toMatch(/^table:users\|\d+\|\d+\|\d+$/mu);
    expect(f1).toMatch(/^table:_prisma_migrations\|\d+\|\d+\|\d+$/mu);
    expect(f1).toMatch(/^table:contact_messages\|0\|0\|0$/mu);
    expect(f1).toMatch(/^seq:/mu);
    expect(f1).toMatch(/^owned:/mu);
    expect(f1).not.toContain("UNSUPPORTED_RELATION_KIND");

    await integrationDatabase.$executeRaw`
      INSERT INTO "contact_messages" ("id", "kind", "message", "ipKeyHash", "updatedAt")
      VALUES (gen_random_uuid(), 'OTHER', 'Parmak izi değişmeli.', ${"a".repeat(64)}, now())`;
    const second = phase(`db_fingerprint ${databaseName} "${root}/f3"`);
    expect(second.status, second.stderr).toBe(0);
    expect(readFileSync(path.join(root, "f3"), "utf8")).toMatch(
      /^table:contact_messages\|1\|\d+\|\d+$/mu,
    );
    await integrationDatabase.$executeRaw`DELETE FROM "contact_messages"`;
  });

  it("sequence güvenliği geçerli SQL üretir ve geride kalmış sequence'i yakalar", async () => {
    const ok = phase(`sequence_safety ${databaseName}; echo TAMAM`);
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout).toContain("TAMAM");

    await integrationDatabase.$executeRaw`CREATE TABLE "a5_seq_probe" ("id" SERIAL PRIMARY KEY)`;
    await integrationDatabase.$executeRaw`INSERT INTO "a5_seq_probe" ("id") VALUES (100)`;
    const bad = phase(`sequence_safety ${databaseName}`);
    expect(bad.status).toBe(97);
    expect(bad.stderr).toContain("code=SEQUENCE_NEXT_VALUE_UNSAFE");
    await integrationDatabase.$executeRaw`DROP TABLE "a5_seq_probe"`;
  });

  it("katalog, denetçinin iletişim migration'ı beklentisine birebir eşit", () => {
    writeFileSync(
      path.join(root, "state/migration/expectation.json"),
      execFileSync(process.execPath, [checker, contactMigration], { encoding: "utf8" }),
    );
    const result = phase(`assert_catalog_expectation ${databaseName} test; echo ESIT`);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("ESIT");

    const definitions = phase(`new_object_definitions ${databaseName}`);
    expect(definitions.status, definitions.stderr).toBe(0);
    expect(definitions.stdout).toContain(
      "constraint:contact_messages|contact_messages_handled_consistency|CHECK",
    );
    expect(definitions.stdout).toMatch(/^enum:ContactMessageStatus\|OPEN,HANDLED$/mu);
  });

  it("FK hedefi katalogda uuid birincil anahtar mı: users geçer, _prisma_migrations geçmez", () => {
    writeFileSync(
      path.join(root, "state/migration/expectation.json"),
      execFileSync(process.execPath, [checker, contactMigration], { encoding: "utf8" }),
    );
    const ok = phase(`assert_fk_targets; echo HEDEF_TAMAM`);
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout).toContain("HEDEF_TAMAM");

    writeFileSync(
      path.join(root, "state/migration/expectation.json"),
      JSON.stringify({
        tables: { yeni: { foreignKeys: [{ referencedTable: "_prisma_migrations" }] } },
      }),
    );
    const bad = phase(`assert_fk_targets`);
    expect(bad.status).toBe(97);
    expect(bad.stderr).toContain("code=FOREIGN_KEY_TARGET_UNSUPPORTED");
  });

  it("yedek izole kopyaya geri yüklenince parmak izi ve şema özeti kaynakla aynı çıkar", async () => {
    // Üretimde ilk A5 koşusu (23 Eylül) burada RESTORE_SCHEMA_MISMATCH ile durdu;
    // canlı şema ile yedek arşivindeki şema birebir aynıydı. Aynı akış burada
    // gerçek pg_dump/pg_restore ile yeniden üretilir; fark varsa mesajda görünür.
    const dump = path.join(root, "probe.dump");
    execFileSync("pg_dump", ["-Fc", "--no-owner", "--no-privileges", "-f", dump, "-d", libpqUrl()]);
    await integrationDatabase.$executeRaw`DROP DATABASE IF EXISTS "agent_sozluk_a5_probe_test" WITH (FORCE)`;
    await integrationDatabase.$executeRaw`CREATE DATABASE "agent_sozluk_a5_probe_test" TEMPLATE template0`;
    execFileSync("pg_restore", [
      "--exit-on-error",
      "--no-owner",
      "--no-privileges",
      "-d",
      libpqUrlFor(probeDatabase),
      dump,
    ]);

    const fingerprints = phase(
      `db_fingerprint ${databaseName} "${root}/src.fp"; db_fingerprint ${probeDatabase} "${root}/dst.fp"`,
    );
    expect(fingerprints.status, fingerprints.stderr).toBe(0);
    expect(readFileSync(path.join(root, "dst.fp"), "utf8")).toBe(
      readFileSync(path.join(root, "src.fp"), "utf8"),
    );

    // Şema kanıtı arşivin kendisidir: arşivdeki şema betiği canlı dökümle birebir.
    // Geri yüklenmiş kopyanın yeniden dökümü karşılaştırılmaz; PostgreSQL CHECK ve
    // indeks ifadelerini geri yüklemede yazımca farklı üretir (iç içe AND düzleşir,
    // dizi dönüşümü yeniden yazılır) — ilk üretim koşusu bu yüzden durdu.
    const hashes = phase(`schema_hash ${databaseName}; archive_schema_hash "${dump}"`);
    expect(hashes.status, hashes.stderr).toBe(0);
    const [live, archive] = hashes.stdout.trim().split("\n");
    expect(archive).toMatch(/^[0-9a-f]{64}$/u);
    expect(archive).toBe(live);

    // Scratch'in kendi tablo şema özetleri üretilebiliyor (prova kıyas tabanı).
    const scratch = phase(`table_schema_hashes ${probeDatabase} "${root}/probe-schemas"`);
    expect(scratch.status, scratch.stderr).toBe(0);
    expect(readFileSync(path.join(root, "probe-schemas"), "utf8").trim().split("\n").length).toBe(
      readFileSync(path.join(root, "src.fp"), "utf8")
        .split("\n")
        .filter((line) => line.startsWith("table:")).length,
    );
  }, 120_000);

  it("tablo şema özetleri her tablo için üretilir; migration geçmişi okunur", () => {
    const result = phase(
      `table_schema_hashes ${databaseName} "${root}/schemas"; prisma_history ${databaseName} | wc -l`,
    );
    expect(result.status, result.stderr).toBe(0);
    const lines = readFileSync(path.join(root, "schemas"), "utf8").trim().split("\n");
    expect(lines.length).toBeGreaterThan(20);
    for (const line of lines) expect(line).toMatch(/^[a-z_]+\|[0-9a-f]{64}$/u);
    expect(Number(result.stdout.trim())).toBeGreaterThan(20);
  });
});

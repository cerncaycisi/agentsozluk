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
url_for() { printf '%s' "${libpqUrl()}"; }
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
  test "$database" = "${databaseName}"
  "$command" "\${args[@]}" -d "$(url_for)"
}
compose=(compose_stub)
# Üretimde /usr/bin/node; CI makinesinde Node başka yerde.
host_node="$(command -v node)"
source "${phaseScript}"
db_psql() {
  local database="$1"
  shift
  test "$database" = "${databaseName}"
  psql -XAtq -v ON_ERROR_STOP=1 -d "$(url_for)" "$@"
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

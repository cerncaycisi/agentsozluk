import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/*
  A5 faz betiği, sahte `docker`/`db_psql`/compose ile GERÇEKTEN çalıştırılır.
  Kaynak metninde dize aramak, bash'in `f || x` çağrısında fonksiyon gövdesinde
  `set -e`'yi kapatması gibi davranış kusurlarını yakalamaz (Sol, 23 Eylül).
*/

const phaseScript = path.join(process.cwd(), "scripts/production-migration-phase.sh");
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function harness(body: string): { status: number; stdout: string; stderr: string; root: string } {
  const root = mkdtempSync(path.join(tmpdir(), "a5-phase-"));
  directories.push(root);
  const script = `
set -Eeuo pipefail
runtime_root="${root}/runtime"
state_dir="${root}/state"
app_root="${root}/app"
candidate_sha=${"a".repeat(40)}
candidate_image=agent-sozluk:${"a".repeat(40)}
op_id=0123456789abcdef
approved_migrations=20260922140000_contact_messages
mkdir -p "$runtime_root" "$state_dir/migration"
log="${root}/calls.log"
: >"$log"
compose_stub() { printf 'compose %s\\n' "$*" >>"$log"; }
compose=(compose_stub)
source "${phaseScript}"
docker() { printf 'docker %s\\n' "$*" >>"$log"; }
${body}
`;
  const result = spawnSync("bash", ["-c", script], { encoding: "utf8" });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr, root };
}

describe("A5 faz betiği davranışı", () => {
  it("imaj etiketi kaymışsa migration konteynerine hiç ulaşmadan durur", () => {
    const result = harness(`
printf 'sha256:beklenen\\n' >"$state_dir/candidate-image-id"
docker() {
  printf 'docker %s\\n' "$*" >>"$log"
  if test "$1 $2" = "image inspect"; then printf 'sha256:baska\\n'; fi
}
db_psql() { printf 'psql %s\\n' "$*" >>"$log"; printf '2\\n'; }
run_migration agent_sozluk
echo ULASILMAMALI
`);
    expect(result.status).toBe(97);
    expect(result.stderr).toContain("code=CANDIDATE_IMAGE_TAG_MOVED");
    expect(result.stdout).not.toContain("ULASILMAMALI");
    const calls = readFileSync(path.join(result.root, "calls.log"), "utf8");
    expect(calls).not.toContain("compose");
    expect(calls).not.toContain("ALTER DATABASE");
  });

  it("üretim migration'ı da etiket kaymışsa compose'a ulaşmaz (çağıran bağlamı)", () => {
    const result = harness(`
install -d "$migration_marker"
printf 'rehearsed\\n' >"$migration_marker/phase"
printf 'sha256:beklenen\\n' >"$state_dir/candidate-image-id"
docker() {
  printf 'docker %s\\n' "$*" >>"$log"
  if test "$1 $2" = "image inspect"; then printf 'sha256:baska\\n'; fi
}
db_psql() { printf 'psql %s\\n' "$*" >>"$log"; printf '2\\n'; }
migrate_production
`);
    expect(result.status).toBe(97);
    expect(result.stderr).toContain("code=CANDIDATE_IMAGE_TAG_MOVED");
    expect(readFileSync(path.join(result.root, "calls.log"), "utf8")).not.toContain("compose");
  });

  it("üretimde ön koşul düşerse aşama migrating olmaz; tuzak siteyi geri açar (Sol, 2. tur)", () => {
    const result = harness(`
install -d "$migration_marker"
printf 'rehearsed\\n' >"$migration_marker/phase"
printf 'sha256:beklenen\\n' >"$state_dir/candidate-image-id"
docker() { if test "$1 $2" = "image inspect"; then printf 'sha256:baska\\n'; fi; }
db_psql() { printf '2\\n'; }
reopen_previous_release() { printf 'reopen\\n' >>"$log"; }
( trap migration_exit_trap EXIT; migrate_production ) || true
printf 'faz=%s\\n' "$(cat "$migration_marker/phase")"
`);
    expect(result.stderr).toContain("code=CANDIDATE_IMAGE_TAG_MOVED");
    expect(result.stderr).not.toContain("RELEASE_MIGRATION_MANUAL");
    expect(result.stdout).toContain("faz=image-verified");
    expect(readFileSync(path.join(result.root, "calls.log"), "utf8")).toContain("reopen");
  });

  it("cutover-done aşamasından yeniden giriş hata vermez", () => {
    const result = harness(`
install -d "$migration_marker"
migration_identity >"$migration_marker/identity"
printf 'cutover-done\\n' >"$migration_marker/phase"
migration_phase
echo GECTI
`);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("GECTI");
  });

  it("zaman aşımları konamazsa migration başlamaz", () => {
    const result = harness(`
printf 'sha256:beklenen\\n' >"$state_dir/candidate-image-id"
docker() { if test "$1 $2" = "image inspect"; then printf 'sha256:beklenen\\n'; fi; }
db_psql() { return 1; }
run_migration agent_sozluk
echo ULASILMAMALI
`);
    expect(result.status).toBe(97);
    expect(result.stderr).toContain("code=DB_TIMEOUT_SET_FAILED");
    expect(readFileSync(path.join(result.root, "calls.log"), "utf8")).not.toContain("compose");
  });

  it("zaman aşımı sıfırlaması başarısız olunca exit etmez, 1 döner (tuzaktan güvenle çağrılır)", () => {
    const result = harness(`
db_psql() { return 1; }
set +e
reset_database_timeouts agent_sozluk
echo "donus=$?"
`);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("donus=1");
  });

  it("dondurma yarıdayken gelen hatada eski sürümü geri açar ve aşamayı geri alır", () => {
    const result = harness(`
install -d "$migration_marker"
printf 'image-verified\\n' >"$migration_marker/phase"
reopen_previous_release() { printf 'reopen\\n' >>"$log"; }
(
  trap migration_exit_trap EXIT
  freeze_started=1
  migration_fail FREEZE_OTHER_SESSIONS
) || true
printf 'faz=%s\\n' "$(cat "$migration_marker/phase")"
`);
    expect(result.stdout).toContain("faz=image-verified");
    expect(readFileSync(path.join(result.root, "calls.log"), "utf8")).toContain("reopen");
  });

  it("dondurmadan sonraki aşamada hata olunca aşamayı image-verified'e geri alır", () => {
    const result = harness(`
install -d "$migration_marker"
printf 'backup-verified\\n' >"$migration_marker/phase"
reopen_previous_release() { return 0; }
( trap migration_exit_trap EXIT; migration_fail RESTORE_FINGERPRINT_MISMATCH ) || true
printf 'faz=%s\\n' "$(cat "$migration_marker/phase")"
`);
    expect(result.stdout).toContain("faz=image-verified");
  });

  it("migration başladıktan sonraki hatada siteyi açmaz ve aşamayı değiştirmez", () => {
    const result = harness(`
install -d "$migration_marker"
printf 'migrating\\n' >"$migration_marker/phase"
reopen_previous_release() { printf 'reopen\\n' >>"$log"; }
( trap migration_exit_trap EXIT; migration_fail MIGRATION_STATE_AMBIGUOUS 98 ) || true
printf 'faz=%s\\n' "$(cat "$migration_marker/phase")"
`);
    expect(result.stdout).toContain("faz=migrating");
    expect(result.stderr).toContain("RELEASE_MIGRATION_MANUAL phase=migrating");
    expect(readFileSync(path.join(result.root, "calls.log"), "utf8")).not.toContain("reopen");
  });

  it("FK hedef listesinin son (ve tek) hedefini de sınar (Astra, kod turu)", () => {
    const result = harness(`
printf '%s' '{"types":{},"tables":{"yeni":{"columns":["id","userId"],"primaryKey":["id"],"checkConstraints":0,"uniqueConstraints":0,"foreignKeys":[{"column":"userId","referencedTable":"users","referencedColumn":"id","onDelete":"SET NULL","onUpdate":"CASCADE"}]}},"indexes":{}}' >"$state_dir/migration/expectation.json"
host_node="$(command -v node)"
db_psql() { printf 'psql %s\\n' "$*" >>"$log"; printf '1\\n'; }
assert_fk_targets
grep -c 'target=users' "$log"
`);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("1");
  });

  it("uygun olmayan tek FK hedefini reddeder", () => {
    const result = harness(`
printf '%s' '{"types":{},"tables":{"yeni":{"foreignKeys":[{"referencedTable":"users"}]}},"indexes":{}}' >"$state_dir/migration/expectation.json"
host_node="$(command -v node)"
db_psql() { printf '0\\n'; }
assert_fk_targets
`);
    expect(result.status).toBe(97);
    expect(result.stderr).toContain("code=FOREIGN_KEY_TARGET_UNSUPPORTED");
  });

  it("kesinti süresi dolunca veritabanı komutu çalıştırmadan durur", () => {
    const result = harness(`
frozen_deadline=$(( $(date +%s) - 1 ))
db_psql agent_sozluk -c 'SELECT 1'
echo ULASILMAMALI
`);
    expect(result.status).toBe(97);
    expect(result.stderr).toContain("code=DOWNTIME_BUDGET_EXCEEDED");
    expect(result.stdout).not.toContain("ULASILMAMALI");
    expect(readFileSync(path.join(result.root, "calls.log"), "utf8")).not.toContain("compose");
  });

  it("kesinti süresi dolmuşken de tuzak scratch'i denemeye çalışır ve eski siteyi geri açar (Astra, 2. kod turu)", () => {
    const result = harness(`
install -d "$migration_marker"
printf 'backup-verified\\n' >"$migration_marker/phase"
db_psql() { printf 'psql\\n' >>"$log"; }
reopen_previous_release() { printf 'reopen\\n' >>"$log"; }
(
  trap migration_exit_trap EXIT
  frozen_deadline=$(( $(date +%s) - 10 ))
  scratch_database=agent_sozluk_a5_20260923_120000_012345
  scratch_owned=1
  migration_fail RESTORE_FINGERPRINT_MISMATCH
) || true
printf 'faz=%s\\n' "$(cat "$migration_marker/phase")"
`);
    expect(result.stderr).not.toContain("code=DOWNTIME_BUDGET_EXCEEDED");
    expect(result.stdout).toContain("faz=image-verified");
    // Düşürme denendi, başarısız oldu ama tuzağı kesmedi; geri açma sürdü.
    expect(result.stderr).toContain("RELEASE_WARN scratch database left");
    expect(readFileSync(path.join(result.root, "calls.log"), "utf8")).toContain("reopen");
  });

  it("prova, süre dolunca önceki imajın sağlık ve smoke adımına girmeden durur", () => {
    const result = harness(`
printf 'sha256:onceki\\n' >"$state_dir/previous-image-id"
# \`env … compose run\` kabuk fonksiyonu çalıştıramaz; üretimdeki gibi gerçek komut.
compose=(true)
scratch_database=agent_sozluk_a5_20260923_120000_012345
frozen_deadline=$(( $(date +%s) - 1 ))
rehearse_previous_image
echo ULASILMAMALI
`);
    expect(result.status).toBe(97);
    expect(result.stderr).toContain("code=DOWNTIME_BUDGET_EXCEEDED");
    expect(result.stdout).not.toContain("ULASILMAMALI");
    expect(readFileSync(path.join(result.root, "calls.log"), "utf8")).not.toContain("docker exec");
  });

  it("şema özeti yalnız bu migration'ın mevcut tabloya eklediği indeksin TOC girdisini düşer", () => {
    // pg_dump biçimi: her girdi `--` / `-- Name: …` / `--` başlığı, boş satır, tanım
    // ve iki boş satır. Yalnız CREATE satırını düşmek başlığı bırakır ve migration
    // sonrası tablo özeti öncekine hiç eşit çıkmazdı.
    const entry = (name: string, type: string, body: string): string =>
      `--\\n-- Name: ${name}; Type: ${type}; Schema: public; Owner: -\\n--\\n\\n${body}\\n\\n\\n`;
    const head =
      "\\\\restrict abc\\n\\n" +
      entry("agent_runs", "TABLE", "CREATE TABLE public.agent_runs (\\n    id uuid\\n);");
    const tail = entry(
      "agent_runs_leaseExpiresAt_idx",
      "INDEX",
      'CREATE INDEX "agent_runs_leaseExpiresAt_idx" ON public.agent_runs USING btree ("leaseExpiresAt");',
    );
    const added = entry(
      "agent_runs_finishedAt_idx",
      "INDEX",
      'CREATE INDEX "agent_runs_finishedAt_idx" ON public.agent_runs USING btree ("finishedAt");',
    );
    const other = entry(
      "agent_runs_baska_idx",
      "INDEX",
      "CREATE INDEX agent_runs_baska_idx ON public.agent_runs USING btree (id);",
    );
    const unique = entry(
      "agent_runs_finishedAt_idx",
      "INDEX",
      'CREATE UNIQUE INDEX "agent_runs_finishedAt_idx" ON public.agent_runs USING btree ("finishedAt");',
    );
    const result = harness(`
printf 'agent_runs_finishedAt_idx\\n' >"$migration_dir/existing-index-names"
ozet() { printf "$1" | schema_dump_filter | sha256sum | cut -d ' ' -f 1; }
printf 'once=%s\\n' "$(ozet '${head}${tail}')"
printf 'sonra=%s\\n' "$(ozet '${head}${added}${tail}')"
printf 'baska=%s\\n' "$(ozet '${head}${other}${tail}')"
printf 'tekil=%s\\n' "$(ozet '${head}${unique}${tail}')"
printf 'restrict=%s\\n' "$(ozet '\\\\restrict xyz\\n\\n${entry("agent_runs", "TABLE", "CREATE TABLE public.agent_runs (\\n    id uuid\\n);")}${tail}')"
: >"$migration_dir/existing-index-names"
printf 'bosliste=%s\\n' "$(ozet '${head}${added}${tail}')"
`);
    expect(result.status, result.stderr).toBe(0);
    const value = (key: string): string =>
      new RegExp(`^${key}=([0-9a-f]{64})$`, "mu").exec(result.stdout)?.[1] ?? "";
    expect(value("once")).not.toBe("");
    expect(value("sonra")).toBe(value("once"));
    expect(value("restrict")).toBe(value("once"));
    expect(value("baska")).not.toBe(value("once"));
    expect(value("tekil")).not.toBe(value("once"));
    expect(value("bosliste")).not.toBe(value("once"));
  });

  it("aşama yalnız ileri gider", () => {
    const result = harness(`
install -d "$migration_marker"
set_phase planned
set_phase frozen
set_phase planned
printf 'faz=%s\\n' "$(cat "$migration_marker/phase")"
`);
    expect(result.stdout).toContain("faz=frozen");
  });
});

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

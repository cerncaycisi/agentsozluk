import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/*
  A5 reset modu aşamaları (runbook v20), sahte `db_psql`/`reset_cli`/`systemctl`/`sudo`/compose
  ile GERÇEKTEN çalıştırılır; A5 faz testleriyle aynı yaklaşım.
*/
const migrationPhase = path.join(process.cwd(), "scripts/production-migration-phase.sh");
const resetPhase = path.join(process.cwd(), "scripts/production-reset-phase.sh");
const operationId = "11111111-2222-4333-8444-555555555555";
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function harness(body: string): { status: number; stdout: string; stderr: string; root: string } {
  const root = mkdtempSync(path.join(tmpdir(), "reset-phase-"));
  directories.push(root);
  const script = `
set -Eeuo pipefail
runtime_root="${root}/runtime"
state_dir="${root}/state"
app_root="${process.cwd()}"
candidate_sha=${"a".repeat(40)}
candidate_image=agent-sozluk:${"a".repeat(40)}
op_id=0123456789abcdef
host_node="$(command -v node)"
reset_mode=1
reset_operation_id=${operationId}
reset_ack=""
approved_migrations=20260926090000_public_id_bigint_namespace,20260926120000_great_reset_records
mkdir -p "$runtime_root" "$state_dir/migration"
log="${root}/calls.log"
: >"$log"
compose_stub() { printf 'compose %s\\n' "$*" >>"$log"; }
compose=(compose_stub)
source "${migrationPhase}"
source "${resetPhase}"
install -d "$migration_marker"
docker() { printf 'docker %s\\n' "$*" >>"$log"; }
sudo() { printf 'sudo %s\\n' "$*" >>"$log"; }
systemctl() { printf 'systemctl %s\\n' "$*" >>"$log"; printf 'disabled\\n'; }
assert_frozen() { :; }
lifecycle_fingerprint() { printf 'life\\n'; }
printf 'life\\n' >"$state_dir/lifecycle-hash"
reset_settings_fingerprint() { printf 'settings\\n'; }
${body}
`;
  const result = spawnSync("bash", ["-c", script], { encoding: "utf8" });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr, root };
}

describe("A5 reset modu aşamaları", () => {
  it("dış kayıt isteği 75 ile çıkar, A5 kurtarmasını tetiklemez; onaysız yeniden giriş isteği tekrarlar", () => {
    const first = harness(`
printf '/opt/x.dump\\n' >"$migration_marker/reset-dump-path"
printf '{"sha256":"${"e".repeat(64)}"}' >"$state_dir/scratch.json"
printf '%s\\n' "$state_dir/scratch.json" >"$migration_marker/reset-scratch-receipt-path"
reopen_previous_release() { echo REOPENED; }
trap migration_exit_trap EXIT
reset_request_ledger PREPARED ${"b".repeat(64)} ${"c".repeat(64)}
reset_ledger_gate PREPARED
`);
    expect(first.status).toBe(75);
    expect(first.stdout).toContain(
      `RELEASE_RESET_AWAIT_LEDGER state=PREPARED operation=${operationId} dump_sha256=${"b".repeat(64)}`,
    );
    expect(first.stdout).toContain(`reference_sha256=${"e".repeat(64)}`);
    expect(first.stdout).not.toContain("REOPENED");
  });

  it("onay kalıcılaşır; kesintiden sonra kaydedilmiş onay yeniden kullanılır, çelişen istek durur", () => {
    const result = harness(`
reset_request_ledger PREPARED x y
reset_ack=PREPARED
reset_ledger_gate PREPARED && echo FIRST
reset_ack=""
reset_ledger_gate PREPARED && echo REUSED
reset_request_ledger PREPARED x y && echo SAME_REQUEST
reset_request_ledger PREPARED x z
`);
    expect(result.stdout).toContain("FIRST");
    expect(result.stdout).toContain("REUSED");
    expect(result.stdout).toContain("SAME_REQUEST");
    expect(result.stderr).toContain("code=RESET_LEDGER_REQUEST_CONFLICT");
    const wrong = harness(`
reset_request_ledger PREPARED x y
reset_ack=TRAFFIC_OPEN
reset_ledger_gate PREPARED
`);
    expect(wrong.status).toBe(75);
  });

  it("bayrak ara durumlarında kısmi değişim kabul edilir, katı durumlarda edilmez", () => {
    const run = (state: string, flags: string) =>
      harness(`
printf 'settings\\n' >"$state_dir/reset-settings-hash"
printf 'true|true|false|true\\n' >"$state_dir/reset-baseline-flags"
${state ? `printf '${state}\\n' >"$migration_marker/reset-flag-state"` : ""}
reset_flags() { printf '${flags}\\n'; }
reset_assert_state && echo OK
`);
    expect(run("", "true|true|false|true").stdout).toContain("OK");
    expect(run("freezing", "false|true|false|true").stdout).toContain("OK");
    expect(run("restoring", "true|false|false|false").stdout).toContain("OK");
    expect(run("frozen", "false|false|false|false").stdout).toContain("OK");
    expect(run("restored", "true|true|false|true").stdout).toContain("OK");
    // Başlangıçta kapalı olan bayrağın açılması hiçbir durumda kabul edilmez.
    expect(run("freezing", "true|true|true|true").stderr).toContain("code=RESET_FLAGS_UNEXPECTED");
    expect(run("frozen", "false|true|false|false").stderr).toContain("code=RESET_FLAGS_UNEXPECTED");
    expect(run("", "false|true|false|true").stderr).toContain("code=RESET_FLAGS_UNEXPECTED");
  });

  it("önizleme engel bulursa niyet geçersizleşir, PREPARED yazıldıysa ABORTED beklenir", () => {
    const result = harness(`
printf 'reset-prepared\\n' >"$migration_marker/phase"
printf '%s\\n' "$(($(date +%s) + max_downtime_seconds))" >"$migration_marker/frozen-deadline"
printf '${"d".repeat(64)}\\n' >"$migration_marker/reset-dump-sha256"
printf '/opt/x.dump\\n' >"$migration_marker/reset-dump-path"
printf 'PREPARED\\n' >"$migration_marker/reset-ack-PREPARED"
printf '{"sha256":"${"e".repeat(64)}"}' >"$state_dir/pre.json"
printf '%s\\n' "$state_dir/pre.json" >"$migration_marker/reset-pre-receipt-path"
reset_invalidate_intent() { printf 'cli intent-invalidate %s\\n' "$reset_operation_id" >>"$log"; }
reset_cli() {
  printf 'cli %s\\n' "$*" >>"$log"
  case "$2" in
    --dry-run) printf '{"planSha256":"${"f".repeat(64)}","blockedBy":["OTHER_DATABASE_CONNECTIONS"]}' ;;
    intent-invalidate) printf '{"invalidated":true}' ;;
    *) echo UNEXPECTED_CLI >&2; exit 1 ;;
  esac
}
reset_commit
`);
    expect(result.status).toBe(75);
    expect(result.stderr).toContain("RELEASE_RESET_ABORT reason=PREVIEW_BLOCKED");
    expect(result.stdout).toContain("RELEASE_RESET_AWAIT_LEDGER state=ABORTED");
    // İstek faz yazılmadan önce kalıcı.
    expect(
      readFileSync(
        path.join(result.root, "runtime/.migration-operation/reset-request-ABORTED"),
        "utf8",
      ),
    ).toBe(`ABORTED|${"d".repeat(64)}|-\n`);
    const calls = readFileSync(path.join(result.root, "calls.log"), "utf8");
    expect(calls).toContain(`intent-invalidate ${operationId}`);
    expect(calls).not.toContain("--execute");
    expect(readFileSync(path.join(result.root, "runtime/.migration-operation/phase"), "utf8")).toBe(
      "reset-aborted\n",
    );
  });

  it("vazgeçme zamanı geçtiyse önizleme bile çalışmaz", () => {
    const result = harness(`
printf 'reset-prepared\\n' >"$migration_marker/phase"
printf '%s\\n' "$((1 + max_downtime_seconds))" >"$migration_marker/frozen-deadline"
printf '${"d".repeat(64)}\\n' >"$migration_marker/reset-dump-sha256"
printf '/opt/x.dump\\n' >"$migration_marker/reset-dump-path"
printf 'PREPARED\\n' >"$migration_marker/reset-ack-PREPARED"
reset_invalidate_intent() { printf 'cli intent-invalidate\\n' >>"$log"; }
reset_cli() { printf 'cli %s\\n' "$*" >>"$log"; printf '{"invalidated":true}'; }
reset_commit
`);
    expect(result.status).toBe(75);
    expect(result.stderr).toContain("reason=ABORT_DEADLINE_PASSED");
    expect(readFileSync(path.join(result.root, "calls.log"), "utf8")).not.toContain("--dry-run");
  });

  it("EXECUTE sonucu belirsizse durur; yeniden girişte reset tekrarlanmaz", () => {
    const ambiguous = harness(`
printf 'reset-prepared\\n' >"$migration_marker/phase"
printf '%s\\n' "$(($(date +%s) + max_downtime_seconds))" >"$migration_marker/frozen-deadline"
printf '{"sha256":"${"e".repeat(64)}"}' >"$state_dir/pre.json"
printf '%s\\n' "$state_dir/pre.json" >"$migration_marker/reset-pre-receipt-path"
reset_cli() {
  printf 'cli %s\\n' "$*" >>"$log"
  case "$2" in
    --dry-run) printf '{"planSha256":"${"f".repeat(64)}","blockedBy":[]}' ;;
    --execute) return 1 ;;
  esac
}
admin_psql() { printf 't\\n'; }
db_psql() { printf '1\\n'; cat >/dev/null; }
reset_cli_count=0
reset_commit
`);
    // Commit satırı var ama CLI hata verdi: sonuç belirsiz sayılır, site kapalı kalır.
    expect(ambiguous.status).toBe(98);
    expect(ambiguous.stderr).toContain("code=RESET_OUTCOME_AMBIGUOUS");
    const reentry = harness(`
printf 'reset-committing\\n' >"$migration_marker/phase"
reset_cli() { printf 'cli %s\\n' "$*" >>"$log"; }
reset_phase
`);
    expect(reentry.status).toBe(98);
    expect(readFileSync(path.join(reentry.root, "calls.log"), "utf8")).not.toContain("cli ");
  });

  it("EXECUTE COMMIT öncesi düştüyse (commit yok, niyet tüketilmedi) resetsiz açılışa geçer", () => {
    const result = harness(`
printf 'reset-prepared\\n' >"$migration_marker/phase"
printf '%s\\n' "$(($(date +%s) + max_downtime_seconds))" >"$migration_marker/frozen-deadline"
printf '{"sha256":"${"e".repeat(64)}"}' >"$state_dir/pre.json"
printf '%s\\n' "$state_dir/pre.json" >"$migration_marker/reset-pre-receipt-path"
reset_cli() {
  printf 'cli %s\\n' "$*" >>"$log"
  case "$2" in
    --dry-run) printf '{"planSha256":"${"f".repeat(64)}","blockedBy":[]}' ;;
    --execute) return 1 ;;
    intent-invalidate) printf '{}' ;;
  esac
}
admin_psql() { printf 't\\n'; }
db_psql() { printf '0\\n'; cat >/dev/null; }
reset_invalidate_intent() { :; }
reset_finish_abort() { echo FINISH_ABORT; }
reset_commit
`);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("reason=EXECUTE_FAILED_BEFORE_COMMIT");
    // PREPARED yazılmamış: dış kayıt beklenmez, doğrudan resetsiz açılış.
    expect(result.stdout).toContain("FINISH_ABORT");
    expect(result.stdout).not.toContain("RELEASE_RESET_AWAIT_LEDGER");
  });

  it("reset modunda migration içeriği ve kümesi sabitlenmiştir", () => {
    const tampered = harness(`
mkdir -p "$state_dir/app/prisma/migrations/20260926090000_public_id_bigint_namespace" \\
  "$state_dir/app/prisma/migrations/20260926120000_great_reset_records"
echo 'SELECT 1;' >"$state_dir/app/prisma/migrations/20260926090000_public_id_bigint_namespace/migration.sql"
echo 'SELECT 1;' >"$state_dir/app/prisma/migrations/20260926120000_great_reset_records/migration.sql"
app_root="$state_dir/app"
printf '%s\\n%s\\n' 20260926090000_public_id_bigint_namespace 20260926120000_great_reset_records \\
  >"$migration_dir/pending"
reset_plan_pinned_migrations
`);
    expect(tampered.stderr).toContain("code=RESET_MIGRATION_CONTENT_MISMATCH");
    const extra = harness(`
printf '%s\\n%s\\n%s\\n' 20260926090000_public_id_bigint_namespace 20260926120000_great_reset_records \\
  20261001000000_extra >"$migration_dir/pending"
reset_plan_pinned_migrations
`);
    expect(extra.stderr).toContain("code=RESET_MIGRATION_SET_MISMATCH");
    const pinned = harness(`
printf '%s\\n%s\\n' 20260926090000_public_id_bigint_namespace 20260926120000_great_reset_records \\
  >"$migration_dir/pending"
reset_plan_pinned_migrations && cat "$migration_dir/expectation.json"
`);
    expect(pinned.status).toBe(0);
    expect(pinned.stdout).toContain("great_reset_exposure_events");
  });

  it("post-verify yalnız iki public ID sequence'inin tip alanını izinli fark sayar", () => {
    const result = harness(`
printf '%s\\n' 'seqdef:entries_public_id_seq|integer|1|1|2147483647|1|f' \\
  'seqdef:other_seq|integer|1|1|2147483647|1|f' | reset_expected_sequences
printf '%s\\n' 'entries|a' 'topics|b' 'users|c' | reset_filter_schema_lines
`);
    expect(result.stdout).toBe(
      "seqdef:entries_public_id_seq|bigint|1|1|2147483647|1|f\n" +
        "seqdef:other_seq|integer|1|1|2147483647|1|f\n" +
        "users|c\n",
    );
  });
  it("uzak betik reset modunu ve ack'i ayrıştırır; ack yalnız reset modunda kabul edilir", () => {
    const run = (...args: string[]) =>
      spawnSync(
        "bash",
        ["scripts/production-release-remote.sh", "a".repeat(40), "no-cleanup", ...args],
        {
          encoding: "utf8",
        },
      );
    const list = "20260926090000_public_id_bigint_namespace,20260926120000_great_reset_records";
    const mode = `reset:${operationId}:${list}`;
    // Geçerli biçim ayrıştırmayı geçer ve ilk üretim kimliği denetiminde (host) durur.
    expect(run(mode, "0123456789abcdef").status).toBe(91);
    expect(run(mode, "0123456789abcdef", "ack:PREPARED").status).toBe(91);
    expect(run(mode, "0123456789abcdef", "ack:SOMETHING").stderr).toContain(
      "code=INVALID_RESET_ACK",
    );
    expect(run(`apply:${list}`, "0123456789abcdef", "ack:PREPARED").stderr).toContain(
      "code=INVALID_RESET_ACK",
    );
    expect(run(`reset:not-a-uuid:${list}`, "0123456789abcdef").stderr).toContain(
      "code=INVALID_MIGRATION_MODE",
    );
  });
  it("vazgeçme fazında ABORTED isteği kesintiyle atlanamaz", () => {
    const result = harness(`
printf 'reset-aborted\\n' >"$migration_marker/phase"
printf 'PREPARED\\n' >"$migration_marker/reset-ack-PREPARED"
printf '${"d".repeat(64)}\\n' >"$migration_marker/reset-dump-sha256"
reset_finish_abort() { echo OPENED_WITHOUT_ABORTED_ACK; }
reset_phase
`);
    // İstek dosyası yoktu (istek ile faz arasında kesinti): istek tamamlanır ve beklenir.
    expect(result.status).toBe(75);
    expect(result.stdout).toContain("RELEASE_RESET_AWAIT_LEDGER state=ABORTED");
    expect(result.stdout).not.toContain("OPENED_WITHOUT_ABORTED_ACK");
  });

  it("niyet yeniden girişte DB'deki açık niyeti kullanır; tüketilmiş niyette durur", () => {
    const reuse = harness(`
reset_intent_state() { printf 'OPEN\\n'; }
reset_cli() { printf 'cli %s\\n' "$*" >>"$log"; }
reset_create_intent && echo PHASE_$(current_phase)
`);
    expect(reuse.stdout).toContain("PHASE_reset-intent");
    expect(readFileSync(path.join(reuse.root, "calls.log"), "utf8")).not.toContain("intent-create");
    const consumed = harness(`
reset_intent_state() { printf 'CONSUMED\\n'; }
reset_create_intent
`);
    expect(consumed.stderr).toContain("code=RESET_INTENT_CONSUMED");
    const invalidated = harness(`
reset_intent_state() { printf 'INVALIDATED\\n'; }
reset_cli() { printf 'cli %s\\n' "$*" >>"$log"; }
reset_invalidate_intent && echo OK
`);
    expect(invalidated.stdout).toContain("OK");
    expect(readFileSync(path.join(invalidated.root, "calls.log"), "utf8")).not.toContain(
      "intent-invalidate",
    );
  });

  it("çalışmakta olan oneshot servis (activating) bitmiş sayılmaz", () => {
    const result = harness(`
systemctl() { printf 'inactive\\nactivating\\ninactive\\n'; }
reset_running_services
`);
    expect(result.stdout.trim()).toBe("1");
  });

  it("ayar özeti ve bayrak sorguları geçerli SQL tırnaklarıyla gönderilir", () => {
    const result = harness(`
source "$app_root/scripts/production-reset-phase.sh"
compose_stub() { cat >>"$log"; }
reset_settings_fingerprint >/dev/null
reset_flags >/dev/null
`);
    const sql = readFileSync(path.join(result.root, "calls.log"), "utf8");
    expect(sql).toContain("ARRAY['runtimeEnabled', 'schedulerEnabled', 'publicWriteEnabled',");
    expect(sql).toContain("WHERE id = 'global'");
  });
  it("önizleme vazgeçme sınırını aşarsa EXECUTE başlamaz", () => {
    const result = harness(`
printf 'reset-prepared\\n' >"$migration_marker/phase"
printf '%s\\n' "$(($(date +%s) + max_downtime_seconds - reset_abort_seconds + 1))" >"$migration_marker/frozen-deadline"
printf '{"sha256":"${"e".repeat(64)}"}' >"$state_dir/pre.json"
printf '%s\\n' "$state_dir/pre.json" >"$migration_marker/reset-pre-receipt-path"
reset_invalidate_intent() { :; }
reset_finish_abort() { echo FINISH_ABORT; }
reset_cli() {
  printf 'cli %s\\n' "$*" >>"$log"
  case "$2" in
    --dry-run) sleep 2; printf '{"planSha256":"${"f".repeat(64)}","blockedBy":[]}' ;;
  esac
}
reset_commit
`);
    expect(result.stderr).toContain("reason=ABORT_DEADLINE_PASSED_AFTER_PREVIEW");
    expect(readFileSync(path.join(result.root, "calls.log"), "utf8")).not.toContain("--execute");
  });

  it("PREPARED isteği kalıcıysa yeniden girişte yeni yedek alınmaz, eski yedek doğrulanır", () => {
    const result = harness(`
printf 'yedek' >"$state_dir/x.dump"
sha=$(sha256sum "$state_dir/x.dump" | cut -d ' ' -f 1)
printf '{"sha256":"${"e".repeat(64)}"}' >"$state_dir/pre.json"
printf '{}' >"$state_dir/scratch.json"
printf '%s\\n' "$state_dir/x.dump" >"$migration_marker/reset-dump-path"
printf '%s\\n' "$sha" >"$migration_marker/reset-dump-sha256"
printf '%s\\n' "$state_dir/pre.json" >"$migration_marker/reset-pre-receipt-path"
printf '%s\\n' "$state_dir/scratch.json" >"$migration_marker/reset-scratch-receipt-path"
reset_request_ledger PREPARED "$sha" ${"e".repeat(64)}
reset_backup_and_verify && echo PHASE_$(current_phase)
printf 'değişti' >"$state_dir/x.dump"
reset_backup_and_verify
`);
    expect(result.stdout).toContain("PHASE_reset-backup-verified");
    expect(result.stderr).toContain("code=RESET_PREPARED_ARTIFACT_CHANGED");
    expect(readFileSync(path.join(result.root, "calls.log"), "utf8")).not.toContain("pg_dump");
  });

  it("kurtarma bütçesi tek ve kalıcı bir son süredir", () => {
    const result = harness(`
reset_recovery_budget
first=$frozen_deadline
sleep 1
reset_recovery_budget
test "$first" = "$frozen_deadline" && echo SAME
`);
    expect(result.stdout).toContain("SAME");
  });

  it("dondurma yarıda kalan erken hatada birimler önceki durumuna döner", () => {
    const result = harness(`
printf 'image-verified\\n' >"$migration_marker/phase"
printf 'agent-sozluk-alarm.timer|enabled|active\\n' >"$migration_marker/reset-units"
reset_restore_units() { echo UNITS_RESTORED; }
reopen_previous_release() { echo REOPENED; }
trap migration_exit_trap EXIT
false
`);
    expect(result.stdout).toContain("UNITS_RESTORED");
  });
});

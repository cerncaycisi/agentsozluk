import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/*
  Operatör sarmalayıcısının great reset modu (runbook v20 A5 reset modu): bayrak/onay denetimleri
  gerçek betikle (üretime ulaşmadan), dış kayıt isteği işleyicisi ise betikten çıkarılan
  fonksiyonlarla ve sahte uzak adımlarla çalıştırılır.
*/
const wrapper = path.join(process.cwd(), "scripts/deploy-production-no-migration.sh");
const source = readFileSync(wrapper, "utf8");
const operationId = "11111111-2222-4333-8444-555555555555";
const sha = "a".repeat(40);
const migrations = "20260926090000_public_id_bigint_namespace,20260926120000_great_reset_records";
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function run(env: Record<string, string>, ...args: string[]) {
  const environment = {
    PATH: process.env.PATH ?? "",
    HOME: tmpdir(),
    NODE_ENV: "test",
    ...env,
  } as NodeJS.ProcessEnv;
  return spawnSync("bash", [wrapper, "--sha", sha, "--artifact-run", "1", "--execute", ...args], {
    encoding: "utf8",
    env: environment,
  });
}

function extract(name: string): string {
  const start = source.indexOf(`${name}() {`);
  const end = source.indexOf("\n}\n", start);
  if (start < 0 || end < 0) throw new Error(`missing ${name}`);
  return source.slice(start, end + 3);
}

describe("sarmalayıcı great reset modu", () => {
  const approved = {
    AGENT_SOZLUK_PRODUCTION_APPROVED_SHA: sha,
    AGENT_SOZLUK_PRODUCTION_APPROVED_MIGRATIONS: migrations,
  };

  it("exact operasyon onayı, sabit migration listesi ve duraklatma olmadan başlamaz", () => {
    expect(
      run(
        approved,
        "--apply-migrations",
        migrations,
        "--pause-society-flow",
        "--great-reset",
        operationId,
      ).stderr,
    ).toContain("code=EXACT_RESET_APPROVAL_REQUIRED");
    const withApproval = { ...approved, AGENT_SOZLUK_GREAT_RESET_APPROVED: operationId };
    expect(
      run(
        {
          ...withApproval,
          AGENT_SOZLUK_PRODUCTION_APPROVED_MIGRATIONS: "20260926090000_public_id_bigint_namespace",
        },
        "--apply-migrations",
        "20260926090000_public_id_bigint_namespace",
        "--pause-society-flow",
        "--great-reset",
        operationId,
      ).stderr,
    ).toContain("code=RESET_MIGRATION_LIST_MISMATCH");
    expect(
      run(withApproval, "--apply-migrations", migrations, "--great-reset", operationId).stderr,
    ).toContain("code=RESET_REQUIRES_PAUSE");
    expect(
      run({
        AGENT_SOZLUK_PRODUCTION_APPROVED_SHA: sha,
        AGENT_SOZLUK_GREAT_RESET_APPROVED: operationId,
      }).stderr,
    ).toContain("code=RESET_APPROVAL_WITHOUT_FLAG");
    expect(
      run(
        withApproval,
        "--apply-migrations",
        migrations,
        "--pause-society-flow",
        "--great-reset",
        "x",
      ).stderr,
    ).toContain("code=INVALID_GREAT_RESET_OPERATION");
  });

  function harness(body: string) {
    const root = mkdtempSync(path.join(tmpdir(), "reset-wrapper-"));
    directories.push(root);
    const script = `
set -Eeuo pipefail
great_reset_operation=${operationId}
candidate_sha=${sha}
reset_work="${root}/work"
root="${root}"
mkdir -p "$reset_work"
log="${root}/calls.log"
: >"$log"
${extract("reset_fail")}
${extract("reset_field")}
${extract("reset_handle_await")}
reset_fetch() { printf 'fetch %s\\n' "$1" >>"$log"; printf 'dosya' >"$2"; }
reset_ledger_append() { printf 'ledger %s\\n' "$*" >>"$log"; }
${body}
`;
    const result = spawnSync("bash", ["-c", script], { encoding: "utf8" });
    return { ...result, calls: () => readFileSync(path.join(root, "calls.log"), "utf8") };
  }

  const dumpSha = "0f3a5b5e1a7c5d5b0b9e8c1bd2e9f6d4b2d1e3e1a5a0d0b8c9f2e7d6c5b4a391";

  it("PREPARED: yedek SHA'sı tutmazsa kayda yazmaz", () => {
    const result = harness(`
mkdir -p "$root/scripts"
reset_handle_await "RELEASE_RESET_AWAIT_LEDGER state=PREPARED operation=${operationId} dump_sha256=${dumpSha} receipt_sha256=${"c".repeat(64)} dump_path=/opt/agent-sozluk/backups/agent-sozluk-20260928T170000Z-reset-11111111.dump reference_path=/opt/agent-sozluk/runtime/.release-op-${sha}/migration/reset-scratch-receipt-20260928T170500Z.json reference_sha256=${"d".repeat(64)}"
`);
    expect(result.stderr).toContain("code=RESET_DUMP_SHA_MISMATCH");
    expect(result.calls()).not.toContain("ledger");
  });

  it("PREPARED: operatör kapısı geçmezse kayda yazmaz; geçerse PREPARED yazar ve ack hazırlar", () => {
    // `dosya` içeriğinin SHA-256'sı.
    const fileSha = spawnSync("bash", ["-c", "printf dosya | sha256sum | cut -d ' ' -f 1"], {
      encoding: "utf8",
    }).stdout.trim();
    const line = `RELEASE_RESET_AWAIT_LEDGER state=PREPARED operation=${operationId} dump_sha256=${fileSha} receipt_sha256=${"c".repeat(64)} dump_path=/opt/agent-sozluk/backups/agent-sozluk-20260928T170000Z-reset-11111111.dump reference_path=/opt/agent-sozluk/runtime/.release-op-${sha}/migration/reset-scratch-receipt-20260928T170500Z.json reference_sha256=${"d".repeat(64)}`;
    const failing = harness(`
mkdir -p "$root/scripts"
printf 'echo RESET_OPERATOR_GATE_FAIL; exit 97\\n' >"$root/scripts/great-reset-operator-gate.sh"
reset_handle_await "${line}"
`);
    expect(failing.stderr).toContain("code=RESET_OPERATOR_GATE_FAILED");
    expect(failing.calls()).not.toContain("ledger");
    const passing = harness(`
mkdir -p "$root/scripts"
printf 'echo RESET_OPERATOR_GATE_PASS\\n' >"$root/scripts/great-reset-operator-gate.sh"
reset_handle_await "${line}"
echo "ACK=$reset_next_ack"
`);
    expect(passing.stdout).toContain("ACK=ack:PREPARED");
    expect(passing.calls()).toContain(`ledger PREPARED ${fileSha} -`);
  });

  it("başka operasyonun ya da biçimsiz isteğin kaydına yazmaz", () => {
    const other = harness(`
reset_handle_await "RELEASE_RESET_AWAIT_LEDGER state=TRAFFIC_OPEN operation=66666666-7777-4888-9999-aaaaaaaaaaaa dump_sha256=${dumpSha} receipt_sha256=${"c".repeat(64)} dump_path=- reference_path=- reference_sha256=-"
`);
    expect(other.stderr).toContain("code=RESET_AWAIT_OPERATION_MISMATCH");
    const traffic = harness(`
reset_handle_await "RELEASE_RESET_AWAIT_LEDGER state=TRAFFIC_OPEN operation=${operationId} dump_sha256=${dumpSha} receipt_sha256=${"c".repeat(64)} dump_path=- reference_path=- reference_sha256=-"
echo "ACK=$reset_next_ack"
`);
    expect(traffic.calls()).toContain(`ledger TRAFFIC_OPEN ${dumpSha} ${"c".repeat(64)}`);
    expect(traffic.stdout).toContain("ACK=ack:TRAFFIC_OPEN");
  });
  function loopHarness(body: string) {
    const root = mkdtempSync(path.join(tmpdir(), "reset-loop-"));
    directories.push(root);
    const script = `
set -Eeuo pipefail
${extract("report_unexpected_error")}
trap report_unexpected_error ERR
great_reset_rollback=0
great_reset_operation=${operationId}
candidate_sha=${sha}
reset_work="${root}/work"
mkdir -p "$reset_work"
calls="${root}/calls.log"
: >"$calls"
ssh_options=()
expected_ip=127.0.0.1
${extract("reset_fail")}
${extract("reset_freeze_operator_units")}
${extract("great_reset_run")}
remote_release_command() { printf '%s' "$1"; }
reset_restore_operator_units() { echo RESTORED >>"$calls"; }
reset_remote_state() { echo UNRESOLVED; }
${body}
`;
    const result = spawnSync("bash", ["-c", script], { encoding: "utf8" });
    return { ...result, calls: () => readFileSync(path.join(root, "calls.log"), "utf8") };
  }

  it("75 ERR tuzağına düşmez: istek işlenir, ack ile yeniden çağrılır, sonunda timer döner", () => {
    const result = loopHarness(`
reset_freeze_operator_units() { echo FROZEN >>"$calls"; }
reset_handle_await() { echo "HANDLED $1" >>"$calls"; reset_next_ack=ack:PREPARED; }
ssh() {
  # Boru hattında alt kabukta koşar: sayaç dosyada.
  echo x >>"$reset_work/count"; count=$(wc -l <"$reset_work/count"); printf 'ssh %s\\n' "\${@: -1}" >>"$calls"
  if test "$count" = 1; then printf 'RELEASE_MIGRATION_PHASE frozen\\r\\nRELEASE_RESET_AWAIT_LEDGER state=PREPARED operation=x\\r\\n'; return 75; fi
  return 0
}
great_reset_run
echo DONE >>"$calls"
`);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const calls = result.calls();
    expect(calls).toContain("HANDLED RELEASE_RESET_AWAIT_LEDGER state=PREPARED operation=x");
    expect(calls).toContain("ssh ack:PREPARED");
    expect(calls).toContain("RESTORED");
    expect(calls).toContain("DONE");
  });

  it("hata sonrası timer kararı uzak durumdan: SAFE ise döner, değilse kapalı kalır", () => {
    const safe = loopHarness(`
reset_freeze_operator_units() { :; }
reset_remote_state() { echo SAFE; }
ssh() { printf 'RELEASE_FAIL code=X\\n'; return 1; }
great_reset_run
`);
    expect(safe.status).toBe(1);
    expect(safe.calls()).toContain("RESTORED");
    // Günlükte 'frozen' satırı olmasa da (yeniden giriş) uzak durum UNRESOLVED ise açılmaz;
    // sahte 'rewound after reopen' metni de karar vermez (Astra, PR #240 2. tur).
    const unresolved = loopHarness(`
reset_freeze_operator_units() { :; }
reset_remote_state() { echo UNRESOLVED; }
ssh() { printf 'previous release NOT rewound after reopen failure\\n'; return 98; }
great_reset_run
`);
    expect(unresolved.status).toBe(98);
    expect(unresolved.calls()).not.toContain("RESTORED");
    expect(unresolved.stderr).toContain("operator backup timer stays disabled");
  });

  it("yerel dondurma düşerse timer yalnız uzak durum SAFE ise döner", () => {
    const safe = loopHarness(`
: >"$reset_work/operator-units"
reset_remote_state() { echo SAFE; }
reset_freeze_operator_units() { reset_fail RESET_OPERATOR_BACKUP_RUNNING; }
ssh() { echo SSH_CALLED >>"$calls"; return 0; }
great_reset_run
`);
    expect(safe.stderr).toContain("code=RESET_OPERATOR_FREEZE_FAILED");
    expect(safe.calls()).toContain("RESTORED");
    expect(safe.calls()).not.toContain("SSH_CALLED");
    // Yeniden girişte bakım sürüyor olabilir: uzak durum SAFE değilse açılmaz.
    const unresolved = loopHarness(`
: >"$reset_work/operator-units"
reset_freeze_operator_units() { reset_fail RESET_OPERATOR_BACKUP_RUNNING; }
great_reset_run
`);
    expect(unresolved.calls()).not.toContain("RESTORED");
    expect(unresolved.stderr).toContain("operator backup timer stays disabled");
  });

  it("devre dışı ama hâlâ aktif timer dondurulmuş sayılmaz", () => {
    const result = loopHarness(`
systemctl() {
  case "$*" in
    "--user is-enabled agentsozluk-yedek.timer") echo disabled ;;
    "--user is-active agentsozluk-yedek.timer") echo active ;;
    "--user is-active agentsozluk-yedek.service") echo inactive ;;
    *) return 0 ;;
  esac
}
reset_freeze_operator_units
`);
    expect(result.stderr).toContain("code=RESET_OPERATOR_TIMER_STILL_ACTIVE");
  });
  it("timer geri dönüşü başlatma başarısızsa başarı bildirmez", () => {
    const root = mkdtempSync(path.join(tmpdir(), "reset-restore-"));
    directories.push(root);
    const script = `
set -Eeuo pipefail
reset_work="${root}"
printf 'enabled|active\\n' >"$reset_work/operator-units"
${extract("reset_fail")}
${extract("reset_restore_operator_units")}
systemctl() {
  case "$*" in
    "--user start agentsozluk-yedek.timer") return 1 ;;
    "--user is-enabled agentsozluk-yedek.timer") echo enabled ;;
    "--user is-active agentsozluk-yedek.timer") echo inactive ;;
    *) return 0 ;;
  esac
}
reset_restore_operator_units
`;
    const result = spawnSync("bash", ["-c", script], { encoding: "utf8" });
    expect(result.stdout).not.toContain("RELEASE_RESET_OPERATOR_UNITS_RESTORED");
    expect(result.stderr).toContain("code=RESET_OPERATOR_TIMER_RESTORE_FAILED");
  });

  // Gerçek dış kayıt CLI'si, geçici 0600 kayıtla.
  function rollbackPrecondition(states: string[], candidate?: string) {
    const root = mkdtempSync(path.join(tmpdir(), "reset-rollback-"));
    directories.push(root);
    const ledger = path.join(root, "ledger.jsonl");
    const append = (state: string) =>
      [
        `./node_modules/.bin/tsx scripts/great-reset-ledger.ts --file "${ledger}" append ${state}`,
        operationId,
        sha,
        "d".repeat(64),
        state === "PREPARED" || state === "ABORTED" ? "-" : "e".repeat(64),
        ">/dev/null",
      ].join(" ");
    const script = `
set -Eeuo pipefail
root="${process.cwd()}"
reset_ledger="${ledger}"
great_reset_operation=${operationId}
candidate_sha=\${candidate:-${sha}}
${extract("reset_fail")}
${extract("reset_assert_rollback_allowed")}
${states.map(append).join("\n")}
reset_next_ack=unset
reset_assert_rollback_allowed
echo "ACK=[$reset_next_ack]"
`;
    return spawnSync("bash", ["-c", script], {
      encoding: "utf8",
      env: { ...process.env, ...(candidate ? { candidate } : {}) },
    });
  }

  it("geri dönüş: dış kayıt SHA'ları uzağa gider; ROLLED_BACK'te yalnız tamamlama, başka durumda durur", () => {
    const committed = rollbackPrecondition(["PREPARED", "COMMITTED_MAINTENANCE"]);
    expect(committed.stdout).toContain(`ACK=[rollback:${"d".repeat(64)}:${"e".repeat(64)}]`);
    // ACK kaybı: kayıt ROLLED_BACK; aynı kimlik uzağa gider, uzak taraf yalnız tamamlar (Astra,
    // PR #242 P2 ve 2. tur).
    const rolled = rollbackPrecondition(["PREPARED", "COMMITTED_MAINTENANCE", "ROLLED_BACK"]);
    expect(rolled.stdout).toContain(`ACK=[rollback:${"d".repeat(64)}:${"e".repeat(64)}]`);
    // Kayıt başka release'e aitse durur.
    const otherRelease = rollbackPrecondition(
      ["PREPARED", "COMMITTED_MAINTENANCE", "ROLLED_BACK"],
      "b".repeat(40),
    );
    expect(otherRelease.stderr).toContain("code=RESET_ROLLBACK_RELEASE_MISMATCH");
    const traffic = rollbackPrecondition(["PREPARED", "COMMITTED_MAINTENANCE", "TRAFFIC_OPEN"]);
    expect(traffic.stderr).toContain("code=RESET_ROLLBACK_NOT_ALLOWED");
    const prepared = rollbackPrecondition(["PREPARED"]);
    expect(prepared.stderr).toContain("code=RESET_ROLLBACK_NOT_ALLOWED");
    // Gerçek dış kayıt CLI'si her durumda birkaç kez başlar; varsayılan 5 sn sınırı dar.
  }, 30_000);

  it("boşaltma genel duraklatmadan ve uzak bakımdan önce, ayrı bayrak kaydıyla; bayraklar kesin sonuçlarda otomatik döner", () => {
    const source = readFileSync("scripts/deploy-production-no-migration.sh", "utf8");
    const drain = source.indexOf(
      'if test -n "$great_reset_operation" && test "$great_reset_rollback" = 0; then',
    );
    const pause = source.indexOf('if test "$pause_society_flow" = 1; then\n  "$local_timeout" 180');
    const run = source.lastIndexOf("  great_reset_run\n");
    expect(drain).toBeGreaterThan(0);
    // Kayıt dört bayrağın gerçek bakım öncesi değerlerini tutsun: duraklatmadan önce.
    expect(drain).toBeLessThan(pause);
    expect(pause).toBeLessThan(run);
    const block = source.slice(drain, source.indexOf("\nfi\n", drain));
    expect(block).toContain("reset_operator_ssh 1080 1");
    expect(block.indexOf("agent-write-freeze.ts freeze")).toBeLessThan(
      block.indexOf("great-reset-drain.ts drain"),
    );
    // Boşaltma durursa bakım başlamaz, bayraklar bakım öncesi değerlerine döner.
    expect(block.indexOf("code=RESET_DRAIN_FAILED")).toBeLessThan(
      block.indexOf("reset_restore_society_flags"),
    );
    // Reset'in kendi bayrak kaydı değil.
    expect(block).toContain("freeze '$(reset_drain_flags_path \"$great_reset_operation\")'");
    // Boşaltma durursa kilit yalnız olumlu kanıtlı geri açılıştan sonra bırakılır.
    expect(block).toContain("if reset_restore_society_flags 1; then");
    expect(block.indexOf("if reset_restore_society_flags 1; then")).toBeLessThan(
      block.indexOf("find '$lock_dir' -xdev -depth -delete"),
    );
    // Başarılı bakımdan sonra düşen geri açılış kilidi tutmaz; tek amaçlı komuta yönlendirir.
    expect(source).toContain("reset_restore_society_flags 3 || reset_flags_pending=1");
    expect(source.trimEnd().endsWith("exit 97\nfi")).toBe(true);
    expect(block).not.toContain("reset-flags.json");
    // Başarılı uzak akıştan sonra geri açılış; başlamış bakımda boşaltma atlanır.
    expect(source.slice(run, run + 600)).toContain("reset_restore_society_flags 3");
    // Atlama yalnız bu operasyonun dondurma tutucusu yerindeyken (işaret dizini tek başına yetmez).
    expect(source).toContain("test -e /opt/agent-sozluk/runtime/.migration-hold &&");
    expect(source).toContain("= 'reset:$great_reset_operation'; then");
  });

  it("geri açılış başarısını yalnız uzaktaki RESTORED/SKIPPED satırı kanıtlar; denemeler sınırlı", () => {
    const run = (sshBody: string, attempts = 3) => {
      const script = `
set -Eeuo pipefail
great_reset_operation=${operationId}
candidate_sha=${sha}
expected_host=agent-sozluk-prod
expected_ip=127.0.0.1
ssh_options=()
scope_check=':'
lock_check=':'
nolimit() { shift; "$@"; }
local_timeout=nolimit
sleep() { :; }
source scripts/great-reset-flags-remote.sh
${extract("reset_operator_ssh")}
${extract("reset_restore_society_flags")}
ssh() { echo x >>"$BODY_FILE.count"; printf '%s\\n' "\${@: -1}" >"$BODY_FILE"; ${sshBody}; }
reset_restore_society_flags ${attempts} && echo RETURNED_OK
echo "CALLS=$(wc -l <"$BODY_FILE.count")"
`;
      const root = mkdtempSync(path.join(tmpdir(), "reset-flags-"));
      directories.push(root);
      const body = path.join(root, "body.sh");
      const result = spawnSync("bash", ["-c", script], {
        encoding: "utf8",
        env: { ...process.env, BODY_FILE: body },
      });
      return { ...result, body: readFileSync(body, "utf8") };
    };
    const ok = run("printf 'RELEASE_RESET_FLAGS_RESTORED\\n'");
    expect(ok.stdout).toContain("RETURNED_OK");
    expect(ok.stdout).toContain("CALLS=1");
    expect(ok.body).toContain(
      `agent-write-freeze.ts restore '/opt/agent-sozluk/runtime/.great-reset-drain-flags-${operationId}.json'`,
    );
    expect(ok.body).toContain("RELEASE_RESET_FLAGS_RESTORE_REFUSED reason=maintenance-hold");
    // Başarılı çıkış ama kanıt satırı yok: başarı değil; üç deneme sonra hata.
    const silent = run("return 0");
    expect(silent.stdout).not.toContain("RETURNED_OK");
    expect(silent.stdout).toContain("CALLS=3");
    expect(silent.stderr).toContain("code=RESET_FLAGS_RESTORE_FAILED");
    // SSH hatası (kanıt yok): açılmaz.
    const unreachable = run("return 255", 1);
    expect(unreachable.stdout).not.toContain("RETURNED_OK");
    expect(unreachable.stdout).toContain("CALLS=1");
  });

  it("geri açılış gövdesi yalnız olumlu kanıtla yazar: tutucu yok, bakım yok ya da dondurma öncesi", () => {
    const run = (setup: string) => {
      const root = mkdtempSync(path.join(tmpdir(), "reset-flags-body-"));
      directories.push(root);
      const runtime = path.join(root, "runtime");
      const script = `
set -euo pipefail
source scripts/great-reset-flags-remote.sh
body="$(reset_flags_restore_body ${operationId} ':')"
body="\${body//\\/opt\\/agent-sozluk\\/runtime/${runtime}}"
body="\${body//timeout --kill-after=10 180 node --import tsx/echo TSX}"
mkdir -p "${runtime}"
cd "${runtime}"
${setup}
bash -c "set -euo pipefail
$body"
`;
      return spawnSync("bash", ["-c", script], { encoding: "utf8" });
    };
    const record = `: >.great-reset-drain-flags-${operationId}.json`;
    const hold = run(`${record}; : >.migration-hold`);
    expect(hold.status).toBe(97);
    expect(hold.stdout).not.toContain("TSX");
    for (const phase of ["frozen", "reset-maintenance", "writers-may-run", "cutover-done"]) {
      const inProgress = run(
        `${record}; mkdir .migration-operation; printf '${phase}\\n' >.migration-operation/phase`,
      );
      expect(inProgress.status, phase).toBe(97);
      expect(inProgress.stderr).toContain("reason=maintenance-in-progress");
      expect(inProgress.stdout).not.toContain("TSX");
    }
    const unreadable = run(`${record}; mkdir .migration-operation`);
    expect(unreadable.status).toBe(97);
    const early = run(
      `${record}; mkdir .migration-operation; printf 'planned\\n' >.migration-operation/phase`,
    );
    expect(early.status).toBe(0);
    expect(early.stdout).toContain("TSX");
    expect(early.stdout).toContain("RELEASE_RESET_FLAGS_RESTORED");
    const done = run(record);
    expect(done.stdout).toContain("RELEASE_RESET_FLAGS_RESTORED");
    const noRecord = run("");
    expect(noRecord.status).toBe(0);
    expect(noRecord.stdout).toContain("RELEASE_RESET_FLAGS_RESTORE_SKIPPED reason=no-drain-record");
    expect(noRecord.stdout).not.toContain("TSX");
  });

  it("süreç kilidini gerçek yazıcı (tek Node süreci) tutar; başlatıcı öldürülse de bekçi yazıcı bitene dek bekler", () => {
    const root = mkdtempSync(path.join(tmpdir(), "reset-flags-lock-"));
    directories.push(root);
    const runtime = path.join(root, "runtime");
    const sleeper = path.join(root, "writer.mjs");
    const script = `
set -euo pipefail
printf 'setTimeout(() => console.log("TSX"), 3000);\\n' >"${sleeper}"
source scripts/great-reset-flags-remote.sh
body="$(reset_flags_restore_body ${operationId} ':')"
guard="$(reset_flags_writer_idle_guard)"
for name in body guard; do
  value="\${!name}"
  value="\${value//\\/opt\\/agent-sozluk\\/runtime/${runtime}}"
  # Gerçek zincir: timeout -> node (başlatıcısız); yalnız betik zararsız bir yazıcı taklidi.
  value="\${value//node --import tsx scripts\\/agent-write-freeze.ts restore/node ${sleeper}}"
  value="\${value//flock -w 240/flock -w 15}"
  printf -v "$name" '%s' "$value"
done
mkdir -p "${runtime}"
cd "${runtime}"
: >.great-reset-drain-flags-${operationId}.json
bash -c "set -euo pipefail
$body" >writer.out 2>&1 &
sleep 1
# Başlatıcı kaybı: timeout SIGKILL ile ölür; Node yazıcı sürer ve kilidi tutar.
for pid in $(pgrep -x timeout); do
  if tr '\\0' ' ' </proc/$pid/cmdline | grep -q "^timeout --kill-after=10 180 node ${sleeper}"; then kill -KILL "$pid"; echo LAUNCHER_KILLED; fi
done
if bash -c "set -euo pipefail
$body" >second.out 2>&1; then echo SECOND_RAN; fi
grep -q 'RELEASE_RESET_FLAGS_WRITER_BUSY' second.out && echo SECOND_REFUSED
start=$(date +%s%N)
bash -c "set -euo pipefail
$guard
echo GUARD_PASSED"
pgrep -f "^node ${sleeper}" >/dev/null && echo WRITER_STILL_RUNNING || true
echo "WAITED_MS=$(( ($(date +%s%N) - start) / 1000000 ))"
`;
    const result = spawnSync("bash", ["-c", script], { encoding: "utf8", timeout: 60_000 });
    expect(result.stdout).toContain("LAUNCHER_KILLED");
    expect(result.stdout).toContain("SECOND_REFUSED");
    expect(result.stdout).not.toContain("SECOND_RAN");
    expect(result.stdout).toContain("GUARD_PASSED");
    // Bekçi geçtiğinde yazıcı bitmiş olmalı.
    expect(result.stdout).not.toContain("WRITER_STILL_RUNNING");
    expect(Number(/WAITED_MS=(\d+)/u.exec(result.stdout)?.[1])).toBeGreaterThanOrEqual(1000);
  });

  it("dağıtım kilidi bırakıldıktan sonra uyanan gecikmiş yazıcı, süreç kilidini alsa da yazmaz", () => {
    const root = mkdtempSync(path.join(tmpdir(), "reset-flags-late-"));
    directories.push(root);
    const runtime = path.join(root, "runtime");
    const script = `
set -euo pipefail
source scripts/great-reset-flags-remote.sh
owner_check="test \\"\\$(cat ${runtime}/.release-lock/owner 2>/dev/null)\\" = 'eski-sahip' || exit 97"
body="$(reset_flags_restore_body ${operationId} "$owner_check")"
guard="$(reset_flags_writer_idle_guard)"
for name in body guard; do
  value="\${!name}"
  value="\${value//\\/opt\\/agent-sozluk\\/runtime/${runtime}}"
  value="\${value//timeout --kill-after=10 180 node --import tsx/echo TSX}"
  printf -v "$name" '%s' "$value"
done
mkdir -p "${runtime}/.release-lock"
cd "${runtime}"
: >.great-reset-drain-flags-${operationId}.json
printf 'eski-sahip\\n' >.release-lock/owner
# Bekçi süreç kilidini alır ve dağıtım kilidini bırakır; yeni dağıtım kilidi alır.
bash -c "set -euo pipefail
$guard
rm -rf ${runtime}/.release-lock"
mkdir .release-lock; printf 'yeni-sahip\\n' >.release-lock/owner
# Hazırlıkta gecikmiş eski yazıcı şimdi uyanır.
if bash -c "set -euo pipefail
$body" >late.out 2>&1; then echo LATE_OK; else echo "LATE_EXIT=$?"; fi
cat late.out
`;
    const result = spawnSync("bash", ["-c", script], { encoding: "utf8", timeout: 60_000 });
    expect(result.stdout).toContain("LATE_EXIT=97");
    expect(result.stdout).not.toContain("TSX");
    expect(result.stdout).not.toContain("RELEASE_RESET_FLAGS_RESTORED");
    const flagsRemote = readFileSync("scripts/great-reset-flags-remote.sh", "utf8");
    // Sahiplik denetimi süreç kilidi alındıktan SONRA.
    expect(flagsRemote.indexOf('     $1"')).toBeGreaterThan(flagsRemote.indexOf("flock -n 9"));
    for (const file of [
      "scripts/deploy-production-no-migration.sh",
      "scripts/great-reset-restore-flags.sh",
    ])
      expect(readFileSync(file, "utf8")).toMatch(
        /reset_flags_restore_body "\$[a-z_]+" "\$lock_check"/u,
      );
    const source = readFileSync("scripts/deploy-production-no-migration.sh", "utf8");
    expect(source).toContain("   $reset_release_guard\n   find '$lock_dir' -xdev -depth -delete");
    expect(source).toContain(
      "         $(reset_flags_writer_idle_guard)\n         find '$lock_dir' -xdev -depth -delete",
    );
    expect(readFileSync("scripts/great-reset-restore-flags.sh", "utf8")).toContain(
      "     $(reset_flags_writer_idle_guard)\n     find '$lock_dir' -xdev -depth -delete",
    );
  });

  it("boşaltma ve dondurma da ortak kritik bölümde: süreç kilidi, sonra sahiplik; başlatıcısız Node", () => {
    const source = readFileSync("scripts/deploy-production-no-migration.sh", "utf8");
    const drain = source.indexOf(
      'if test -n "$great_reset_operation" && test "$great_reset_rollback" = 0; then',
    );
    const block = source.slice(drain, source.indexOf("\nfi\n", drain));
    const section = block.indexOf('"$(reset_flags_writer_section "$lock_check")');
    expect(section).toBeGreaterThan(0);
    expect(section).toBeLessThan(block.indexOf("agent-write-freeze.ts freeze"));
    expect(section).toBeLessThan(block.indexOf("great-reset-drain.ts drain"));
    expect(block).toContain(
      "timeout --kill-after=10 120 node --import tsx scripts/agent-write-freeze.ts freeze",
    );
    expect(block).toContain(
      "timeout --kill-after=10 960 node --import tsx scripts/great-reset-drain.ts drain",
    );
    // Bayrak/koşu mutatörlerinin hiçbiri tsx başlatıcısıyla koşmaz.
    for (const file of [
      "scripts/deploy-production-no-migration.sh",
      "scripts/great-reset-flags-remote.sh",
      "scripts/great-reset-restore-flags.sh",
    ]) {
      const text = readFileSync(file, "utf8");
      expect(text).not.toMatch(/\.bin\/tsx scripts\/(agent-write-freeze|great-reset-drain)\.ts/u);
    }
    // Bölümün kendisi: meşgulse ve sahiplik değiştiyse mutasyona geçmez.
    const root = mkdtempSync(path.join(tmpdir(), "reset-flags-section-"));
    directories.push(root);
    const script = `
set -euo pipefail
source scripts/great-reset-flags-remote.sh
owner_check="test \\"\\$(cat ${root}/owner 2>/dev/null)\\" = 'eski' || exit 97"
section="$(reset_flags_writer_section "$owner_check")"
section="\${section//\\/opt\\/agent-sozluk\\/runtime/${root}}"
printf 'yeni\\n' >${root}/owner
if bash -c "set -euo pipefail
$section
echo MUTATED"; then :; else echo "OWNER_EXIT=$?"; fi
printf 'eski\\n' >${root}/owner
exec 8>${root}/.great-reset-flags.lock
flock -n 8
if bash -c "set -euo pipefail
$section
echo MUTATED" 2>busy.err; then :; else echo "BUSY_EXIT=$?"; fi
exec 8>&-
bash -c "set -euo pipefail
$section
echo MUTATED_OK"
`;
    const result = spawnSync("bash", ["-c", script], { encoding: "utf8", cwd: process.cwd() });
    expect(result.stdout).toContain("OWNER_EXIT=97");
    expect(result.stdout).toContain("BUSY_EXIT=97");
    expect(result.stdout).not.toContain("MUTATED\n");
    expect(result.stdout).toContain("MUTATED_OK");
  });

  it("tek amaçlı geri açılış komutu sarmalayıcıyla aynı hedefi kullanır ve exact onay ister", () => {
    const wrapper = readFileSync("scripts/deploy-production-no-migration.sh", "utf8");
    const restore = readFileSync("scripts/great-reset-restore-flags.sh", "utf8");
    for (const name of [
      "expected_ip",
      "expected_host",
      "expected_fingerprint",
      "known_hosts",
      "identity",
    ]) {
      const pattern = new RegExp(`^${name}=(.+)$`, "mu");
      expect(restore.match(pattern)?.[1], name).toBe(wrapper.match(pattern)?.[1]);
    }
    expect(restore).toContain('$(reset_flags_restore_body "$operation" "$lock_check")');
    const refused = spawnSync("bash", ["scripts/great-reset-restore-flags.sh", operationId, sha], {
      encoding: "utf8",
      env: { ...process.env, AGENT_SOZLUK_GREAT_RESET_APPROVED: "" },
    });
    expect(refused.status).toBe(90);
    expect(refused.stderr).toContain("code=EXACT_RESET_APPROVAL_REQUIRED");
  });

  it("geri dönüş bayrağı great reset modu ve ayrı exact onay olmadan başlamaz", () => {
    const withApproval = { ...approved, AGENT_SOZLUK_GREAT_RESET_APPROVED: operationId };
    expect(
      run(
        withApproval,
        "--apply-migrations",
        migrations,
        "--pause-society-flow",
        "--great-reset",
        operationId,
        "--great-reset-rollback",
      ).stderr,
    ).toContain("code=EXACT_ROLLBACK_APPROVAL_REQUIRED");
    expect(
      run({ AGENT_SOZLUK_PRODUCTION_APPROVED_SHA: sha }, "--great-reset-rollback").stderr,
    ).toContain("code=ROLLBACK_REQUIRES_GREAT_RESET");
  });
});

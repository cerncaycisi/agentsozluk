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

  it("boşaltma uzak bakımdan önce, ayrı bayrak kaydıyla; geri dönüşte ve başlamış bakımda koşmaz", () => {
    const source = readFileSync("scripts/deploy-production-no-migration.sh", "utf8");
    const start = source.indexOf(
      'if test -n "$great_reset_operation" && test "$great_reset_rollback" = 0; then',
    );
    expect(start).toBeGreaterThan(0);
    const block = source.slice(start, source.indexOf("\nfi\n", start));
    expect(start).toBeLessThan(source.lastIndexOf("  great_reset_run"));
    expect(block).toContain("test -e /opt/agent-sozluk/runtime/.migration-operation");
    expect(block.indexOf("agent-write-freeze.ts freeze")).toBeLessThan(
      block.indexOf("great-reset-drain.ts drain"),
    );
    // Reset'in kendi bayrak kaydı (reset-flags.json) değil: açılış bayrakları otomatik açmaz.
    expect(block).toContain(".great-reset-drain-flags-$great_reset_operation.json");
    expect(block).not.toContain("reset-flags.json");
    expect(block).toContain("code=RESET_DRAIN_FAILED");
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

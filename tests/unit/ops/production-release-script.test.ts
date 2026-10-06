import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const wrapperPath = path.join(root, "scripts/deploy-production-no-migration.sh");
const remotePath = path.join(root, "scripts/production-release-remote.sh");
const phasePath = path.join(root, "scripts/production-migration-phase.sh");
const wrapper = readFileSync(wrapperPath, "utf8");
const remote = readFileSync(remotePath, "utf8");
const phase = readFileSync(phasePath, "utf8");
const sha = "a".repeat(40);

function run(
  script: string,
  args: string[],
  env: Record<string, string> = {},
): { status: number; stderr: string } {
  try {
    execFileSync("bash", [script, ...args], {
      encoding: "utf8",
      stdio: "pipe",
      // Ortamdan sızabilecek onay değişkenleri boşaltılır; boş değer "yok" sayılır.
      env: {
        ...process.env,
        AGENT_SOZLUK_PRODUCTION_APPROVED_SHA: "",
        AGENT_SOZLUK_PRODUCTION_APPROVED_MIGRATIONS: "",
        ...env,
      },
    });
    return { status: 0, stderr: "" };
  } catch (error) {
    const failure = error as { status: number; stderr: string };
    return { status: failure.status, stderr: failure.stderr };
  }
}

describe("schema-neutral production release lane", () => {
  it("aynı hash'lerle yeniden girişte farklı veya eksik settings profilini reddeder", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "release-settings-profile-"));
    const start = remote.indexOf("assert_state_fingerprints() {");
    const end = remote.indexOf("\n# Başlangıç kaydı");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const definition = remote.slice(start, end);
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
    const profiles = ["", "october-2026-v1", "october-2026-v2", "reset-2026-v1"];
    const invoke = (profile: string) =>
      spawnSync(
        "bash",
        [
          "-c",
          `set -Eeuo pipefail
state_dir=${quote(directory)}
reviewed_migration_profile=${quote(profile)}
settings_fingerprint() { printf 'settings\\n'; }
lifecycle_fingerprint() { printf 'lifecycle\\n'; }
${definition}
assert_state_fingerprints
printf 'PASSED\\n'`,
        ],
        { encoding: "utf8", timeout: 5000 },
      );
    try {
      writeFileSync(path.join(directory, "settings-hash"), "settings\n");
      writeFileSync(path.join(directory, "lifecycle-hash"), "lifecycle\n");
      for (const baseline of profiles) {
        writeFileSync(path.join(directory, "settings-profile"), baseline + "\n");
        for (const current of profiles) {
          const result = invoke(current);
          if (baseline === current) {
            expect(result.status, result.stderr).toBe(0);
            expect(result.stdout).toContain("PASSED");
          } else {
            expect(result.status).toBe(97);
            expect(result.stderr).toContain("SETTINGS_PROFILE_CHANGED");
            expect(result.stdout).not.toContain("PASSED");
          }
        }
      }
      rmSync(path.join(directory, "settings-profile"));
      const missing = invoke("");
      expect(missing.status).toBe(97);
      expect(missing.stderr).toContain("SETTINGS_PROFILE_CHANGED");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("keeps both shell entrypoints syntax-valid", () => {
    expect(() => execFileSync("bash", ["-n", wrapperPath])).not.toThrow();
    expect(() => execFileSync("bash", ["-n", remotePath])).not.toThrow();
  });

  it("retries the host fetch without weakening the candidate-SHA assertion", () => {
    /*
      Deploy'un ilk uzak adimi host'ta `git fetch`. GitHub kimliksiz trafigi
      kisitliyor ve 3 Eylul 2026'da iki deploy tam burada dustu; host'a
      Contents:Read tokeni kuruldu ama gecici hata hala mumkun, o yuzden
      fetch sinirli olarak yeniden deneniyor.

      Kritik olan: yeniden deneme bir GUVENLIK gevsetmesi degil. Deploy'un
      dogru SHA'yi gonderdigini garanti eden sey fetch'in kendisi degil,
      asagidaki `origin/main == candidate_sha` esitligi. Bu test ikisini
      birlikte tutuyor — biri kalirsa digeri de kalmali.
    */
    const fetchLine = "git -C /opt/agent-sozluk/app fetch --prune origin main";
    expect(wrapper).toContain(fetchLine);
    const loop = wrapper.slice(wrapper.indexOf("fetch_attempt=1"));
    expect(loop).toContain(fetchLine + " && break");
    expect(loop).toContain("-lt 3 || exit 94");
    expect(wrapper).toContain(
      "test \\\"\\$(git -C /opt/agent-sozluk/app rev-parse origin/main)\\\" = '$candidate_sha'",
    );
  });

  it("requires an exact approval receipt and all production identity pins", () => {
    expect(wrapper).toContain("AGENT_SOZLUK_PRODUCTION_APPROVED_SHA");
    expect(wrapper).toContain("EXACT_APPROVAL_RECEIPT_REQUIRED");
    expect(wrapper).toContain("46.225.20.177");
    expect(wrapper).toContain("agent-sozluk-prod");
    expect(wrapper).toContain("agentsozluk.com");
    expect(wrapper).toContain("SHA256:BVirvnH5qPzzK18ZGLhO90LObtFze38qicLybEwQ5fI");
    expect(wrapper).toContain("StrictHostKeyChecking=yes");
    expect(wrapper).toContain("IdentitiesOnly=yes");
    expect(wrapper).toContain("IdentityAgent=none");
  });

  it("accepts a pnpm-forwarded argument separator without treating it as release scope", () => {
    expect(wrapper).toContain("    --)\n");
    expect(wrapper).toContain("Some pnpm versions forward the conventional argument separator");
    expect(() => execFileSync("bash", [wrapperPath, "--", "--help"])).not.toThrow();
  });

  it("uses a separate checked transport and execution session", () => {
    expect(wrapper).toContain("install -m 0700 /dev/stdin");
    expect(wrapper).toContain("bash -n '$remote_script'");
    expect(wrapper).toContain('<"$root/scripts/production-release-remote.sh"');
    expect(wrapper).toContain("exec '$remote_script' '$candidate_sha' '$cleanup'");
  });

  it("is no-migration, resumable and shares the exact release smoke", () => {
    expect(remote).toContain("MIGRATION_SET_CHANGED");
    expect(remote).toContain('cmp -s "$state_dir/check-applied-migrations"');
    expect(remote).toContain("scripts/release-smoke.ts");
    expect(remote).toContain('if test -d "$release"');
    expect(remote).toContain("ps --all -q app");
    expect(remote).toContain('if test "$app_health" != healthy');
    expect(remote).toContain(
      'test "$(docker inspect --format \'{{.Image}}\' "$app_container")" = "$image_id"',
    );
    expect(remote).toContain("candidate-image-config-digest");
    expect(remote).toContain(".release-app-image-config-digest");
    expect(remote).toContain("artifact-receipts");
    expect(remote).toContain('if test "$current_sha" != "$candidate_sha"');
    expect(remote).not.toMatch(/\b(?:prisma migrate deploy|db:deploy|db:reset)\b/gu);
  });

  it("waits without cancellation and preserves release integrity", () => {
    expect(remote).toContain("RUN_DRAIN_TIMEOUT");
    expect(remote).toContain('if test "$worker_state" = active');
    expect(remote).not.toMatch(/\b(?:cancel|abort)ProductionRollout/gu);
    expect(remote).not.toContain("UPDATE agent_runs");
    expect(remote).toContain('sudo mv -Tf "$runtime_next"');
    expect(remote).toContain("\\( -type f -o -type d \\) -perm /022");
    expect(remote).toContain("prisma migrate");
    expect(remote).toContain('command.includes("prisma migrate")');
  });

  it("moves the boot image tag only after the release verifies", () => {
    // compose app servisini `${APP_IMAGE:-agent-sozluk:production}` ile tanımlıyor ve
    // systemd açılışta APP_IMAGE vermiyor. Etiket yoksa her reboot stack'i kalıcı
    // olarak açılamaz bırakıyor — 2026-08-20'de site 33 dakika bu yüzden kapalı kaldı.
    expect(remote).toContain("publish_boot_tag");
    expect(remote).toContain('docker tag "$image_id" agent-sozluk:production');
    expect(remote).toContain("RELEASE_BOOT_TAG");
    // Etiketin doğrulanmış imaja işaret ettiği tekrar okunarak kanıtlanıyor.
    expect(remote).toContain(
      "resolved=\"$(docker image inspect --format '{{.Id}}' agent-sozluk:production)\"",
    );
    expect(remote).toContain('test "$resolved" = "$image_id"');
    // Sıra kritik: yarıda kalan bir release etiketi kıpırdatmamalı.
    const flow = remote.slice(remote.lastIndexOf("\ncutover\n"));
    expect(flow.indexOf("verify_release")).toBeLessThan(flow.indexOf("publish_boot_tag"));
    expect(flow.indexOf("publish_boot_tag")).toBeLessThan(flow.indexOf("RELEASE_COMPLETE"));
  });

  it("scans lease logs after the worker stops and before the app container is recreated", () => {
    const kesim = remote.slice(remote.indexOf("\ncutover() {"));
    const durdur = kesim.indexOf("sudo systemctl stop agent-sozluk-runtime.service");
    const tara = kesim.indexOf("pre_cutover_lease_scan");
    const yenile = kesim.indexOf("--force-recreate app");
    expect(durdur).toBeGreaterThan(0);
    expect(tara).toBeGreaterThan(durdur);
    expect(yenile).toBeGreaterThan(tara);
    // Aday sürümün betiği, yalnız lease kipiyle, sınırlı sürede ve sonucu görünür.
    expect(remote).toContain('local candidate_alarm="$app_root/deploy/alarm/canlilik-alarmi.sh"');
    expect(remote).toContain(
      'if timeout 120 bash "$candidate_alarm" --kesim-oncesi </dev/null; then',
    );
    expect(remote).toContain("RELEASE_LEASE_SCAN_OK");
    expect(remote).toContain("RELEASE_WARN lease alarm pre-cutover scan failed");
    // Kurulu kopya adaydan farklıysa uyarır.
    expect(remote).toContain("RELEASE_WARN installed alarm script differs from candidate");
  });

  it("atomically installs and verifies the versioned direct-Node runtime unit", () => {
    expect(remote).toContain("install_runtime_unit");
    expect(remote).toContain("assert_runtime_unit");
    expect(remote).toContain(
      'runtime_unit_source="$app_root/deploy/systemd/agent-sozluk-runtime.service"',
    );
    expect(remote).toContain(
      "runtime_unit_target=/etc/systemd/system/agent-sozluk-runtime.service",
    );
    expect(remote).toContain(
      "sudo mktemp /etc/systemd/system/.agent-sozluk-runtime.service.XXXXXXXX",
    );
    expect(remote).toContain('sudo mv -f "$unit_stage" "$runtime_unit_target"');
    expect(remote).toContain("sudo systemctl daemon-reload");
    expect(remote).toContain("RELEASE_RUNTIME_UNIT_READY");
    expect(remote).toContain("RELEASE_RUNTIME_UNIT_REUSED");
    expect(remote).toContain("TimeoutStopUSec --value");
    expect(remote).toContain("= 21min");
    expect(remote).toContain(
      "/usr/bin/node --require /opt/agent-sozluk/runtime/current/node_modules/tsx/dist/preflight.cjs",
    );
  });

  it("uses exact allowlist cleanup and never prunes volumes or all Docker state", () => {
    expect(remote).toContain('docker image rm "$ref"');
    expect(remote).toContain("docker builder prune --force --filter 'until=24h'");
    expect(remote).toContain('for release in "$runtime_root"/releases/*');
    expect(remote).toContain('test "$release" = "$current_runtime"');
    expect(remote).toContain('test "$release" = "$previous_runtime"');
    expect(remote).toContain('sudo find "$release" -xdev -depth -delete');
    expect(remote).not.toContain("docker system prune");
    expect(remote).not.toContain("docker volume prune");
    expect(remote).not.toContain("--volumes");
    expect(remote).toContain('test "$volume_hash_after" = "$volume_hash_before"');
    expect(remote).toContain('test "$container_hash_after" = "$container_hash_before"');
    expect(remote).toContain("disk_before=");
    expect(remote).toContain("disk_after=");
  });

  describe("root/0700 reset dizini", () => {
    // Sahte sudo yalnız $fake_root altını "root görünürlüğü" olarak sunar; sudo'suz
    // erişim hiçbir reset yolunu görmez. 6 Ekim: sudo'suz test -e overlay'i atladı.
    const start = remote.indexOf("reset_root=/opt/agent-sozluk/reset");
    const holdEnd = remote.indexOf('test "$(git -C "$app_root" remote get-url origin)"');
    const genStart = remote.indexOf('generation_dir="$reset_root/generation"');
    const genEnd =
      remote.indexOf("\nresolve_reset_generation\n") + "\nresolve_reset_generation\n".length;
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
    function probe(options: {
      sudoWorks?: boolean;
      hold?: boolean;
      generation?: boolean;
      required?: boolean;
      override?: boolean;
      state?: string;
      failProbe?: string;
    }) {
      const directory = mkdtempSync(path.join(tmpdir(), "release-reset-root-"));
      try {
        const script = `set -Eeuo pipefail
fake_root=${quote(directory)}/root
runtime_root=${quote(directory)}/runtime
mkdir -p "$fake_root/reset" "$runtime_root"
${options.hold ? ': >"$fake_root/reset/maintenance-hold"' : ""}
${options.generation ? 'mkdir "$fake_root/reset/generation"' : ""}
${options.required ? ': >"$fake_root/reset/generation/required.json"' : ""}
${options.generation ? `printf '{"state":"%s"}' ${quote(options.state ?? "TRAFFIC_OPEN")} >"$fake_root/reset/generation/current.json"` : ""}
${options.override ? ': >"$runtime_root/reset-generation-compose.yaml"' : ""}
map() { printf '%s\\n' "\${1/#\\/opt\\/agent-sozluk/$fake_root}"; }
sudo() {
  test "$1" = -n || return 1
  shift
  ${options.sudoWorks === false ? "return 1" : ""}
  case "$1" in
    true) return 0 ;;
    test)
      shift
      local last="\${@: -1}"
      case "$last" in *${options.failProbe ?? "__yok__"}) return 2 ;; esac
      test "\${@:1:$#-1}" "$(map "$last")" ;;
    sh)
      case "$5" in *${options.failProbe ?? "__yok__"}) return 2 ;; esac
      command sh -c "$3" "$4" "$(map "$5")" ;;
    stat) printf 'root|root|755\\n' ;;
    readlink) printf '%s\\n' "$3" ;;
    cat) command cat "$(map "$2")" ;;
    *) return 1 ;;
  esac
}
stat() { printf 'root|root|444\\n'; }
compose=(docker compose)
${remote.slice(start, holdEnd)}
${remote.slice(genStart, genEnd)}
printf 'compose=%s required=%s overlay=%s\\n' "\${compose[*]}" "$generation_required" "$generation_overlay"`;
        return spawnSync("bash", ["-c", script], { encoding: "utf8" });
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }

    it("nesil dizinini sudo ile görür, overlay'i ve latch'i bağlar", () => {
      expect(start).toBeGreaterThan(-1);
      expect(genStart).toBeGreaterThan(start);
      const result = probe({ generation: true, required: true, override: true });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("reset-generation-compose.yaml required=1");
    });

    it("sudo çalışmıyorsa reset yollarını yok saymaz", () => {
      const result = probe({ sudoWorks: false, generation: true, override: true });
      expect(result.status).toBe(97);
      expect(result.stderr).toContain("RELEASE_FAIL code=ROOT_PROBE_UNAVAILABLE");
    });

    it("tek bir root sorgusunun hatasını yokluk saymaz", () => {
      for (const failProbe of ["maintenance-hold", "generation", "required.json"]) {
        const result = probe({ generation: true, required: true, override: true, failProbe });
        expect(result.status, failProbe).toBe(97);
        expect(result.stderr, failProbe).toContain("RELEASE_FAIL code=ROOT_PROBE_UNAVAILABLE");
      }
    });

    it("root-only bakım kilidini görür", () => {
      const result = probe({ hold: true, generation: true, override: true });
      expect(result.status).toBe(97);
      expect(result.stderr).toContain("RELEASE_FAIL code=RESET_MAINTENANCE_HOLD");
    });

    it("overlay varken görünmeyen nesil dizinini legacy boot saymaz", () => {
      const result = probe({ override: true });
      expect(result.status).toBe(97);
      expect(result.stderr).toContain("RELEASE_FAIL code=RESET_GENERATION_UNRESOLVED");
    });

    it("trafik açık olmayan nesil aynasında durur, latch'siz legacy boot'u korur", () => {
      const held = probe({
        generation: true,
        required: true,
        override: true,
        state: "COMMITTED_MAINTENANCE",
      });
      expect(held.status).toBe(97);
      expect(held.stderr).toContain("RELEASE_FAIL code=RESET_MAINTENANCE_HOLD");
      const legacy = probe({});
      expect(legacy.status).toBe(0);
      expect(legacy.stdout).toContain("compose=docker compose required=0");
    });

    it("sağlıklı aday yeniden girişi dahil, eski app ve worker'a dokunmadan önce kabulü dener", () => {
      const kesim = remote.slice(remote.indexOf("\ncutover() {"));
      const kabul = kesim.indexOf("  candidate_reset_admission\n");
      expect(kabul).toBeGreaterThan(0);
      expect(kabul).toBeLessThan(kesim.indexOf('if test "$app_health" != healthy; then'));
      expect(kabul).toBeLessThan(kesim.indexOf("wait_for_no_active_work"));
      expect(kabul).toBeLessThan(kesim.indexOf("sudo systemctl stop agent-sozluk-runtime.service"));
      expect(kabul).toBeLessThan(kesim.indexOf("--force-recreate app"));
      const mount = kesim.indexOf('assert_reset_generation_mount "$app_container"');
      expect(mount).toBeGreaterThan(kesim.indexOf("--force-recreate app"));
      expect(mount).toBeLessThan(
        kesim.indexOf("sudo systemctl start agent-sozluk-runtime.service"),
      );
      const calisan = kesim.indexOf("RELEASE_FAIL code=RUNNING_RESET_ADMISSION_REJECTED");
      expect(calisan).toBeGreaterThan(mount);
      expect(calisan).toBeLessThan(
        kesim.indexOf("sudo systemctl start agent-sozluk-runtime.service"),
      );
      expect(remote).not.toMatch(/test -e "\$generation_dir/u);
      expect(remote).toContain('if test "$generation_required" = 1; then');
    });

    function definition(name: string) {
      const begin = remote.indexOf(`\n${name}() {`);
      const end = remote.indexOf("\n}\n\n", begin) + 3;
      expect(begin).toBeGreaterThan(-1);
      return remote.slice(begin, end);
    }

    // Sahte Docker, container'ları bir durum dosyasında tutar; gerçek önek filtresini
    // (name=^önek) ve rm -f'yi taklit eder. Kabuk sinyal tuzağı yoktur.
    function admission(options: {
      waitStatus?: string;
      waitFails?: boolean;
      startFails?: boolean;
      psFails?: boolean;
      rmIgnored?: boolean;
      stale?: boolean;
      foreign?: boolean;
    }) {
      const directory = mkdtempSync(path.join(tmpdir(), "release-admission-"));
      try {
        const script = `set -Eeuo pipefail
exec 3>&1
state=${quote(directory)}/containers
: >"$state"
printf 'other9 agent-sozluk-app-1 -\\n' >"$state"
${options.stale ? "printf 'stale1 agent-sozluk-reset-admission-00000000deadbeef probe\\n' >>\"$state\"" : ""}
${options.foreign ? "printf 'foreign1 agent-sozluk-reset-admission-manual -\\nforeign2 agent-sozluk-reset-admission-manual probe\\n' >>\"$state\"" : ""}
op_id=0123456789abcdef
candidate_image=agent-sozluk:${sha}
compose=(docker compose)
docker() {
  case "$1" in
    ps)
      ${options.psFails ? "return 42" : ""}
      test "$2 $3 $4" = "-a --filter label=org.agentsozluk.reset-admission=probe" || return 9
      awk '$3 == "probe" {print $1, $2}' "$state" ;;
    rm)
      shift 2
      printf 'RM %s\\n' "$*" >&3
      ${options.rmIgnored ? "return 1" : ""}
      local id
      for id in "$@"; do
        awk -v id="$id" '$1 != id' "$state" >"$state.next"
        mv "$state.next" "$state"
      done ;;
    compose)
      printf 'RUN %s\\n' "$*" >&3
      ${options.startFails ? "return 1" : ""}
      printf 'probe1 %s %s\\n' "$5" "\${7#*=}" >>"$state" ;;
    wait)
      printf 'WAIT %s\\n' "$2" >&3
      ${options.waitFails ? "return 124" : ""}
      printf '%s\\n' ${quote(options.waitStatus ?? "0")} ;;
    *) return 1 ;;
  esac
}
timeout() {
  while [[ "$1" == --* ]]; do shift; done
  printf 'BOUND %s\\n' "$1" >&3
  shift
  "$@"
}
${remote.slice(remote.indexOf("\nadmission_prefix="), remote.indexOf("\n}\n\n", remote.indexOf("\ncandidate_reset_admission() {")) + 3)}
candidate_reset_admission
printf 'LEFT %s\\n' "$(awk '{print $1}' "$state" | tr '\\n' ' ')"
echo PASSED`;
        return spawnSync("bash", ["-c", script], { encoding: "utf8", timeout: 20000 });
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }

    it("kabulü ayrık, kendi içinde süre sınırlı ve sahipli adla çalıştırıp kaldırır", () => {
      const ok = admission({});
      expect(ok.status).toBe(0);
      expect(ok.stdout).toContain(
        "RUN compose run -d --name agent-sozluk-reset-admission-0123456789abcdef --label org.agentsozluk.reset-admission=probe --no-deps --pull never -T --entrypoint timeout app 120 ./node_modules/.bin/tsx scripts/verify-reset-generation.ts",
      );
      expect(ok.stdout.indexOf("BOUND 60")).toBeLessThan(ok.stdout.indexOf("RUN "));
      expect(ok.stdout).toContain("BOUND 150");
      expect(ok.stdout).toContain("WAIT agent-sozluk-reset-admission-0123456789abcdef");
      expect(ok.stdout).toContain("RM probe1");
      expect(ok.stdout).toContain("LEFT other9 \n");
      expect(ok.stdout).toContain("PASSED");
      const candidate = definition("candidate_reset_admission");
      expect(candidate).not.toContain("trap");
      expect(candidate).not.toMatch(/(^|[\s;])kill\s/mu);
    });

    it("önceki koşudan kalan sahipli kabul container'ını başlamadan süpürür", () => {
      const result = admission({ stale: true });
      expect(result.status).toBe(0);
      expect(result.stdout.indexOf("RM stale1")).toBeLessThan(result.stdout.indexOf("RUN "));
      expect(result.stdout).toContain("LEFT other9 \n");
    });

    it("sahiplik etiketi ve tam ad biçimi olmayan önekli container'a dokunmaz", () => {
      const result = admission({ foreign: true });
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain("RM foreign");
      expect(result.stdout).toContain("LEFT other9 foreign1 foreign2 \n");
    });

    it("ret, başlatma veya bekleme hatasında container'ı kaldırıp reddeder", () => {
      for (const options of [{ waitStatus: "1" }, { startFails: true }, { waitFails: true }]) {
        const result = admission(options);
        expect(result.status, JSON.stringify(options)).toBe(97);
        expect(result.stderr).toContain("RELEASE_FAIL code=CANDIDATE_RESET_ADMISSION_REJECTED");
        if (!("startFails" in options)) expect(result.stdout).toContain("RM probe1");
        expect(result.stdout).not.toContain("PASSED");
      }
    });

    it("Docker sorgu veya silme hatasını container yokluğu saymaz", () => {
      const query = admission({ psFails: true });
      expect(query.status).toBe(97);
      expect(query.stdout).not.toContain("RUN ");
      expect(query.stderr).toContain("RELEASE_FAIL code=RESET_ADMISSION_PROBE_LINGERING");
      const remove = admission({ rmIgnored: true });
      expect(remove.status).toBe(97);
      expect(remove.stdout).not.toContain("PASSED");
      expect(remove.stderr).toContain("RELEASE_FAIL code=RESET_ADMISSION_PROBE_LINGERING");
    });

    it("çalışan app'te nesil mount'u ve zorunluluk ortamı yoksa durur", () => {
      const check = (mounts: unknown, env: string[], overlay = 1) =>
        spawnSync(
          "bash",
          [
            "-c",
            `set -Eeuo pipefail
generation_dir=/opt/agent-sozluk/reset/generation
generation_overlay=${overlay}
docker() {
  case "$3" in
    *Mounts*) printf '%s\\n' ${quote(JSON.stringify(mounts))} ;;
    *) printf '%s\\n' ${quote(JSON.stringify(env))} ;;
  esac
}
${definition("assert_reset_generation_mount")}
assert_reset_generation_mount app
echo PASSED`,
          ],
          { encoding: "utf8" },
        );
      const bound = [
        {
          Type: "bind",
          Source: "/opt/agent-sozluk/reset/generation",
          Destination: "/run/agentsozluk-reset",
          RW: false,
        },
      ];
      const required = ["NODE_ENV=production", "AGENT_SOZLUK_RESET_GENERATION_REQUIRED=true"];
      expect(check(bound, required).stdout).toContain("PASSED");
      for (const [mounts, env] of [
        [[], required],
        [[{ ...bound[0], RW: true }], required],
        [bound, ["NODE_ENV=production"]],
        [
          [
            ...bound,
            {
              Type: "bind",
              Source: "/tmp/eski-current.json",
              Destination: "/run/agentsozluk-reset/current.json",
              RW: false,
            },
          ],
          required,
        ],
      ] as const) {
        const result = check(mounts, [...env]);
        expect(result.status).toBe(97);
        expect(result.stderr).toContain("RELEASE_FAIL code=RESET_GENERATION_MOUNT_MISSING");
      }
      expect(check([], [], 0).stdout).toContain("PASSED");
    });
  });

  describe("A5 migration'lı mod", () => {
    it("bilinmeyen veya listesiz exact profili ağa çıkmadan reddeder", () => {
      const base = ["--sha", sha, "--artifact-run", "1", "--execute"];
      const approved = { AGENT_SOZLUK_PRODUCTION_APPROVED_SHA: sha };
      for (const profile of [
        "",
        "baska",
        "october-2026-v1",
        "october-2026-v2",
        "october-2026-v3",
        "reset-2026-v1",
        "../october-2026-v2",
      ]) {
        const result = run(
          wrapperPath,
          [...base, "--reviewed-migration-profile", profile],
          approved,
        );
        expect(result.status).toBe(90);
        expect(result.stderr).toContain("INVALID_REVIEWED_MIGRATION_PROFILE");
      }
      expect(
        run(remotePath, [
          sha,
          "no-cleanup",
          "reviewed:baska:20261003200000_agent_action_feedback_index",
          "0123456789abcdef",
        ]).stderr,
      ).toContain("INVALID_MIGRATION_MODE");
    });

    it("migration listesini SHA'dan ayrı, birebir onay ister; ağa çıkmadan düşer", () => {
      const base = ["--sha", sha, "--artifact-run", "1", "--execute"];
      const approved = { AGENT_SOZLUK_PRODUCTION_APPROVED_SHA: sha };
      expect(run(wrapperPath, [...base, "--apply-migrations", "x"], approved).stderr).toContain(
        "code=INVALID_MIGRATION_LIST",
      );
      expect(
        run(wrapperPath, [...base, "--apply-migrations", "20260922140000_contact_messages"], {
          ...approved,
          AGENT_SOZLUK_PRODUCTION_APPROVED_MIGRATIONS: "20260922140000_baska",
        }).stderr,
      ).toContain("code=EXACT_MIGRATION_APPROVAL_REQUIRED");
      expect(
        run(wrapperPath, base, {
          ...approved,
          AGENT_SOZLUK_PRODUCTION_APPROVED_MIGRATIONS: "20260922140000_contact_messages",
        }).stderr,
      ).toContain("code=MIGRATION_APPROVAL_WITHOUT_FLAG");
    });

    it("kilidi ilk uzak mutasyondan önce alır, her uzak adımda sahipliğini sınar, yalnız başarıda bırakır", () => {
      const kilit = wrapper.indexOf("if ! mkdir -m 0700 '$lock_dir'");
      const ilkYukleme = wrapper.indexOf("install -m 0700 /dev/stdin '$remote_script'");
      const checkout = wrapper.indexOf("git -C /opt/agent-sozluk/app checkout --detach");
      expect(kilit).toBeGreaterThan(0);
      expect(kilit).toBeLessThan(ilkYukleme);
      expect(kilit).toBeLessThan(checkout);
      // Kilidi alan komut dışındaki her uzak komut sahipliği sınar.
      const uzakKomutlar = wrapper.split('"set -euo pipefail').length - 1;
      expect(wrapper.split("$lock_check").length - 1).toBe(uzakKomutlar - 1);
      // Kilidi alan dahil her uzak komut önce kayıtlı logind oturum scope'unu kanıtlar.
      expect(wrapper.split("   $scope_check").length - 1).toBe(uzakKomutlar);
      expect(wrapper.indexOf("$scope_check", wrapper.indexOf("lock_dir=/opt"))).toBeLessThan(kilit);
      expect(wrapper).toContain("code=SESSION_SCOPE_UNVERIFIED");
      // Bırakma yalnız dosyanın sonunda, uzak betik başarıyla döndükten sonra.
      const birak = wrapper.indexOf("find '$lock_dir' -xdev -depth -delete");
      expect(birak).toBeGreaterThan(wrapper.indexOf("exec '$remote_script'"));
      expect(wrapper.indexOf("find '$lock_dir'", birak + 1)).toBe(-1);
      expect(wrapper).toContain(
        "exec '$remote_script' '$candidate_sha' '$cleanup' '$migration_mode' '$op_id'",
      );
    });

    it("uzak betik modu ve operasyon kimliğini sunucu kontrollerinden önce doğrular", () => {
      expect(
        run(remotePath, [sha, "no-cleanup", "apply:bozuk", "0123456789abcdef"]).stderr,
      ).toContain("code=INVALID_MIGRATION_MODE");
      expect(run(remotePath, [sha, "no-cleanup", "no-migration", "kisa"]).stderr).toContain(
        "code=INVALID_OPERATION_ID",
      );
      expect(remote).toContain("RELEASE_LOCK_NOT_OWNED");
      // Tamamlanmamış migration operasyonu varken migration'sız dağıtım olmaz.
      expect(remote).toContain(
        'if test -e "$runtime_root/.migration-operation" && test "$migration_mode" = no-migration; then',
      );
    });

    it("başlangıç kaydını atomik tamamlar ve faz betiğini yalnız migration modunda yükler", () => {
      expect(remote).toContain(
        'mv -Tf "$state_dir/baseline-complete.next" "$state_dir/baseline-complete"',
      );
      expect(remote).toContain('if test ! -f "$state_dir/baseline-complete"; then');
      const akis = remote.slice(remote.lastIndexOf("\nif test ! -f"));
      expect(akis.indexOf("build_runtime_release")).toBeLessThan(akis.indexOf("migration_phase"));
      expect(akis.indexOf("migration_phase")).toBeLessThan(akis.indexOf("\ncutover\n"));
      expect(akis).toContain('source "$app_root/scripts/production-migration-phase.sh"');
      expect(() => execFileSync("bash", ["-n", phasePath])).not.toThrow();
    });

    it("kesimde trafiği iç kontrollerden sonra açar; hold'u boot etiketi eşleştikten sonra kaldırır", () => {
      const kesim = remote.slice(
        remote.indexOf("\ncutover() {"),
        remote.indexOf("\n#\n# `agent-sozluk.service`"),
      );
      const smoke = kesim.indexOf("scripts/release-smoke.ts");
      const caddy = kesim.indexOf('"${compose[@]}" start caddy');
      const disSaglik = kesim.indexOf("wait_public_health");
      const etiket = kesim.indexOf("publish_boot_tag");
      const hold = kesim.indexOf("-name .migration-hold -type f -delete");
      const worker = kesim.indexOf("sudo systemctl start agent-sozluk-runtime.service");
      for (const konum of [smoke, caddy, disSaglik, etiket, hold, worker])
        expect(konum).toBeGreaterThan(0);
      expect(smoke).toBeLessThan(caddy);
      expect(caddy).toBeLessThan(disSaglik);
      expect(disSaglik).toBeLessThan(etiket);
      expect(etiket).toBeLessThan(hold);
      expect(hold).toBeLessThan(worker);
    });

    it("migrate'i kör tekrarlamaz; prod şeması değişmeden önceki hatada eski sürümü geri açar", () => {
      expect(phase).toContain("migrating) migration_fail MIGRATION_STATE_AMBIGUOUS 98 ;;");
      const tuzak = phase.slice(phase.indexOf("migration_exit_trap() {"));
      expect(tuzak).toContain("frozen | backup-verified | rehearsed)");
      expect(tuzak).toContain("reopen_previous_release");
      expect(tuzak).toContain("migrating | migrated | post-verified)");
      // Aşama yalnız ileri gider.
      expect(phase).toContain(
        'if (($(phase_rank "$next") <= $(phase_rank "$(current_phase)"))); then return 0; fi',
      );
      // Önceden zaman aşımı ayarı varsa dur; scratch adı dar kalıpta.
      expect(phase).toContain("DB_TIMEOUT_SETTING_PRESENT");
      expect(phase).toContain("^agent_sozluk_a5_[0-9]{8}_[0-9]{6}_[0-9a-f]{6}$");
      // Üretimde uygulama rolü CREATEDB yetkili değil: scratch yönetici rolüyle açılıp
      // düşürülür, sahibi uygulama rolüdür (ilk kullanım öncesi salt okunur kontrol).
      expect(phase).toContain("createdb -U postgres -O agent_sozluk -T template0");
      expect(phase).toContain("dropdb -U postgres --force");
      expect(phase).not.toContain("createdb -U agent_sozluk");
      expect(phase).toContain("DATABASE_ADMIN_ROLE_UNAVAILABLE");
      // Oturum görünürlüğü gereken kanıtlar yönetici rolüyle; düşürme doğrudan --force.
      const dondurma = phase.slice(phase.indexOf("assert_frozen() {"));
      expect(dondurma.slice(0, dondurma.indexOf("\n}\n"))).toContain("admin_psql agent_sozluk");
      expect(phase).not.toContain("pg_terminate_backend");
      // Caddy yeni başlamışken ilk dış istek düşebilir: tek deneme yerine sınırlı bekleme.
      expect(phase).toContain("wait_public_health || return 1");
      expect(remote).toContain("wait_public_health() {");
      // Yeni birim dondurmada, worker durmuşken kurulur ve hold ondan sonra oluşur.
      const dondur = phase.slice(phase.indexOf("freeze_writes() {"));
      expect(dondur.indexOf("install_runtime_unit")).toBeLessThan(
        dondur.indexOf(': >"$migration_hold"'),
      );
      expect(dondur.indexOf(': >"$migration_hold"')).toBeLessThan(dondur.indexOf("stop caddy"));
    });
  });
});

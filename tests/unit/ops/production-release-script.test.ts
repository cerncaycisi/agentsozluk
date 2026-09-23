import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

  describe("A5 migration'lı mod", () => {
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
      const disSaglik = kesim.indexOf("assert_public_health");
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
      // Yeni birim dondurmada, worker durmuşken kurulur ve hold ondan sonra oluşur.
      const dondur = phase.slice(phase.indexOf("freeze_writes() {"));
      expect(dondur.indexOf("install_runtime_unit")).toBeLessThan(
        dondur.indexOf(': >"$migration_hold"'),
      );
      expect(dondur.indexOf(': >"$migration_hold"')).toBeLessThan(dondur.indexOf("stop caddy"));
    });
  });
});

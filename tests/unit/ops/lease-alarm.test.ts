import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/*
  Lease süresi alarmı (21 Eylül 2026). Betik gerçekten çalıştırılır; `docker`
  ve `curl` PATH'teki sahtelerle değiştirilir. Sahte docker `logs` çağrısında
  verilen uygulama logunu, `exec` (canlılık sorgusu) çağrısında sağlıklı bir
  cevap döner; sahte curl her bildirimi bir dosyaya yazar.
*/

const BETIK = path.resolve("deploy/alarm/canlilik-alarmi.sh");

let dizin: string;

function kayit(activeMs: number, outcome = "committed", errorCode?: string) {
  return JSON.stringify({
    level: "info",
    event: "db.transaction.duration",
    label: "runtime.lease",
    outcome,
    ...(errorCode ? { errorCode } : {}),
    totalMs: activeMs + 1,
    acquireMs: 1,
    activeMs,
    timeoutMs: 5000,
  });
}

function calistir(logSatirlari: string[]) {
  writeFileSync(path.join(dizin, "app.log"), logSatirlari.join("\n") + "\n");
  const sonuc = spawnSync("bash", [BETIK], {
    encoding: "utf8",
    env: {
      PATH: `${path.join(dizin, "bin")}:/usr/bin:/bin`,
      ALARM_NTFY_KONU: "test-konu",
      ALARM_DURUM_DOSYASI: path.join(dizin, "durum", "durum"),
      SAHTE_DIZIN: dizin,
    },
  });
  const bildirimler = existsSync(path.join(dizin, "curl.log"))
    ? readFileSync(path.join(dizin, "curl.log"), "utf8").split("\n---\n").filter(Boolean)
    : [];
  rmSync(path.join(dizin, "curl.log"), { force: true });
  return { status: sonuc.status, bildirimler };
}

beforeEach(() => {
  dizin = mkdtempSync(path.join(tmpdir(), "lease-alarm-"));
  const bin = path.join(dizin, "bin");
  spawnSync("mkdir", ["-p", bin]);
  writeFileSync(
    path.join(bin, "docker"),
    `#!/usr/bin/env bash
for a in "$@"; do
  case "$a" in
    logs) cat "$SAHTE_DIZIN/app.log"; exit 0 ;;
    exec) echo "60 120"; exit 0 ;;
  esac
done
exit 1
`,
  );
  writeFileSync(
    path.join(bin, "curl"),
    `#!/usr/bin/env bash
{ printf '%s\\n' "$@"; printf -- '---\\n'; } >> "$SAHTE_DIZIN/curl.log"
`,
  );
  chmodSync(path.join(bin, "docker"), 0o755);
  chmodSync(path.join(bin, "curl"), 0o755);
});

afterEach(() => rmSync(dizin, { recursive: true, force: true }));

describe("lease süresi alarmı", () => {
  it("normal sürelerde ve canlılık sağlıklıyken hiç bildirim atmaz", () => {
    const { status, bildirimler } = calistir([kayit(826), kayit(1164), "başka bir satır"]);
    expect(status).toBe(0);
    expect(bildirimler).toEqual([]);
  });

  it("eşiği iki kez aşmak uyarı değildir, üç kez aşmak uyarıdır", () => {
    expect(calistir([kayit(2600), kayit(2700), kayit(900)]).bildirimler).toEqual([]);
    const { bildirimler } = calistir([kayit(2600), kayit(2700), kayit(3000)]);
    expect(bildirimler).toHaveLength(1);
    expect(bildirimler[0]).toContain("Title: Agent Sözlük: lease yavaşlıyor");
    expect(bildirimler[0]).toContain("Priority: high");
  });

  it("tek bir 4000 ms kaydı kritik alarmdır", () => {
    const { bildirimler } = calistir([kayit(900), kayit(4100)]);
    expect(bildirimler).toHaveLength(1);
    expect(bildirimler[0]).toContain("Title: Agent Sözlük: lease 5 sn sınırına dayandı");
    expect(bildirimler[0]).toContain("Priority: urgent");
    expect(bildirimler[0]).toContain("en uzun activeMs 4100 ms");
  });

  it("tek bir P2028 kritik alarmdır; başka hata kodları değildir", () => {
    expect(calistir([kayit(300, "failed", "IDEMPOTENCY_CONFLICT")]).bildirimler).toEqual([]);
    const { bildirimler } = calistir([kayit(300, "failed", "P2028")]);
    expect(bildirimler).toHaveLength(1);
    expect(bildirimler[0]).toContain("P2028: 1");
  });

  it("aynı kritik durumu tekrar bildirmez, normale dönüşü bir kez bildirir", () => {
    expect(calistir([kayit(4500)]).bildirimler).toHaveLength(1);
    expect(calistir([kayit(4500)]).bildirimler).toHaveLength(0);
    const donus = calistir([kayit(800)]).bildirimler;
    expect(donus).toHaveLength(1);
    expect(donus[0]).toContain("normale döndü");
    expect(calistir([kayit(800)]).bildirimler).toHaveLength(0);
  });

  it("uyarıdan kritiğe geçişi bildirir", () => {
    expect(calistir([kayit(2600), kayit(2600), kayit(2600)]).bildirimler).toHaveLength(1);
    const { bildirimler } = calistir([kayit(4200)]);
    expect(bildirimler).toHaveLength(1);
    expect(bildirimler[0]).toContain("sınırına dayandı");
  });

  it("başka etiketli transaction kayıtlarını saymaz", () => {
    const baska = kayit(4800).replace('"runtime.lease"', '"baska.is"');
    expect(calistir([baska]).bildirimler).toEqual([]);
  });

  it("log boşsa ya da okunamazsa lease kontrolü sessiz kalır, canlılık yine koşar", () => {
    const { status, bildirimler } = calistir([]);
    expect(status).toBe(0);
    expect(bildirimler).toEqual([]);
  });
});

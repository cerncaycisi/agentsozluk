import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/*
  Canlılık alarmının sağlık özeti (1 Ekim 2026, PLAN 5.9 İ6). Betik gerçekten
  çalıştırılır; `docker` ve `curl` PATH'teki sahtelerle değiştirilir. Sahte
  docker yalnız `db` üzerinde, READ ONLY ve `saglik-ozeti` işaretli sorguya
  sahte özeti döndürür.

  Özet biçimi: SAGLIK codexHata basarili ret basari ayar etkin neden kalanSn
*/

const BETIK = path.resolve("deploy/alarm/canlilik-alarmi.sh");
const COMPOSE = "/opt/agent-sozluk/runtime/compose.production.yaml";
const SAGLAM = "SAGLIK 0 12 3 40 2 2 EVIDENCE_FRESH 900000";

let dizin: string;

function calistir(ozet: string, simdi = 1_800_000_000, ekOrtam: Record<string, string> = {}) {
  const sonuc = spawnSync("bash", [BETIK, "--yalniz-saglik"], {
    encoding: "utf8",
    timeout: 30_000,
    env: {
      NODE_ENV: "test",
      PATH: `${path.join(dizin, "bin")}:/usr/bin:/bin`,
      ALARM_NTFY_KONU: "test-konu",
      ALARM_NTFY_SUNUCU: "https://ntfy.example",
      ALARM_DURUM_DOSYASI: path.join(dizin, "durum", "durum"),
      ALARM_SIMDI: String(simdi),
      SAHTE_DIZIN: dizin,
      SAHTE_SAGLIK: ozet,
      ...ekOrtam,
    },
  });
  const oku = (ad: string) =>
    existsSync(path.join(dizin, ad)) ? readFileSync(path.join(dizin, ad), "utf8") : "";
  const bildirimler = oku("curl.log").split("\n---\n").filter(Boolean);
  rmSync(path.join(dizin, "curl.log"), { force: true });
  return {
    status: sonuc.status,
    stderr: sonuc.stderr,
    bildirimler,
    durum: oku(path.join("durum", "durum-saglik")).trim(),
  };
}

beforeEach(() => {
  dizin = mkdtempSync(path.join(tmpdir(), "saglik-alarm-"));
  const bin = path.join(dizin, "bin");
  mkdirSync(bin);
  writeFileSync(
    path.join(bin, "docker"),
    `#!/usr/bin/env bash
tum=" $* "
[[ "$tum" == *" -f ${COMPOSE} "* && "$tum" == *" exec -T db psql "* ]] || exit 97
sql="$(cat)"
[[ "$sql" == *"READ ONLY"* && "$sql" == *"saglik-ozeti"* ]] || exit 99
[[ -n "$SAHTE_SAGLIK" ]] && echo "$SAHTE_SAGLIK"
exit 0
`,
  );
  writeFileSync(
    path.join(bin, "curl"),
    `#!/usr/bin/env bash
[[ -n "$SAHTE_CURL_HATA" ]] && exit 22
{ printf '%s\\n' "$@"; printf -- '---\\n'; } >> "$SAHTE_DIZIN/curl.log"
`,
  );
  chmodSync(path.join(bin, "docker"), 0o755);
  chmodSync(path.join(bin, "curl"), 0o755);
});

afterEach(() => rmSync(dizin, { recursive: true, force: true }));

describe("sağlık özeti", () => {
  it("her şey yolundaysa bildirim atmaz ve temiz yazar", () => {
    const sonuc = calistir(SAGLAM);
    expect(sonuc.status).toBe(0);
    expect(sonuc.bildirimler).toEqual([]);
    expect(sonuc.durum).toMatch(/^temiz \d+$/);
  });

  it("Codex hataları varken başarılı koşu yoksa yüksek öncelikle bildirir", () => {
    const sonuc = calistir("SAGLIK 5 0 3 40 2 2 EVIDENCE_FRESH 900000");
    expect(sonuc.bildirimler).toHaveLength(1);
    expect(sonuc.bildirimler[0]).toContain("Title: Agent Sözlük sağlık: codex");
    expect(sonuc.bildirimler[0]).toContain("Priority: high");
    expect(sonuc.bildirimler[0]).toContain("5 koşu Codex hatasıyla bitti");
    expect(sonuc.durum).toMatch(/^codex \d+$/);
  });

  it("başarılı koşu varken Codex hataları tek başına alarm değildir", () => {
    expect(calistir("SAGLIK 5 1 3 40 2 2 EVIDENCE_FRESH 900000").bildirimler).toEqual([]);
  });

  it("etkin eşzamanlılık ayarın altındaysa nedeniyle bildirir", () => {
    const sonuc = calistir("SAGLIK 0 6 3 40 2 1 EVIDENCE_STALE -3600");
    expect(sonuc.bildirimler[0]).toContain("Title: Agent Sözlük sağlık: hat,kapasite");
    expect(sonuc.bildirimler[0]).toContain("etkin eşzamanlılık 1, ayar 2 (neden EVIDENCE_STALE)");
    expect(sonuc.bildirimler[0]).toContain("kanıt 0 gündür bayat");
  });

  it("kapasite kanıtı üç gün içinde bayatlayacaksa önceden uyarır", () => {
    const sonuc = calistir("SAGLIK 0 6 3 40 2 2 EVIDENCE_FRESH 7200");
    expect(sonuc.bildirimler[0]).toContain("Title: Agent Sözlük sağlık: kapasite");
    expect(sonuc.bildirimler[0]).toContain("kanıt 2 saat içinde bayatlıyor");
    expect(calistir(SAGLAM.replace("900000", "yok"), 1_900_000_000).bildirimler[0]).toContain(
      "ölçüm kaydı yok",
    );
  });

  it("ret oranı eşiği aşınca düşük öncelikle günde bir kez hatırlatır", () => {
    const t = 1_800_000_000;
    const ilk = calistir("SAGLIK 0 6 30 70 2 2 EVIDENCE_FRESH 900000", t);
    expect(ilk.bildirimler[0]).toContain("Title: Agent Sözlük sağlık: ret");
    expect(ilk.bildirimler[0]).toContain("Priority: low");
    expect(ilk.bildirimler[0]).toContain("%30'i reddedildi (30/100, eşik %20)");
    expect(
      calistir("SAGLIK 0 6 30 70 2 2 EVIDENCE_FRESH 900000", t + 7 * 3600).bildirimler,
    ).toEqual([]);
    expect(
      calistir("SAGLIK 0 6 30 70 2 2 EVIDENCE_FRESH 900000", t + 25 * 3600).bildirimler,
    ).toHaveLength(1);
  });

  it("az sayıda entry eyleminde ret oranına bakmaz", () => {
    expect(calistir("SAGLIK 0 6 9 5 2 2 EVIDENCE_FRESH 900000").bildirimler).toEqual([]);
  });

  it("aynı sorun 6 saat içinde tekrar bildirilmez, sorun kümesi değişince bildirilir", () => {
    const t = 1_800_000_000;
    expect(calistir("SAGLIK 5 0 3 40 2 2 EVIDENCE_FRESH 900000", t).bildirimler).toHaveLength(1);
    expect(calistir("SAGLIK 5 0 3 40 2 2 EVIDENCE_FRESH 900000", t + 900).bildirimler).toEqual([]);
    const degisen = calistir("SAGLIK 5 0 3 40 2 1 EVIDENCE_STALE -10", t + 1800);
    expect(degisen.bildirimler[0]).toContain("sağlık: codex,hat,kapasite");
    expect(
      calistir("SAGLIK 5 0 3 40 2 1 EVIDENCE_STALE -10", t + 1800 + 6 * 3600 + 1).bildirimler,
    ).toHaveLength(1);
  });

  it("sorun geçince bir kez düzeldi der", () => {
    const t = 1_800_000_000;
    calistir("SAGLIK 5 0 3 40 2 2 EVIDENCE_FRESH 900000", t);
    const duzeldi = calistir(SAGLAM, t + 900);
    expect(duzeldi.bildirimler[0]).toContain("Title: Agent Sözlük sağlık: düzeldi");
    expect(duzeldi.durum).toMatch(/^temiz /);
    expect(calistir(SAGLAM, t + 1800).bildirimler).toEqual([]);
  });

  it("gönderim başarısızsa durumu yazmaz; sonraki koşu yeniden dener", () => {
    const t = 1_800_000_000;
    const ozet = "SAGLIK 5 0 3 40 2 2 EVIDENCE_FRESH 900000";
    expect(calistir(ozet, t, { SAHTE_CURL_HATA: "1" }).durum).toBe("");
    expect(calistir(ozet, t + 900).bildirimler).toHaveLength(1);
  });

  it("sorgu başarısız ya da bozuksa bildirim atmaz, journal'a yazar ve 0 döner", () => {
    for (const ozet of ["", "SAGLIK x 0 0 0 2 2 EVIDENCE_FRESH 1", "SAGLIK 1 2 3"]) {
      const sonuc = calistir(ozet);
      expect(sonuc.status).toBe(0);
      expect(sonuc.bildirimler).toEqual([]);
      expect(sonuc.stderr).toContain("agent-sozluk-alarm: sağlık özeti");
    }
  });

  it("bozuk durum dosyası temiz sayılır", () => {
    mkdirSync(path.join(dizin, "durum"), { recursive: true });
    writeFileSync(path.join(dizin, "durum", "durum-saglik"), "codex 99999999999999\n");
    expect(calistir("SAGLIK 5 0 3 40 2 2 EVIDENCE_FRESH 900000").bildirimler).toHaveLength(1);
  });
});

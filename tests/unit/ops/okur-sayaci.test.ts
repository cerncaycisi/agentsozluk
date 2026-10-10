import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/*
  Çerezsiz okur sayacı (2 Ekim 2026, PLAN 5.9 Z6). Betik gerçekten çalıştırılır;
  `docker` PATH'teki sahteyle değiştirilir. Sahte docker yalnız doğru compose
  dosyasıyla `ps -a -q caddy` (SAHTE_KIMLIK) ve `logs ... caddy` (kayit.log)
  çağrılarına cevap verir ve `--since` değerini kaydeder. Sayaçlar SQLite'ta;
  test `gun` komutunun JSON çıktısını okur.
*/

const BETIK = path.resolve("deploy/sayac/okur-sayaci.py");
const COMPOSE = "/opt/agent-sozluk/runtime/compose.production.yaml";
const T0 = Date.UTC(2026, 9, 2, 10, 0, 0) / 1000; // 2 Ekim 10:00 UTC
const KIMLIK = "aaaaaaaaaaaa1111";

const CHROME =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const GPTBOT = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2)";

let dizin: string;

interface Istek {
  ts: number;
  uri?: string;
  ua?: string;
  status?: number;
  method?: string;
  host?: string;
  ct?: string | null;
  referer?: string;
  rsc?: boolean;
  ip?: string;
  tarayici?: boolean; // Sec-Fetch-Mode/Dest; varsayılan: UA Mozilla ise var
  dest?: string;
  purpose?: string;
}

function satir(i: Istek): string {
  const ua = i.ua ?? CHROME;
  const headers: Record<string, string[]> = { "User-Agent": [ua], Cookie: ["REDACTED"] };
  if (i.referer !== undefined) headers.Referer = [i.referer];
  if (i.rsc) headers.Rsc = ["1"];
  if (i.tarayici ?? ua.startsWith("Mozilla/")) {
    headers["Sec-Fetch-Mode"] = ["navigate"];
    headers["Sec-Fetch-Dest"] = [i.dest ?? "document"];
  }
  if (i.purpose) headers["Sec-Purpose"] = [i.purpose];
  return JSON.stringify({
    level: "info",
    ts: i.ts,
    logger: "http.log.access.log0",
    msg: "handled request",
    request: {
      remote_ip: i.ip ?? "203.0.113.7",
      client_ip: i.ip ?? "203.0.113.7",
      method: i.method ?? "GET",
      host: i.host ?? "agentsozluk.com",
      uri: i.uri ?? "/",
      headers,
    },
    status: i.status ?? 200,
    resp_headers: i.ct === null ? {} : { "Content-Type": [i.ct ?? "text/html; charset=utf-8"] },
  });
}

function calistir(
  satirlar: string[] | null,
  simdi: number,
  komut = "topla",
  ek: Record<string, string> = {},
) {
  if (satirlar) writeFileSync(path.join(dizin, "kayit.log"), satirlar.join("\n") + "\n");
  return spawnSync("python3", [BETIK, ...komut.split(" ")], {
    encoding: "utf8",
    timeout: 30_000,
    env: {
      NODE_ENV: "test",
      PATH: `${path.join(dizin, "bin")}:/usr/bin:/bin`,
      SAYAC_DIZINI: path.join(dizin, "veri"),
      SAYAC_SIMDI: String(simdi),
      SAHTE_DIZIN: dizin,
      SAHTE_KIMLIK: KIMLIK,
      ...ek,
    },
  });
}

function gun(ad = "2026-10-02") {
  const sonuc = calistir(null, T0, `gun ${ad}`);
  expect(sonuc.status).toBe(0);
  return JSON.parse(sonuc.stdout) as {
    sayac: Record<string, Record<string, number>>;
    bosluk: number;
    kismi: number;
    ilk: number | null;
  };
}

beforeEach(() => {
  dizin = mkdtempSync(path.join(tmpdir(), "okur-sayaci-"));
  mkdirSync(path.join(dizin, "bin"));
  writeFileSync(path.join(dizin, "kayit.log"), "");
  writeFileSync(
    path.join(dizin, "bin", "docker"),
    `#!/usr/bin/env bash
tum=" $* "
[[ "$tum" == *" -f ${COMPOSE} "* && "$*" == *" caddy" ]] || exit 97
if [[ "$tum" == *" ps -a -q "* ]]; then
  [[ -n "\${SAHTE_PS_HATA:-}" ]] && exit 1
  echo "$SAHTE_KIMLIK"; exit 0
fi
[[ "$tum" == *" logs "* ]] || exit 98
since=""; onceki=""
for a in "$@"; do [[ "$onceki" == "--since" ]] && since="$a"; onceki="$a"; done
echo "$since" >> "$SAHTE_DIZIN/since.log"
[[ -n "\${SAHTE_HATA:-}" ]] && exit 1
[[ -n "\${SAHTE_SESSIZ:-}" ]] && exec sleep "$SAHTE_SESSIZ"
# stdout'u devralan torun süreç bırakıp çık.
[[ -n "\${SAHTE_TORUN:-}" ]] && { sleep "$SAHTE_TORUN" & exit 0; }
cat "$SAHTE_DIZIN/kayit.log"
`,
  );
  chmodSync(path.join(dizin, "bin", "docker"), 0o755);
});

afterEach(() => rmSync(dizin, { recursive: true, force: true }));

describe("çerezsiz okur sayacı", () => {
  it("insan ve bot sayfa görüntülemelerini ayırır, türleri ve başlıkları sayar", () => {
    const sonuc = calistir(
      [
        satir({ ts: T0 - 300, uri: "/" }),
        satir({
          ts: T0 - 290,
          uri: "/baslik/yaya-guvenligi--6526",
          referer: "https://www.google.com/",
        }),
        satir({
          ts: T0 - 280,
          uri: "/baslik/yaya-guvenligi--6526?page=2",
          referer: "https://agentsozluk.com/",
        }),
        satir({ ts: T0 - 270, uri: "/ara?q=gizli+arama+terimi" }),
        satir({ ts: T0 - 260, uri: "/baslik/yaya-guvenligi--6526", ua: GOOGLEBOT }),
        satir({ ts: T0 - 250, uri: "/entry/12", ua: GPTBOT }),
        satir({ ts: T0 - 240, uri: "/sitemap.xml", ua: GOOGLEBOT, ct: "application/xml" }),
        satir({ ts: T0 - 230, uri: "/baslik/x?_rsc=abc", rsc: true }),
        satir({ ts: T0 - 220, uri: "/_next/static/a.js", ct: "application/javascript" }),
        satir({ ts: T0 - 210, uri: "/yok", status: 404 }),
        satir({ ts: T0 - 200, uri: "/", ua: "curl/8.5.0" }),
        satir({ ts: T0 - 190, uri: "/", host: "46.225.20.177" }),
        satir({ ts: T0 - 180, uri: "/api/v1/topics", ct: "application/json" }),
        "bozuk satır",
      ],
      T0,
    );
    expect(sonuc.status).toBe(0);
    const g = gun().sayac;
    expect(g.sayfa).toEqual({ insan: 4, bot: 3 });
    expect(g.bot_ailesi).toEqual({ google: 1, yapay_zeka: 1, arac: 1 });
    expect(g.insan_sayfa_turu).toEqual({ ana_sayfa: 1, baslik: 2, arama: 1 });
    expect(g.insan_baslik).toEqual({ "6526": 2 });
    expect(g.yonlendiren).toEqual({ "www.google.com": 1, "(site ici)": 1, "(yok)": 2 });
    // Güvenilir insan: ana sayfa + iki yönlendirenli; yönlendirensiz arama sayılmaz.
    expect(g.guvenilir).toEqual({ insan: 3, yonlendirensiz_derin: 1 });
    expect(g.rsc_gezinme).toEqual({ insan: 1 });
    expect(g.istek).toMatchObject({ toplam: 13, "2xx": 12, "4xx": 1, baska_alan: 1, api_dis: 1 });
  });

  it("diske IP, User-Agent, sorgu dizesi, çerez ya da ham başlık yolu yazmaz", () => {
    calistir(
      [
        satir({ ts: T0 - 100, uri: "/ara?q=gizli+arama+terimi", ip: "198.51.100.23" }),
        satir({ ts: T0 - 95, uri: "/baslik/ali%40example.com" }), // açılmamış başlık
        satir({
          ts: T0 - 90,
          uri: "/baslik/a--7?q=baska",
          referer: "https://ornek.example/yol?ad=x",
        }),
        satir({ ts: T0 - 85, uri: "/", referer: "http://198.51.100.23/ozel" }),
        satir({ ts: T0 - 84, uri: "/", referer: "http://[2001:db8::7]/ozel" }),
        satir({ ts: T0 - 83, uri: "/", referer: "https://[GIZLI_ISARET]/" }),
        satir({ ts: T0 - 82, uri: "/", referer: "https://kullanici@kotu_ad!.example/" }),
      ],
      T0,
    );
    const ham = readFileSync(path.join(dizin, "veri", "sayac.db")).toString("latin1");
    const dok = JSON.stringify(gun());
    for (const yasak of [
      "198.51.100.23",
      "203.0.113.7",
      "2001:db8",
      "gizli",
      "GIZLI_ISARET",
      "Chrome",
      "REDACTED",
      "?q=",
      "ad=x",
      "/yol",
      "example.com",
      "ali",
      "kullanici",
    ]) {
      expect(ham).not.toContain(yasak);
      expect(dok).not.toContain(yasak);
    }
    const g = gun().sayac;
    expect(g.insan_baslik).toEqual({ "(acilmamis)": 1, "7": 1 });
    expect(g.yonlendiren).toMatchObject({ "ornek.example": 1, "(ip)": 2, "(gecersiz)": 2 });
  });

  it("bozuk yönlendiren koşuyu durdurmaz ve journal'a girdi yazılmaz", () => {
    const sonuc = calistir([satir({ ts: T0 - 10, referer: "http://[::1" })], T0);
    expect(sonuc.status).toBe(0);
    expect(sonuc.stderr).toBe("");
    expect(gun().sayac.yonlendiren).toEqual({ "(gecersiz)": 1 });
  });

  it("imleçten sonrasını okur; aynı satır iki kez sayılmaz", () => {
    const kayit = [satir({ ts: T0 - 100 }), satir({ ts: T0 - 50 })];
    calistir(kayit, T0);
    calistir([...kayit, satir({ ts: T0 + 100 })], T0 + 3600);
    expect(gun().sayac.sayfa?.insan).toBe(3);
    const since = readFileSync(path.join(dizin, "since.log"), "utf8").trim().split("\n");
    expect(since[1]).toBe("2026-10-02T09:58:10Z"); // imleç (T0−50) − 60 sn
  });

  it("kesirli zaman damgası yuvarlanmaz; tekrar okunan satır sayılmaz (Astra, 2 Ekim)", () => {
    const kayit = [satir({ ts: 1790935190.1234562 })];
    calistir(kayit, T0);
    calistir(kayit, T0 + 3600);
    expect(gun().sayac.sayfa?.insan).toBe(1);
  });

  it("henüz gelmemiş zaman damgalı satırı bu koşuda saymaz", () => {
    const kayit = [satir({ ts: T0 - 10 }), satir({ ts: T0 + 10 })];
    calistir(kayit, T0);
    expect(gun().sayac.sayfa?.insan).toBe(1);
    calistir(kayit, T0 + 60);
    expect(gun().sayac.sayfa?.insan).toBe(2);
  });

  it("gece yarısını aşan kaydı iki güne böler", () => {
    const gece = Date.UTC(2026, 9, 3, 0, 0, 0) / 1000;
    calistir([satir({ ts: gece - 5 }), satir({ ts: gece + 5 })], gece + 60);
    expect(gun("2026-10-02").sayac.sayfa?.insan).toBe(1);
    expect(gun("2026-10-03").sayac.sayfa?.insan).toBe(1);
  });

  it("uzun boşlukta aradaki bütün günleri işaretler (Astra, 2 Ekim)", () => {
    calistir([satir({ ts: T0 - 10 })], T0);
    const sonra = T0 + 2 * 86400;
    calistir([satir({ ts: sonra - 10 })], sonra);
    for (const ad of ["2026-10-02", "2026-10-03", "2026-10-04"]) expect(gun(ad).bosluk).toBe(1);
  });

  it("Caddy konteyneri değiştiyse kısa aralıkta da boşluk işaretler", () => {
    calistir([satir({ ts: T0 - 10 })], T0);
    calistir([satir({ ts: T0 + 300 })], T0 + 3600, "topla", { SAHTE_KIMLIK: "bbbbbbbbbbbb2222" });
    expect(gun().bosluk).toBe(1);
  });

  it("kısa ve kesintisiz aralıkta boşluk işaretlemez", () => {
    calistir([satir({ ts: T0 - 10 })], T0);
    calistir([satir({ ts: T0 + 300 })], T0 + 3600);
    expect(gun().bosluk).toBe(0);
  });

  it("insan için yalnız belge gezinmesini sayar: prefetch ve gömülü istek sayılmaz", () => {
    calistir(
      [
        satir({ ts: T0 - 40, purpose: "prefetch" }),
        satir({ ts: T0 - 30, dest: "iframe" }),
        satir({ ts: T0 - 20, dest: "empty" }),
        satir({ ts: T0 - 10 }),
      ],
      T0,
    );
    expect(gun().sayac.sayfa).toEqual({ insan: 1 });
  });

  it("Content-Type içermeyen 304 belge gezinmesini sayar (Astra, 2 Ekim)", () => {
    calistir([satir({ ts: T0 - 10, status: 304, ct: null })], T0);
    expect(gun().sayac.sayfa).toEqual({ insan: 1 });
  });

  it("Sec-Fetch başlığı olmayan tarayıcı taklidini bot sayar", () => {
    calistir(
      [
        satir({
          ts: T0 - 20,
          uri: "/baslik/a--1",
          referer: "https://www.google.com/",
          tarayici: false,
        }),
        satir({ ts: T0 - 10, uri: "/baslik/a--1", referer: "https://www.google.com/" }),
      ],
      T0,
    );
    const g = gun().sayac;
    expect(g.sayfa).toEqual({ insan: 1, bot: 1 });
    expect(g.bot_ailesi).toEqual({ taklit_tarayici: 1 });
    expect(g.yonlendiren).toEqual({ "www.google.com": 1 });
  });

  it("docker okunamazsa 1 döner, imleç ve sayaçlar değişmez", () => {
    calistir([satir({ ts: T0 - 10 })], T0);
    for (const ek of [{ SAHTE_HATA: "1" }, { SAHTE_PS_HATA: "1" }]) {
      const sonuc = calistir([satir({ ts: T0 + 10 })], T0 + 60, "topla", ek);
      expect(sonuc.status).toBe(1);
      expect(sonuc.stderr).toMatch(/okur-sayaci: (kayıt okunamadı|caddy konteyneri bulunamadı)/);
    }
    expect(gun().sayac.sayfa?.insan).toBe(1);
    calistir([satir({ ts: T0 + 10 })], T0 + 60);
    expect(gun().sayac.sayfa?.insan).toBe(2);
  });

  it("günlük sayımı kırpmaz: saatler arasında biriken başlık kaybolmaz (Astra, 2 Ekim)", () => {
    const ilk = Array.from({ length: 60 }, (_, i) =>
      satir({ ts: T0 - 200 + i, uri: `/baslik/b--${i + 1}` }),
    );
    calistir(ilk, T0);
    calistir([satir({ ts: T0 + 10, uri: "/baslik/b--60" })], T0 + 3600);
    const b = gun().sayac.insan_baslik ?? {};
    expect(Object.keys(b)).toHaveLength(60);
    expect(b["60"]).toBe(2);
  });

  it("400 günden eski günleri siler", () => {
    const eski = Date.UTC(2025, 7, 1, 12) / 1000;
    calistir([satir({ ts: eski })], eski + 60);
    calistir([satir({ ts: T0 - 10 })], T0);
    expect(gun("2025-08-01").sayac).toEqual({});
    expect(gun().sayac.sayfa?.insan).toBe(1);
  });

  it("rapor verilen ana göre günlük özeti yazar", () => {
    calistir(
      [satir({ ts: T0 - 10, uri: "/baslik/a--5" }), satir({ ts: T0 - 5, ua: GOOGLEBOT })],
      T0,
    );
    const sonuc = calistir(null, T0, "rapor 1");
    expect(sonuc.status).toBe(0);
    expect(sonuc.stdout).toMatch(/2026-10-02 +1 +1 +%50/);
    expect(sonuc.stdout).toContain("(publicId): 5 1");
    // Yönlendirensiz derin başlık güvenilir insan sayılmaz.
    expect(sonuc.stdout).toMatch(/2026-10-02 +1 +1 +%50 +1 +0 +0 +0 +0 {2}/u);
  });

  it("uygulamanın başlık kimliği sayılmayan sayısal yolları kimlik diye saklamaz (Astra, 2. tur)", () => {
    calistir(
      [
        satir({ ts: T0 - 30, uri: "/baslik/--5551234567" }),
        satir({ ts: T0 - 20, uri: "/baslik/kart--9999888877776666" }),
        satir({ ts: T0 - 10, uri: "/baslik/a--b--12" }),
      ],
      T0,
    );
    const ham = readFileSync(path.join(dizin, "veri", "sayac.db")).toString("latin1");
    for (const yasak of ["5551234567", "9999888877776666"]) expect(ham).not.toContain(yasak);
    expect(gun().sayac.insan_baslik).toEqual({ "(acilmamis)": 2, "12": 1 });
  });

  it("alternatif IPv4 yazımlı yönlendiren alan adı sayılmaz (Astra, 2. tur)", () => {
    calistir(
      ["http://192.168.001.001/p", "http://127.1/", "http://0x7f.0.0.1/", "http://2130706433/"].map(
        (referer, i) => satir({ ts: T0 - 40 + i, referer }),
      ),
      T0,
    );
    expect(gun().sayac.yonlendiren).toEqual({ "(ip)": 4 });
  });

  it("imleçsiz ilk koşunun başladığı gün kısmi işaretlenir, sonraki koşu bunu bozmaz", () => {
    const yarim = Date.UTC(2026, 9, 2, 0, 45) / 1000;
    calistir([satir({ ts: yarim - 900 })], yarim);
    expect(gun().kismi).toBe(1);
    calistir([satir({ ts: yarim + 100 })], yarim + 3600);
    expect(gun().kismi).toBe(1);
    expect(calistir(null, yarim + 3600, "rapor 1").stdout).toContain("kısmi");
  });

  it("sessiz kalan docker süreci süre sınırında kesilir (Astra, 2. tur)", () => {
    const bas = Date.now();
    const sonuc = calistir(null, T0, "topla", { SAHTE_SESSIZ: "20", SAYAC_OKUMA_SINIRI_SN: "1" });
    expect(sonuc.status).toBe(1);
    expect(sonuc.stderr).toContain("kayıt okunamadı");
    expect(Date.now() - bas).toBeLessThan(10_000);
  });

  it("stdout'u tutan torun süreç de süre sınırında kesilir (Astra, 3. tur)", () => {
    const bas = Date.now();
    const sonuc = calistir(null, T0, "topla", { SAHTE_TORUN: "20", SAYAC_OKUMA_SINIRI_SN: "1" });
    expect(sonuc.status).toBe(1);
    expect(sonuc.stderr).toContain("kayıt okunamadı");
    expect(Date.now() - bas).toBeLessThan(10_000);
  });

  it("gece yarısı örtüşmesinde sayılan önceki gün de kısmi işaretlenir (Astra, 3. tur)", () => {
    const simdi = Date.UTC(2026, 9, 2, 0, 0, 30) / 1000;
    const onceki = Date.UTC(2026, 8, 30, 23, 59, 45) / 1000;
    calistir([satir({ ts: onceki }), satir({ ts: simdi - 10 })], simdi);
    expect(gun("2026-09-30").kismi).toBe(1);
    expect(gun("2026-09-30").sayac.sayfa?.insan).toBe(1);
  });

  it("eski şemalı veritabanı veriyi koruyarak yükseltilir (Astra, 3. tur)", () => {
    mkdirSync(path.join(dizin, "veri"), { recursive: true });
    const kur = spawnSync(
      "python3",
      [
        "-c",
        `import sqlite3,sys
db=sqlite3.connect(sys.argv[1])
db.executescript("""CREATE TABLE durum (anahtar TEXT PRIMARY KEY, deger TEXT NOT NULL);
CREATE TABLE sayac (gun TEXT NOT NULL, alan TEXT NOT NULL, anahtar TEXT NOT NULL, adet INTEGER NOT NULL, PRIMARY KEY (gun, alan, anahtar));
CREATE TABLE gun (gun TEXT PRIMARY KEY, ilk REAL, son REAL, bosluk INTEGER NOT NULL DEFAULT 0);
INSERT INTO sayac VALUES ('2026-10-02','sayfa','insan',5);""")
db.commit()`,
        path.join(dizin, "veri", "sayac.db"),
      ],
      { encoding: "utf8" },
    );
    expect(kur.status).toBe(0);
    expect(calistir(null, T0, "rapor 1").status).toBe(0);
    expect(gun().sayac.sayfa?.insan).toBe(5);
    expect(gun().kismi).toBe(0);
  });
});

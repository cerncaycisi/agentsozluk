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
    ozet: Ozet;
  };
}

interface Ozet {
  insan_goruntuleme: number;
  guvenilir_goruntuleme: { tanim: string; adet: number; kismi?: boolean; v1_adet?: number };
  site_ici_gezinme: number;
  yonlendirensiz: number;
  ip_gecersiz_yonlendiren: number;
  dis_giris: Record<"toplam" | "arama_motoru" | "cevap_motoru" | "sosyal" | "diger", number>;
  cevap_motoru_getirmesi: number;
}

function sql(veritabani: string, betik: string) {
  const sonuc = spawnSync(
    "python3",
    [
      "-c",
      "import sqlite3,sys\ndb=sqlite3.connect(sys.argv[1])\ndb.executescript(sys.argv[2])\ndb.commit()",
      veritabani,
      betik,
    ],
    { encoding: "utf8" },
  );
  expect(sonuc.status).toBe(0);
}

function durumOku(veritabani: string, anahtar: string) {
  return spawnSync(
    "python3",
    [
      "-c",
      "import sqlite3,sys\nr=sqlite3.connect(sys.argv[1]).execute('SELECT deger FROM durum WHERE anahtar = ?', (sys.argv[2],)).fetchone()\nprint(r[0] if r else '')",
      veritabani,
      anahtar,
    ],
    { encoding: "utf8" },
  ).stdout.trim();
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
    // Güvenilir görüntüleme v2: yönlendirensiz ana sayfa + dış yönlendirenli; site içi
    // yönlendirenli başlık ve yönlendirensiz arama sayılmaz. v1 alanı artık yazılmaz.
    expect(g.guvenilir).toBeUndefined();
    expect(g.guvenilir_v2).toEqual({ evet: 2, hayir: 2 });
    expect(g.rsc_gezinme).toEqual({ insan: 1 });
    expect(g.istek).toMatchObject({ toplam: 13, "2xx": 12, "4xx": 1, baska_alan: 1, api_dis: 1 });
  });

  it("yapay zekâ ajanlarını sabit adla ayırır; kullanıcı adına getirmeyi ve dış girişi sayar (12 Ekim)", () => {
    const CHATGPT_USER =
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot";
    const PERPLEXITY_USER =
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)";
    const META_FETCHER =
      "meta-externalfetcher/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)";
    const OAI_SEARCH =
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0";
    const sonuc = calistir(
      [
        satir({ ts: T0 - 100, uri: "/baslik/kapiler-etki--77", ua: CHATGPT_USER }),
        satir({ ts: T0 - 95, uri: "/entry/9", ua: PERPLEXITY_USER }),
        satir({ ts: T0 - 90, uri: "/baslik/kapiler-etki--77", ua: OAI_SEARCH }),
        satir({ ts: T0 - 85, uri: "/entry/12", ua: GPTBOT }),
        satir({ ts: T0 - 80, uri: "/robots.txt", ua: CHATGPT_USER, ct: "text/plain" }),
        satir({ ts: T0 - 75, uri: "/baslik/a--5", ua: META_FETCHER }),
        satir({ ts: T0 - 74, uri: `/baslik/a--${"9".repeat(4301)}`, ua: CHATGPT_USER }),
        satir({
          ts: T0 - 70,
          uri: "/baslik/kapiler-etki--77",
          referer: "https://www.google.com/",
        }),
        satir({ ts: T0 - 60, uri: "/entry/9", referer: "https://chatgpt.com/" }),
        satir({ ts: T0 - 50, uri: "/baslik/b--8", referer: "https://agentsozluk.com/" }),
      ],
      T0,
    );
    expect(sonuc.status).toBe(0);
    const g = gun().sayac;
    expect(g.bot_ailesi).toEqual({ yapay_zeka: 6 });
    expect(g.yz_ajan).toEqual({
      "chatgpt-user": 2,
      "perplexity-user": 1,
      "meta-externalfetcher": 1,
      "oai-searchbot": 1,
      gptbot: 1,
    });
    expect(g.yz_getirme_turu).toEqual({ baslik: 3, entry: 1 });
    // Binlerce basamaklı ek kimlik sayılmaz ve kaydı yarım bırakmaz (Astra, 12 Ekim).
    expect(g.yz_getirme_baslik).toEqual({ "77": 1, "5": 1, "(acilmamis)": 1 });
    expect(g.istek?.islenemeyen).toBeUndefined();
    // Site içi yönlendirme dış giriş sayılmaz.
    expect(g.dis_giris_turu).toEqual({ baslik: 1, entry: 1 });
    expect(g.dis_giris_baslik).toEqual({ "77": 1 });

    const rapor = calistir(null, T0, "rapor 7");
    expect(rapor.status).toBe(0);
    expect(rapor.stdout).toContain("dönem (2026-09-26 – 2026-10-02):");
    // İmleçsiz ilk koşu bir gün geriye baktı: ayrıntı kapsamı o günden başlar ve önceki dönem
    // sıfır gibi sunulmaz.
    expect(rapor.stdout).toContain(
      "not: ayrıntılı sayaçlar 2026-10-01 tarihinden beri (o gün kısmi); öncesi ölçülmedi",
    );
    expect(rapor.stdout).toContain(
      "dış giriş 2 (yönlendirenden): arama motoru 1, cevap motoru 1, sosyal 0, diğer 0; sayfa türü: baslik 1, entry 1",
    );
    expect(rapor.stdout).toContain(
      "cevap motoru getirmesi (kullanıcı adına bot isteği, insan sayılmaz) 4: baslik 3, entry 1",
    );
    // Kısmi gün tek günlük raporda da eksik diye işaretlenir.
    expect(calistir(null, T0, "rapor 1").stdout).toContain(
      "eksik ölçülen gün (boşluk, kısmi ya da veri yok): 2026-10-02",
    );
    // Dönemde verisi olmayan günler eksik diye listelenir; toplam tam gibi sunulmaz (Sol, 12 Ekim).
    expect(rapor.stdout).toContain(
      "not: eksik ölçülen gün (boşluk, kısmi ya da veri yok): 2026-09-26, 2026-09-27, 2026-09-28, 2026-09-29, 2026-09-30, 2026-10-01, 2026-10-02",
    );
    // Ertesi günden başlayan dönemde ayrıntı notu yok; o günün verisi olmadığı için eksik notu var.
    const ertesi = calistir(null, T0 + 86_400, "rapor 1").stdout;
    expect(ertesi).not.toContain("öncesi ölçülmedi");
    expect(ertesi).toContain("eksik ölçülen gün (boşluk, kısmi ya da veri yok): 2026-10-03");
    expect(rapor.stdout).toContain("getirilen başlıklar (publicId): (acilmamis) 1, 5 1, 77 1");
    const ham = readFileSync(path.join(dizin, "veri", "sayac.db"));
    expect(ham.includes(Buffer.from("ChatGPT-User/1.0"))).toBe(false);
  });

  it("boş geçen ilk yükseltilmiş koşu ayrıntı başlangıcını imlecin gününe yazar (Sol, 12 Ekim)", () => {
    calistir([satir({ ts: T0 - 10, uri: "/" })], T0);
    // Eski sürüm gibi: başlangıç anahtarı yok, imleç 2 Ekim'de.
    const veritabani = path.join(dizin, "veri", "sayac.db");
    expect(
      spawnSync("python3", [
        "-c",
        `import sqlite3; db = sqlite3.connect(${JSON.stringify(veritabani)}); db.execute("DELETE FROM durum WHERE anahtar = 'ayrinti_baslangic'"); db.commit()`,
      ]).status,
    ).toBe(0);
    // Gece yarısından hemen önce satırsız ama başarılı koşu.
    expect(calistir([], T0 + 50_000).status).toBe(0);
    const rapor = calistir(null, T0 + 86_400, "rapor 1").stdout;
    expect(rapor).not.toContain("öncesi ölçülmedi");
    expect(calistir(null, T0, "rapor 1").stdout).toContain(
      "ayrıntılı sayaçlar 2026-10-02 tarihinden beri",
    );
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
    // Yönlendirensiz derin başlık güvenilir görüntüleme sayılmaz; sütun tanım sürümünü taşır.
    expect(sonuc.stdout).toMatch(/2026-10-02 +1 +1 +%50 +1 +0 +0 +0 +0 +v2 0 +0 {2}/u);
    expect(sonuc.stdout).not.toMatch(/kişi|ziyaretçi/u);
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
  it("güvenilir görüntüleme v2: yalnız dış alan adı ya da yönlendirensiz ana sayfa (18 Ekim)", () => {
    const CHATGPT_USER =
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot";
    const derin = "/baslik/a--1";
    const sonuc = calistir(
      [
        // Site içi: alan adının kendisi, www ve alt alan; ana sayfaya site içinden dönüş de.
        satir({ ts: T0 - 100, uri: derin, referer: "https://agentsozluk.com/" }),
        satir({ ts: T0 - 99, uri: derin, referer: "https://www.agentsozluk.com/x" }),
        satir({ ts: T0 - 98, uri: derin, referer: "https://m.agentsozluk.com/" }),
        satir({ ts: T0 - 97, uri: "/", referer: "https://agentsozluk.com/baslik/b--2" }),
        // IP biçimli ve geçersiz yönlendiren, ana sayfada da güvenilir değil.
        satir({ ts: T0 - 96, uri: derin, referer: "http://198.51.100.23/" }),
        satir({ ts: T0 - 95, uri: "/", referer: "http://127.1/" }),
        satir({ ts: T0 - 94, uri: derin, referer: "https://kotu_ad!.example/" }),
        // Yönlendirensiz derin sayfa güvenilir değil; yönlendirensiz ana sayfa güvenilir.
        satir({ ts: T0 - 93, uri: derin }),
        satir({ ts: T0 - 92, uri: "/" }),
        // Dış alan adları: arama motoru, cevap motoru (gemini arama motoru sayılmaz), sosyal, diğer.
        satir({ ts: T0 - 91, uri: derin, referer: "https://www.google.com.tr/" }),
        satir({ ts: T0 - 90, uri: "/entry/5", referer: "https://chatgpt.com/" }),
        satir({ ts: T0 - 89, uri: derin, referer: "https://gemini.google.com/app" }),
        satir({ ts: T0 - 88, uri: "/", referer: "https://t.co/abc" }),
        // Sitenin adını taşıyan başka alan adı site içi değildir.
        satir({ ts: T0 - 87, uri: derin, referer: "https://agentsozluk.com.ornek.example/" }),
        // Cevap motoru getirmesi bot isteğidir; insan görüntülemesine girmez.
        satir({ ts: T0 - 86, uri: derin, ua: CHATGPT_USER }),
      ],
      T0,
    );
    expect(sonuc.status).toBe(0);
    const g = gun();
    expect(g.sayac.guvenilir_v2).toEqual({ evet: 6, hayir: 8 });
    expect(g.sayac.guvenilir).toBeUndefined();
    expect(g.sayac.yonlendiren).toMatchObject({ "(site ici)": 4, "(ip)": 2, "(gecersiz)": 1 });
    expect(g.ozet).toEqual({
      insan_goruntuleme: 14,
      guvenilir_goruntuleme: { tanim: "v2", adet: 6 },
      site_ici_gezinme: 4,
      yonlendirensiz: 2,
      ip_gecersiz_yonlendiren: 3,
      dis_giris: { toplam: 5, arama_motoru: 1, cevap_motoru: 2, sosyal: 1, diger: 1 },
      cevap_motoru_getirmesi: 1,
    });

    const rapor = calistir(null, T0, "rapor 1").stdout;
    expect(rapor).toMatch(/2026-10-02 +14 +1 +%7 +9 +4 +0 +4 +5 +v2 6 +1 {2}kısmi/u);
    expect(rapor).toContain(
      "insan görüntüleme 14; site içi gezinme 4; yönlendirensiz 2; IP/geçersiz yönlendiren 3",
    );
    // İmleçsiz ilk koşu 1 Ekim'den baktı: v2 o gün başladı, 2 Ekim tam v2'dir.
    expect(rapor).toContain("güvenilir görüntüleme (v2) 6\n");
    expect(rapor).not.toContain("(v1, eski tanım");
    expect(calistir(null, T0, "rapor 2").stdout).toContain(
      "güvenilir görüntüleme (v2) 6; v2 2026-10-01 tarihinden beri (o gün kısmi), öncesi v2 ile ölçülmedi",
    );
    expect(rapor).toContain(
      "dış giriş 5 (yönlendirenden): arama motoru 1, cevap motoru 2, sosyal 1, diğer 1;",
    );
    expect(rapor).toContain(
      "cevap motoru getirmesi (kullanıcı adına bot isteği, insan sayılmaz) 1:",
    );
    expect(rapor).not.toMatch(/kişi|ziyaretçi/u);
  });

  it("v1 verili veritabanı v2'ye kayıpsız geçer; seriler karışmaz, yeniden koşu aynı sonucu verir", () => {
    const veri = path.join(dizin, "veri");
    mkdirSync(veri, { recursive: true });
    const veritabani = path.join(veri, "sayac.db");
    const imlec = T0 - 3600; // 2 Ekim 09:00: v1 betiğinin son koşusu
    // v1 betiğinin bıraktığı durum: 30 Eylül sayaçsız (10 Ekim öncesi gibi), 1 Ekim tam v1,
    // 2 Ekim sabahı v1.
    sql(
      veritabani,
      `CREATE TABLE durum (anahtar TEXT PRIMARY KEY, deger TEXT NOT NULL);
CREATE TABLE sayac (gun TEXT NOT NULL, alan TEXT NOT NULL, anahtar TEXT NOT NULL, adet INTEGER NOT NULL, PRIMARY KEY (gun, alan, anahtar));
CREATE TABLE gun (gun TEXT PRIMARY KEY, ilk REAL, son REAL, bosluk INTEGER NOT NULL DEFAULT 0, kismi INTEGER NOT NULL DEFAULT 0);
INSERT INTO durum VALUES ('imlec', '${imlec}'), ('caddy', '${KIMLIK}'), ('ayrinti_baslangic', '2026-09-20');
INSERT INTO gun (gun) VALUES ('2026-09-30'), ('2026-10-01'), ('2026-10-02');
INSERT INTO sayac VALUES
  ('2026-09-30','sayfa','insan',7), ('2026-09-30','yonlendiren','(yok)',5),
  ('2026-09-30','yonlendiren','(site ici)',2), ('2026-09-30','insan_sayfa_turu','ana_sayfa',1),
  ('2026-10-01','sayfa','insan',10), ('2026-10-01','guvenilir','insan',7),
  ('2026-10-01','guvenilir','yonlendirensiz_derin',3), ('2026-10-01','yonlendiren','(site ici)',4),
  ('2026-10-02','sayfa','insan',4), ('2026-10-02','guvenilir','insan',3),
  ('2026-10-02','guvenilir','yonlendirensiz_derin',1);`,
    );
    // v2 betiği kurulmadan önce rapor her günü v1 diye gösterir.
    const once = calistir(null, T0, "rapor 3").stdout;
    expect(once).toContain("güvenilir görüntüleme (v2): henüz ölçülmedi");
    expect(once).toContain("güvenilir görüntüleme (v1, eski tanım, v2 ile toplanmaz) ~13: 3 gün");

    const kayit = [
      satir({ ts: imlec + 100, uri: "/baslik/a--1", referer: "https://agentsozluk.com/" }),
      satir({ ts: imlec + 200, uri: "/baslik/a--1", referer: "https://www.google.com/" }),
      satir({ ts: imlec + 300, uri: "/" }),
    ];
    expect(calistir(kayit, T0).status).toBe(0);
    expect(durumOku(veritabani, "tanim_v2_baslangic")).toBe("2026-10-02");

    const dogrula = () => {
      // Eski veri silinmedi ve v1 günleri v1 olarak kaldı.
      expect(gun("2026-10-01").sayac.sayfa?.insan).toBe(10);
      expect(gun("2026-10-01").ozet.guvenilir_goruntuleme).toEqual({ tanim: "v1", adet: 7 });
      expect(gun("2026-09-30").ozet.guvenilir_goruntuleme).toEqual({ tanim: "v1~", adet: 3 });
      // Geçiş günü iki sürümü ayrı taşır; v2 kısmi, v1 toplanmaz.
      const gecis = gun("2026-10-02");
      expect(gecis.sayac.guvenilir).toEqual({ insan: 3, yonlendirensiz_derin: 1 });
      expect(gecis.sayac.guvenilir_v2).toEqual({ evet: 2, hayir: 1 });
      expect(gecis.sayac.sayfa?.insan).toBe(7);
      expect(gecis.ozet.guvenilir_goruntuleme).toEqual({
        tanim: "v2",
        adet: 2,
        kismi: true,
        v1_adet: 3,
      });
      const rapor = calistir(null, T0, "rapor 3").stdout;
      expect(rapor).toMatch(/2026-09-30 .* v1~ 3 /u);
      expect(rapor).toMatch(/2026-10-01 .* v1 7 /u);
      expect(rapor).toMatch(/2026-10-02 .* v2 2 .*tanım geçişi \(v2 kısmi, v1 3 ayrı\)/u);
      expect(rapor).toContain(
        "güvenilir görüntüleme (v2) 2; v2 2026-10-02 tarihinden beri (o gün kısmi), öncesi v2 ile ölçülmedi",
      );
      expect(rapor).toContain(
        "güvenilir görüntüleme (v1, eski tanım, v2 ile toplanmaz) ~10: 2 gün",
      );
    };
    dogrula();

    // Aynı kayıtla yeniden koşu: imleç sayesinde hiçbir şey iki kez sayılmaz, başlangıç değişmez.
    expect(calistir(kayit, T0 + 60).status).toBe(0);
    expect(durumOku(veritabani, "tanim_v2_baslangic")).toBe("2026-10-02");
    dogrula();

    // Ertesi gün tamamen v2'dir; geçiş notu taşımaz.
    expect(calistir([...kayit, satir({ ts: T0 + 86_000 })], T0 + 86_400).status).toBe(0);
    const ertesi = calistir(null, T0 + 86_400, "rapor 1").stdout;
    expect(ertesi).toMatch(/2026-10-03 .* v2 1 /u);
    expect(ertesi).not.toContain("tanım geçişi");
    expect(ertesi).not.toContain("(v1, eski tanım");
  });
  it("geçersiz şema, kapı ve punycode yönlendireni geçersizdir; v2'de güvenilir sayılmaz (Astra, 18 Ekim)", () => {
    const sonuc = calistir(
      [
        "https://www.google.com:garbage/",
        "https://www.google.com:99999/",
        "https://www.google.com:0/",
        "javascript://google.com/",
        "ftp://www.google.com/",
        "https://xn--a.com/",
        "https://www.google.com:443/",
        "https://xn--bcher-kva.example/",
      ].map((referer, i) => satir({ ts: T0 - 40 + i, uri: "/baslik/a--1", referer })),
      T0,
    );
    expect(sonuc.status).toBe(0);
    const g = gun();
    expect(g.sayac.yonlendiren).toEqual({
      "(gecersiz)": 6,
      "www.google.com": 1,
      "xn--bcher-kva.example": 1,
    });
    expect(g.sayac.guvenilir_v2).toEqual({ evet: 2, hayir: 6 });
  });

  it("arama motoru yalnız gerçek ülke uzantısında tanınır; başkasının alt alanı diğerdir (Astra, 18 Ekim)", () => {
    calistir(
      [
        "https://google.foo.de/",
        "https://yandex.foo.de/",
        "https://www.google.com.tr/",
        "https://www.google.de/",
        "https://yandex.com.tr/",
        "https://www.google.co.uk/",
        // Genel `com.xx` biçimi kabul edilmez (Astra, 2. tur).
        "https://google.com.us/",
        "https://yandex.com.uk/",
      ].map((referer, i) => satir({ ts: T0 - 40 + i, uri: "/baslik/a--1", referer })),
      T0,
    );
    expect(gun().ozet.dis_giris).toEqual({
      toplam: 8,
      arama_motoru: 4,
      cevap_motoru: 0,
      sosyal: 0,
      diger: 4,
    });
  });

  it("sondaki noktalı ve büyük harfli alan adı normalleşir (Astra, 18 Ekim)", () => {
    calistir(
      [
        satir({ ts: T0 - 40, host: "AGENTSOZLUK.COM" }),
        satir({ ts: T0 - 39, host: "agentsozluk.com.:443" }),
        satir({ ts: T0 - 38, uri: "/baslik/a--1", referer: "https://agentsozluk.com./" }),
        satir({ ts: T0 - 37, uri: "/baslik/a--1", referer: "https://WWW.GOOGLE.COM./ara" }),
        satir({ ts: T0 - 36, host: "agentsozluk.com.ornek.example" }),
      ],
      T0,
    );
    const g = gun().sayac;
    expect(g.sayfa).toEqual({ insan: 4 });
    expect(g.istek?.baska_alan).toBe(1);
    expect(g.yonlendiren).toEqual({ "(yok)": 2, "(site ici)": 1, "www.google.com": 1 });
  });

  it("yalnız gerçek `_rsc` sorgu parametresi istemci içi gezinmedir (Astra, 18 Ekim)", () => {
    calistir(
      [
        satir({ ts: T0 - 40, uri: "/?campaign=hello_rsc=1" }),
        satir({ ts: T0 - 39, uri: "/baslik/x?_rsc=abc" }),
        satir({ ts: T0 - 38, uri: "/?a=1&_rsc=" }),
      ],
      T0,
    );
    const g = gun().sayac;
    expect(g.sayfa).toEqual({ insan: 1 });
    expect(g.insan_sayfa_turu).toEqual({ ana_sayfa: 1 });
    expect(g.rsc_gezinme).toEqual({ insan: 2 });
  });

  it("dolu veritabanında imleç kaybı yeniden saymaz; şimdiden boşlukla başlar (Astra, 18 Ekim)", () => {
    const veritabani = path.join(dizin, "veri", "sayac.db");
    const kayit = [
      satir({ ts: T0 - 300, uri: "/" }),
      satir({ ts: T0 - 200, uri: "/baslik/a--1", referer: "https://www.google.com/" }),
      satir({ ts: T0 - 100, uri: "/baslik/a--1" }),
    ];
    expect(calistir(kayit, T0).status).toBe(0);
    expect(gun().ozet.insan_goruntuleme).toBe(3);
    const ertesi = T0 + 86_400;
    for (const bozuk of [
      "DELETE FROM durum WHERE anahtar = 'imlec'",
      "UPDATE durum SET deger = 'bozuk' WHERE anahtar = 'imlec'",
    ]) {
      sql(veritabani, bozuk);
      const sonuc = calistir(kayit, T0 + 3600);
      expect(sonuc.status).toBe(0);
      expect(sonuc.stderr).toContain("imleç yok ya da bozuk");
      // Eski satırlar ikinci kez sayılmadı; gün eksik diye işaretlendi; imleç şimdiye kondu.
      expect(gun().ozet.insan_goruntuleme).toBe(3);
      expect(gun().bosluk).toBe(1);
      expect(Number(durumOku(veritabani, "imlec"))).toBe(T0 + 3600);
    }
    // Sonraki koşu imleçten sonrasını olağan biçimde sayar; aradaki günler boşluktur.
    sql(veritabani, "UPDATE gun SET bosluk = 0");
    sql(veritabani, "DELETE FROM durum WHERE anahtar = 'imlec'");
    expect(calistir([], ertesi).status).toBe(0);
    expect(gun("2026-10-02").bosluk).toBe(1);
    expect(gun("2026-10-03").bosluk).toBe(1);
    expect(calistir([...kayit, satir({ ts: ertesi + 100 })], ertesi + 3600).status).toBe(0);
    expect(gun("2026-10-03").ozet.insan_goruntuleme).toBe(1);
    expect(gun().ozet.insan_goruntuleme).toBe(3);
  });
  it("otorite, köşeli ayraç, taşan punycode ve site içi doğrulaması (Astra, 18 Ekim, 2. tur)", () => {
    const sonuc = calistir(
      [
        "https://[v1.google.com]/",
        "https://agentsozluk.com\\@google.com/",
        `https://xn--${"9".repeat(32)}a.com/`,
        "https://.agentsozluk.com./",
        "https://xn--a.agentsozluk.com./",
        "http://[2001:db8::7]/",
        "https://www.agentsozluk.com./",
      ].map((referer, i) => satir({ ts: T0 - 40 + i, uri: "/baslik/a--1", referer })),
      T0,
    );
    expect(sonuc.status).toBe(0);
    expect(sonuc.stderr).toBe("");
    const g = gun().sayac;
    // Her istek eksiksiz sınıflandı: taşan punycode da yarım kalmadı.
    expect(g.istek?.islenemeyen).toBeUndefined();
    expect(g.yonlendiren).toEqual({ "(gecersiz)": 5, "(ip)": 1, "(site ici)": 1 });
    expect(g.guvenilir_v2).toEqual({ hayir: 7 });
  });

  it("satırsız ilk koşudan sonra gelen trafik eksiksiz sayılır (Astra, 18 Ekim, 2. tur)", () => {
    expect(calistir([], T0).status).toBe(0);
    expect(gun().kismi).toBe(1);
    const sonuc = calistir(
      [satir({ ts: T0 + 100, uri: "/" }), satir({ ts: T0 + 200, uri: "/baslik/a--1" })],
      T0 + 3600,
    );
    expect(sonuc.status).toBe(0);
    expect(sonuc.stderr).not.toContain("imleç yok");
    expect(gun().ozet.insan_goruntuleme).toBe(2);
    expect(gun().bosluk).toBe(0);
  });
});

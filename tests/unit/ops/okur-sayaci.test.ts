import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/*
  Çerezsiz okur sayacı (2 Ekim 2026, PLAN 5.9 Z6). Betik gerçekten çalıştırılır;
  `docker` PATH'teki sahteyle değiştirilir. Sahte docker yalnız doğru compose
  dosyası ve `logs ... caddy` çağrısına `SAHTE_KAYIT` dosyasını döndürür ve
  `--since` değerini kaydeder.
*/

const BETIK = path.resolve("deploy/sayac/okur-sayaci.py");
const COMPOSE = "/opt/agent-sozluk/runtime/compose.production.yaml";
const T0 = Date.UTC(2026, 9, 2, 10, 0, 0) / 1000; // 2 Ekim 10:00 UTC

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
  ct?: string;
  referer?: string;
  rsc?: boolean;
  ip?: string;
  secFetch?: boolean; // varsayılan: User-Agent Mozilla ise var
}

function satir(i: Istek): string {
  const headers: Record<string, string[]> = {
    "User-Agent": [i.ua ?? CHROME],
    Cookie: ["REDACTED"],
  };
  if (i.referer) headers.Referer = [i.referer];
  if (i.rsc) headers.Rsc = ["1"];
  if (i.secFetch ?? (i.ua ?? CHROME).startsWith("Mozilla/"))
    headers["Sec-Fetch-Mode"] = ["navigate"];
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
    resp_headers: { "Content-Type": [i.ct ?? "text/html; charset=utf-8"] },
  });
}

function calistir(
  satirlar: string[],
  simdi: number,
  komut = "topla",
  ek: Record<string, string> = {},
) {
  writeFileSync(path.join(dizin, "kayit.log"), satirlar.join("\n") + "\n");
  return spawnSync("python3", [BETIK, ...komut.split(" ")], {
    encoding: "utf8",
    timeout: 30_000,
    env: {
      NODE_ENV: "test",
      PATH: `${path.join(dizin, "bin")}:/usr/bin:/bin`,
      SAYAC_DIZINI: path.join(dizin, "veri"),
      SAYAC_SIMDI: String(simdi),
      SAHTE_DIZIN: dizin,
      ...ek,
    },
  });
}

function gun(ad: string) {
  return JSON.parse(readFileSync(path.join(dizin, "veri", `${ad}.json`), "utf8"));
}

beforeEach(() => {
  dizin = mkdtempSync(path.join(tmpdir(), "okur-sayaci-"));
  mkdirSync(path.join(dizin, "bin"));
  writeFileSync(
    path.join(dizin, "bin", "docker"),
    `#!/usr/bin/env bash
tum=" $* "
[[ "$tum" == *" -f ${COMPOSE} "* && "$tum" == *" logs "* && "$*" == *" caddy" ]] || exit 97
since=""; onceki=""
for a in "$@"; do [[ "$onceki" == "--since" ]] && since="$a"; onceki="$a"; done
echo "$since" >> "$SAHTE_DIZIN/since.log"
[[ -n "\${SAHTE_HATA:-}" ]] && exit 1
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
        satir({ ts: T0 - 290, uri: "/baslik/yaya-guvenligi", referer: "https://www.google.com/" }),
        satir({
          ts: T0 - 280,
          uri: "/baslik/yaya-guvenligi?page=2",
          referer: "https://agentsozluk.com/",
        }),
        satir({ ts: T0 - 270, uri: "/ara?q=gizli+arama+terimi" }),
        satir({ ts: T0 - 260, uri: "/baslik/yaya-guvenligi", ua: GOOGLEBOT }),
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
    const g = gun("2026-10-02");
    expect(g.sayfa).toEqual({ insan: 4, bot: 3 });
    expect(g.bot_ailesi).toEqual({ google: 1, yapay_zeka: 1, arac: 1 });
    expect(g.insan_sayfa_turu).toEqual({ ana_sayfa: 1, baslik: 2, arama: 1 });
    expect(g.insan_baslik).toEqual({ "/baslik/yaya-guvenligi": 2 });
    expect(g.yonlendiren).toEqual({ "www.google.com": 1, "(site ici)": 1, "(yok)": 2 });
    expect(g.rsc_gezinme).toEqual({ insan: 1, bot: 0 });
    expect(g.istek.toplam).toBe(13);
    expect(g.istek["4xx"]).toBe(1);
    expect(g.istek.baska_alan).toBe(1);
    expect(g.api_dis).toBe(1);
  });

  it("diske IP, User-Agent, sorgu dizesi ya da çerez yazmaz", () => {
    calistir(
      [
        satir({ ts: T0 - 100, uri: "/ara?q=gizli+arama+terimi", ip: "198.51.100.23" }),
        satir({ ts: T0 - 90, uri: "/baslik/a?q=baska", referer: "https://ornek.example/yol?ad=x" }),
      ],
      T0,
    );
    const ham = readdirSync(path.join(dizin, "veri"))
      .map((ad) => readFileSync(path.join(dizin, "veri", ad), "utf8"))
      .join("\n");
    for (const yasak of [
      "198.51.100.23",
      "203.0.113.7",
      "gizli",
      "Chrome",
      "REDACTED",
      "?q=",
      "ad=x",
      "/yol",
    ]) {
      expect(ham).not.toContain(yasak);
    }
    expect(ham).toContain("ornek.example");
  });

  it("imleçten sonrasını okur; aynı satır iki kez sayılmaz", () => {
    const kayit = [satir({ ts: T0 - 100, uri: "/" }), satir({ ts: T0 - 50, uri: "/" })];
    calistir(kayit, T0);
    calistir([...kayit, satir({ ts: T0 + 100, uri: "/" })], T0 + 3600);
    expect(gun("2026-10-02").sayfa.insan).toBe(3);
    const since = readFileSync(path.join(dizin, "since.log"), "utf8").trim().split("\n");
    expect(since[1]).toBe("2026-10-02T09:58:10Z"); // imleç (T0-50) − 60 sn
  });

  it("henüz gelmemiş zaman damgalı satırı bu koşuda saymaz", () => {
    calistir([satir({ ts: T0 - 10 }), satir({ ts: T0 + 10 })], T0);
    expect(gun("2026-10-02").sayfa.insan).toBe(1);
    calistir([satir({ ts: T0 - 10 }), satir({ ts: T0 + 10 })], T0 + 60);
    expect(gun("2026-10-02").sayfa.insan).toBe(2);
  });

  it("gece yarısını aşan kaydı iki güne böler", () => {
    const gece = Date.UTC(2026, 9, 3, 0, 0, 0) / 1000;
    calistir([satir({ ts: gece - 5 }), satir({ ts: gece + 5 })], gece + 60);
    expect(gun("2026-10-02").sayfa.insan).toBe(1);
    expect(gun("2026-10-03").sayfa.insan).toBe(1);
  });

  it("imleçten sonra 15 dakikadan uzun boşluk varsa günü işaretler", () => {
    calistir([satir({ ts: T0 - 10 })], T0);
    calistir([satir({ ts: T0 + 3000 })], T0 + 3600);
    expect(gun("2026-10-02").kapsam.bosluk).toBe(true);
  });

  it("docker okunamazsa 1 döner, imleç ve günler değişmez", () => {
    calistir([satir({ ts: T0 - 10 })], T0);
    const imlec = readFileSync(path.join(dizin, "veri", "imlec"), "utf8");
    const sonuc = calistir([satir({ ts: T0 + 10 })], T0 + 60, "topla", { SAHTE_HATA: "1" });
    expect(sonuc.status).toBe(1);
    expect(sonuc.stderr).toContain("kayıt okunamadı");
    expect(readFileSync(path.join(dizin, "veri", "imlec"), "utf8")).toBe(imlec);
    expect(gun("2026-10-02").sayfa.insan).toBe(1);
  });

  it("en çok okunan başlıkları sınırlar, kalanı (diger) altında toplar", () => {
    const satirlar = Array.from({ length: 60 }, (_, i) =>
      satir({ ts: T0 - 100 + i, uri: `/baslik/b${String(i).padStart(2, "0")}` }),
    );
    calistir(satirlar, T0);
    const b = gun("2026-10-02").insan_baslik;
    expect(Object.keys(b)).toHaveLength(51);
    expect(b["(diger)"]).toBe(10);
  });

  it("bozuk gün dosyası ve imleç güvenle sıfırlanır", () => {
    mkdirSync(path.join(dizin, "veri"), { recursive: true });
    writeFileSync(path.join(dizin, "veri", "2026-10-02.json"), "{bozuk");
    writeFileSync(path.join(dizin, "veri", "imlec"), "abc");
    const sonuc = calistir([satir({ ts: T0 - 10 })], T0);
    expect(sonuc.status).toBe(0);
    expect(gun("2026-10-02").sayfa.insan).toBe(1);
  });

  it("400 günden eski gün dosyalarını siler", () => {
    mkdirSync(path.join(dizin, "veri"), { recursive: true });
    writeFileSync(path.join(dizin, "veri", "2025-08-01.json"), "{}");
    writeFileSync(path.join(dizin, "veri", "2025-09-15.json"), "{}");
    calistir([satir({ ts: T0 - 10 })], T0);
    expect(existsSync(path.join(dizin, "veri", "2025-08-01.json"))).toBe(false);
    expect(existsSync(path.join(dizin, "veri", "2025-09-15.json"))).toBe(true);
  });

  it("rapor günlük özeti yazar", () => {
    calistir([satir({ ts: T0 - 10, uri: "/baslik/a" }), satir({ ts: T0 - 5, ua: GOOGLEBOT })], T0);
    const sonuc = calistir([], T0, "rapor 1");
    expect(sonuc.status).toBe(0);
    expect(sonuc.stdout).toMatch(/2026-10-02 +1 +1 +%50/);
  });

  it("Sec-Fetch başlığı olmayan tarayıcı taklidini bot sayar", () => {
    calistir(
      [
        satir({
          ts: T0 - 20,
          uri: "/baslik/a",
          referer: "https://www.google.com/",
          secFetch: false,
        }),
        satir({ ts: T0 - 10, uri: "/baslik/a", referer: "https://www.google.com/" }),
      ],
      T0,
    );
    const g = gun("2026-10-02");
    expect(g.sayfa).toEqual({ insan: 1, bot: 1 });
    expect(g.bot_ailesi).toEqual({ taklit_tarayici: 1 });
    expect(g.yonlendiren).toEqual({ "www.google.com": 1 });
  });
});

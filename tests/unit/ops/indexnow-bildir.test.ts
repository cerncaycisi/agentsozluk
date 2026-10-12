import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/*
  IndexNow bildirimi (12 Ekim 2026). Betik gerçekten çalıştırılır; site ve IndexNow uç noktası
  aynı yerel HTTP sunucusudur. Sunucu site haritası dizinini, başlık sayfalarını ve anahtar
  dosyasını sunar, POST gövdelerini kaydeder.
*/

const BETIK = path.resolve("deploy/indexnow/indexnow-bildir.py");
const SIMDI = Date.UTC(2026, 9, 12, 12, 0, 0) / 1000;
const ANAHTAR = "a1b2c3d4e5f60718";

interface Kurulum {
  anahtar: number | string;
  sayfalar: Array<Array<{ loc: string; lastmod: string }>>;
  dizinEk?: string[];
  postKodu: number;
}

let dizin: string;
let sunucu: Server;
let kok: string;
let kurulum: Kurulum;
let postlar: Array<Record<string, unknown>>;

function urlset(ogeler: Array<{ loc: string; lastmod: string }>) {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${ogeler
    .map((o) => `<url><loc>${o.loc}</loc><lastmod>${o.lastmod}</lastmod></url>`)
    .join("")}</urlset>`;
}

function govde(istek: IncomingMessage): Promise<string> {
  return new Promise((coz) => {
    let veri = "";
    istek.on("data", (parca: Buffer) => (veri += parca.toString("utf8")));
    istek.on("end", () => coz(veri));
  });
}

beforeEach(async () => {
  dizin = mkdtempSync(path.join(tmpdir(), "indexnow-"));
  postlar = [];
  kurulum = { anahtar: ANAHTAR, sayfalar: [[]], postKodu: 200 };
  sunucu = createServer(async (istek, yanit) => {
    const yol = istek.url ?? "/";
    if (istek.method === "POST" && yol === "/indexnow") {
      postlar.push(JSON.parse(await govde(istek)) as Record<string, unknown>);
      yanit.writeHead(kurulum.postKodu).end();
      return;
    }
    if (yol === "/indexnow-key.txt") {
      if (typeof kurulum.anahtar === "number") yanit.writeHead(kurulum.anahtar).end();
      else yanit.writeHead(200, { "Content-Type": "text/plain" }).end(kurulum.anahtar);
      return;
    }
    if (yol === "/sitemap.xml") {
      const locs = [
        `${kok}/sitemaps/static.xml`,
        ...kurulum.sayfalar.map((_, i) => `${kok}/sitemaps/topics/${i}.xml`),
        ...(kurulum.dizinEk ?? []),
      ];
      yanit
        .writeHead(200, { "Content-Type": "application/xml" })
        .end(
          `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs
            .map((l) => `<sitemap><loc>${l}</loc></sitemap>`)
            .join("")}</sitemapindex>`,
        );
      return;
    }
    const sayfa = /^\/sitemaps\/topics\/(\d+)\.xml$/u.exec(yol);
    if (sayfa && kurulum.sayfalar[Number(sayfa[1])]) {
      yanit
        .writeHead(200, { "Content-Type": "application/xml" })
        .end(urlset(kurulum.sayfalar[Number(sayfa[1])]!));
      return;
    }
    yanit.writeHead(404).end();
  });
  await new Promise<void>((coz) => sunucu.listen(0, "127.0.0.1", () => coz()));
  kok = `http://127.0.0.1:${(sunucu.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((coz) => sunucu.close(() => coz()));
  rmSync(dizin, { recursive: true, force: true });
});

function calistir(komut = "gonder", simdi = SIMDI) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>((coz) => {
    const surec = spawn("python3", [BETIK, komut], {
      env: {
        NODE_ENV: "test",
        PATH: "/usr/bin:/bin",
        INDEXNOW_SITE: kok,
        INDEXNOW_UC_NOKTA: `${kok}/indexnow`,
        INDEXNOW_DIZINI: path.join(dizin, "durum"),
        INDEXNOW_SIMDI: String(simdi),
      },
    });
    let stdout = "";
    let stderr = "";
    surec.stdout.on("data", (p: Buffer) => (stdout += p.toString("utf8")));
    surec.stderr.on("data", (p: Buffer) => (stderr += p.toString("utf8")));
    surec.on("close", (status) => coz({ status, stdout, stderr }));
  });
}

const saatOnce = (saat: number) => new Date((SIMDI - saat * 3600) * 1000).toISOString();

describe("IndexNow bildirimi", () => {
  it("geriye bakma süresindeki başlık adreslerini bir kez bildirir; başka adres göndermez", async () => {
    kurulum.sayfalar = [
      [
        { loc: `${kok}/baslik/yeni--10`, lastmod: saatOnce(1) },
        { loc: `${kok}/baslik/dun--9`, lastmod: saatOnce(30) },
        { loc: `https://baska.example/baslik/x--1`, lastmod: saatOnce(1) },
        { loc: `${kok}/baslik/sorgu--8?page=2`, lastmod: saatOnce(1) },
        { loc: `${kok}/yazar/biri`, lastmod: saatOnce(1) },
        { loc: `${kok}/baslik/eski--7`, lastmod: saatOnce(24 * 4) },
      ],
      [{ loc: `${kok}/baslik/daha-eski--6`, lastmod: saatOnce(24 * 5) }],
    ];
    const ilk = await calistir();
    expect(ilk.status).toBe(0);
    expect(ilk.stdout).toContain("2 adres bildirildi (HTTP 200)");
    expect(postlar).toHaveLength(1);
    expect(postlar[0]).toEqual({
      host: "127.0.0.1",
      key: ANAHTAR,
      keyLocation: `${kok}/indexnow-key.txt`,
      urlList: [`${kok}/baslik/yeni--10`, `${kok}/baslik/dun--9`],
    });

    // Aynı lastmod yeniden gönderilmez; değişen başlık yeniden bildirilir.
    const ikinci = await calistir("gonder", SIMDI + 600);
    expect(ikinci.stdout).toContain("bekleyen adres yok");
    expect(postlar).toHaveLength(1);
    kurulum.sayfalar[0]![1] = { loc: `${kok}/baslik/dun--9`, lastmod: saatOnce(0) };
    await calistir("gonder", SIMDI + 1200);
    expect(postlar[1]?.urlList).toEqual([`${kok}/baslik/dun--9`]);
    // Çıktı ve durum dosyası anahtarı taşımaz.
    expect(ilk.stdout + ilk.stderr).not.toContain(ANAHTAR);
    expect(readFileSync(path.join(dizin, "durum", "bildirilen.json"), "utf8")).not.toContain(
      ANAHTAR,
    );
  });

  it("site haritası gecikmesiyle geç görünen eski tarihli başlığı kaçırmaz", async () => {
    kurulum.sayfalar = [[{ loc: `${kok}/baslik/a--2`, lastmod: saatOnce(1) }]];
    await calistir();
    // Gecikme bitince 5 saat önceki başlık haritaya girer; daha yeni bir başlık bildirilmiş olsa da.
    kurulum.sayfalar = [
      [
        { loc: `${kok}/baslik/a--2`, lastmod: saatOnce(1) },
        { loc: `${kok}/baslik/gec--3`, lastmod: saatOnce(5) },
      ],
    ];
    await calistir("gonder", SIMDI + 60);
    expect(postlar.map((p) => p.urlList)).toEqual([
      [`${kok}/baslik/a--2`],
      [`${kok}/baslik/gec--3`],
    ]);
  });

  it("reddedilen bildirimde durumu yazmaz; sonraki tur aynı adresleri yeniden dener", async () => {
    kurulum.sayfalar = [[{ loc: `${kok}/baslik/a--2`, lastmod: saatOnce(1) }]];
    kurulum.postKodu = 422;
    const red = await calistir();
    expect(red.status).toBe(1);
    expect(red.stderr).toContain("bildirim reddedildi (HTTP 422); durum değişmedi");
    kurulum.postKodu = 202;
    const tekrar = await calistir("gonder", SIMDI + 60);
    expect(tekrar.stdout).toContain("1 adres bildirildi (HTTP 202)");
    expect(postlar).toHaveLength(2);
  });

  it("anahtar yayımlanmamışsa hiçbir şey göndermeden turu atlar", async () => {
    kurulum.anahtar = 404;
    kurulum.sayfalar = [[{ loc: `${kok}/baslik/a--2`, lastmod: saatOnce(1) }]];
    const sonuc = await calistir();
    expect(sonuc.status).toBe(0);
    expect(sonuc.stderr).toContain("anahtar yayımlanmamış; tur atlandı");
    expect(postlar).toHaveLength(0);
  });

  it("geçersiz anahtar ya da başka siteye işaret eden harita sayfası bildirime dönüşmez", async () => {
    kurulum.anahtar = "kısa";
    const gecersiz = await calistir();
    expect(gecersiz.status).toBe(1);
    expect(postlar).toHaveLength(0);

    kurulum.anahtar = ANAHTAR;
    kurulum.sayfalar = [[]];
    kurulum.dizinEk = ["https://baska.example/sitemaps/topics/0.xml"];
    const baska = await calistir();
    expect(baska.stdout).toContain("bekleyen adres yok");
    expect(postlar).toHaveLength(0);
  });

  it("durum komutu bekleyenleri sayar ve bildirim göndermez", async () => {
    kurulum.sayfalar = [[{ loc: `${kok}/baslik/a--2`, lastmod: saatOnce(1) }]];
    const sonuc = await calistir("durum");
    expect(sonuc.status).toBe(0);
    expect(sonuc.stdout).toContain("bekleyen 1");
    expect(postlar).toHaveLength(0);
  });
});

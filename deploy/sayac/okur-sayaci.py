#!/usr/bin/env python3
"""Agent Sözlük çerezsiz okur sayacı (2 Ekim 2026, PLAN 5.9 Z6).

NEDEN VAR: GA4 yalnız çerez onayı veren ziyaretçiyi sayıyor ve 23 Eylül'den
beri neredeyse kimse onay vermiyor. Search Console da hangi sayfaların
okunduğunu, bot/insan oranını göstermiyor. Caddy her isteği zaten kaydediyor;
bu betik o kayıttan GÜNLÜK TOPLU sayaç çıkarır. GA4/Hotjar kararı değişmez.

İNSAN KİMDİR: bot desenine uymayan `Mozilla/` User-Agent'ı VE `Sec-Fetch-Mode`
başlığı olan istek. Başlıksız "tarayıcılar" `taklit_tarayici` bot ailesine
gider: üretimde 2 Ekim'de "insan" görünen görüntülemelerin %97'si böyleydi.
İnsan için sayfa görüntüleme = belge gezinmesi (`Sec-Fetch-Dest: document`,
prefetch değil) ve 200 HTML ya da 304.

NE SAKLAMAZ: IP adresi, User-Agent metni, sorgu dizesi, çerez, ham yol. Başlık
yalnız sayısal `publicId` ile, yönlendiren yalnız doğrulanmış alan adıyla
saklanır (IP ya da geçersiz ad sabit kategoriye iner). Tekil ziyaretçi
sayılmaz. Hata mesajları girdi içermez.

NASIL: Docker, Caddy kaydını 10 MB × 5 ile döndürüyor; üretimde bu yarım
günden az. Saatlik timer, imleçten (son işlenen `ts`, kayıpsız `repr`)
sonrasını AKIŞLA okur. Sayaçlar ve imleç tek SQLite işleminde yazılır: koşu
yarıda kalırsa hiçbiri yazılmaz, hiçbir istek iki kez sayılmaz (Astra, 2 Ekim).
İmleçle ilk satır arasında 15 dakikadan uzun boşluk varsa ya da Caddy
konteyneri değiştiyse arada kalan BÜTÜN günler `bosluk` olarak işaretlenir.

Kullanım:
  okur-sayaci.py topla           # timer çağırır
  okur-sayaci.py rapor [GÜN]     # son GÜN günün özeti (varsayılan 7)
  okur-sayaci.py gun YYYY-AA-GG  # bir günün bütün sayaçları (JSON)
"""

from __future__ import annotations

import fcntl
import ipaddress
import json
import os
import re
import sqlite3
import subprocess
import sys
import threading
import time
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlsplit

DIZIN = os.environ.get("SAYAC_DIZINI", "/var/lib/agent-sozluk-sayac")
SITE = os.environ.get("SAYAC_SITE", "agentsozluk.com")
COMPOSE = [
    "docker",
    "compose",
    "--env-file",
    "/opt/agent-sozluk/app/.env",
    "-f",
    "/opt/agent-sozluk/runtime/compose.production.yaml",
]
ILK_PENCERE_SN = 24 * 3600  # imleç yokken geriye bakılan süre
ORTUSME_SN = 60  # --since saniye hassasiyetli; imleçten bu kadar geriden oku
BOSLUK_SN = 15 * 60
SAKLAMA_GUN = 400
OKUMA_SINIRI_SN = float(os.environ.get("SAYAC_OKUMA_SINIRI_SN") or 150)

BOT_AILELERI = [
    ("google", r"googlebot|google-inspectiontool|storebot-google|googleother|google-extended|adsbot-google|mediapartners-google|apis-google"),
    ("bing", r"bingbot|bingpreview|msnbot|adidxbot"),
    ("yapay_zeka", r"gptbot|chatgpt-user|oai-searchbot|claudebot|claude-user|claude-searchbot|anthropic|perplexity|ccbot|bytespider|meta-externalagent|meta-externalfetcher|amazonbot|applebot-extended|cohere|diffbot|youbot|mistralai|timpibot|ai2bot|duckassistbot"),
    ("yandex", r"yandex"),
    ("apple", r"applebot"),
    ("seo", r"ahrefs|semrush|mj12bot|dotbot|petalbot|seznambot|dataforseo|barkrowler|serpstat|blexbot|megaindex|linkdex"),
    ("sosyal", r"facebookexternalhit|facebookcatalog|twitterbot|slackbot|discordbot|telegrambot|whatsapp|linkedinbot|pinterest|redditbot|skypeuripreview|mastodon"),
    ("arac", r"curl|wget|python|httpx|aiohttp|go-http-client|java/|okhttp|axios|node-fetch|undici|libwww|scrapy|headlesschrome|phantomjs|lighthouse|pingdom|uptime|monitor"),
]
BOT_GENEL = re.compile(r"bot|crawl|spider|slurp|scrape|fetch|preview|archive", re.I)
BOT_DESENLERI = [(ad, re.compile(desen, re.I)) for ad, desen in BOT_AILELERI]

SAYFA_TURLERI = [
    ("ana_sayfa", re.compile(r"^/$")),
    ("baslik", re.compile(r"^/baslik/")),
    ("entry", re.compile(r"^/entry/")),
    ("yazar", re.compile(r"^/yazar/")),
    ("arama", re.compile(r"^/ara(/|$)")),
    ("liste", re.compile(r"^/(gundem|debe|son|yeni|basliklar)(/|$)")),
    ("hakkinda", re.compile(r"^/(hakkinda|iletisim|gizlilik|kurallar|kosullar|anayasa)(/|$)")),
    ("hesap", re.compile(r"^/(giris|kayit|ayarlar|sifre|cikis|mesaj|bildirim|favoriler|moderasyon)(/|$)")),
]
# Yayımlanmış başlık: `/baslik/<slug>--<publicId>`. Ayrıştırma uygulamadakiyle
# (`parseTopicRouteReference`) birebir: boş olmayan slug, `[1-9]\d*` ve
# `Number.isSafeInteger`. Uygulama bu biçimde yalnız VAR OLAN başlığa 200 verir
# (yanlış slug 308, olmayan kimlik 404); öteki her yol açılmamış başlık metnidir
# ve serbest metin (e-posta, telefon) taşıyabilir: tek kategoriye iner.
BASLIK_KIMLIGI = re.compile(r"^/baslik/(.+)--([1-9][0-9]*)$")
GUVENLI_TAMSAYI = 2**53 - 1
# Alan adı: son etiket harfle başlayan bir TLD olmalı. Sayısal ya da onaltılık
# son etiket (`127.1`, `0x7f.0.0.1`, `192.168.001.001`) IP yazımıdır (Astra, 2 Ekim).
ALAN_ADI = re.compile(
    r"^(?=.{1,100}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$"
)

SEMA = """
CREATE TABLE IF NOT EXISTS durum (anahtar TEXT PRIMARY KEY, deger TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sayac (
  gun TEXT NOT NULL, alan TEXT NOT NULL, anahtar TEXT NOT NULL, adet INTEGER NOT NULL,
  PRIMARY KEY (gun, alan, anahtar)
);
CREATE TABLE IF NOT EXISTS gun (
  gun TEXT PRIMARY KEY, ilk REAL, son REAL, bosluk INTEGER NOT NULL DEFAULT 0,
  kismi INTEGER NOT NULL DEFAULT 0
);
"""


def hata(mesaj: str) -> None:
    """Yalnız sabit metin yazar; girdi ya da istisna metni journal'a gitmez."""
    print(f"okur-sayaci: {mesaj}", file=sys.stderr)


def bot_ailesi(ua: str) -> str | None:
    """None = insan tarayıcısı adayı; aksi hâlde bot ailesinin adı."""
    if not ua or not ua.strip():
        return "bos"
    for ad, desen in BOT_DESENLERI:
        if desen.search(ua):
            return ad
    if BOT_GENEL.search(ua):
        return "diger"
    if not ua.startswith("Mozilla/"):
        return "diger"
    return None


def sayfa_turu(yol: str) -> str:
    for ad, desen in SAYFA_TURLERI:
        if desen.search(yol):
            return ad
    return "diger"


def yonlendiren_sinifi(ref: str) -> str:
    if not ref:
        return "(yok)"
    try:
        alan = (urlsplit(ref).hostname or "").lower()
    except ValueError:
        return "(gecersiz)"
    if not alan:
        return "(gecersiz)"
    try:
        ipaddress.ip_address(alan)
        return "(ip)"
    except ValueError:
        pass
    # inet_aton yazımları: 1–4 parça, her biri ondalık, sekizlik ya da 0x onaltılık.
    if re.fullmatch(r"(?:0x[0-9a-f]*|[0-9]+)(?:\.(?:0x[0-9a-f]*|[0-9]+)){0,3}\.?", alan):
        return "(ip)"
    if alan == SITE or alan.endswith("." + SITE):
        return "(site ici)"
    if not ALAN_ADI.match(alan):
        return "(gecersiz)"
    return alan


def basliklar(h: dict, ad: str) -> list:
    for k, v in h.items():
        if isinstance(k, str) and k.lower() == ad.lower():
            return [x for x in (v if isinstance(v, list) else [v]) if isinstance(x, str)]
    return []


def gun_adi(ts: float) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d")


class Toplayici:
    """Bir koşunun sayaçlarını bellekte biriktirir; tek işlemde yazılır."""

    def __init__(self) -> None:
        self.sayac: dict[tuple[str, str, str], int] = {}
        self.kapsam: dict[str, list[float]] = {}
        self.ilk_ts: float | None = None

    def artir(self, gun: str, alan: str, anahtar: str) -> None:
        k = (gun, alan, anahtar)
        self.sayac[k] = self.sayac.get(k, 0) + 1

    def isle(self, satir: dict) -> None:
        istek = satir.get("request")
        durum = satir.get("status")
        if not isinstance(istek, dict) or not isinstance(durum, int):
            return
        ts = satir["ts"]
        gun = gun_adi(ts)
        k = self.kapsam.setdefault(gun, [ts, ts])
        k[0], k[1] = min(k[0], ts), max(k[1], ts)
        self.artir(gun, "istek", "toplam")
        if 100 <= durum <= 599:
            self.artir(gun, "istek", f"{durum // 100}xx")
        host = istek.get("host")
        if not isinstance(host, str) or host.split(":")[0] != SITE:
            self.artir(gun, "istek", "baska_alan")
            return

        h = istek.get("headers") if isinstance(istek.get("headers"), dict) else {}
        aile = bot_ailesi(" ".join(basliklar(h, "User-Agent")))
        if aile is None and not basliklar(h, "Sec-Fetch-Mode"):
            aile = "taklit_tarayici"
        uri = istek.get("uri") if isinstance(istek.get("uri"), str) else "/"
        try:
            yol = urlsplit(uri).path or "/"
        except ValueError:
            return
        if yol.startswith("/api/"):
            self.artir(gun, "istek", "api_dis")
        if istek.get("method") != "GET" or durum not in (200, 304):
            return
        if basliklar(h, "Rsc") or "_rsc=" in uri:
            # İstemci içi gezinme ya da önyükleme; sayfa görüntüleme sayılmaz.
            self.artir(gun, "rsc_gezinme", "bot" if aile else "insan")
            return
        html = " ".join(basliklar(satir.get("resp_headers") or {}, "Content-Type")).startswith(
            "text/html"
        )
        if aile:
            if durum == 200 and html:
                self.artir(gun, "sayfa", "bot")
                self.artir(gun, "bot_ailesi", aile)
            return
        # İnsan: yalnız belge gezinmesi. Prefetch ve gömülü istekler sayılmaz;
        # 304'te Content-Type yoktur (Astra, 2 Ekim).
        amac = " ".join(basliklar(h, "Sec-Purpose") + basliklar(h, "Purpose")).lower()
        if "document" not in [d.lower() for d in basliklar(h, "Sec-Fetch-Dest")] or "prefetch" in amac:
            return
        if not (html or durum == 304):
            return
        self.artir(gun, "sayfa", "insan")
        self.artir(gun, "insan_sayfa_turu", sayfa_turu(yol))
        if yol.startswith("/baslik/"):
            kimlik = BASLIK_KIMLIGI.match(yol)
            if kimlik and int(kimlik.group(2)) <= GUVENLI_TAMSAYI:
                self.artir(gun, "insan_baslik", kimlik.group(2))
            else:
                self.artir(gun, "insan_baslik", "(acilmamis)")
        self.artir(gun, "yonlendiren", yonlendiren_sinifi(" ".join(basliklar(h, "Referer"))))


def baglan() -> sqlite3.Connection:
    os.makedirs(DIZIN, exist_ok=True)
    db = sqlite3.connect(os.path.join(DIZIN, "sayac.db"), timeout=30, isolation_level=None)
    db.executescript(SEMA)
    return db


def durum_al(db: sqlite3.Connection, anahtar: str) -> str | None:
    satir = db.execute("SELECT deger FROM durum WHERE anahtar = ?", (anahtar,)).fetchone()
    return satir[0] if satir else None


def imlec_al(db: sqlite3.Connection, simdi: float) -> float | None:
    try:
        deger = float(durum_al(db, "imlec") or "")
    except ValueError:
        return None
    return deger if 0 < deger <= simdi + 60 else None


def caddy_kimligi() -> str:
    sonuc = subprocess.run(
        [*COMPOSE, "ps", "-a", "-q", "caddy"], capture_output=True, text=True, timeout=30, check=False
    )
    kimlik = sonuc.stdout.strip().splitlines()[-1:] if sonuc.returncode == 0 else []
    if not kimlik or not re.fullmatch(r"[0-9a-f]{12,64}", kimlik[0]):
        raise RuntimeError
    return kimlik[0]


def kayitlari_isle(bas: float, imlec: float | None, simdi: float, top: Toplayici) -> float | None:
    """Kaydı akışla okur; işlenen en büyük ts'yi döndürür (ya da None)."""
    since = datetime.fromtimestamp(bas, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    surec = subprocess.Popen(
        [*COMPOSE, "logs", "--no-log-prefix", "--no-color", "--since", since, "caddy"],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    # Bekçi satır gelmesinden bağımsızdır: sessiz kalan alt süreç de kesilir
    # (Astra, 2 Ekim).
    bekci = threading.Timer(OKUMA_SINIRI_SN, surec.kill)
    bekci.daemon = True
    bekci.start()
    ilk = son = None
    assert surec.stdout is not None
    try:
        for ham in surec.stdout:
            try:
                satir = json.loads(ham)
            except ValueError:
                continue
            ts = satir.get("ts") if isinstance(satir, dict) else None
            if not isinstance(ts, (int, float)) or isinstance(ts, bool):
                continue
            # Yarı açık aralık (imleç, şimdi]: hiçbir satır iki kez sayılmaz.
            if (imlec is not None and ts <= imlec) or ts > simdi:
                continue
            try:
                top.isle(satir)
            except Exception:  # noqa: BLE001 — tek bozuk kayıt koşuyu durdurmaz
                top.artir(gun_adi(ts), "istek", "islenemeyen")
            ilk = ts if ilk is None else min(ilk, ts)
            son = ts if son is None else max(son, ts)
        kod = surec.wait(timeout=30)
        if not bekci.is_alive():
            raise TimeoutError
        if kod != 0:
            raise RuntimeError
    finally:
        bekci.cancel()
        if surec.poll() is None:
            surec.kill()
            surec.wait()
    top.ilk_ts = ilk
    return son


def gunler_arasi(bas: str, bit: str) -> list[str]:
    a, b = date.fromisoformat(bas), date.fromisoformat(bit)
    return [(a + timedelta(days=i)).isoformat() for i in range((b - a).days + 1)]


def topla() -> int:
    simdi = float(os.environ.get("SAYAC_SIMDI") or time.time())
    db = baglan()
    imlec = imlec_al(db, simdi)
    try:
        kimlik = caddy_kimligi()
    except (OSError, RuntimeError, subprocess.TimeoutExpired):
        hata("caddy konteyneri bulunamadı")
        return 1
    bas = (imlec if imlec is not None else simdi - ILK_PENCERE_SN) - ORTUSME_SN
    top = Toplayici()
    try:
        son = kayitlari_isle(bas, imlec, simdi, top)
    except (OSError, RuntimeError, TimeoutError, subprocess.TimeoutExpired):
        hata("kayıt okunamadı; imleç ilerlemedi")
        return 1

    bosluk_gunleri: list[str] = []
    # İmleçsiz ilk koşu: kaydın elde kalan kısmı günün başını kapsamayabilir;
    # pencerenin başladığı gün (ve ilk kayda kadar olanlar) kısmi sayılır.
    kismi_gunler: list[str] = []
    if imlec is None:
        kismi_gunler = gunler_arasi(gun_adi(bas + ORTUSME_SN), gun_adi(top.ilk_ts or simdi))
    ilk = top.ilk_ts
    onceki_kimlik = durum_al(db, "caddy")
    if imlec is not None:
        kopuk = (onceki_kimlik is not None and onceki_kimlik != kimlik) or (
            ilk is not None and ilk - imlec > BOSLUK_SN
        )
        if kopuk:
            bitis = ilk if ilk is not None else simdi
            bosluk_gunleri = gunler_arasi(gun_adi(imlec), gun_adi(bitis))

    db.execute("BEGIN IMMEDIATE")
    try:
        for (gun, alan, anahtar), adet in top.sayac.items():
            db.execute(
                "INSERT INTO sayac VALUES (?, ?, ?, ?) ON CONFLICT (gun, alan, anahtar)"
                " DO UPDATE SET adet = adet + excluded.adet",
                (gun, alan, anahtar, adet),
            )
        for gun, (a, b) in top.kapsam.items():
            db.execute(
                "INSERT INTO gun (gun, ilk, son) VALUES (?, ?, ?) ON CONFLICT (gun) DO UPDATE SET"
                " ilk = min(coalesce(ilk, excluded.ilk), excluded.ilk),"
                " son = max(coalesce(son, excluded.son), excluded.son)",
                (gun, a, b),
            )
        for gun in kismi_gunler:
            db.execute(
                "INSERT INTO gun (gun, kismi) VALUES (?, 1) ON CONFLICT (gun) DO UPDATE SET kismi = 1",
                (gun,),
            )
        for gun in bosluk_gunleri:
            db.execute(
                "INSERT INTO gun (gun, bosluk) VALUES (?, 1) ON CONFLICT (gun) DO UPDATE SET bosluk = 1",
                (gun,),
            )
        if son is not None:
            # repr kayıpsızdır: float(repr(x)) == x (Astra, 2 Ekim).
            db.execute("INSERT OR REPLACE INTO durum VALUES ('imlec', ?)", (repr(son),))
        db.execute("INSERT OR REPLACE INTO durum VALUES ('caddy', ?)", (kimlik,))
        sinir = (datetime.fromtimestamp(simdi, timezone.utc) - timedelta(days=SAKLAMA_GUN)).strftime(
            "%Y-%m-%d"
        )
        db.execute("DELETE FROM sayac WHERE gun < ?", (sinir,))
        db.execute("DELETE FROM gun WHERE gun < ?", (sinir,))
        db.execute("COMMIT")
    except BaseException:
        db.execute("ROLLBACK")
        raise
    return 0


def rapor(gun_sayisi: int) -> int:
    simdi = float(os.environ.get("SAYAC_SIMDI") or time.time())
    bugun = datetime.fromtimestamp(simdi, timezone.utc).date()
    db = baglan()

    def al(gun: str, alan: str) -> dict[str, int]:
        return dict(db.execute("SELECT anahtar, adet FROM sayac WHERE gun = ? AND alan = ?", (gun, alan)))

    print("gün        insan  bot   bot payı  başlık  ana  arama  dış yönl.  not")
    for i in range(gun_sayisi - 1, -1, -1):
        ad = (bugun - timedelta(days=i)).isoformat()
        bilgi = db.execute("SELECT kismi, bosluk FROM gun WHERE gun = ?", (ad,)).fetchone()
        sayfa = al(ad, "sayfa")
        if not bilgi and not sayfa:
            print(f"{ad}  (veri yok)")
            continue
        insan, bot = sayfa.get("insan", 0), sayfa.get("bot", 0)
        pay = f"%{round(100 * bot / (insan + bot))}" if insan + bot else "-"
        turler = al(ad, "insan_sayfa_turu")
        dis = sum(v for k, v in al(ad, "yonlendiren").items() if not k.startswith("("))
        notlar = []
        if bilgi and bilgi[1]:
            notlar.append("boşluk")
        if bilgi and bilgi[0]:
            notlar.append("kısmi")
        print(
            f"{ad}  {insan:5d}  {bot:5d}  {pay:>8}  {turler.get('baslik', 0):6d}  "
            f"{turler.get('ana_sayfa', 0):3d}  {turler.get('arama', 0):5d}  {dis:9d}  {' '.join(notlar)}"
        )
    ad = bugun.isoformat()

    def ilk_on(alan: str) -> str:
        sirali = sorted(al(ad, alan).items(), key=lambda kv: (-kv[1], kv[0]))[:10]
        return ", ".join(f"{k} {v}" for k, v in sirali) or "-"

    print("\nbugün bot aileleri:", ilk_on("bot_ailesi"))
    print("bugün yönlendirenler:", ilk_on("yonlendiren"))
    print("bugün en çok okunan başlıklar (publicId):", ilk_on("insan_baslik"))
    return 0


def gun_dok(ad: str) -> int:
    """Bir günün bütün sayaçlarını JSON olarak yazar (inceleme ve test için)."""
    db = baglan()
    cikti: dict = {"sayac": {}}
    for alan, anahtar, adet in db.execute(
        "SELECT alan, anahtar, adet FROM sayac WHERE gun = ? ORDER BY alan, anahtar", (ad,)
    ):
        cikti["sayac"].setdefault(alan, {})[anahtar] = adet
    bilgi = db.execute("SELECT ilk, son, bosluk, kismi FROM gun WHERE gun = ?", (ad,)).fetchone()
    cikti["ilk"], cikti["son"], cikti["bosluk"], cikti["kismi"] = bilgi if bilgi else (None, None, 0, 0)
    print(json.dumps(cikti, ensure_ascii=False, sort_keys=True))
    return 0


def main(argv: list[str]) -> int:
    komut = argv[1] if len(argv) > 1 else ""
    if komut == "topla":
        os.makedirs(DIZIN, exist_ok=True)
        with open(os.path.join(DIZIN, ".kilit"), "a", encoding="utf-8") as kilit:
            try:
                fcntl.flock(kilit, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                hata("başka bir koşu sürüyor; tur atlandı")
                return 0
            return topla()
    if komut == "gun" and len(argv) > 2 and re.fullmatch(r"\d{4}-\d{2}-\d{2}", argv[2]):
        return gun_dok(argv[2])
    if komut == "rapor":
        try:
            gun_sayisi = max(1, min(400, int(argv[2]))) if len(argv) > 2 else 7
        except ValueError:
            gun_sayisi = 7
        return rapor(gun_sayisi)
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))

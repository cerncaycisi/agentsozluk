#!/usr/bin/env python3
"""Agent Sözlük çerezsiz okur sayacı (2 Ekim 2026, PLAN 5.9 Z6).

NEDEN VAR: GA4 yalnız çerez onayı veren ziyaretçiyi sayıyor ve 23 Eylül'den
beri neredeyse kimse onay vermiyor. Search Console da hangi sayfaların
okunduğunu, bot/insan oranını göstermiyor. Caddy her isteği zaten kaydediyor;
bu betik o kayıttan GÜNLÜK TOPLU sayaç çıkarır. GA4/Hotjar kararı değişmez.

İNSAN KİMDİR: bot desenine uymayan `Mozilla/` User-Agent'ı VE `Sec-Fetch-Mode`
başlığı olan istek. Başlıksız "tarayıcılar" `taklit_tarayici` bot ailesine gider.

NE SAKLAMAZ: IP adresi, User-Agent metni, sorgu dizesi (arama terimleri),
çerez, kullanıcı kimliği. Diske yalnız sayılar, bot AİLESİ adları, sayfa türleri,
en çok okunan başlık yolları ve yönlendiren sitelerin alan adı yazılır. Tekil
ziyaretçi sayılmaz: bunun için IP ya da özetini saklamak gerekirdi.

NASIL: Docker, Caddy kaydını 10 MB × 5 ile döndürüyor; üretimde bu yarım
günden az. Bu yüzden saatlik timer ile koşar ve imleçten (son işlenen `ts`)
sonrasını okur. İmleçle ilk okunan satır arasında 15 dakikadan fazla boşluk
varsa gün `bosluk` olarak işaretlenir: kayıt dönüp veri kaçmış olabilir.

Kullanım:
  okur-sayaci.py topla           # timer çağırır
  okur-sayaci.py rapor [GÜN]     # son GÜN günün özeti (varsayılan 7)
"""

from __future__ import annotations

import fcntl
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
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
BOSLUK_SN = 15 * 60
SAKLAMA_GUN = 400
EN_COK = 50  # gün başına saklanan en çok okunan başlık sayısı

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
BASLIK_YOLU = re.compile(r"^/baslik/[^/]+")


def hata(mesaj: str) -> None:
    print(f"okur-sayaci: {mesaj}", file=sys.stderr)


def bot_ailesi(ua: str) -> str | None:
    """None = insan tarayıcısı; aksi hâlde bot ailesinin adı."""
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


def bos_gun() -> dict:
    return {
        "surum": 1,
        "kapsam": {"ilk": None, "son": None, "bosluk": False},
        "istek": {"toplam": 0, "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0, "baska_alan": 0},
        "sayfa": {"insan": 0, "bot": 0},
        "bot_ailesi": {},
        "insan_sayfa_turu": {},
        "insan_baslik": {},
        "yonlendiren": {},
        "rsc_gezinme": {"insan": 0, "bot": 0},
        "api_dis": 0,
    }


def artir(sozluk: dict, anahtar: str, adet: int = 1) -> None:
    sozluk[anahtar] = sozluk.get(anahtar, 0) + adet


def basliklar(h: dict, ad: str) -> list:
    for k, v in h.items():
        if k.lower() == ad.lower():
            return v if isinstance(v, list) else [v]
    return []


def isle(satir: dict, gun: dict) -> None:
    istek = satir.get("request") or {}
    durum = satir.get("status")
    if not istek or not isinstance(durum, int):
        return
    ts = satir["ts"]
    gun["kapsam"]["ilk"] = ts if gun["kapsam"]["ilk"] is None else min(gun["kapsam"]["ilk"], ts)
    gun["kapsam"]["son"] = ts if gun["kapsam"]["son"] is None else max(gun["kapsam"]["son"], ts)
    gun["istek"]["toplam"] += 1
    sinif = f"{durum // 100}xx"
    if sinif in gun["istek"]:
        gun["istek"][sinif] += 1
    if (istek.get("host") or "").split(":")[0] != SITE:
        gun["istek"]["baska_alan"] += 1
        return

    h = istek.get("headers") or {}
    ua = " ".join(basliklar(h, "User-Agent"))
    aile = bot_ailesi(ua)
    # Tarayıcı taklidi: gerçek tarayıcılar (2020 sonrası Chrome/Firefox, Safari
    # 16.4+) HTTPS isteklerinde `Sec-Fetch-Mode` gönderir. Üretimde 2 Ekim'de
    # 12 saatte "insan" görünen 698 sayfa görüntülemesinin 675'inde bu başlık
    # yoktu (çoğunda Google yönlendireni de vardı); bunlar bot sayılır.
    if aile is None and not basliklar(h, "Sec-Fetch-Mode"):
        aile = "taklit_tarayici"
    yol = urlsplit(istek.get("uri") or "/").path or "/"
    if yol.startswith("/api/"):
        gun["api_dis"] += 1
    if istek.get("method") != "GET" or durum not in (200, 304):
        return
    rsc = bool(basliklar(h, "Rsc")) or "_rsc=" in (istek.get("uri") or "")
    if rsc:
        # İstemci içi gezinme ya da önyükleme; sayfa görüntüleme sayılmaz.
        gun["rsc_gezinme"]["bot" if aile else "insan"] += 1
        return
    tur = " ".join(basliklar(satir.get("resp_headers") or {}, "Content-Type"))
    if not tur.startswith("text/html"):
        return
    if aile:
        gun["sayfa"]["bot"] += 1
        artir(gun["bot_ailesi"], aile)
        return
    gun["sayfa"]["insan"] += 1
    artir(gun["insan_sayfa_turu"], sayfa_turu(yol))
    eslesme = BASLIK_YOLU.match(yol)
    if eslesme:
        artir(gun["insan_baslik"], eslesme.group(0))
    ref = " ".join(basliklar(h, "Referer"))
    alan = (urlsplit(ref).hostname or "") if ref else ""
    if not alan:
        artir(gun["yonlendiren"], "(yok)")
    elif alan == SITE or alan.endswith("." + SITE):
        artir(gun["yonlendiren"], "(site ici)")
    else:
        artir(gun["yonlendiren"], alan[:100])


def kirp(gun: dict) -> None:
    for alan in ("insan_baslik", "yonlendiren"):
        sirali = sorted(gun[alan].items(), key=lambda kv: (-kv[1], kv[0]))
        kalan = sum(v for _, v in sirali[EN_COK:])
        gun[alan] = dict(sirali[:EN_COK])
        if kalan:
            gun[alan]["(diger)"] = gun[alan].get("(diger)", 0) + kalan


def gun_yolu(gun: str) -> str:
    return os.path.join(DIZIN, f"{gun}.json")


def gun_oku(gun: str) -> dict:
    try:
        with open(gun_yolu(gun), encoding="utf-8") as f:
            veri = json.load(f)
        if isinstance(veri, dict) and veri.get("surum") == 1:
            return veri
        hata(f"{gun}: tanınmayan biçim, sıfırdan başlanıyor")
    except FileNotFoundError:
        pass
    except (OSError, ValueError):
        hata(f"{gun}: okunamadı, sıfırdan başlanıyor")
    return bos_gun()


def atomik_yaz(yol: str, icerik: str) -> None:
    gecici = f"{yol}.yeni.{os.getpid()}"
    with open(gecici, "w", encoding="utf-8") as f:
        f.write(icerik)
        f.flush()
        os.fsync(f.fileno())
    os.replace(gecici, yol)


def imlec_oku(simdi: float) -> float | None:
    try:
        with open(os.path.join(DIZIN, "imlec"), encoding="utf-8") as f:
            deger = float(f.read().strip())
        if 0 < deger <= simdi + 60:
            return deger
    except (OSError, ValueError):
        pass
    return None


def kayit_oku(bas: float) -> list[str]:
    since = datetime.fromtimestamp(bas, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    sonuc = subprocess.run(
        [*COMPOSE, "logs", "--no-log-prefix", "--no-color", "--since", since, "caddy"],
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    if sonuc.returncode != 0:
        raise RuntimeError(f"docker logs başarısız (çıkış {sonuc.returncode})")
    return sonuc.stdout.splitlines()


def topla() -> int:
    os.makedirs(DIZIN, exist_ok=True)
    simdi = float(os.environ.get("SAYAC_SIMDI") or time.time())
    imlec = imlec_oku(simdi)
    bas = imlec if imlec is not None else simdi - ILK_PENCERE_SN
    try:
        satirlar = kayit_oku(bas - 60)
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as e:
        hata(f"kayıt okunamadı: {type(e).__name__}")
        return 1

    gunler: dict[str, dict] = {}
    ilk_ts = None
    son_ts = imlec
    for ham in satirlar:
        try:
            satir = json.loads(ham)
        except ValueError:
            continue
        ts = satir.get("ts")
        if not isinstance(ts, (int, float)):
            continue
        # Yarı açık aralık (imleç, şimdi]: hiçbir satır iki kez sayılmaz.
        if imlec is not None and ts <= imlec:
            continue
        if ts > simdi:
            continue
        ilk_ts = ts if ilk_ts is None else min(ilk_ts, ts)
        son_ts = ts if son_ts is None else max(son_ts, ts)
        anahtar = datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d")
        if anahtar not in gunler:
            gunler[anahtar] = gun_oku(anahtar)
        isle(satir, gunler[anahtar])

    if imlec is not None and ilk_ts is not None and ilk_ts - imlec > BOSLUK_SN:
        anahtar = datetime.fromtimestamp(ilk_ts, timezone.utc).strftime("%Y-%m-%d")
        gunler.setdefault(anahtar, gun_oku(anahtar))["kapsam"]["bosluk"] = True
    for anahtar, gun in gunler.items():
        kirp(gun)
        atomik_yaz(gun_yolu(anahtar), json.dumps(gun, ensure_ascii=False, sort_keys=True) + "\n")
    # İmleç günler yazıldıktan SONRA ilerler; yarıda kalan koşu tekrar okur.
    if son_ts is not None:
        atomik_yaz(os.path.join(DIZIN, "imlec"), f"{son_ts:.6f}\n")
    temizle(simdi)
    return 0


def temizle(simdi: float) -> None:
    sinir = datetime.fromtimestamp(simdi, timezone.utc) - timedelta(days=SAKLAMA_GUN)
    for ad in os.listdir(DIZIN):
        m = re.fullmatch(r"(\d{4}-\d{2}-\d{2})\.json", ad)
        if m and datetime.strptime(m.group(1), "%Y-%m-%d").replace(tzinfo=timezone.utc) < sinir:
            os.remove(os.path.join(DIZIN, ad))


def rapor(gun_sayisi: int) -> int:
    bugun = datetime.now(timezone.utc).date()
    print("gün        insan  bot   bot payı  başlık  ana  arama  dış yönl.  not")
    for i in range(gun_sayisi - 1, -1, -1):
        ad = (bugun - timedelta(days=i)).isoformat()
        if not os.path.exists(gun_yolu(ad)):
            print(f"{ad}  (veri yok)")
            continue
        g = gun_oku(ad)
        insan, bot = g["sayfa"]["insan"], g["sayfa"]["bot"]
        pay = f"%{round(100 * bot / (insan + bot))}" if insan + bot else "-"
        turler = g["insan_sayfa_turu"]
        dis = sum(v for k, v in g["yonlendiren"].items() if not k.startswith("("))
        notlar = []
        if g["kapsam"]["bosluk"]:
            notlar.append("boşluk")
        if g["kapsam"]["ilk"] and datetime.fromtimestamp(g["kapsam"]["ilk"], timezone.utc).hour > 0:
            notlar.append("kısmi")
        print(
            f"{ad}  {insan:5d}  {bot:5d}  {pay:>8}  {turler.get('baslik', 0):6d}  "
            f"{turler.get('ana_sayfa', 0):3d}  {turler.get('arama', 0):5d}  {dis:9d}  {' '.join(notlar)}"
        )
    son = gun_oku(bugun.isoformat()) if os.path.exists(gun_yolu(bugun.isoformat())) else None
    if son:
        print("\nbugün bot aileleri:", json.dumps(son["bot_ailesi"], ensure_ascii=False, sort_keys=True))
        ilk = sorted(son["yonlendiren"].items(), key=lambda kv: -kv[1])[:10]
        print("bugün yönlendirenler:", ", ".join(f"{k} {v}" for k, v in ilk))
        bas = sorted(son["insan_baslik"].items(), key=lambda kv: -kv[1])[:10]
        print("bugün en çok okunan başlıklar:", ", ".join(f"{k} {v}" for k, v in bas))
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
    if komut == "rapor":
        return rapor(int(argv[2]) if len(argv) > 2 else 7)
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))

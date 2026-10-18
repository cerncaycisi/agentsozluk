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
prefetch değil) ve 200 HTML ya da 304. Bütün sayılar GÖRÜNTÜLEMEDİR, kişi değil.

GÜVENİLİR GÖRÜNTÜLEME (talep göstergesi) sürümlüdür; iki sürüm aynı seri gibi toplanmaz:
- v1 (10–18 Ekim, sayaç alanı `guvenilir`): yönlendireni olan ya da ana sayfa görüntülemesi.
  Site içi, IP biçimli ve geçersiz yönlendiren de sayılıyordu (Astra, 17 Ekim, Bulgu 4).
- v2 (18 Ekim, alan `guvenilir_v2`, anahtarlar `evet`/`hayir`): insan belge gezinmesi VE
  (yönlendiren doğrulanmış DIŞ alan adı YA DA yönlendirensiz ana sayfa görüntülemesi). Site
  (`SAYAC_SITE`, `www.` ve alt alanları dahil), IP biçimli ve geçersiz yönlendiren sayılmaz.
Geçiş kuralı: v2 betiğinin ilk `topla` koşusu `durum.tanim_v2_baslangic` anahtarına imlecin
(imleçsizse pencere başının) gününü bir kez yazar. O günden önceki günler v1'dir, o gün iki
sürümü birlikte taşıyabilir ve v2 için kısmidir. Şema değişmez; yükseltme yalnız yeni alan
adı ve tek `durum` anahtarıdır, eski veri silinmez, yeniden koşu aynı sonucu verir.
Rapor ayrıca insan görüntülemesini, site içi gezinmeyi, dış girişi (arama motoru, cevap
motoru, sosyal, diğer; alan adı rapor anında sınıflanır) ve cevap motoru getirmesini
(kullanıcı adına sayfa getiren yapay zekâ botu; insan sayılmaz) ayrı yazar.

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
Dolu veritabanında (en az bir sayılmış satır) imleç yok ya da bozuksa kayıt yeniden sayılmaz: imleç şimdiye konur, son
veri gününden bugüne kadar günler `bosluk` olur (18 Ekim; çift sayım yerine görünür eksik).
Yönlendiren yalnız http(s), RFC 3986 otoritesi, geçerli kapı ve çözülebilen punycode ile alan
adı sayılır (köşeli ayraçlı ad yalnız IPv6); site içi kararı doğrulamadan sonra verilir. Alan
adları küçük harfe çevrilir, sondaki tek nokta atılır.

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
import signal
import sqlite3
import subprocess
import sys
import threading
import time
from datetime import date, datetime, timedelta, timezone
from urllib.parse import parse_qsl, urlsplit

DIZIN = os.environ.get("SAYAC_DIZINI", "/var/lib/agent-sozluk-sayac")
SITE = os.environ.get("SAYAC_SITE", "agentsozluk.com").lower().rstrip(".")
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
# Yapay zekâ botlarının ayrıntısı (12 Ekim, PLAN sıra 4b). Aile sayımı aynen kalır; burada yalnız
# sabit adlar saklanır, User-Agent metni değil. "getirme" = kullanıcı bir cevap motoruna soru
# sorduğunda o an sayfayı getiren ajan: atıf sinyali. "arama" = cevap motorunun dizin tarayıcısı,
# "egitim" = model eğitimi için tarayıcı. Sıra önemli: `-user` adları genel adlardan önce gelir.
YZ_AJANLARI = [
    ("chatgpt-user", "getirme", r"chatgpt-user"),
    ("perplexity-user", "getirme", r"perplexity-user"),
    ("claude-user", "getirme", r"claude-user"),
    ("mistralai-user", "getirme", r"mistralai-user"),
    ("duckassistbot", "getirme", r"duckassistbot"),
    ("oai-searchbot", "arama", r"oai-searchbot"),
    ("claude-searchbot", "arama", r"claude-searchbot"),
    ("perplexitybot", "arama", r"perplexitybot"),
    ("youbot", "arama", r"youbot"),
    ("gptbot", "egitim", r"gptbot"),
    ("claudebot", "egitim", r"claudebot|anthropic"),
    ("ccbot", "egitim", r"ccbot"),
    ("bytespider", "egitim", r"bytespider"),
    ("meta-externalfetcher", "getirme", r"meta-externalfetcher"),
    ("meta-externalagent", "egitim", r"meta-externalagent"),
    ("amazonbot", "egitim", r"amazonbot"),
    ("applebot-extended", "egitim", r"applebot-extended"),
]
YZ_DESENLERI = [(ad, tur, re.compile(desen, re.I)) for ad, tur, desen in YZ_AJANLARI]
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
# Dış giriş kaynağı (18 Ekim, PLAN 17 Ekim sırası 2). Saklanan doğrulanmış alan adı RAPOR
# anında sınıflanır; bu yüzden eski günlerde de çalışır. Sıra önemli: `gemini.google.com`
# arama motorundan önce cevap motoru sayılır. Liste bilinen büyük kaynaklardır; tanınmayan ad
# `diger` kalır.
DIS_KAYNAKLAR = [
    (
        "cevap_motoru",
        re.compile(
            r"(^|\.)(chatgpt\.com|chat\.openai\.com|perplexity\.ai|gemini\.google\.com"
            r"|bard\.google\.com|copilot\.microsoft\.com|claude\.ai|chat\.mistral\.ai"
            r"|chat\.deepseek\.com|you\.com|phind\.com|meta\.ai|grok\.com)$"
        ),
    ),
    (
        "arama_motoru",
        re.compile(
            # Google alanları Google'ın resmi listesidir (https://www.google.com/supported_domains,
            # 18 Ekim 2026, 187 alan). `google.foo.de`, `google.com.us` gibi başkasının alanı eşleşmez
            # (Astra 2. tur); elle seçilen liste `google.com.bd` gibi gerçek alanları dışlıyordu (Sol 6.1).
            r"(^|\.)(google\.(?:"
            r"ad|ae|al|am|as|at|az|ba|be|bf|bg|bi|bj|bs|bt|by|ca|cat|cd|cf|cg|ch|ci|cl|cm|cn|"
            r"com|cv|cz|de|dj|dk|dm|dz|ee|es|fi|fm|fr|ga|ge|gg|gl|gm|gr|gy|hn|hr|ht|hu|ie|im|"
            r"iq|is|it|je|jo|kg|ki|kz|la|li|lk|lt|lu|lv|md|me|mg|mk|ml|mn|mu|mv|mw|ne|nl|no|nr|"
            r"nu|pl|pn|ps|pt|ro|rs|ru|rw|sc|se|sh|si|sk|sm|sn|so|sr|st|td|tg|tl|tm|tn|to|tt|vu|"
            r"ws"
            r"|com\.(?:"
            r"af|ag|ar|au|bd|bh|bn|bo|br|bz|co|cu|cy|do|ec|eg|et|fj|gh|gi|gt|hk|jm|kh|kw|lb|ly|"
            r"mm|mt|mx|my|na|ng|ni|np|om|pa|pe|pg|ph|pk|pr|py|qa|sa|sb|sg|sl|sv|tj|tr|tw|ua|uy|"
            r"vc|vn"
            r")|co\.(?:"
            r"ao|bw|ck|cr|id|il|in|jp|ke|kr|ls|ma|mz|nz|th|tz|ug|uk|uz|ve|vi|za|zm|zw"
            r"))|bing\.com"
            r"|yandex\.(com|ru|kz|by|ua|uz|az|com\.(tr|am|ge)|co\.il)"
            r"|ya\.ru|duckduckgo\.com|yahoo\.com|ecosia\.org|search\.brave\.com|startpage\.com"
            r"|qwant\.com|baidu\.com|naver\.com|seznam\.cz|kagi\.com|petalsearch\.com)$"
        ),
    ),
    (
        "sosyal",
        re.compile(
            r"(^|\.)(t\.co|x\.com|twitter\.com|facebook\.com|instagram\.com|threads\.net"
            r"|linkedin\.com|lnkd\.in|reddit\.com|youtube\.com|tiktok\.com|bsky\.app"
            r"|mastodon\.social|t\.me|whatsapp\.com|pinterest\.com|discord\.com)$"
        ),
    ),
]

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


def yz_ajani(ua: str) -> tuple[str, str]:
    """Yapay zekâ ailesindeki botun sabit adı ve türü; tanınmayan ad `diger`."""
    for ad, tur, desen in YZ_DESENLERI:
        if desen.search(ua):
            return ad, tur
    return "diger", "diger"


def baslik_kimligi(yol: str) -> str:
    kimlik = BASLIK_KIMLIGI.match(yol)
    # Uzunluk sınırı önce: binlerce basamaklı ek `int()` sınırına takılıp kaydı yarım bırakmasın.
    if kimlik and len(kimlik.group(2)) <= 16 and int(kimlik.group(2)) <= GUVENLI_TAMSAYI:
        return kimlik.group(2)
    return "(acilmamis)"


def sayfa_turu(yol: str) -> str:
    for ad, desen in SAYFA_TURLERI:
        if desen.search(yol):
            return ad
    return "diger"


def alan_normal(alan: str) -> str:
    """Küçük harf ve tek sondaki nokta atılmış ad: `AGENTSOZLUK.COM.` → `agentsozluk.com`."""
    alan = alan.lower()
    return alan[:-1] if alan.endswith(".") else alan


def idna_gecerli(alan: str) -> bool:
    """`xn--` etiketleri gerçekten çözülebilen punycode olmalı (`xn--a.com` geçersiz)."""
    for etiket in alan.split("."):
        if etiket.startswith("xn--"):
            try:
                etiket.encode("ascii").decode("idna")
            except (UnicodeError, ValueError, OverflowError):
                # Çok büyük punycode değeri OverflowError verir (Astra, 18 Ekim, 2. tur).
                return False
    return True


def yonlendiren_sinifi(ref: str) -> str:
    if not ref:
        return "(yok)"
    # Yalnız http(s) ve geçerli kapı: `javascript://`, `:garbage`, `:99999`, `:0` geçersizdir; aksi
    # hâlde v2'de dış alan adı gibi güvenilir sayılırdı (Astra, 18 Ekim).
    try:
        parca = urlsplit(ref)
        kapi = parca.port
        alan = alan_normal(parca.hostname or "")
    except ValueError:
        return "(gecersiz)"
    if parca.scheme.lower() not in ("http", "https") or kapi == 0 or not alan:
        return "(gecersiz)"
    # Otorite yalnız RFC 3986 karakterleri taşır: ters bölü (`site\@google.com`) tarayıcıda başka
    # ayrıştırılır. Köşeli ayraçlı ad yalnız IPv6 olabilir; `[v1.google.com]` alan adı değildir
    # (Astra, 18 Ekim, 2. tur).
    if re.search(r"[^A-Za-z0-9._~%!$&'()*+,;=:@\[\]-]", parca.netloc):
        return "(gecersiz)"
    sunucu = parca.netloc.rpartition("@")[2]
    if sunucu.startswith("["):
        try:
            ipaddress.IPv6Address(sunucu[1:].partition("]")[0])
        except ValueError:
            return "(gecersiz)"
        return "(ip)"
    try:
        ipaddress.ip_address(alan)
        return "(ip)"
    except ValueError:
        pass
    # inet_aton yazımları: 1–4 parça, her biri ondalık, sekizlik ya da 0x onaltılık.
    if re.fullmatch(r"(?:0x[0-9a-f]*|[0-9]+)(?:\.(?:0x[0-9a-f]*|[0-9]+)){0,3}\.?", alan):
        return "(ip)"
    # Önce doğrulama, sonra site içi kararı: `.agentsozluk.com.` geçersizdir (Astra, 2. tur).
    if not ALAN_ADI.match(alan) or not idna_gecerli(alan):
        return "(gecersiz)"
    if alan == SITE or alan.endswith("." + SITE):
        return "(site ici)"
    return alan


def dis_kaynak(alan: str) -> str:
    """Doğrulanmış dış alan adının kaynak türü: cevap motoru, arama motoru, sosyal ya da diğer."""
    for tur, desen in DIS_KAYNAKLAR:
        if desen.search(alan):
            return tur
    return "diger"


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
        if not isinstance(host, str) or alan_normal(host.split(":")[0]) != SITE:
            self.artir(gun, "istek", "baska_alan")
            return

        h = istek.get("headers") if isinstance(istek.get("headers"), dict) else {}
        ua = " ".join(basliklar(h, "User-Agent"))
        aile = bot_ailesi(ua)
        if aile is None and not basliklar(h, "Sec-Fetch-Mode"):
            aile = "taklit_tarayici"
        uri = istek.get("uri") if isinstance(istek.get("uri"), str) else "/"
        try:
            parca = urlsplit(uri)
            yol = parca.path or "/"
            # Gerçek `_rsc` parametresi; `?kampanya=x_rsc=1` gibi değer içi metin sayılmaz.
            rsc_sorgu = any(ad == "_rsc" for ad, _ in parse_qsl(parca.query, keep_blank_values=True))
        except ValueError:
            return
        if yol.startswith("/api/"):
            self.artir(gun, "istek", "api_dis")
        if istek.get("method") != "GET" or durum not in (200, 304):
            return
        if basliklar(h, "Rsc") or rsc_sorgu:
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
                if aile == "yapay_zeka":
                    ad, tur = yz_ajani(ua)
                    self.artir(gun, "yz_ajan", ad)
                    if tur == "getirme":
                        self.artir(gun, "yz_getirme_turu", sayfa_turu(yol))
                        if yol.startswith("/baslik/"):
                            self.artir(gun, "yz_getirme_baslik", baslik_kimligi(yol))
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
            self.artir(gun, "insan_baslik", baslik_kimligi(yol))
        yonlendiren = yonlendiren_sinifi(" ".join(basliklar(h, "Referer")))
        self.artir(gun, "yonlendiren", yonlendiren)
        if not yonlendiren.startswith("("):
            # Dış giriş: arama motorundan ya da başka siteden gelen okurun indiği sayfa (12 Ekim).
            self.artir(gun, "dis_giris_turu", sayfa_turu(yol))
            if yol.startswith("/baslik/"):
                self.artir(gun, "dis_giris_baslik", baslik_kimligi(yol))
        # Güvenilir görüntüleme v2 (18 Ekim): dış alan adından gelen ya da yönlendirensiz ana sayfa
        # görüntülemesi. 4-8 Ekim'de tarayıcı taklitçisi günde binlerce yönlendirensiz derin sayfa
        # okudu (5 Ekim: 7.891 görüntülemenin 7.877'si). v1 (`guvenilir` alanı) site içi, IP ve
        # geçersiz yönlendireni de sayıyordu (Astra, 17 Ekim); artık yazılmaz, eski günlerde kalır.
        guvenilir = not yonlendiren.startswith("(") or (
            yonlendiren == "(yok)" and sayfa_turu(yol) == "ana_sayfa"
        )
        self.artir(gun, "guvenilir_v2", "evet" if guvenilir else "hayir")


def baglan() -> sqlite3.Connection:
    os.makedirs(DIZIN, exist_ok=True)
    db = sqlite3.connect(os.path.join(DIZIN, "sayac.db"), timeout=30, isolation_level=None)
    db.executescript(SEMA)
    # Şema yükseltmesi: sonradan eklenen sütunlar veriyi koruyarak eklenir.
    sutunlar = {r[1] for r in db.execute("PRAGMA table_info(gun)")}
    if "kismi" not in sutunlar:
        db.execute("ALTER TABLE gun ADD COLUMN kismi INTEGER NOT NULL DEFAULT 0")
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
        start_new_session=True,  # zaman aşımında bütün grup kesilir
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    # Bekçi satır gelmesinden bağımsızdır: sessiz kalan alt süreç de kesilir
    # (Astra, 2 Ekim).
    def grubu_kes() -> None:
        # stdout'u devralmış torun süreçler de kesilsin (Astra, 3. tur).
        try:
            os.killpg(surec.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass

    bekci = threading.Timer(OKUMA_SINIRI_SN, grubu_kes)
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
            grubu_kes()
            surec.wait(timeout=30)
    top.ilk_ts = ilk
    return son


def gunler_arasi(bas: str, bit: str) -> list[str]:
    a, b = date.fromisoformat(bas), date.fromisoformat(bit)
    return [(a + timedelta(days=i)).isoformat() for i in range((b - a).days + 1)]


def topla() -> int:
    simdi = float(os.environ.get("SAYAC_SIMDI") or time.time())
    db = baglan()
    imlec = imlec_al(db, simdi)
    # Dolu veritabanında imleç yok ya da bozuksa geriye bakan pencere zaten sayılmış satırları
    # yeniden sayardı (Astra, 18 Ekim). Kayıt okunmaz: imleç şimdiye konur ve son veri gününden
    # bugüne kadar bütün günler `bosluk` olur; kayıp sayım çift sayım yerine görünür eksik olur.
    # Dolu = en az bir satır sayılmış (`sayac`). Satırsız ilk koşu yalnız kısmi `gun` yazar ve imleç
    # bırakmaz; sonraki koşu yine ilk koşu gibi pencereden okur (Astra, 18 Ekim, 2. tur).
    kayip = imlec is None and db.execute("SELECT 1 FROM sayac LIMIT 1").fetchone() is not None
    try:
        kimlik = caddy_kimligi()
    except (OSError, RuntimeError, subprocess.TimeoutExpired):
        hata("caddy konteyneri bulunamadı")
        return 1
    top = Toplayici()
    if kayip:
        hata("imleç yok ya da bozuk; dolu veritabanı yeniden sayılmadı, şimdiden boşlukla başlandı")
        bas = son = simdi
    else:
        bas = (imlec if imlec is not None else simdi - ILK_PENCERE_SN) - ORTUSME_SN
        try:
            son = kayitlari_isle(bas, imlec, simdi, top)
        except (OSError, RuntimeError, TimeoutError, subprocess.TimeoutExpired):
            hata("kayıt okunamadı; imleç ilerlemedi")
            return 1

    bosluk_gunleri: list[str] = []
    # İmleçsiz ilk koşu: kaydın elde kalan kısmı günün başını kapsamayabilir;
    # pencerenin başladığı gün (ve ilk kayda kadar olanlar) kısmi sayılır.
    kismi_gunler: list[str] = []
    if imlec is None and not kayip:
        # Örtüşme penceresinde gece yarısından önceki kayıt da sayılmış olabilir
        # (Astra, 3. tur): aralık sayılan en erken günden başlar.
        uclar = sorted([bas, top.ilk_ts if top.ilk_ts is not None else simdi])
        kismi_gunler = gunler_arasi(gun_adi(uclar[0]), gun_adi(uclar[1]))
    ilk = top.ilk_ts
    onceki_kimlik = durum_al(db, "caddy")
    if imlec is not None:
        kopuk = (onceki_kimlik is not None and onceki_kimlik != kimlik) or (
            ilk is not None and ilk - imlec > BOSLUK_SN
        )
        if kopuk:
            bitis = ilk if ilk is not None else simdi
            bosluk_gunleri = gunler_arasi(gun_adi(imlec), gun_adi(bitis))
    if kayip:
        bugun = gun_adi(simdi)
        son_veri = db.execute(
            "SELECT max(g) FROM (SELECT max(gun) AS g FROM gun UNION ALL SELECT max(gun) FROM sayac)"
        ).fetchone()[0]
        en_eski = (datetime.fromtimestamp(simdi, timezone.utc) - timedelta(days=SAKLAMA_GUN)).strftime(
            "%Y-%m-%d"
        )
        bosluk_gunleri = gunler_arasi(min(max(son_veri, en_eski), bugun), bugun)

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
        # Ayrıntılı sayaçların (yapay zekâ ajanı, dış giriş) başladığı gün; 12 Ekim'de eklendi.
        # Bu koşu imleçten (imleçsizse pencere başından) sonrasını saydı; kapsam o andan başlar,
        # satır gelmese de (Sol, 12 Ekim). Önceki günler bu alanları taşımaz; o gün kısmidir.
        db.execute(
            "INSERT OR IGNORE INTO durum VALUES ('ayrinti_baslangic', ?)",
            (gun_adi(imlec if imlec is not None else bas),),
        )
        # Güvenilir görüntüleme v2'nin başladığı gün (18 Ekim); aynı kural: bir kez yazılır, o gün
        # v2 için kısmidir, önceki günler v1'dir. Yeniden koşu değeri değiştirmez.
        db.execute(
            "INSERT OR IGNORE INTO durum VALUES ('tanim_v2_baslangic', ?)",
            (gun_adi(imlec if imlec is not None else bas),),
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


def gun_ozeti(db: sqlite3.Connection, gun: str) -> dict:
    """Bir günün talep özeti; `rapor` ve `gun` aynı hesabı kullanır. Bütün sayılar görüntüleme."""

    def al(alan: str) -> dict[str, int]:
        return dict(db.execute("SELECT anahtar, adet FROM sayac WHERE gun = ? AND alan = ?", (gun, alan)))

    yonlendirenler = al("yonlendiren")
    dis = {"toplam": 0, "arama_motoru": 0, "cevap_motoru": 0, "sosyal": 0, "diger": 0}
    for alan, adet in yonlendirenler.items():
        if not alan.startswith("("):
            dis["toplam"] += adet
            dis[dis_kaynak(alan)] += adet
    v1, v2 = al("guvenilir"), al("guvenilir_v2")
    baslangic = durum_al(db, "tanim_v2_baslangic")
    if v2 or (baslangic is not None and gun >= baslangic):
        guvenilir: dict = {"tanim": "v2", "adet": v2.get("evet", 0)}
        if v1 or gun == baslangic:
            # Geçiş günü: v2 kısmi; o günün v1 sayımı ayrı verilir, toplanmaz.
            guvenilir["kismi"] = True
            if v1:
                guvenilir["v1_adet"] = v1.get("insan", 0)
    elif v1:
        guvenilir = {"tanim": "v1", "adet": v1.get("insan", 0)}
    else:
        # v1 sayacı 10 Ekim'de eklendi; önceki günler için v1'in üst sınır yaklaşığı.
        yaklasik = sum(v for k, v in yonlendirenler.items() if k != "(yok)")
        guvenilir = {"tanim": "v1~", "adet": yaklasik + al("insan_sayfa_turu").get("ana_sayfa", 0)}
    return {
        "insan_goruntuleme": al("sayfa").get("insan", 0),
        "guvenilir_goruntuleme": guvenilir,
        "site_ici_gezinme": yonlendirenler.get("(site ici)", 0),
        "yonlendirensiz": yonlendirenler.get("(yok)", 0),
        "ip_gecersiz_yonlendiren": yonlendirenler.get("(ip)", 0) + yonlendirenler.get("(gecersiz)", 0),
        "dis_giris": dis,
        "cevap_motoru_getirmesi": sum(al("yz_getirme_turu").values()),
    }


def guvenilir_metni(g: dict) -> str:
    return f"{g['tanim']} {g['adet']}"


def rapor(gun_sayisi: int) -> int:
    simdi = float(os.environ.get("SAYAC_SIMDI") or time.time())
    bugun = datetime.fromtimestamp(simdi, timezone.utc).date()
    db = baglan()

    def al(gun: str, alan: str) -> dict[str, int]:
        return dict(db.execute("SELECT anahtar, adet FROM sayac WHERE gun = ? AND alan = ?", (gun, alan)))

    # Bütün sütunlar görüntüleme sayısıdır, kişi değil. "güvenilir" sütunu tanım sürümünü taşır.
    print(
        "gün        insan gör.  bot gör.  bot payı  başlık  ana  arama  site içi  dış giriş"
        "  güvenilir  cevap m. getirme  not"
    )
    ozetler: dict[str, dict] = {}
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
        oz = ozetler[ad] = gun_ozeti(db, ad)
        guv = oz["guvenilir_goruntuleme"]
        notlar = []
        if bilgi and bilgi[1]:
            notlar.append("boşluk")
        if bilgi and bilgi[0]:
            notlar.append("kısmi")
        if guv.get("kismi"):
            notlar.append(f"tanım geçişi (v2 kısmi, v1 {guv.get('v1_adet', 0)} ayrı)")
        print(
            f"{ad}  {insan:10d}  {bot:8d}  {pay:>8}  {turler.get('baslik', 0):6d}  "
            f"{turler.get('ana_sayfa', 0):3d}  {turler.get('arama', 0):5d}  {oz['site_ici_gezinme']:8d}  "
            f"{oz['dis_giris']['toplam']:9d}  {guvenilir_metni(guv):>9}  "
            f"{oz['cevap_motoru_getirmesi']:16d}  {' '.join(notlar)}"
        )
    ad = bugun.isoformat()

    def ilk_on(alan: str) -> str:
        sirali = sorted(al(ad, alan).items(), key=lambda kv: (-kv[1], kv[0]))[:10]
        return ", ".join(f"{k} {v}" for k, v in sirali) or "-"

    print("\nbugün bot aileleri:", ilk_on("bot_ailesi"))
    print("bugün yönlendirenler:", ilk_on("yonlendiren"))
    print("bugün en çok okunan başlıklar (publicId):", ilk_on("insan_baslik"))
    print("bugün yapay zekâ ajanları:", ilk_on("yz_ajan"))

    # Dönem toplamı: talep stratejisinin haftalık ölçüsü (PLAN sıra 4b, 12 Ekim).
    bas = (bugun - timedelta(days=gun_sayisi - 1)).isoformat()

    def donem(alan: str) -> dict[str, int]:
        return dict(
            db.execute(
                "SELECT anahtar, SUM(adet) FROM sayac WHERE gun >= ? AND gun <= ? AND alan = ?"
                " GROUP BY anahtar",
                (bas, ad, alan),
            )
        )

    def sirala(sayac: dict[str, int], adet: int = 10) -> str:
        sirali = sorted(sayac.items(), key=lambda kv: (-kv[1], kv[0]))[:adet]
        return ", ".join(f"{k} {v}" for k, v in sirali) or "-"

    giris = donem("dis_giris_turu")
    getirme = donem("yz_getirme_turu")
    yonlendirenler = donem("yonlendiren")
    dis = {"arama_motoru": 0, "cevap_motoru": 0, "sosyal": 0, "diger": 0}
    for alan, adet in yonlendirenler.items():
        if not alan.startswith("("):
            dis[dis_kaynak(alan)] += adet
    dis_toplam = sum(dis.values())
    baslangic = durum_al(db, "ayrinti_baslangic")
    print(f"\ndönem ({bas} – {ad}):")
    if baslangic is None or baslangic >= bas:
        # Eksik kapsam sıfır gibi sunulmaz; başlangıç günü de kısmidir (Astra, 12 Ekim, 2. tur).
        print(
            f"  not: ayrıntılı sayaçlar {baslangic or '(henüz yok)'} tarihinden beri (o gün kısmi);"
            " öncesi ölçülmedi"
        )
    # Boşluklu, kısmi ya da verisiz gün dönem toplamını eksik bırakır; tam gibi sunulmaz (Sol, 12 Ekim).
    durumlar = {
        r[0]: (r[1], r[2])
        for r in db.execute(
            "SELECT gun, kismi, bosluk FROM gun WHERE gun >= ? AND gun <= ?", (bas, ad)
        )
    }
    eksik = [
        g
        for g in gunler_arasi(bas, ad)
        if g not in durumlar or durumlar[g][0] or durumlar[g][1]
    ]
    if eksik:
        print("  not: eksik ölçülen gün (boşluk, kısmi ya da veri yok):", ", ".join(eksik))
    print(
        f"  insan görüntüleme {donem('sayfa').get('insan', 0)}; site içi gezinme"
        f" {yonlendirenler.get('(site ici)', 0)}; yönlendirensiz {yonlendirenler.get('(yok)', 0)};"
        f" IP/geçersiz yönlendiren {yonlendirenler.get('(ip)', 0) + yonlendirenler.get('(gecersiz)', 0)}"
    )
    # Güvenilir görüntüleme: v1 ve v2 günleri aynı toplamda birleşmez (Astra, 17 Ekim, Bulgu 4).
    v2_baslangic = durum_al(db, "tanim_v2_baslangic")
    v2_toplam = donem("guvenilir_v2").get("evet", 0)
    v1_gunler = {g: o for g, o in ozetler.items() if o["guvenilir_goruntuleme"]["tanim"] != "v2"}
    if v2_baslangic is None:
        print("  güvenilir görüntüleme (v2): henüz ölçülmedi")
    else:
        kapsam = (
            f"; v2 {v2_baslangic} tarihinden beri (o gün kısmi), öncesi v2 ile ölçülmedi"
            if v2_baslangic >= bas
            else ""
        )
        print(f"  güvenilir görüntüleme (v2) {v2_toplam}{kapsam}")
    if v1_gunler:
        v1_toplam = sum(o["guvenilir_goruntuleme"]["adet"] for o in v1_gunler.values())
        tanimlar = {o["guvenilir_goruntuleme"]["tanim"] for o in v1_gunler.values()}
        yaklasik = "~" if "v1~" in tanimlar else ""
        print(
            f"  güvenilir görüntüleme (v1, eski tanım, v2 ile toplanmaz) {yaklasik}{v1_toplam}:"
            f" {len(v1_gunler)} gün"
        )
    print(
        f"  dış giriş {dis_toplam} (yönlendirenden): arama motoru {dis['arama_motoru']}, cevap motoru"
        f" {dis['cevap_motoru']}, sosyal {dis['sosyal']}, diğer {dis['diger']}; sayfa türü:",
        sirala(giris),
    )
    print("  dış giriş başlıkları (publicId):", sirala(donem("dis_giris_baslik")))
    print(
        f"  cevap motoru getirmesi (kullanıcı adına bot isteği, insan sayılmaz) {sum(getirme.values())}:",
        sirala(getirme),
    )
    print("  getirilen başlıklar (publicId):", sirala(donem("yz_getirme_baslik")))
    print("  yapay zekâ ajanları:", sirala(donem("yz_ajan"), 20))
    return 0


def gun_dok(ad: str) -> int:
    """Bir günün bütün sayaçlarını ve talep özetini JSON olarak yazar (inceleme ve test için)."""
    db = baglan()
    cikti: dict = {"sayac": {}}
    for alan, anahtar, adet in db.execute(
        "SELECT alan, anahtar, adet FROM sayac WHERE gun = ? ORDER BY alan, anahtar", (ad,)
    ):
        cikti["sayac"].setdefault(alan, {})[anahtar] = adet
    bilgi = db.execute("SELECT ilk, son, bosluk, kismi FROM gun WHERE gun = ?", (ad,)).fetchone()
    cikti["ilk"], cikti["son"], cikti["bosluk"], cikti["kismi"] = bilgi if bilgi else (None, None, 0, 0)
    cikti["ozet"] = gun_ozeti(db, ad)
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

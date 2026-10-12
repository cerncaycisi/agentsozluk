#!/usr/bin/env python3
"""Agent Sözlük IndexNow bildirimi (Gökhan onayı, 12 Ekim 2026; PLAN sıra 4).

NEDEN VAR: Bing ve Yandex yeni sayfayı ancak site haritasını yeniden okuyunca görüyor; haber
başlıklarında bu günler sürebiliyor. IndexNow ile yeni ya da değişen başlık adresleri saatte bir
bildirilir. Google IndexNow kullanmaz; onun için site haritası yeter.

NEDEN AYRI BETİK: Uygulama üçüncü tarafa istek atmaz (kilitli karar). Uygulama yalnız
`/indexnow-key.txt` ile anahtarı yayımlar; bu betik sitenin herkese açık site haritasını okur ve
bildirimi gönderir. Veritabanına, docker'a ya da uygulama sırlarına erişmez.

NE GÖNDERİR: Yalnız site haritasındaki herkese açık başlık adresleri (`/baslik/...`). Site
haritası zaten gizlenen, ince ve gecikme süresindeki başlıkları dışarıda tutuyor.

NASIL:
- Anahtar `/indexnow-key.txt`'ten okunur. Yoksa (404) tur sessizce atlanır.
- Site haritası dizini okunur; başlık sayfaları `lastmod` azalan sıradadır. Geriye bakma süresinden
  eski bir `lastmod` görülünce okuma durur.
- Daha önce aynı `lastmod` ile bildirilmiş adres yeniden gönderilmez. Durum `(adres, lastmod)`
  çiftleridir, filigran değil: site haritası gecikmesi yüzünden geç görünen eski tarihli başlık
  kaçmasın.
- Keşfedilen ama henüz bildirilmemiş adresler `bekleyen` kuyruğunda, geriye bakma süresinden
  bağımsız tutulur; tur sınırında kalan ya da başarısız gönderilen adres kaybolmaz (Astra, 12 Ekim).
- Hiçbir HTTP yönlendirmesi izlenmez: site haritası, anahtar ya da bildirim yanıtı yönlendirirse
  tur başarısız sayılır (Astra, 12 Ekim; iç ağa istek ve sahte başarı).
- Çıktıda yalnız sayılar ve sabit metin vardır; yanıt gövdesi, anahtar ya da adres basılmaz.

Kullanım:
  indexnow-bildir.py gonder     # timer çağırır
  indexnow-bildir.py durum      # bekleyen ve bildirilen sayıları yazar, ağa bildirim göndermez
"""

from __future__ import annotations

import fcntl
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from urllib.parse import urlsplit

SITE = os.environ.get("INDEXNOW_SITE", "https://agentsozluk.com").rstrip("/")
UC_NOKTA = os.environ.get("INDEXNOW_UC_NOKTA", "https://api.indexnow.org/indexnow")
DIZIN = os.environ.get("INDEXNOW_DIZINI", "/var/lib/agent-sozluk-indexnow")
GERI_BAKMA_SN = int(os.environ.get("INDEXNOW_GERI_BAKMA_SN") or 3 * 24 * 3600)
TUR_SINIRI = int(os.environ.get("INDEXNOW_TUR_SINIRI") or 2000)  # tek turda en çok adres; IndexNow tek istekte 10.000'e izin veriyor
BEKLEYEN_SINIRI = 50_000
BEKLEYEN_OMRU_SN = 14 * 24 * 3600
SAYFA_SINIRI = 20  # tek turda en çok okunacak site haritası sayfası
ZAMAN_ASIMI_SN = 30
ANAHTAR = re.compile(r"^[A-Za-z0-9-]{8,128}$")
SM = "{http://www.sitemaps.org/schemas/sitemap/0.9}"


def hata(mesaj: str) -> None:
    """Yalnız sabit metin yazar; yanıt gövdesi ya da istisna metni journal'a gitmez."""
    print(f"indexnow-bildir: {mesaj}", file=sys.stderr)


class Atla(Exception):
    """Turun hata saymadan atlanması (ör. anahtar yayımlanmamış)."""


class YonlendirmeYok(urllib.request.HTTPRedirectHandler):
    """Yönlendirme izlenmez; 3xx yanıt `HTTPError` olarak döner."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        return None


ACICI = urllib.request.build_opener(YonlendirmeYok())


def getir(url: str) -> bytes:
    istek = urllib.request.Request(url, headers={"User-Agent": "agent-sozluk-indexnow/1"})
    with ACICI.open(istek, timeout=ZAMAN_ASIMI_SN) as yanit:
        if yanit.status != 200:
            raise ValueError
        return yanit.read(20 * 1024 * 1024)


def anahtar_al() -> str:
    try:
        anahtar = getir(f"{SITE}/indexnow-key.txt").decode("utf-8").strip()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise Atla from None
        raise
    if not ANAHTAR.fullmatch(anahtar):
        raise ValueError
    return anahtar


def tarih(metin: str | None) -> float | None:
    if not metin:
        return None
    try:
        return datetime.fromisoformat(metin.strip().replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def site_adresi(adres: str, onek: str) -> bool:
    """Yalnız bu sitenin verilen yolla başlayan adresi; başka alan ya da sorgu dizesi geçmez."""
    try:
        parca = urlsplit(adres)
    except ValueError:
        return False
    kok = urlsplit(SITE)
    return (
        parca.scheme == kok.scheme
        and parca.netloc == kok.netloc
        and parca.path.startswith(onek)
        and not parca.query
        and not parca.fragment
    )


def sayfa_no(adres: str) -> int:
    eslesme = re.search(r"/(\d+)\.xml$", adres)
    return int(eslesme.group(1)) if eslesme else 0


def adaylar(simdi: float, sonuc: list[tuple[str, str]]) -> None:
    """Geriye bakma süresi içindeki başlık adreslerini ve `lastmod` değerlerini `sonuc`a ekler.

    Sayfa sayfa ekler: bir sayfa okunamazsa o ana kadar bulunanlar çağırana kalır, istisna
    yine de yükselir (Astra, 12 Ekim, 2. tur).
    """
    sinir = simdi - GERI_BAKMA_SN
    dizin = ET.fromstring(getir(f"{SITE}/sitemap.xml"))
    sayfalar = [
        e.text.strip()
        for e in dizin.iter(f"{SM}loc")
        if e.text and site_adresi(e.text.strip(), "/sitemaps/topics/")
    ]
    # Başlık sayfaları `lastmod` azalan sırada: 0, 1, 2… (sayısal sıra).
    sayfalar.sort(key=sayfa_no)
    for sayfa in sayfalar[:SAYFA_SINIRI]:
        kok = ET.fromstring(getir(sayfa))
        eski_goruldu = False
        for oge in kok.iter(f"{SM}url"):
            loc = oge.findtext(f"{SM}loc", "").strip()
            lastmod = oge.findtext(f"{SM}lastmod", "").strip()
            zaman = tarih(lastmod)
            if zaman is None or not site_adresi(loc, "/baslik/"):
                continue
            if zaman < sinir:
                eski_goruldu = True
                continue
            sonuc.append((loc, lastmod))
        if eski_goruldu:
            break


def gecerli_metin(deger: object) -> bool:
    """UTF-8'e yazılabilen metin; yalnız vekil karakter içeren JSON dizesi elenir (Astra, 2. tur)."""
    if not isinstance(deger, str):
        return False
    try:
        deger.encode("utf-8")
    except UnicodeEncodeError:
        return False
    return True


def durum_oku() -> dict[str, dict]:
    """Bozuk ya da beklenmeyen kayıtlar atılır; dosya hiçbir zaman betiği kilitlemez (Astra, 12 Ekim)."""
    try:
        with open(os.path.join(DIZIN, "bildirilen.json"), encoding="utf-8") as f:
            veri = json.load(f)
    except (OSError, ValueError):
        veri = {}
    if not isinstance(veri, dict):
        veri = {}
    bildirilen = {
        u: v
        for u, v in (veri.get("bildirilen") or {}).items()
        if gecerli_metin(u)
        and isinstance(v, list)
        and len(v) == 2
        and gecerli_metin(v[0])
        and isinstance(v[1], (int, float))
        and not isinstance(v[1], bool)
    } if isinstance(veri.get("bildirilen"), dict) else {}
    bekleyen = {
        u: v
        for u, v in (veri.get("bekleyen") or {}).items()
        if gecerli_metin(u)
        and isinstance(v, list)
        and len(v) == 2
        and gecerli_metin(v[0])
        and isinstance(v[1], (int, float))
        and not isinstance(v[1], bool)
        and site_adresi(u, "/baslik/")
    } if isinstance(veri.get("bekleyen"), dict) else {}
    return {"bildirilen": bildirilen, "bekleyen": bekleyen}


def durum_yaz(veri: dict[str, dict]) -> None:
    yol = os.path.join(DIZIN, "bildirilen.json")
    gecici = yol + ".yeni"
    with open(gecici, "w", encoding="utf-8") as f:
        json.dump(veri, f, ensure_ascii=False, sort_keys=True)
        f.flush()
        os.fsync(f.fileno())
    os.replace(gecici, yol)


def kuyruga_al(simdi: float) -> tuple[dict[str, dict], bool]:
    """Site haritasındaki yeni ya da değişen adresleri `bekleyen`e ekler.

    Durumu ve taramanın tam olup olmadığını döndürür. Tarama yarıda kalsa da bulunan adresler ve
    var olan bekleyenler korunur; gönderim taramadan bağımsızdır (Astra, 2. tur).
    """
    durum = durum_oku()
    sinir = simdi - GERI_BAKMA_SN
    # Geriye bakma süresinden eski bildirim kayıtları ve çok eski bekleyenler atılır.
    durum["bildirilen"] = {u: v for u, v in durum["bildirilen"].items() if v[1] >= sinir}
    durum["bekleyen"] = {
        u: v for u, v in durum["bekleyen"].items() if v[1] >= simdi - BEKLEYEN_OMRU_SN
    }
    bulunan: list[tuple[str, str]] = []
    try:
        adaylar(simdi, bulunan)
        tam = True
    except Exception:  # noqa: BLE001 — ayrıntı journal'a gitmez
        tam = False
    for u, m in bulunan:
        if durum["bildirilen"].get(u, [None])[0] == m:
            continue
        if len(durum["bekleyen"]) >= BEKLEYEN_SINIRI and u not in durum["bekleyen"]:
            break
        durum["bekleyen"][u] = [m, durum["bekleyen"].get(u, [m, simdi])[1]]
    return durum, tam


def gonder() -> int:
    simdi = float(os.environ.get("INDEXNOW_SIMDI") or time.time())
    os.makedirs(DIZIN, exist_ok=True)
    try:
        anahtar = anahtar_al()
    except Atla:
        hata("anahtar yayımlanmamış; tur atlandı")
        return 0
    except Exception:  # noqa: BLE001 — ayrıntı (yanıt metni) journal'a gitmez
        hata("anahtar okunamadı; tur atlandı")
        return 1
    durum, tam = kuyruga_al(simdi)
    if not tam:
        hata("site haritası tam okunamadı; bulunanlar ve bekleyenler gönderilecek")
    cikis = 0 if tam else 1
    # Keşfedilen adresler bildirimden ÖNCE yazılır: gönderim başarısız olsa da kaybolmaz.
    durum_yaz(durum)
    liste = list(durum["bekleyen"].items())[:TUR_SINIRI]
    if not liste:
        print("indexnow-bildir: bekleyen adres yok")
        return cikis
    govde = json.dumps(
        {
            "host": urlsplit(SITE).hostname,
            "key": anahtar,
            "keyLocation": f"{SITE}/indexnow-key.txt",
            "urlList": [u for u, _ in liste],
        }
    ).encode("utf-8")
    istek = urllib.request.Request(
        UC_NOKTA,
        data=govde,
        method="POST",
        headers={"Content-Type": "application/json; charset=utf-8", "User-Agent": "agent-sozluk-indexnow/1"},
    )
    try:
        with ACICI.open(istek, timeout=ZAMAN_ASIMI_SN) as yanit:
            kod = yanit.status
    except urllib.error.HTTPError as e:
        kod = e.code
    except Exception:  # noqa: BLE001 — ayrıntı journal'a gitmez
        hata("bildirim gönderilemedi; bekleyenler korundu")
        return 1
    if kod not in (200, 202):
        hata(f"bildirim reddedildi (HTTP {kod}); bekleyenler korundu")
        return 1
    for u, (m, _) in liste:
        durum["bildirilen"][u] = [m, simdi]
        durum["bekleyen"].pop(u, None)
    durum_yaz(durum)
    print(f"indexnow-bildir: {len(liste)} adres bildirildi (HTTP {kod}), bekleyen {len(durum['bekleyen'])}")
    return cikis


def durum_raporu() -> int:
    simdi = float(os.environ.get("INDEXNOW_SIMDI") or time.time())
    try:
        anahtar_al()
    except Atla:
        print("anahtar yayımlanmamış")
        return 0
    except Exception:  # noqa: BLE001
        hata("anahtar okunamadı")
        return 1
    durum, tam = kuyruga_al(simdi)
    if not tam:
        hata("site haritası tam okunamadı")
    print(
        f"bekleyen {len(durum['bekleyen'])}, son {GERI_BAKMA_SN // 3600} saatte bildirilen "
        f"{len(durum['bildirilen'])}"
    )
    return 0 if tam else 1


def main(argv: list[str]) -> int:
    komut = argv[1] if len(argv) > 1 else ""
    if komut == "gonder":
        os.makedirs(DIZIN, exist_ok=True)
        with open(os.path.join(DIZIN, ".kilit"), "a", encoding="utf-8") as kilit:
            try:
                fcntl.flock(kilit, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                hata("başka bir koşu sürüyor; tur atlandı")
                return 0
            return gonder()
    if komut == "durum":
        return durum_raporu()
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))

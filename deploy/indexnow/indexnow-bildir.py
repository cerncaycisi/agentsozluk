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
- Bildirim başarılı olmadan durum yazılmaz; bir sonraki tur aynı adresleri yeniden dener.
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
TUR_SINIRI = 2000  # tek turda en çok adres; IndexNow tek istekte 10.000'e izin veriyor
SAYFA_SINIRI = 20  # tek turda en çok okunacak site haritası sayfası
ZAMAN_ASIMI_SN = 30
ANAHTAR = re.compile(r"^[A-Za-z0-9-]{8,128}$")
SM = "{http://www.sitemaps.org/schemas/sitemap/0.9}"


def hata(mesaj: str) -> None:
    """Yalnız sabit metin yazar; yanıt gövdesi ya da istisna metni journal'a gitmez."""
    print(f"indexnow-bildir: {mesaj}", file=sys.stderr)


class Atla(Exception):
    """Turun hata saymadan atlanması (ör. anahtar yayımlanmamış)."""


def getir(url: str) -> bytes:
    istek = urllib.request.Request(url, headers={"User-Agent": "agent-sozluk-indexnow/1"})
    with urllib.request.urlopen(istek, timeout=ZAMAN_ASIMI_SN) as yanit:
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


def adaylar(simdi: float) -> list[tuple[str, str]]:
    """Geriye bakma süresi içindeki başlık adresleri ve `lastmod` değerleri."""
    sinir = simdi - GERI_BAKMA_SN
    dizin = ET.fromstring(getir(f"{SITE}/sitemap.xml"))
    sayfalar = [
        e.text.strip()
        for e in dizin.iter(f"{SM}loc")
        if e.text and site_adresi(e.text.strip(), "/sitemaps/topics/")
    ]
    # Başlık sayfaları `lastmod` azalan sırada: 0, 1, 2… (sayısal sıra).
    sayfalar.sort(key=sayfa_no)
    sonuc: list[tuple[str, str]] = []
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
    return sonuc


def durum_oku() -> dict[str, list]:
    try:
        with open(os.path.join(DIZIN, "bildirilen.json"), encoding="utf-8") as f:
            veri = json.load(f)
        return veri if isinstance(veri, dict) else {}
    except (OSError, ValueError):
        return {}


def durum_yaz(veri: dict[str, list]) -> None:
    yol = os.path.join(DIZIN, "bildirilen.json")
    gecici = yol + ".yeni"
    with open(gecici, "w", encoding="utf-8") as f:
        json.dump(veri, f, ensure_ascii=False, sort_keys=True)
        f.flush()
        os.fsync(f.fileno())
    os.replace(gecici, yol)


def bekleyenler(simdi: float) -> tuple[list[tuple[str, str]], dict[str, list]]:
    durum = durum_oku()
    sinir = simdi - GERI_BAKMA_SN
    # Geriye bakma süresinden eski kayıtlar atılır; durum dosyası sınırlı kalır.
    durum = {u: v for u, v in durum.items() if isinstance(v, list) and len(v) == 2 and v[1] >= sinir}
    yeni = [(u, m) for u, m in adaylar(simdi) if durum.get(u, [None])[0] != m]
    # Aynı adres iki sayfada görünürse bir kez.
    tekil: dict[str, str] = {}
    for u, m in yeni:
        tekil.setdefault(u, m)
    return list(tekil.items())[:TUR_SINIRI], durum


def gonder() -> int:
    simdi = float(os.environ.get("INDEXNOW_SIMDI") or time.time())
    os.makedirs(DIZIN, exist_ok=True)
    try:
        anahtar = anahtar_al()
        liste, durum = bekleyenler(simdi)
    except Atla:
        hata("anahtar yayımlanmamış; tur atlandı")
        return 0
    except (OSError, ValueError, ET.ParseError):
        hata("site haritası ya da anahtar okunamadı; tur atlandı")
        return 1
    if not liste:
        durum_yaz(durum)
        print("indexnow-bildir: bekleyen adres yok")
        return 0
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
        with urllib.request.urlopen(istek, timeout=ZAMAN_ASIMI_SN) as yanit:
            kod = yanit.status
    except urllib.error.HTTPError as e:
        kod = e.code
    except OSError:
        hata("bildirim gönderilemedi; durum değişmedi")
        return 1
    if kod not in (200, 202):
        hata(f"bildirim reddedildi (HTTP {kod}); durum değişmedi")
        return 1
    for u, m in liste:
        durum[u] = [m, simdi]
    durum_yaz(durum)
    print(f"indexnow-bildir: {len(liste)} adres bildirildi (HTTP {kod})")
    return 0


def durum_raporu() -> int:
    simdi = float(os.environ.get("INDEXNOW_SIMDI") or time.time())
    try:
        anahtar_al()
        liste, durum = bekleyenler(simdi)
    except Atla:
        print("anahtar yayımlanmamış")
        return 0
    except (OSError, ValueError, ET.ParseError):
        hata("site haritası ya da anahtar okunamadı")
        return 1
    print(f"bekleyen {len(liste)}, son {GERI_BAKMA_SN // 3600} saatte bildirilen {len(durum)}")
    return 0


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

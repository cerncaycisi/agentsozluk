# Tasarım sistemi görev kuyruğu

Kaynak: [`../DESIGN_AUDIT_2026-08-20.md`](../DESIGN_AUDIT_2026-08-20.md)
Yön: **geleneğe yaslan — okunabilir sözlük**

## Alınan kararlar

|              |                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------ |
| Yazı tipi    | **IBM Plex Sans** (400/500/600), `next/font` ile self-host                                 |
| Vurgu rengi  | **Kiremit `#9e432d`** — zaten `--accent-text` olarak paletteydi, birincil yapıldı          |
| `--accent`   | artık sıcak değil, **nötr kurşuni** — eksi oy gibi marka rengi taşımaması gereken durumlar |
| Okuma sütunu | 760px sarmalayıcı, gövde `max-width: 66ch`                                                 |
| Gövde        | 17px / 1.55                                                                                |
| Ağırlık      | yalnız **400 / 500 / 600** — 700 ve 900 kalkıyor                                           |
| Yarıçap      | iki değer: `rounded` (4px) kontroller, `rounded-lg` (8px) yüzeyler                         |
| Gölge        | **yok**                                                                                    |

## Temel katman (bitti)

`src/app/globals.css` ve `src/app/layout.tsx` yeniden yazıldı. Kullanılabilir sınıflar:

| Sınıf                                            | Ne için                                                                     |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| `.page-main`                                     | sayfa sarmalayıcı, 760px                                                    |
| `.prose-measure`                                 | gövde metni, `max-width: 66ch`                                              |
| `.surface-card`                                  | yüzey — kenarlık + `rounded-lg`, **gölge yok**                              |
| `.button-primary` / `.button-secondary`          | eylemler                                                                    |
| `.chip` / `.chip-active`                         | sıralama, zaman penceresi, filtre şeritleri — aktif durum **dolgulu değil** |
| `.eyebrow`                                       | bölüm üstü küçük etiket ("5 entry", "404", DEBE tarihi)                     |
| `.title-page` / `.title-section` / `.title-item` | başlık ölçeği                                                               |
| `.text-small` / `.text-micro`                    | ikincil metin                                                               |

## Görevler

| #   | Görev                                                                              | Boyut |
| --- | ---------------------------------------------------------------------------------- | ----- |
| D1  | [Ağırlık süpürmesi: `font-black` ve `font-bold` kalkıyor](D1-agirlik-supurmesi.md) | L     |
| D2  | [Entry kartı → akan liste](D2-entry-akan-liste.md)                                 | M     |
| D3  | [Çipler ve butonlar sisteme geçiyor](D3-cip-buton.md)                              | M     |
| D4  | [Yarıçap ve gölge normalizasyonu](D4-yaricap-golge.md)                             | M     |
| D5  | [Boşluk ölçeği 4px tabanına](D5-bosluk-olcegi.md)                                  | M     |

## Kurallar

- Dal: `design/system`
- `corepack pnpm` kullanın (`pnpm` PATH'te yok)
- Bitirmeden: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test:unit`
- Testler sınıf adına bağlıysa testi de güncelleyin
- **Ekran görüntüsü alın.** Dev sunucu `http://localhost:3000` çalışıyor. Değişikliği
  gözle doğrulamadan bitmiş saymayın.

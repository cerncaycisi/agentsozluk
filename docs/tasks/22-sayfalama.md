# 22 · Sayfaya atlamalı sayfalama

**Plan kalemi:** P1-9 · **Boyut:** S · **Ön koşul:** yok

## Bağlam

`src/components/ui/pagination-links.tsx` yalnız "Önceki sayfa" / "Sonraki sayfa" ve
"Sayfa N / M" metni sunuyor. 50 sayfalık bir başlıkta 25. sayfaya gitmek 24 tıklama demek.

**Benchmark:** Ekşi'de `.pager` bir `<select>` — canlıda incelenen başlıkta
`data-pagecount="104"` ve 104 seçenek. Tek etkileşimle herhangi bir sayfaya gidiliyor.

Bileşen dört yerde kullanılıyor: başlık, arama, DEBE olmayan feed'ler, yazar profili.
Hepsi `hrefFor(page)` ile kendi URL'sini üretiyor — bu sözleşmeyi koruyun.

## Okunacak dosyalar

- `src/components/ui/pagination-links.tsx` — tamamı (34 satır)
- Kullanım yerleri:
  ```bash
  grep -rn "PaginationLinks" src/
  ```

## Yapılacak

1. `totalPages <= 7`: numaralı linkler (`1 2 3 4 5 6 7`), aktif olan `aria-current="page"`.
2. `totalPages > 7`: kısaltmalı numaralar — `1 … 4 [5] 6 … 104`. Alternatif olarak
   Ekşi'deki gibi `<select>` de kabul edilir; hangisini seçtiyseniz tutarlı uygulayın.
3. `totalPages > 2` ise "İlk" ve "Son" linkleri ekleyin.
4. **JS'siz çalışmalı.** `<select>` seçerseniz onu `<form method="get">` içine sarın ve
   `<noscript>` olmadan da submit edilebilir olsun. `hrefFor` zaten sorgu dizesi üretiyor;
   form'un `action` ve gizli alanlarını ondan türetin.
   Numaralı link yaklaşımı bu sorunu tamamen ortadan kaldırır — tercih sebebi.
5. Mobilde taşmasın: 375px'te numaralar sarmasın, gerekirse gösterilen numara sayısını azaltın.
6. Her sayfa hedefi ≥24px (görev 19 ile tutarlı).

## Doğrulama

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

Elle: çok sayfalı bir başlık bulun (`/gundem`'de entry sayısı yüksek olanlara bakın),
son sayfaya tek etkileşimle gidin. JS'i kapatıp tekrar deneyin.

## Bitti kriteri

- [ ] Çok sayfalı bir listede herhangi bir sayfaya tek etkileşimle gidiliyor
- [ ] JS kapalıyken de çalışıyor
- [ ] 375px'te sarmıyor
- [ ] Dört kullanım yerinin hepsinde doğru URL üretiliyor (`hrefFor` sözleşmesi korundu)
- [ ] Aktif sayfa `aria-current="page"` taşıyor

## Dokunmayın

- `hrefFor` prop sözleşmesi — imzasını değiştirirseniz dört çağrı yerini de kırarsınız
- Sayfa boyutu (20) mantığı

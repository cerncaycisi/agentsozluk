# 22 · Sayfaya atlamalı sayfalama

**Plan kalemi:** P1-9 · **Boyut:** S · **Ön koşul:** yok

## Bağlam

`src/components/ui/pagination-links.tsx` yalnız "Önceki sayfa" / "Sonraki sayfa" ve
"Sayfa N / M" metni sunuyor. 50 sayfalık bir başlıkta 25. sayfaya gitmek 24 tıklama demek.

**Benchmark:** Ekşi'de `.pager` bir `<select>` — canlıda incelenen başlıkta
`data-pagecount="104"` ve 104 seçenek. Tek etkileşimle herhangi bir sayfaya gidiliyor.

Bileşen **17 dosyada, 18 yerde** kullanılıyor (6'sı genel yüzey, 11'i moderasyon).
Hepsi `hrefFor(page)` ile kendi URL'sini üretiyor ve şekiller birbirinden farklı
(`?page=`, `/ara?q=…&type=…&page=`, `topicUrlWithQuery(...)`) — bu sözleşmeyi koruyun.

Bu sayı `<select>` yaklaşımını pratikte eler: `hrefFor` bir string URL döndürdüğü için
18 farklı sorgu şeklinden form `action`'ı ve gizli alanları güvenilir biçimde türetmek
sözleşmeyi kırmadan mümkün değil. **Numaralı link yaklaşımını seçin.**

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
   "İlk"/"Son" metin linklerini mobilde gizlemek kabul edilebilir — `1` ve `104` numaraları
   aynı işi görüyor. "Önceki/Sonraki" ok simgesine inebilir, ama `aria-label` tam metni korumalı.
6. Her sayfa hedefi ≥24px (görev 19 ile tutarlı).
7. **Aktif sayfa link olmasın** — `<span aria-current="page">` kullanın. Bulunduğu sayfaya
   link vermek ekran okuyucuda gereksiz gürültü.
8. **"İlk"/"Son" yalnız bir yere götürdüklerinde render edilsin** — sayfa 1'deyken "İlk"
   gösterilmemeli.

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
- [ ] 18 kullanım yerinin hepsinde doğru URL üretiliyor (`hrefFor` sözleşmesi korundu)
- [ ] Aktif sayfa `aria-current="page"` taşıyor

## Dokunmayın

- `hrefFor` prop sözleşmesi — imzasını değiştirirseniz dört çağrı yerini de kırarsınız
- Sayfa boyutu (20) mantığı

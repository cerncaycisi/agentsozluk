# D2 · Entry kartı → akan liste

**Boyut:** M · **Ön koşul:** yok (D1 ile paralel gidebilir, farklı dosyalar)

## Bağlam

Her entry `surface-card p-5` ile kutuya alınıyor: kenarlık + yarıçap + (eskiden) gölge +
20px padding. "Bu bir entry" demek için dört görsel araç.

Ekşi'de entry `padding: 15px 0`, kenarlık **yok**, zemin **yok**. Normal Sözlük'te hafif
ayraç. İkisi de kart kullanmıyor — çünkü sözlük okuma ürünü, kartlar okumayı böler ve
yoğunluğu tavanlar.

## Okunacak

- `src/components/entries/entry-preview.tsx` — kart sarmalayıcısı ve footer
- `src/app/baslik/[topic]/page.tsx`, `src/app/debe/page.tsx`,
  `src/components/topics/topic-sampler-feed.tsx` — entry listeleri
- `src/app/globals.css` — `.prose-measure` hazır

## Yapılacak

1. `EntryPreview`'ın kök `<article>`'ından `surface-card` kalkar. Yerine: üstte ince ayraç
   (`border-t`) ve dikey padding. Liste sarmalayıcısı `space-y-*` yerine ayraçla ritim kurar.
2. Gövde metnine `.prose-measure` eklenir — 66ch'i aşmaz.
3. Kart padding'i (`p-5`) kalkar; yatay padding sıfır, dikey ~18px.
4. `scroll-mt-28` kalır (sticky header için).
5. **Kırpma mekanizması bozulmasın**: `collapsible` durumunda `peer` checkbox → kırpılan
   kutu → iki label aynı ebeveynde ve bu sırada kalmalı. Testi var, koşun.
6. `/debe`'deki sıra numarası rozeti ve ana sayfadaki blok yapısı buna göre hizalanır.

## Doğrulama

```bash
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test:unit
```

Tarayıcıda `/`, `/gundem`, bir başlık sayfası, `/debe`, `/yazar/<biri>` — ekran görüntüsü alın.
Ölçün: 1280px'te bir başlık sayfasında kaydırmadan görünen entry sayısı **artmalı**.

## Bitti kriteri

- [ ] Entry'ler kutu içinde değil, ayraçla ayrılmış akan liste
- [ ] Gövde metni 66ch'i aşmıyor
- [ ] Kırpma (`collapsible`) hâlâ çalışıyor, DOM sırası testi geçiyor
- [ ] Ekranda görünen entry sayısı arttı, ölçümle gösterildi

## Dokunmayın

- Entry aksiyonları ve ⋮ menüsünün işlevi
- `EntryBody` tokenizasyonu

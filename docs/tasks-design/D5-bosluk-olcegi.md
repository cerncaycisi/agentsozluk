# D5 · Boşluk ölçeği 4px tabanına

**Boyut:** M · **Ön koşul:** D1-D4 bitmiş olmalı (hepsi boşluğa dokunuyor)

## Bağlam

Ölçülen: `mt-1`(131), `mt-2`(90), `mt-3`(60), `mt-4`(86), `mt-5`(57), `mt-6`(6), `mt-7`(13),
`mt-8`(11), `mt-24`(9). Padding'de `p-3`(61), `p-4`(66), `p-5`(53), `p-6`(53).

Ritim yok — her değer serbestçe kullanılmış. Sonuç: dikey ritim tutarsız, sayfalar birbirine
benzemiyor.

## Yapılacak

Ölçek: **4 / 8 / 12 / 16 / 24 / 32 / 48** → Tailwind'de `1 / 2 / 3 / 4 / 6 / 8 / 12`.

`5` ve `7` ölçek dışı — kaldırın:

- `mt-5` (20px) → bağlama göre `mt-4` (16px) veya `mt-6` (24px)
- `mt-7` (28px) → `mt-6` (24px) veya `mt-8` (32px)
- `p-5` (20px) → `p-4` (16px) veya `p-6` (24px)

**Rol bazlı karar verin, toplu değiştirmeyin:**

| Bağlam                | Değer           |
| --------------------- | --------------- |
| Etiket ↔ kontrolü     | `mt-1` (4px)    |
| İlişkili öğeler arası | `mt-2` (8px)    |
| Blok içi ayrım        | `mt-4` (16px)   |
| Bölümler arası        | `mt-6` / `mt-8` |
| Sayfa bölümleri       | `mt-12`         |

## Doğrulama

```bash
grep -rnE '\b[mp][trblxy]?-(5|7)\b' src/    # boş dönmeli
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test:unit
```

Beş sayfada 375px ve 1280px ekran görüntüsü — dikey ritim tutarlı görünmeli, hiçbir yerde
sıkışma veya kopukluk olmamalı.

## Bitti kriteri

- [ ] `5` ve `7` boşluk değerleri kod tabanında yok
- [ ] Dikey ritim beş sayfada tutarlı, ekran görüntüsüyle gösterildi
- [ ] Hiçbir sayfada öğeler birbirine yapışmıyor veya kopmuyor

## Dokunmayın

- `globals.css` içindeki `.page-main` ve `.button-*` padding'leri (zaten sisteme uygun)

# 05 · İçerik genişliğini tek yerden yönet

**Plan kalemi:** P2-21 · **Boyut:** S · **Ön koşul:** yok

## Bağlam

15 ayrı yerde aynı `main` sınıf dizisi kopyalanmış:
`mx-auto max-w-[820px] px-4 py-10 sm:px-6`

Biri tutarsız: `src/app/takip/yazarlar/page.tsx:41` → `max-w-[920px]`.

## Okunacak dosyalar

```bash
grep -rn 'max-w-\[8\|max-w-\[9' src/app src/components
```

Beklenen çıktı (15 satır): `ara`, `baslik/[topic]`, `baslik/ac`, `debe`, `entry/[id]`,
`entry/[id]/revizyonlar`, `takip/yazarlar` (920px), `yazar/[username]`,
`components/account/personal-list-page`, `components/content/information-page`,
`components/moderation/moderation-nav`, `components/topics/feed-page`.

`src/components/layout/site-shell.tsx`'teki `max-w-[1240px]` **kabuk genişliği**, farklı bir şey — dokunmayın.

## Yapılacak

1. `src/app/globals.css` → `@layer components` bloğuna:
   ```css
   .page-main {
     @apply mx-auto max-w-[820px] px-4 py-10 sm:px-6;
   }
   ```
2. Yukarıdaki 15 yerde `className="mx-auto max-w-[820px] px-4 py-10 sm:px-6"` → `className="page-main"`.
3. `takip/yazarlar/page.tsx:41`'i de `page-main`'e çevirin — 920px'ten 820px'e iner, kasıtlı.

Bir `main` ek sınıf taşıyorsa (`className="mx-auto max-w-[820px] ... başka-sınıf"`),
`className="page-main başka-sınıf"` yapın.

## Doğrulama

```bash
grep -rn 'max-w-\[820px\]\|max-w-\[920px\]' src/app src/components   # boş dönmeli
grep -rn 'page-main' src/ | wc -l                                     # 16 olmalı (15 kullanım + 1 tanım)
pnpm lint && pnpm typecheck && pnpm test
```

## Bitti kriteri

- [ ] Genişlik tek yerden (`globals.css`) tanımlı
- [ ] `/takip/yazarlar` diğer sayfalarla aynı genişlikte
- [ ] Hiçbir sayfada yatay kaydırma yok (375px'te kontrol edin)

## Dokunmayın

- `site-shell.tsx`'teki `max-w-[1240px]` kabuk genişlikleri
- `max-w-xs`, `max-w-2xl` gibi bileşen içi genişlikler

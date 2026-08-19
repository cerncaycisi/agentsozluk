# 04 · Form kontrol kenarlığı kontrastı

**Plan kalemi:** P2-16 · **Boyut:** S · **Ön koşul:** görev 01 (aynı dosyaya dokunuyor, çakışmasın)

## Bağlam

`globals.css`'te `* { border-color: rgb(var(--border)); }` ile tüm kenarlıklar tek bir tokendan geliyor.
Ölçülen kontrast:

| | oran |
|---|---|
| `--border` / `--surface` (açık) | 1.36:1 |
| `--border` / `--surface` (koyu) | 1.40:1 |

Kart kenarlıkları için sorun değil (dekoratif). Ama **form kontrollerinin sınırı** WCAG 2.x
1.4.11 (Non-text Contrast) uyarınca en az **3:1** olmalı — kullanıcının input'un nerede
başlayıp bittiğini görmesi gerekiyor. Şu an input'lar zeminden neredeyse ayırt edilemiyor.

## Okunacak dosyalar

- `src/app/globals.css` — token blokları ve `*` kenarlık kuralı
- `src/components/ui/form-field.tsx` — `FormField` ve `FormTextarea`, ikisi de `rounded-xl border bg-page`
- Doğrudan `border` sınıfı kullanan diğer form kontrolleri:
  ```bash
  grep -rn '<input\|<textarea\|<select' src/ | grep -n 'border'
  ```

## Yapılacak

1. `globals.css`'te üç tema bloğunun her birine `--border-strong` ekleyin.
   Başlangıç önerisi — **hesaplayarak doğrulayın, körlemesine kopyalamayın**:
   - açık: `148 156 170`
   - koyu: `90 100 118`
2. `@layer components` içine:
   ```css
   .field-border {
     border-color: rgb(var(--border-strong));
   }
   ```
3. `form-field.tsx`'teki `input` ve `textarea`'ya `field-border` ekleyin.
4. Doğrudan `border` kullanan diğer form kontrollerine de ekleyin. Bilinen yerler:
   - `src/components/layout/site-shell.tsx` header arama input'u
   - `src/app/baslik/[topic]/page.tsx` başlık içi arama input'u
   - `src/app/ara/page.tsx` arama input'u
   - `src/components/entries/entry-actions.tsx` düzenleme textarea'sı

## Doğrulama

Kontrast hesabı — ikisi de ≥ 3.0 olmalı:
- açık tema `--border-strong` / `--surface` (255 255 255)
- koyu tema `--border-strong` / `--surface` (25 30 39)

Ayrıca `--border-strong` / `--page` çiftini de kontrol edin (input'lar `bg-page` kullanıyor,
`bg-surface` değil) — asıl önemli olan bu.

```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Bitti kriteri

- [ ] Form kontrol kenarlığı / input zemini ≥ 3:1, **her iki temada**
- [ ] Kart kenarlıkları (`surface-card`) değişmedi — hâlâ yumuşak `--border`
- [ ] Focus halkası (`:focus-visible` outline) etkilenmedi

## Dokunmayın

- `* { border-color: ... }` genel kuralı — kaldırmayın, kartlar ona bağlı
- `--border` token değeri

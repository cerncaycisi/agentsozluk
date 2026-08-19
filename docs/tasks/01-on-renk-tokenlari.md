# 01 · Renk tokenları: `--on-primary`, `--on-accent`, `--on-destructive`

**Plan kalemi:** P0-1 · **Boyut:** S · **Ön koşul:** yok

## Bağlam

Agent Sözlük (Next.js + Tailwind) renklerini `src/app/globals.css` içindeki CSS değişkenlerinden alıyor.
Koyu temada dolgulu butonlarda beyaz metin kullanılıyor ve WCAG AA'yı geçemiyor:

| Kombinasyon (koyu tema)               | Ölçülen oran | Gerekli |
| ------------------------------------- | ------------ | ------- |
| beyaz / `--primary` (139 139 245)     | **2.95:1**   | 4.5:1   |
| beyaz / `--destructive` (249 112 102) | **2.79:1**   | 4.5:1   |
| beyaz / `--accent` (242 139 103)      | **2.42:1**   | 4.5:1   |

Bu görev **yalnız tokenları tanımlar**. Kullanım yerlerinin değiştirilmesi görev 02'de.

## Okunacak dosyalar

- `src/app/globals.css` — üç tema bloğu var: `:root`, `@media (prefers-color-scheme: dark)` içindeki `:root:not([data-theme="light"])`, ve `:root[data-theme="dark"]`
- `tailwind.config.ts`

## Yapılacak

1. `globals.css`'te **üç tema bloğunun her birine** ekleyin:
   - Açık tema (`:root`): `--on-primary: 255 255 255; --on-accent: 24 33 47; --on-destructive: 255 255 255;`
     **`--on-accent` açık temada beyaz DEĞİL.** Beyaz, `--accent` (217 108 74) üzerinde
     yalnız 3.39:1 verir — AA'nın altında. `24 33 47` (= `--ink` değeri) 4.77:1 verir.
   - Her iki koyu blok: `--on-primary: 16 19 24; --on-accent: 16 19 24; --on-destructive: 16 19 24;`
     (`16 19 24` = koyu temanın `--page` değeri)
2. `tailwind.config.ts` → `theme.extend.colors`:
   ```ts
   "on-primary": "rgb(var(--on-primary) / <alpha-value>)",
   "on-accent": "rgb(var(--on-accent) / <alpha-value>)",
   "on-destructive": "rgb(var(--on-destructive) / <alpha-value>)",
   ```

## Doğrulama

**Altı kombinasyonun hepsini** hesaplayın (WCAG formülü, `(L1+0.05)/(L2+0.05)`).
Yalnız birkaçını kontrol etmeyin — bu görevin ilk uygulamasında `--on-accent`'in açık tema
değeri tam da bu yüzden gözden kaçtı.

| Tema | Kombinasyon                               | Beklenen |
| ---- | ----------------------------------------- | -------- |
| açık | `255 255 255` / `91 91 214` (primary)     | 5.37     |
| açık | `24 33 47` / `217 108 74` (accent)        | 4.77     |
| açık | `255 255 255` / `180 35 24` (destructive) | 6.57     |
| koyu | `16 19 24` / `139 139 245` (primary)      | 6.30     |
| koyu | `16 19 24` / `242 139 103` (accent)       | 7.68     |
| koyu | `16 19 24` / `249 112 102` (destructive)  | 6.68     |

Hepsi ≥ 4.5 olmalı.

Hesap 4.5'in altında kalırsa değeri koyulaştırın, görevi eksik bırakmayın.

```bash
pnpm lint && pnpm typecheck
```

## Bitti kriteri

- [ ] Üç token, üç tema bloğunun **hepsinde** tanımlı (birinde eksikse tema geçişinde renk kaybolur)
- [ ] Tailwind `colors` içinde üçü de var
- [ ] Yukarıdaki **altı** kontrast hesabının hepsi ≥ 4.5

## Dokunmayın

- Mevcut token değerleri (`--primary`, `--accent`, `--destructive`, `--page`, `--ink` …) değişmeyecek
- `.button-primary` ve diğer bileşen sınıfları bu görevde değişmeyecek — görev 02'de

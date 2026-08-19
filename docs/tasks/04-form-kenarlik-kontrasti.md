# 04 · Form kontrol kenarlığı kontrastı

**Plan kalemi:** P2-16 · **Boyut:** S · **Ön koşul:** görev 01 (aynı dosyaya dokunuyor, çakışmasın)

## Bağlam

`globals.css`'te `* { border-color: rgb(var(--border)); }` ile tüm kenarlıklar tek bir tokendan geliyor.
Ölçülen kontrast:

|                                 | oran   |
| ------------------------------- | ------ |
| `--border` / `--surface` (açık) | 1.36:1 |
| `--border` / `--surface` (koyu) | 1.40:1 |

Kart kenarlıkları için sorun değil (dekoratif). Ama **form kontrollerinin sınırı** WCAG 2.x
1.4.11 (Non-text Contrast) uyarınca en az **3:1** olmalı — kullanıcının input'un nerede
başlayıp bittiğini görmesi gerekiyor. Şu an input'lar zeminden neredeyse ayırt edilemiyor.

## Okunacak dosyalar

- `src/app/globals.css` — token blokları ve `*` kenarlık kuralı
- `src/components/ui/form-field.tsx` — `FormField` ve `FormTextarea`, ikisi de `rounded-xl border bg-page`
- Doğrudan `border` sınıfı kullanan diğer form kontrolleri.
  **Satır bazlı grep işe yaramaz** — JSX'te `className` çoğu zaman ayrı satırda, bu yüzden
  `grep '<input' | grep 'border'` sıfır sonuç döndürür ve yanlışlıkla "başka yer yok"
  sonucuna varmanıza yol açar. Çok satırlı eşleşme kullanın:
  ```bash
  python3 - <<'EOF'
  import re, pathlib
  for p in pathlib.Path('src').rglob('*.tsx'):
      t = p.read_text()
      for m in re.finditer(r'<(input|textarea|select)\b[^>]*?>', t, re.S):
          if 'className' in m.group(0) and re.search(r'\bborder\b', m.group(0)) \
             and 'field-border' not in m.group(0):
              print(f"{p}:{t[:m.start()].count(chr(10))+1}")
  EOF
  ```
  Bu tarama sonrası kalan 16 ham kontrolün **hepsi `src/app/moderasyon/**` altındadır\*\* ve
  plan gereği kapsam dışıdır. Genel yüzeyde kalan yok.

## Yapılacak

1. `globals.css`'te üç tema bloğunun her birine `--border-strong` ekleyin.
   Doğrulanmış değerler:
   - açık: `130 138 154` → page 3.23:1, surface 3.47:1
   - koyu: `100 110 128` → page 3.62:1, surface 3.25:1

   **Sınırlayıcı çift her temada farklı:** açık temada `--page` (247 247 242) daha zor,
   koyu temada `--surface` (25 30 39) daha zor. Input'lar `bg-page` kullanıyor ama kart
   içinde surface'a komşu olabiliyor — ikisini birden ≥3 tutun, yalnız birine bakmayın.

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

# 09 · Mobil arama ikonu ve açılır panel

**Plan kalemi:** P0-3 · **Boyut:** M · **Ön koşul:** görev 08 bitmiş olmalı

## Bağlam

`site-shell.tsx:362`'deki header arama formu `hidden ... sm:block` — **640px altında yok**.
375px'te sözlükte arama yapmanın header'dan hiçbir yolu bulunmuyor.

**Karar: ikon + açılır panel** (Normal Sözlük deseni), Ekşi'nin "input hep açık" deseni değil.
Gerekçe: ilk entry şu an 375px'te 337px'te başlıyor (viewport'un %41'i). Input'u hep açık
tutmak header'ı büyütüp bu sorunu derinleştirirdi.

## Okunacak dosyalar

- `src/components/layout/site-shell.tsx` — header satır 1, arama formu (362-382)
- `src/components/layout/account-menu.tsx` — projedeki Radix + focus yönetimi örneği
- Drawer'daki focus trap ve Esc mantığı (`site-shell.tsx:289-318`) — aynı deseni izleyin

## Yapılacak

1. `<640px`: arama formu yerine **büyüteç ikon butonu** (`lucide-react` `Search`, zaten import edili).
   - `min-h-11 min-w-11` (44×44)
   - `aria-label="Aramayı aç"`, `aria-expanded`, `aria-controls="mobil-arama"`
2. Tıklanınca header'ın **altında**, tam genişlikte arama paneli açılsın:
   - Mevcut `<form action="/ara" role="search">` yapısını yeniden kullanın — yeni bir arama
     mekanizması yazmayın
   - `id="mobil-arama"`
   - Açılışta input'a focus
   - **Esc** ile kapanma, kapanınca focus tetikleyici butona dönsün
   - Dışarı tıklayınca kapanma
3. `≥640px`: mevcut inline form aynen korunur, ikon görünmez.
4. Panel açıkken sayfa kaydırmasını **kilitlemeyin** — bu bir modal değil, açılır bir satır.

## Doğrulama

Klavye ile tam turu deneyin: Tab ile ikona gel → Enter → input'a focus düştü mü →
yaz → Enter ile `/ara`'ya gitti mi → geri gel → Esc ile kapandı mı → focus ikona döndü mü.

375px'te:

```js
document.querySelector("header").getBoundingClientRect().height; // panel kapalıyken ≤110
```

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

## Bitti kriteri

- [ ] 375px'te aramaya **1 dokunuşla** ulaşılıyor
- [ ] Panel kapalıyken header ≤110px
- [ ] Esc kapatıyor ve focus'u geri veriyor
- [ ] `aria-expanded` doğru değeri taşıyor
- [ ] ≥640px'te davranış değişmedi

## Dokunmayın

- `/ara` sayfası
- Arama önerisi/autocomplete — görev 26 ve 27. Bu görev yalnız formun **erişilebilirliğini** çözüyor.
  Ama panelin DOM yapısını görev 27'nin combobox'ı sarabilecek şekilde temiz bırakın.

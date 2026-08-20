# D1 · Ağırlık süpürmesi

**Boyut:** L · **Ön koşul:** yok

## Bağlam

Kod tabanında `font-black` **123**, `font-bold` **225** kez kullanılıyor — toplam 348 ağır
ağırlık. Buna karşılık `font-normal` + `font-medium` yalnız 12.

Ölçüldü: Ekşi'nin tüm başlık sayfasında `font-weight: 700` **dört** öğede var, 1014 öğe 400.
Normal Sözlük'te 700 altı öğede, 1318 öğe 400. Hiyerarşiyi ağırlıkla kurmuyorlar.

Yazı tipi artık IBM Plex Sans ve **yalnız 400/500/600 yükleniyor** — `font-bold` (700) ve
`font-black` (900) tarayıcıda sentetik kalınlaştırmaya düşüyor, ki bu çirkin görünür.
Yani bu yalnız estetik değil, teknik bir zorunluluk.

## Okunacak

- `src/app/globals.css` — `.title-page`, `.title-section`, `.title-item`, `.eyebrow` hazır
- `grep -rn "font-black\|font-bold" src/`

## Yapılacak

Her kullanımı rolüne göre eşleyin — toplu `sed` yapmayın, bağlama bakın:

| Bugün                                       | Rol                  | Olacak                                     |
| ------------------------------------------- | -------------------- | ------------------------------------------ |
| `text-3xl font-black`                       | sayfa başlığı (`h1`) | `.title-page`                              |
| `text-2xl font-black` / `text-xl font-bold` | bölüm başlığı (`h2`) | `.title-section`                           |
| `text-lg font-bold`                         | kart/başlık linki    | `.title-item`                              |
| `text-xs font-bold uppercase`               | üst etiket           | `.eyebrow`                                 |
| `font-bold` (gövde içi vurgu)               | sayaç, puan          | `font-medium`                              |
| `font-semibold` (buton)                     | —                    | `.button-*` zaten taşıyor, sınıfı kaldırın |

**Hiçbir yerde `font-bold` veya `font-black` kalmayacak.** Vurgu gerekiyorsa `font-medium`
(500) veya `font-semibold` (600) kullanın.

`logo`: `text-lg font-black` → `.title-item` değil; logo `font-semibold` + biraz
`tracking-tight` olsun, marka öğesi.

## Doğrulama

```bash
grep -rn "font-black\|font-bold" src/     # boş dönmeli
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test:unit
```

Gerçek tarayıcıda `/`, `/gundem`, bir başlık sayfası ve `/yazar/<biri>` açın; ekran
görüntüsü alın. Sentetik kalınlaştırma izi (bulanık/şişmiş harfler) kalmamalı.

## Bitti kriteri

- [ ] `font-black` ve `font-bold` kod tabanında yok
- [ ] Sayfa başlıkları, bölüm başlıkları ve etiketler ölçek sınıflarını kullanıyor
- [ ] Testlerdeki sınıf iddiaları güncellendi
- [ ] Dört sayfada ekran görüntüsüyle doğrulandı

## Dokunmayın

- `globals.css` ölçek tanımları (hazır, kullanın)
- Renk sınıfları

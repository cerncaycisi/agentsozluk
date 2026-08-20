# D4 · Yarıçap ve gölge normalizasyonu

**Boyut:** M · **Ön koşul:** D2 ve D3 bitmiş olmalı (onlar da yarıçapa dokunuyor)

## Bağlam

Ölçülen kullanım: `rounded-xl` **146**, `rounded-lg` **69**, `rounded-full` 10,
`rounded-2xl` 8, `rounded-md` 2. Beş farklı yarıçap, sistem yok.

Benchmarklar: Ekşi 3px, Normal Sözlük 4px. İkisi de tek değer.

Hedef **iki** değer:

- `rounded` (4px) — kontroller: buton, input, çip, ikon düğmesi
- `rounded-lg` (8px) — yüzeyler: kart, açılır menü, panel

`rounded-full` yalnız gerçekten dairesel olması gerekenlerde kalır (avatar, nokta rozeti).

## Okunacak

```bash
grep -rn "rounded-" src/ | grep -v globals.css
```

## Yapılacak

1. `rounded-xl` ve `rounded-2xl` → rolüne göre `rounded` veya `rounded-lg`.
2. `rounded-md` → `rounded`.
3. `rounded-full` kullanımlarını gözden geçirin: rozet/nokta ise kalsın, buton ise `rounded`.
4. **Gölge:** `shadow-sm`, `shadow-xl`, `shadow-2xl` gibi tüm gölgeler kalkar.
   İstisna: portal içinde açılan menü/dialog — zeminden ayrılması gerekiyor, orada
   `shadow-lg` kalabilir ama `border` ile birlikte, ikisi birden değil tercihen kenarlık.

## Doğrulama

```bash
grep -rn "rounded-xl\|rounded-2xl\|rounded-md" src/    # boş
grep -rn "shadow-" src/ | grep -v "DropdownMenu\|AlertDialog"   # boş veya gerekçeli
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test:unit
```

## Bitti kriteri

- [ ] Yalnız `rounded`, `rounded-lg` ve gerekçeli `rounded-full` kaldı
- [ ] Yüzeylerde gölge yok
- [ ] Açılır menüler hâlâ zeminden ayırt edilebiliyor (ekran görüntüsüyle)

## Dokunmayın

- `globals.css` bileşen sınıfları

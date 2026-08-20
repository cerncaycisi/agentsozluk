# D3 · Çipler ve butonlar sisteme geçiyor

**Boyut:** M · **Ön koşul:** yok

## Bağlam

Sıralama şeridi, zaman penceresi şeridi ve indeks sekmeleri aktif durumda **dolgulu birincil
renk** kullanıyor (`bg-primary text-on-primary`). Sıralama değiştiren bir kontrolün birincil
buton ağırlığı taşımasına gerek yok — üstelik başlık sayfasında artık iki şerit var, ikisi de
dolgu kullanınca sayfa bağırıyor.

`globals.css`'te `.chip` ve `.chip-active` hazır: aktif durum dolgusuz, kiremit metin +
%6 kiremit zemin + kiremit kenarlık.

## Okunacak

- `src/app/globals.css` — `.chip`, `.chip-active`, `.button-primary`, `.button-secondary`
- `src/app/baslik/[topic]/page.tsx` — sıralama ve zaman penceresi şeritleri
- `src/components/layout/site-shell.tsx` — header nav şeridi
- `src/app/yazar/[username]/page.tsx` — profil sekmeleri
- `src/app/ara/page.tsx` — arama türü radyoları

## Yapılacak

1. Sıralama, zaman penceresi ve profil sekmeleri `.chip` / `.chip-active` kullanır.
2. Header nav şeridi de aynı dile geçer — aktif öğe `.chip-active` değil ama aynı mantık:
   dolgu yok, kiremit metin + alt çizgi veya hafif zemin. Nav'ın çipten görsel olarak
   ayrışması iyi; ikisi aynı görünmesin.
3. Entry oy düğmelerinin aktif hali: artı oy `bg-primary`, eksi oy `bg-accent`
   (artık nötr kurşuni). İkisi de `text-on-*` taşıyor, dokunmayın — yalnız yarıçapları
   sisteme uysun.
4. `button-primary` / `button-secondary` sınıflarını taşıyan yerlerden fazladan
   `font-semibold`, `rounded-xl`, `px-5` gibi geçersiz kılmaları temizleyin — sınıf zaten
   taşıyor.

## Doğrulama

```bash
grep -rn "bg-primary text-on-primary" src/    # yalnız oy/favori düğmelerinde kalmalı
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test:unit
```

375px ve 1280px'te başlık sayfası ekran görüntüsü — iki şerit de sakin görünmeli, sayfa
"bağırmamalı".

## Bitti kriteri

- [ ] Sıralama, zaman penceresi ve profil sekmeleri dolgusuz aktif durum kullanıyor
- [ ] Nav şeridi çiplerden görsel olarak ayrışıyor
- [ ] Buton sınıflarında gereksiz geçersiz kılma kalmadı
- [ ] İki kırılma noktasında ekran görüntüsüyle doğrulandı

## Dokunmayın

- Oy/favori düğmelerinin renk semantiği
- `globals.css` sınıf tanımları

# 02 · `text-white` → `text-on-*` geçişi

**Plan kalemi:** P0-1 · **Boyut:** S · **Ön koşul:** görev 01 bitmiş olmalı

## Bağlam

Görev 01 `on-primary` / `on-accent` / `on-destructive` Tailwind renklerini tanımladı.
Bu görev, dolgulu zeminlerde sabit `text-white` kullanan tüm yerleri bu tokenlara geçirir.
Koyu temada beyaz metin bu dolgular üzerinde 2.4–3.0:1 kalıyor (AA 4.5 gerektiriyor).

## Okunacak dosyalar

Tam liste (`grep -rn "bg-\(primary\|accent\|destructive\)" src/ | grep text-white` ile üretildi):

| Dosya:satır                                     | Bağlam                                 |
| ----------------------------------------------- | -------------------------------------- |
| `src/app/globals.css:84`                        | `.button-primary` bileşen sınıfı       |
| `src/app/layout.tsx:74`                         | "Ana içeriğe geç" skip-link            |
| `src/app/baslik/[topic]/page.tsx:278`           | aktif sıralama sekmesi                 |
| `src/components/entries/entry-actions.tsx:116`  | aktif artı oy butonu                   |
| `src/components/entries/entry-actions.tsx:129`  | aktif eksi oy butonu (`bg-accent`)     |
| `src/components/entries/entry-actions.tsx:139`  | aktif favori butonu                    |
| `src/components/layout/site-shell.tsx:67`       | aktif indeks sekmesi                   |
| `src/components/layout/site-shell.tsx:126`      | aktif sidebar başlığı                  |
| `src/components/account/security-forms.tsx:205` | yıkıcı işlem butonu (`bg-destructive`) |
| `src/components/account/security-forms.tsx:231` | yıkıcı işlem butonu (`bg-destructive`) |

Ayrıca `src/components/layout/site-shell.tsx:131` `text-white/80` kullanıyor.

**Yukarıdaki grep'in kaçırdığı bir vaka var.** Metin rengi `.button-primary`'den geldiği için
literal `text-white` içermeyen, ama dolgusu değiştirilmiş düğmeler. Bunları ayrıca arayın:

```bash
grep -rn 'button-primary[^"]*bg-' src/
```

Bilinen ikisi: `src/components/entries/entry-actions.tsx:205` ve
`src/components/moderation/confirm-action.tsx:126` — ikisi de `button-primary bg-destructive`,
ikisine de `text-on-destructive` eklenmeli.

## Yapılacak

Her yerde zemine göre eşleştirin:

- `bg-primary` + `text-white` → `text-on-primary`
- `bg-accent` + `text-white` → `text-on-accent`
- `bg-destructive` + `text-white` → `text-on-destructive`
- `site-shell.tsx:131` `text-white/80` → `text-on-primary/80` (aktif sidebar satırının entry sayacı)

**Açık temada `--on-accent` beyaz değil, koyu (`24 33 47`).** Yani `entry-actions.tsx:129`'daki
aktif eksi oy butonunun ikonu açık temada beyazdan koyuya dönecek — bu **kasıtlı**, geri almayın.
Beyaz, accent dolgusu üzerinde 3.39:1 veriyordu (AA altında).

`entry-actions.tsx:205`'teki `className="button-primary bg-destructive"` kombinasyonuna dikkat:
`.button-primary` artık `text-on-primary` taşıyacak, ama zemin `bg-destructive`. Bu düğmede
metin sınıfını da açıkça `text-on-destructive` ile geçersiz kılın.

## Doğrulama

```bash
grep -rn "bg-\(primary\|accent\|destructive\)" src/ | grep "text-white"   # boş dönmeli
grep -rn "text-white" src/                                                 # kalanları gözden geçirin
pnpm lint && pnpm typecheck && pnpm test
```

Kalan `text-white` varsa: yalnız zemini sabit koyu olan (tema ile değişmeyen) yerlerde kabul edilir.
Her birini tek tek gerekçelendirin.

## Bitti kriteri

- [ ] Yukarıdaki grep boş dönüyor
- [ ] Koyu temada birincil buton, aktif oy butonu, aktif sidebar satırı ve skip-link okunabilir
- [ ] Açık temada görsel olarak hiçbir şey değişmedi (açık temada `--on-*` zaten beyaz)

## Dokunmayın

- Token değerleri (görev 01'de tanımlandı)
- Buton geometrisi, padding, radius — yalnız renk sınıfı değişiyor

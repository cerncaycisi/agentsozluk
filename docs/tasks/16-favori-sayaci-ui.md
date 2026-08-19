# 16 · Favori sayacını göster

**Plan kalemi:** P1-8 · **Boyut:** S · **Ön koşul:** görev 14 ve 15 bitmiş olmalı

## Bağlam

Görev 14 bookmark sayısını sorgulara ekledi, görev 15 aksiyon satırını misafire açtı.
Bu görev sayacı görünür kılıyor.

**Benchmark:** Ekşi `favoriteCount`, Normal Sözlük `☆ (6)` — ikisi de misafire açık.

## Okunacak dosyalar

- `src/components/entries/entry-actions.tsx:120` — mevcut skor sayacı
- `src/components/entries/entry-preview.tsx` — `_count` prop'unun aktarımı
- `src/components/entries/entry-actions.tsx:133-142` — favori butonu

## Yapılacak

1. Favori butonunun yanına sayacı ekleyin, skor sayacıyla aynı görsel dilde
   (`entry-actions.tsx:120`: `min-w-8 text-center text-sm font-bold`).
2. Sayı 0 ise sayacı **gizleyin** — sıfırlar entry'yi olumsuz gösterir ve gürültü yaratır.
3. Kullanıcı favoriye ekleyip çıkardığında sayaç iyimser (optimistic) güncellensin;
   `toggleBookmark` zaten `bookmarked` durumunu yerelde tutuyor, aynı desende sayıyı da tutun.
4. `aria-live="polite"` ekleyin — skor sayacında olduğu gibi.

## Doğrulama

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Elle: favorisi olan bir entry bulun, sayaç görünüyor mu; favoriye ekleyin, sayı arttı mı;
çıkarın, azaldı mı; sayfayı yenileyin, sunucudan gelen değerle tutarlı mı.

## Bitti kriteri

- [ ] Favori sayısı >0 olan entry'lerde sayaç görünüyor
- [ ] 0 olanlarda görünmüyor
- [ ] Ekle/çıkar sonrası sayaç anında güncelleniyor ve yenilemeden sonra tutarlı
- [ ] Misafir de sayacı görüyor

## Dokunmayın

- Veri katmanı — görev 14'te bitti
- Skor sayacının tekilleştirilmesi — görev 17

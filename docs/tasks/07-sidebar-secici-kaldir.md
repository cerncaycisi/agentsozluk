# 07 · Sidebar'daki indeks seçicisini kaldır

**Plan kalemi:** P0-2 · **Boyut:** M · **Ön koşul:** görev 06 bitmiş olmalı

## Bağlam

Görev 06 header navigasyonunu gerçek linke çevirdi. Şimdi aynı üç seçenek (Son/Gündem/Yeni)
**iki yerde** duruyor: header'da (artık link) ve sidebar + mobil drawer'da (`TopicIndexControls`).
İkisi aynı `indexFeed` state'ini paylaşıyor.

**Karar:** Seçici yalnız header'da kalacak. Sidebar bulunduğun sayfanın listesini gösterir,
kendi seçicisi olmaz.

**Benchmark dayanağı:** Ekşi'de sol kolonun kendi seçicisi yok — seçici header altındaki şeritte.
Normal Sözlük'te seçici sol kolonun tepesinde ve header'da kopyası yok. **İkisinde de tek yerde.**

## Okunacak dosyalar

`src/components/layout/site-shell.tsx` — tamamı. İlgili bölgeler:

| Satır | Ne |
|---|---|
| 36-37 | `TOPIC_INDEX_STORAGE_KEY`, `TOPIC_INDEX_SCROLL_PREFIX` |
| 51-75 | `TopicIndexControls` bileşeni |
| 117 | sidebar linklerine eklenen `?index=${feed}` |
| 166-190 | `indexFeed` state + localStorage okuma/yazma effect'leri |
| 235-238 | `selectIndexFeed` |
| 426 | sidebar başlığındaki `TopicIndexControls` |
| 517 | drawer'daki `TopicIndexControls` |

## Yapılacak

1. `TopicIndexControls` bileşenini ve her iki kullanımını (426, 517) silin.
2. `indexFeed` state'ini kaldırın. Sidebar'ın hangi feed'i çekeceğini `usePathname()`'den türetin:
   ```
   /son     -> "recent"
   /gundem  -> "trending"
   /yeni    -> "new"
   diğer    -> "recent"   (varsayılan)
   ```
   Bunu küçük bir `feedFromPathname(pathname)` yardımcısına alın.
3. `TOPIC_INDEX_STORAGE_KEY` ve onunla ilgili iki `useEffect`'i (182-190) silin — feed artık
   URL'den geliyor, localStorage'da tutulmasına gerek yok.
4. `selectIndexFeed`'i silin. Mobilde drawer açan yan etkisi de böylece gitmiş olur.
5. `scrollStorageKey` / `TOPIC_INDEX_SCROLL_PREFIX` **kalsın** — kaydırma konumu hatırlama hâlâ
   işe yarıyor, sadece anahtarı artık `feedFromPathname` sonucundan üretilecek.
6. Sidebar başlığındaki `indexLabel(indexFeed)` çağrıları da yeni türetilmiş feed'i kullansın.
7. Sidebar linklerindeki `?index=${feed}` parametresi (117) **şimdilik kalsın** — görev 20
   bunu `?window=` şemasına taşıyacak. Bu görevde şemayı değiştirmeyin.

## Doğrulama

```bash
grep -n "TopicIndexControls\|TOPIC_INDEX_STORAGE_KEY\|selectIndexFeed" src/components/layout/site-shell.tsx
# üçü de bulunmamalı

pnpm lint && pnpm typecheck && pnpm test
pnpm test:e2e
```

Elle:
- `/gundem`'e gidin → sidebar başlığı "Gündem" yazmalı, liste gündem başlıklarını göstermeli
- `/son`'a gidin → sidebar "Son"a geçmeli
- Sayfada indeks seçici **yalnız bir kez** (header'da) görünmeli
- Mobil drawer'ı açın → yalnız başlık listesi olmalı, seçici olmamalı

## Bitti kriteri

- [ ] Sayfada indeks seçici tek bir yerde
- [ ] Sidebar bulunduğunuz sayfayı yansıtıyor
- [ ] localStorage'da `ajan_topic_index` artık yazılmıyor
- [ ] Kaydırma konumu hatırlama hâlâ çalışıyor

## Dokunmayın

- `?index=` query şeması — görev 20'de değişecek
- Sidebar'ın veri çekme mantığı (`/api/v1/topics?feed=...`) — yalnız feed'in **kaynağı** değişiyor

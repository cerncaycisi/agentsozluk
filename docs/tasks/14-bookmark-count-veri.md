# 14 · Bookmark sayısı: veri katmanı

**Plan kalemi:** P1-8 · **Boyut:** M · **Ön koşul:** yok

## Bağlam

Entry'lerin kaç kez favorilendiği hiçbir sorguda dönmüyor, dolayısıyla UI'da gösterilemiyor.
Karar: favori sayacı herkese açık gösterilecek (görev 16), bu görev veriyi hazırlıyor.

**Benchmark:** Ekşi entry `dataset`'inde `favoriteCount` (örnek entry'de 14682) taşıyor ve
gösteriyor. Normal Sözlük entry aksiyon satırında `☆ (6)` olarak gösteriyor.

Bu görev **yalnız veri katmanı** — UI değişikliği görev 16'da.

## Okunacak dosyalar

- `prisma/schema.prisma` — bookmark modelinin adı ve entry ile ilişkisi
- `src/modules/entries/application/entries.ts` — `getTopicEntries`
- `src/modules/feeds/application/feeds.ts` — `getDebe`, `getTopicFeed`
- `src/modules/interactions/application/interactions.ts` — `getViewerEntryStates`,
  mevcut bookmark sorgusu deseni
- `src/components/entries/entry-preview.tsx:10-22` — `EntryPreviewItem` arayüzü

## Yapılacak

1. Entry döndüren sorgulara Prisma `_count` ile bookmark sayısını ekleyin:
   ```ts
   _count: { select: { bookmarks: true, revisions: true } }
   ```
   `revisions` zaten kullanılıyor (`EntryPreviewItem._count.revisions`) — aynı `_count`
   nesnesine ekleyin, ikinci bir sorgu açmayın.
2. Etkilenecek select'ler — **beş modülde altı yer**, `src/modules/users/**` dahil
   (kolayca gözden kaçıyor):
   | Dosya | Ne besliyor |
   |---|---|
   | `entries/repository/entries.ts` → `entryDetailSelect` | `getEntry`, `getEntryByPublicId`, `getTopicEntries` |
   | `feeds/repository/feeds.ts` → `listDebeEntries` | `getDebe` |
   | `interactions/repository/interactions.ts` → `listUserFollows` | `/takip/yazarlar` |
   | `interactions/repository/interactions.ts` → `listBookmarks` | `getBookmarks` |
   | `interactions/repository/interactions.ts` → `listVotes` | `getVotes` |
   | **`users/repository/profiles.ts`** | `/yazar/[username]` |

   Doğrulama:

   ```bash
   grep -rn "_count: { select:" src/modules/
   ```

   `withEditedIndicator` `_count`'u tamamen düşürüyor (`Omit<T, "_count">`), o yüzden
   sayacı taşıyan yeni bir helper gerekiyor. `withEditedIndicator`'ı **değiştirmeyin** —
   mevcut birim testi ve mutasyon yolları ona bağlı.

3. `EntryPreviewItem` tipine `_count?: { revisions?: number; bookmarks?: number }` şeklinde
   ekleyin — mevcut `revisions` kullanımını kırmayın.
4. Silinmiş/gizlenmiş entry'lerin favorileri **sayılır, filtre uygulanmaz**. Gerekçe:
   `recalculateCounters` (`entries/repository/recalculate.ts`) `score`'u `entry_votes`'tan
   hiçbir filtre olmadan hesaplıyor — ne entry status'ü ne oy verenin durumu. İki sayaç
   simetrik olmalı. Kullanıcı silindiğinde bookmark satırları da oy satırları gibi
   temizleniyor, yani yaşam döngüleri de aynı.
5. **Public API cevaplarına eklemeyin.** `serializePublicEntry` allowlist'i ve
   `replayedPublicEntrySchema` bilinçli bir sınır; sayfalar application katmanını doğrudan
   çağırıyor, UI için API'ye dokunmak gerekmiyor.

## Doğrulama

```bash
pnpm db:generate
pnpm lint && pnpm typecheck
pnpm test:unit && pnpm test:integration
```

Sorgu sayısının artmadığını doğrulayın — `_count` mevcut sorguya ekleniyor, N+1 açmıyor.
Şüpheliyseniz Prisma log'unu açıp bir başlık sayfası isteğindeki sorgu sayısını
öncesi/sonrası karşılaştırın.

## Bitti kriteri

- [ ] Entry döndüren tüm public sorgular bookmark sayısını içeriyor
- [ ] `pnpm typecheck` temiz, mevcut `_count.revisions` kullanımı kırılmadı
- [ ] Sayfa başına sorgu sayısı artmadı
- [ ] Integration testleri geçiyor

## Dokunmayın

- UI — görev 16
- Bookmark ekleme/çıkarma API'si (`/api/v1/entries/[entryId]/bookmark`)
- Şema değişikliği gerekmiyor; migration yazmanız gerekiyorsa **durun ve gerekçesini yazın**

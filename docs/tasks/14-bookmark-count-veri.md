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
2. Etkilenecek fonksiyonlar — hepsini bulun, tahmin etmeyin:
   ```bash
   grep -rn "_count" src/modules/ | grep -i "revision\|entry"
   ```
   En az: `getTopicEntries`, `getDebe`, yazar profili entry sorgusu.
3. `EntryPreviewItem` tipine `_count?: { revisions?: number; bookmarks?: number }` şeklinde
   ekleyin — mevcut `revisions` kullanımını kırmayın.
4. Silinmiş/gizlenmiş entry'lerin favorileri sayılmalı mı? Mevcut `score` davranışıyla
   tutarlı olun — `score` nasıl hesaplanıyorsa aynı filtreyi uygulayın.

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

# 24 · Ana sayfa

**Plan kalemi:** P0-5 · **Boyut:** L · **Ön koşul:** görev 06, 07 ve **13** bitmiş olmalı

## Bağlam

`src/app/page.tsx` şu an sadece bir yönlendirme:

```tsx
export default function HomePage(): never { redirect("/rastgele"); }
```

`/rastgele` de rastgele bir başlığa 302 atıyor. İlk ziyaretçi oryantasyonsuz bir başlıkta
buluyor kendini — canlıda test edildiğinde 2 entry'lik "aktarma süresi" başlığına düşüldü.

**Benchmark deseni (ikisi de canlıda doğrulandı):** Her iki sitenin ana sayfası da aynı
yapıda — sol frame başlık listesi, sağ frame **"başlık + o başlıktan tek entry"**
bloklarının tekrarı. Düz başlık listesi değil, kronolojik akış da değil.

- **Ekşi:** `<section id="content-body">` içinde `#topic`, orada 8 kez
  `<h1 id="title">` + `<ul class="home-page-entry-list">` (blok başına 1 entry)
- **Normal Sözlük:** 20 blok, `<h2>` başlık linki + 1 entry.
  Gösterilen entry'ler eski tarihli ve yenilemede değişmiyor → seçilmiş/önbelleklenmiş örneklem

**Kararlar:**
- Blok sayısı: **10** (Ekşi 8, Normal Sözlük 20 kullanıyor; ikisinin arası)
- Temsilci entry: **en yüksek puanlı**

## Okunacak dosyalar

- `src/app/page.tsx`, `src/app/rastgele/route.ts`
- `src/app/gundem/page.tsx` ve `src/components/topics/feed-page.tsx` — mevcut gündem akışı
- `src/modules/feeds/application/feeds.ts` — `getTopicFeed`, `getDebe`, `getRandomTopic`
- `src/components/entries/entry-preview.tsx` — görev 13'ten sonraki `collapsible` prop'u
- `src/modules/indexing/domain/public-seo.ts` — `publicAlternates`, canonical mantığı

## Yapılacak

1. `page.tsx`'teki `redirect`'i kaldırın.
2. Yeni sorgu — `src/modules/feeds/application/feeds.ts` içine, örn. `getHomeSampler()`:
   - Gündem sıralamasına göre **10 başlık**
   - Her başlık için **en yüksek puanlı aktif entry**
   - **Eşitlikte ikincil sıralama: en yeni.** Puanların çoğu şu an 0 (canlıda ölçüldü),
     bu yüzden eşitlik yaygın olacak — deterministik ve önbelleklenebilir olması için şart
   - **N+1 sorgu açmayın.** Tek bir sorguda veya iki sorguda (başlıklar, sonra `IN` ile
     entry'ler) çözün
3. Yeni bileşen: `src/components/topics/topic-sampler-feed.tsx`
   Her blok:
   - `<h2>` başlık, başlığa link
   - `EntryPreview` — `showTopicTitle={false}` ve **`collapsible`** (görev 13; yoksa tek uzun
     entry sayfayı doldurur)
   - Altında "başlığa git · N entry" satırı
4. Sayfanın altına "gündemin tamamı" → `/gundem`.
5. **SEO:** `/` ve `/gundem` benzer içerik döndürecek. Tek bir canonical seçin ve
   `publicAlternates` ile bildirin. Hangisini seçtiğinizi commit mesajında gerekçelendirin.
6. `/rastgele` bir yol olarak **kalsın**, silmeyin. Footer'da zaten "Rastgele başlık" olarak var.
7. Sidebar (sol frame) zaten `SiteShell`'den geliyor — ayrıca bir şey yapmanız gerekmiyor.

## Doğrulama

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
curl -sI https://localhost:3000/ | head -1     # 200 dönmeli, 302 değil
```

- `/` 200 dönüyor mu
- Kaydırmadan en az 3 farklı başlıktan içerik görünüyor mu
- `/rastgele` hâlâ çalışıyor mu
- Sorgu sayısı makul mü (Prisma log'una bakın; 10 blok için 30 sorgu görüyorsanız N+1 var)
- 375px'te sayfa aşırı uzamıyor mu (görev 13'ün kırpması devrede mi)

## Bitti kriteri

- [ ] `/` 200 dönüyor, başlık + entry blokları gösteriyor
- [ ] 10 blok
- [ ] Her blokta o başlığın en yüksek puanlı entry'si, eşitlikte en yenisi
- [ ] N+1 yok
- [ ] Uzun entry'ler kırpılmış
- [ ] `/rastgele` çalışıyor
- [ ] Canonical bilinçli olarak seçilmiş ve bildirilmiş

## Dokunmayın

- `/gundem` sayfası — kalmaya devam ediyor
- `/rastgele` route handler'ı

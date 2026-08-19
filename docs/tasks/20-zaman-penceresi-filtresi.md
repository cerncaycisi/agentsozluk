# 20 · Başlık sayfasına zaman penceresi filtresi

**Plan kalemi:** P1-10 · **Boyut:** M · **Ön koşul:** görev 07 bitmiş olmalı (`?index=` üretimi orada)

## Bağlam

Başlık sayfasında yalnız sıralama var: `eskiden yeniye · yeniden eskiye · en yüksek puan`
(`baslik/[topic]/page.tsx:269-287`).

Ayrıca **görünmez bir davranış** var: sidebar'dan gelen `?index=recent|trending|new`
parametresi, `page.tsx:176-182`'de sessizce **24 saatlik bir pencere** uyguluyor.
Kullanıcı bunun kontrolünü göremiyor, sadece daha az entry görüyor. Asıl sorun bu.

**Benchmark dengesi — dürüst tablo:**
- **Ekşi:** başlık sayfasında `şükela · son 24 saat · son 1 hafta · son 1 ay · son 3 ay · tümü`
- **Normal Sözlük:** zaman filtresi **yok**; sıralaması `eskiden yeniye · yeniden eskiye ·
  en beğenilen` — yani Agent Sözlük'ün mevcut üçlüsüyle birebir aynı

Yani bu kalem yalnız Ekşi'yi takip ediyor. **Karar: tam kademe eklensin.**

## Okunacak dosyalar

- `src/app/baslik/[topic]/page.tsx` — özellikle 37-59 (`topicIndexFrom`, `topicUrlWithQuery`),
  134-189 (parametre işleme ve `createdAtWindow`), 269-292 (sıralama şeridi)
- `src/modules/entries/application/entries.ts` — `getTopicEntries` ve `createdAtWindow`
- `src/modules/indexing/domain/public-seo.ts` — `robotsForCanonicalView`
- `src/components/layout/site-shell.tsx` — sidebar'ın ürettiği `?index=` linkleri

## Yapılacak

1. Yeni parametre: `?window=24h|1w|1m|3m|all`, varsayılan `all`.
   `createdAtWindow` hesabını buradan türetin — mevcut `index` mantığının genelleştirilmiş hâli.
2. Sıralama şeridinin **yanına ikinci bir şerit**: `24 saat · 1 hafta · 1 ay · 3 ay · tümü`.
   Sıralama şeridiyle aynı görsel dil (`rounded-lg border px-3 py-2 text-sm font-semibold`,
   aktif olan `bg-primary text-on-primary` — görev 02'den sonraki token).
3. **Geriye dönük uyumluluk:** `?index=X` gelirse `?window=24h`'e eşleyin.
   Sidebar'ın ürettiği linkleri (`site-shell.tsx:117`) `?window=24h`'e taşıyın.
   Eski `?index=` linkleri çalışmaya devam etmeli — dışarıda paylaşılmış olabilir.
4. `topicUrlWithQuery` yardımcısını `window` parametresini de taşıyacak şekilde genişletin.
   Sayfalama ve arama linkleri pencereyi korumalı.
5. `robotsForCanonicalView`'a `window` da bir "görünüm parametresi" olarak bildirilmeli
   (`hasViewParameters` hesabı, `page.tsx:79`) — yoksa filtreli görünümler indekslenir.
6. **Mobil:** iki şerit alt alta yer kaplayacak. İkisi de `overflow-x-auto` yatay şerit olmalı,
   **sarmamalı**. Şu an sıralama sekmeleri 375px'te 2 satıra sarıp ~130px yer kaplıyor —
   bu görev onu da düzeltmeli, kötüleştirmemeli.

## Doğrulama

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

Elle:
- Bir başlıkta `?window=1w` seçin, URL paylaşılabilir mi, yenileyince korunuyor mu
- Eski bir `?index=recent` linki hâlâ çalışıyor mu
- Sayfa 2'ye geçince pencere korunuyor mu
- Başlık içi arama yapınca pencere korunuyor mu
- 375px'te iki şerit toplam ≤100px mi ve sarmıyor mu

## Bitti kriteri

- [ ] Beş kademe de çalışıyor, URL'de görünüyor
- [ ] `?index=` geriye dönük çalışıyor
- [ ] Pencere; sayfalama, sıralama ve arama arasında korunuyor
- [ ] Filtreli görünümler `robots` açısından doğru işaretleniyor
- [ ] 375px'te şeritler sarmıyor

## Dokunmayın

- Sıralama seçeneklerinin kendisi (üçü de kalıyor)
- `getTopicEntries`'in sıralama mantığı — yalnız pencere hesabı genelleşiyor

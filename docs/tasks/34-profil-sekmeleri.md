# 34 · Yazar profiline sekmeler

**Plan kalemi:** P2-18 · **Boyut:** M · **Ön koşul:** yok

## Bağlam

`src/app/yazar/[username]/page.tsx` yalnız üç sayı (aktif entry, açtığı başlık, katılım) ve
son entry'lerin listesini gösteriyor. Bir yazarın açtığı başlıkları görmenin yolu yok.

**Benchmark:** Ekşi profilinde sekmeler var (entry'ler, favoriler, istatistik).

**Kapsam kararı:** Yalnız **iki sekme** — "Entry'ler" ve "Açtığı başlıklar".
Favoriler sekmesi **kapsam dışı**: bir kullanıcının favorilerini herkese açmak ayrı bir
gizlilik kararı gerektirir, bu görevde alınmayacak.

## Okunacak dosyalar

- `src/app/yazar/[username]/page.tsx` — tamamı
- `src/modules/users/` — profil sorgusu; `openedActiveTopicCount` nerede hesaplanıyor bulun
  (sayı zaten var, listesi yok)
- `src/components/ui/pagination-links.tsx` — sekme başına sayfalama gerekiyor
- `src/components/topics/topic-list.tsx` — görev 23'ten sonraki hâli, başlık listesi için

## Yapılacak

1. `?tab=entryler|basliklar` parametresi, varsayılan `entryler`.
   **Sunucu tarafı, link tabanlı sekmeler** — istemci state'i kullanmayın.
   Böylece paylaşılabilir, geri tuşu çalışır, JS'siz de gezilir.
2. Sekme çubuğu: `<nav>` içinde iki `<Link>`, aktif olan `aria-current="page"`.
   Görsel dil olarak başlık sayfasındaki sıralama şeridini izleyin.
3. "Açtığı başlıklar" sekmesi için yeni sorgu: kullanıcının açtığı **aktif** başlıklar,
   `TopicList` ile render edilir (görev 23'ten sonra yoğun liste hâli).
   `openedActiveTopicCount` zaten hesaplanıyor — aynı filtreyi kullanın ki sayı ile liste tutarlı olsun.
4. Sayfalama her sekme için ayrı çalışsın; `hrefFor` hem `tab` hem `page` taşımalı.
5. Sekme etiketlerinde sayıları gösterin: "Entry'ler (128)", "Açtığı başlıklar (14)".
   Sayılar zaten `result.profile` içinde var.
6. Boş durumlar: her sekmenin kendi mesajı olsun.
7. **SEO:** `?tab=basliklar` bir görünüm parametresi. Profil sayfasının canonical'ı
   parametresiz hâle işaret etmeli — `publicAlternates` / `robotsForCanonicalView`
   kullanımını başlık sayfasındaki desenle hizalayın.

## Doğrulama

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

Elle:

- İki sekme arasında gidip gelin, URL değişiyor mu, geri tuşu çalışıyor mu
- Başlık sekmesindeki sayı ile listedeki öğe sayısı tutuyor mu
- Çok başlığı olan bir yazarda sayfalama çalışıyor mu
- JS kapalıyken sekmeler çalışıyor mu

## Bitti kriteri

- [ ] İki sekme, URL'de paylaşılabilir durum
- [ ] Geri tuşu ve JS'siz gezinme çalışıyor
- [ ] Sekme sayıları listelerle tutarlı
- [ ] Her sekmede sayfalama doğru
- [ ] Canonical parametresiz hâle işaret ediyor

## Dokunmayın

- Favoriler — gizlilik kararı alınmadı, kapsam dışı
- Profil başlığındaki üç istatistik bloğu
- `ProfileActions` (takip / engelle / moderasyon)

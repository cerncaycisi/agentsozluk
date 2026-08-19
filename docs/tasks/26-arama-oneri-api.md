# 26 · Arama öneri API'si

**Plan kalemi:** P1-6 · **Boyut:** M · **Ön koşul:** yok

## Bağlam

Sitede hiçbir yerde arama önerisi yok — ne header'da ne `/ara` sayfasında. Bir sözlükte
bu, keşfin ana etkileşimi.

**Benchmark:** Ekşi'nin `/autocomplete/query?q=pen` uç noktası canlıda test edildi, 200 dönüyor:

```json
{"Titles":["pen","pentagram","penguen","pena","marine le pen", ...],
 "Query":"pen",
 "Nicks":["pen","pen red","pena"]}
```

Yani **hem başlık hem yazar** önerisi. Normal Sözlük de aynı işi yapıyor
(placeholder: "başlık ya da @yazar ara...").

Bu görev **yalnız API**. Arayüz görev 27'de.

## Okunacak dosyalar

- `src/modules/search/application/search.ts` — `searchAll`, mevcut arama mantığı
- `src/modules/search/validation/schemas.ts` — `searchTypeSchema`
- `src/modules/search/domain/normalization.ts` — `normalizeSearchQuery`
- `src/app/ara/page.tsx:50-72` — rate limit uygulama deseni
- `src/modules/rate-limit/application/rate-limit.ts` — `RATE_LIMIT_RULES`
- Mevcut bir API rotası, sözleşme için: `src/app/api/v1/feeds/random/route.ts`

## Yapılacak

1. Yeni rota: `src/app/api/v1/search/suggest/route.ts`, `GET`.
2. Girdi: `?q=` — `normalizeSearchQuery` ile normalize edin, 100 karaktere kesin.
   `q.length < 2` ise boş sonuç dönün (hata değil).
3. Çıktı:
   ```json
   { "topics": [{ "title": "...", "url": "..." }], "users": [{ "username": "...", "url": "..." }] }
   ```
   Her biri en fazla **8** öğe.
4. Mevcut `searchAll` mantığını yeniden kullanın — **yeni bir arama motoru yazmayın**.
   Gerekirse `searchAll`'a bir "yalnız başlık/yazar, snippet'siz" modu ekleyin;
   entry gövdesi aramak öneri için gereksiz ve yavaş.
5. **Rate limit zorunlu.** `/ara` sayfasındaki desenin aynısı:
   oturum açmışsa `userRateLimitIdentifier` + `RATE_LIMIT_RULES.searchAuthenticated`,
   değilse `ipRateLimitIdentifier` + `searchVisitor`.
   Öneri uç noktası her tuş vuruşunda çağrılabilir — limit aşılırsa **429** dönün, 500 değil.
6. Yalnız görünür/aktif kayıtlar dönsün — gizlenmiş başlık ve askıya alınmış yazar sızmasın.
   `searchAll`'ın mevcut filtrelerini teyit edin.
7. Yanıt önbellekleme: kısa `Cache-Control` (örn. `public, max-age=30`) uygun olur,
   ama kullanıcıya özel bir şey dönmediğinden emin olun.

## Doğrulama

```bash
pnpm lint && pnpm typecheck
pnpm test:unit && pnpm test:integration
```

Elle:

```bash
curl -s 'http://localhost:3000/api/v1/search/suggest?q=ya' | jq
curl -s 'http://localhost:3000/api/v1/search/suggest?q=a'  | jq   # boş sonuç
```

Hızlı ardışık istek atıp 429 aldığınızı doğrulayın.

## Bitti kriteri

- [ ] 2+ karakterde başlık ve yazar önerisi dönüyor, her biri ≤8
- [ ] <2 karakterde boş sonuç, hata değil
- [ ] Rate limit çalışıyor, aşımda 429
- [ ] Gizlenmiş başlık / askıya alınmış yazar dönmüyor
- [ ] Integration testi yazıldı

## Dokunmayın

- `/ara` sayfası
- `searchAll`'ın mevcut davranışı — genişletin, değiştirmeyin

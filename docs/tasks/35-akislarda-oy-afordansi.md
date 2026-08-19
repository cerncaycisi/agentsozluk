# 35 · `/debe` ve `/yazar` akışlarında oy afordansı

**Boyut:** M · **Ön koşul:** görev 14, 15, 16, 17 bitmiş olmalı

## Bağlam

Görev 17 skoru entry kartının footer'ından kaldırıp `EntryActions`'ın içine taşıdı — skor iki
yerde görünüyordu, tekrar doğru şekilde bitirildi. Ama `EntryActions` yalnız `actions` veya
`guestActions` verildiğinde render ediliyor. Sonuç: **ikisini de geçmeyen sayfalarda skor
tamamen kayboldu.**

Canlı doğrulandı — `/debe`'de entry footer'ında yalnız tarih ve yazar var, skor yok.

Prop geçmeyen sayfalar:

| Sayfa | Misafire açık? | Bugün ne görünüyor |
|---|---|---|
| `/debe` | ✓ | skor yok, oy yok |
| `/yazar/[username]` | ✓ | skor yok, oy yok |
| `/` (ana sayfa) | ✓ | misafirde tamam, **girişli kullanıcıda skor ve oy yok** |
| `/takip/yazarlar` | ✗ (oturum) | skor yok |
| `/favoriler`, `/oylarim`, `/takip` | ✗ (oturum) | skor yok |

**İki ayrı sorun var, ikisini de çöz:**

**a) Skor her yerde görünmeli.** Skor entry verisidir, ziyaretçi durumuna bağlı değil.
`EntryPreview`'da ne `actions` ne `guestActions` verildiğinde salt okunur bir skor render
edilsin — oy düğmesi değil, yalnız sayı (ve favori sayacı). Bu, oturum hesaplamayan tüm
sayfaları tek hamlede düzeltir ve tekrarı geri getirmez.

**b) Herkese açık akışlarda oy afordansı.** `/debe` ve `/yazar/[username]` oturumu hiç
hesaplamıyor. `/baslik/[topic]` desenini uygula: girişliye gerçek `actions`, misafire
`guestActions`.

**Yarım yapılırsa daha kötü olur.** Yalnız `guestActions` eklerseniz misafir düğmeleri görür,
girişli kullanıcı görmez — girişlinin misafirden az görmesi mevcut durumdan da kötü.

`/` (ana sayfa) için: `topic-sampler-feed.tsx` şu an yalnız `guestActions` geçiyor. Girişli
kullanıcı için `actions` da geçmeli. Blocked-author maskeleme (`listBlockedAuthorIds`) burada
tuzak — modül sınırları testi (`module-boundaries.test.ts`) sayfanın repository import etmesini
engelliyor, application katmanından geçir.

## Okunacak dosyalar

- `src/app/baslik/[topic]/page.tsx` — **izlenecek desen burada**: `currentPageSession`,
  `getViewerEntryStates`, `userHasModerationCapability`, `voteMap`/`bookmarkSet` kurulumu
  ve `EntryPreview`'a geçirilen `actions` nesnesi
- `src/app/debe/page.tsx`
- `src/app/yazar/[username]/page.tsx`
- `src/components/topics/topic-sampler-feed.tsx` ve `src/app/page.tsx` — ana sayfa
- `src/components/entries/entry-preview.tsx` — (a) için salt okunur skor modu
- `tests/unit/architecture/module-boundaries.test.ts` — sayfanın neyi import edebileceği
- `src/modules/interactions/application/interactions.ts` — `getViewerEntryStates`
- `src/components/entries/entry-preview.tsx` — `actions` ve `guestActions` prop'ları

## Yapılacak

Her iki sayfada başlık sayfasının desenini uygulayın:

1. `currentPageSession()` ile oturumu al.
2. Oturum varsa ve `status === "ACTIVE"` ise `getViewerEntryStates` ile oy ve favori
   durumlarını çek, `EntryPreview`'a `actions` geçir.
3. Oturum yoksa `guestActions` geçir.
4. `canEdit` / `canReport` / `canBlockAuthor` hesabı başlık sayfasındakiyle aynı mantıkta olsun.
   `/yazar/[username]` özel durum: kendi profiline bakan kullanıcı kendi entry'lerini
   düzenleyebilmeli.
5. **Tek sorgu.** `getViewerEntryStates` sayfadaki tüm entry id'lerini birden alıyor;
   entry başına sorgu açmayın.

## Doğrulama

```bash
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test:unit
```

Çalışan dev sunucuda (`http://localhost:3000`) dört durumu da elle görün:
- misafir `/debe` → oy düğmeleri var, tıklayınca `/giris?next=/entry/N`
- misafir `/yazar/<biri>` → aynı
- girişli `/debe` → gerçek oy düğmeleri, tıklayınca oy veriyor
- girişli kendi profili → kendi entry'lerinde düzenle/sil var

## Bitti kriteri

- [ ] **`EntryPreview` render eden HİÇBİR sayfada skor kayıp değil** — yedi çağrı yerinin
      hepsini tek tek kontrol edin (`grep -rl "<EntryPreview" src/`)
- [ ] `/debe`, `/yazar` ve `/` misafiri oy afordansını görüyor
- [ ] `/debe`, `/yazar` ve `/` girişli kullanıcısı gerçek oy verebiliyor
- [ ] Girişli kullanıcı hiçbir yerde misafirden az şey görmüyor
- [ ] Skor hiçbir yerde iki kez görünmüyor (görev 17'nin çözdüğü sorun geri gelmemiş)
- [ ] Sayfa başına sorgu sayısı entry sayısıyla ölçeklenmiyor
- [ ] Engellenmiş yazarın entry'si maskeli kalıyor ve yanında canlı "engelle" düğmesi çıkmıyor

## Dokunmayın

- `requirePageSession` çağıran sayfalar (`/takip/**`, `/favoriler`, `/oylarim`)
- `EntryPreview` ve `EntryActions` bileşenleri — prop'ları zaten hazır, kullanın

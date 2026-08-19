# 35 · `/debe` ve `/yazar` akışlarında oy afordansı

**Boyut:** M · **Ön koşul:** görev 14, 15, 16, 17 bitmiş olmalı

## Bağlam

Görev 15 misafire oy düğmelerini açtı, ama yalnız oturum durumunu hesaplayan iki sayfada:
`/baslik/[topic]` ve `/entry/[id]`. Bu ikisi `guestActions={!session}` geçiyor.

Herkese açık diğer iki akış — **`/debe` ve `/yazar/[username]`** — oturumu hiç hesaplamıyor,
dolayısıyla `EntryPreview`'a ne `actions` ne `guestActions` geçiyor. Sonuç: o sayfalarda
kimse oy düğmesi görmüyor.

`/takip/yazarlar`, `/favoriler`, `/oylarim` ve `/takip` **kapsam dışı** — hepsi
`requirePageSession()` çağırıyor, misafir zaten ulaşamıyor.

**Dikkat — yarım yapılırsa daha kötü olur.** Yalnız `guestActions={!session}` eklerseniz
misafir düğmeleri görür, giriş yapmış kullanıcı görmez. Girişli kullanıcının misafirden az
şey görmesi mevcut durumdan da kötü. İkisi birlikte yapılmalı.

## Okunacak dosyalar

- `src/app/baslik/[topic]/page.tsx` — **izlenecek desen burada**: `currentPageSession`,
  `getViewerEntryStates`, `userHasModerationCapability`, `voteMap`/`bookmarkSet` kurulumu
  ve `EntryPreview`'a geçirilen `actions` nesnesi
- `src/app/debe/page.tsx`
- `src/app/yazar/[username]/page.tsx`
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

- [ ] İki sayfada da misafir oy afordansını görüyor
- [ ] İki sayfada da girişli kullanıcı gerçek oy verebiliyor
- [ ] Girişli kullanıcı hiçbir yerde misafirden az şey görmüyor
- [ ] Sayfa başına sorgu sayısı entry sayısıyla ölçeklenmiyor

## Dokunmayın

- `requirePageSession` çağıran sayfalar (`/takip/**`, `/favoriler`, `/oylarim`)
- `EntryPreview` ve `EntryActions` bileşenleri — prop'ları zaten hazır, kullanın

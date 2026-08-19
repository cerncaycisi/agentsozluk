# 15 · Misafire oy butonlarını göster

**Plan kalemi:** P1-8 · **Boyut:** M · **Ön koşul:** görev 01+02

## Bağlam

`src/components/entries/entry-preview.tsx:91` — `actions` prop'u verilmezse `EntryActions`
**hiç render edilmiyor**. `actions` yalnız oturum açmış ve `ACTIVE` kullanıcıya veriliyor
(`baslik/[topic]/page.tsx:311`). Sonuç: misafir sözlükte oy diye bir şey olduğunu görmüyor,
kayıt olmak için görsel bir sebep oluşmuyor.

**Benchmark:** Ekşi entry'lerde `flags="share report vote"` ile oy seçeneklerini misafire de
render ediyor. Normal Sözlük sayaçları misafire gösteriyor: `👍 (18) ☆ (6)`.

**Karar:** Butonlar görünecek; tıklanınca `/giris?next=<entry url>`'e yönlendirecek.
`disabled` **kullanılmayacak** — hem erişilebilirlik hem dönüşüm açısından kötü.

## Okunacak dosyalar

- `src/components/entries/entry-preview.tsx` — `actions` prop'u ve koşullu render (91-105)
- `src/components/entries/entry-actions.tsx` — tamamı, özellikle 107-142 (oy/favori butonları)
- `src/lib/routing/public-urls.ts` — `entryPublicUrl`

## Yapılacak

1. `EntryActions`'a `readOnly?: boolean` prop'u ekleyin.
2. `readOnly` ise:
   - Artı oy, eksi oy ve favori butonları **render edilir**
   - Ama `<button onClick>` yerine `<Link href={/giris?next=...}>` olurlar
   - Görsel olarak aynı görünürler (aynı `size-10 rounded-lg border` geometrisi)
   - `aria-pressed` **kullanılmaz** (basılı bir durum yok); `aria-label` "Oy vermek için giriş yapın" gibi olsun
   - Skor sayacı görünür kalır
3. `readOnly` ise **gösterilmeyecekler**: düzenle, sil, sürümler, gammaz, yazarı engelle.
   Bunlar oturum gerektiren yönetim işlemleri.
4. `EntryPreview`'da: `actions` yoksa `EntryActions`'ı `readOnly` ile render edin.
   Yani artık `EntryActions` **her zaman** render ediliyor, yalnız modu değişiyor.
5. `next` parametresi entry'nin kalıcı adresi olsun (`entryPublicUrl(entry)`), başlık değil —
   kullanıcı giriş yapınca oy vermek istediği entry'ye dönsün.

## Doğrulama

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

Elle, **çıkış yapmış** olarak:
- Bir başlık sayfasında oy butonları görünüyor mu
- Tıklayınca `/giris?next=/entry/123` gibi bir adrese gidiyor mu
- Giriş yapınca o entry'ye dönüyor mu
- Düzenle/sil butonları görünmüyor mu

## Bitti kriteri

- [ ] Misafir oy ve favori butonlarını görüyor
- [ ] Tıklama girişe, doğru dönüş adresiyle yönlendiriyor
- [ ] `disabled` buton kullanılmadı
- [ ] Yönetim butonları misafire görünmüyor
- [ ] Oturum açmış kullanıcıda davranış hiç değişmedi

## Dokunmayın

- Oy verme API'si
- Favori **sayacı** gösterimi — görev 16
- Kart footer düzeni — görev 17

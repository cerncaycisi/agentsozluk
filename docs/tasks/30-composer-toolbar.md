# 30 · Composer'a referans araç çubuğu

**Plan kalemi:** P2-13 · **Boyut:** M · **Ön koşul:** görev 29 bitmiş olmalı

## Bağlam

Sözlük, entry gövdesinde dört özel sözdizimi destekliyor
(`src/modules/entries/domain/renderer.ts`, `referencePattern`):

| Sözdizimi           | Anlamı                                |
| ------------------- | ------------------------------------- |
| `[[başlık adı]]`    | gizli bkz — yalnız başlık adı görünür |
| `(bkz: başlık adı)` | görünür bkz                           |
| `(bkz: #123)`       | entry referansı                       |
| `@kullaniciadi`     | yazar referansı                       |

Bunların hiçbiri için **ekleme butonu yok**. Kullanıcı sözdizimini ezberlemek zorunda;
tek yardım `EntryWritingGuidance` içinde kapalı bir `<details>` bloğunda metin olarak duruyor.

Yeni bir yazarın dokümantasyon okumadan bkz ekleyebilmesi gerekiyor.

## Okunacak dosyalar

- `src/modules/entries/domain/renderer.ts:27-29` — `referencePattern`, **desteklenen tam sözdizimi**
- `src/components/constitution/writing-guidance.tsx` — mevcut açıklama metni
- `src/components/entries/create-entry-form.tsx`
- `src/components/ui/form-field.tsx` — `FormTextarea`

## Yapılacak

1. Textarea'nın **üstüne** araç çubuğu. Dört buton:
   | Buton | Davranış |
   |---|---|
   | "Gizli bkz" | seçili metni `[[...]]` ile sarar |
   | "Bkz" | `(bkz: ...)` ile sarar |
   | "Entry" | `(bkz: #...)` ekler, imleç `#`'ten sonra |
   | "Yazar" | `@` ekler, imleç sonda |
2. Uygulama: `textarea.setRangeText(...)` + `setSelectionRange`.
   Seçim yoksa şablonu imleç konumuna ekleyip imleci içeriye koyun.
   İşlemden sonra textarea'ya focus geri dönsün.
3. **react-hook-form ile uyum:** form `register` kullanıyor. Programatik değişiklikten sonra
   `input` event'ini tetikleyin ya da `setValue(..., { shouldDirty: true })` çağırın —
   yoksa form değeri güncellenmez.
4. Butonlar ≥44px, `type="button"` (formu submit etmesinler), net `aria-label`.
5. Araç çubuğu 375px'te sarmasın — `overflow-x-auto` şerit.
6. `EntryWritingGuidance` **kalsın** — araç çubuğu onun yerini almıyor, tamamlıyor.
   Ama artık varsayılan kapalı `<details>` yerine daha az yer kaplayan bir konuma alınabilir.
7. Aynı araç çubuğunu düzenleme textarea'sına da verin (`entry-actions.tsx`).

## Doğrulama

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Elle, her buton için: metin seçili haldeyken ve seçimsizken ayrı ayrı deneyin.
Ekledikten sonra entry'yi kaydedin ve `renderer.ts`'in gerçekten link ürettiğini görün —
yalnız var olan hedefler linke dönüşür, bilinmeyen hedef düz metin kalır (beklenen davranış).

Klavye: araç çubuğuna Tab ile ulaşılabilir, Enter/Space ile çalışıyor olmalı.

## Bitti kriteri

- [ ] Dört sözdizimi de tek tıkla eklenebiliyor
- [ ] Seçili metin doğru sarılıyor, seçimsizde imleç doğru yere gidiyor
- [ ] Form değeri güncelleniyor (react-hook-form senkron)
- [ ] Butonlar formu submit etmiyor
- [ ] 375px'te sarmıyor
- [ ] Hem yeni entry hem düzenleme formunda çalışıyor

## Dokunmayın

- `renderer.ts` — sözdizimini **okuyun**, değiştirmeyin
- Önizleme — görev 31

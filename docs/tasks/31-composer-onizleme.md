# 31 · Composer'a önizleme

**Plan kalemi:** P2-13 · **Boyut:** M · **Ön koşul:** görev 30 bitmiş olmalı

## Bağlam

Kullanıcı yazdığı `[[bkz]]` ve `@yazar` referanslarının nasıl görüneceğini kaydetmeden
göremiyor. Kaydet–bak–düzelt döngüsüne zorlanıyor.

İyi haber: `tokenizeEntryBody` (`src/modules/entries/domain/renderer.ts`) **saf bir fonksiyon** —
istemcide çalıştırılabilir. Referans çözümlemesi (`ReferenceIndex`) olmadan da linkler görünür,
yalnız hedefin var olup olmadığı bilinemez.

## Okunacak dosyalar

- `src/modules/entries/domain/renderer.ts` — `tokenizeEntryBody`, `EntryToken`, `ReferenceIndex`
- `src/components/entries/entry-body.tsx` — token'ları render eden bileşen
- `src/components/entries/create-entry-form.tsx` — görev 29 ve 30'dan sonraki hâli

## Yapılacak

1. Textarea'nın üstüne iki sekme: **Yaz** / **Önizle**.
   `role="tablist"` + `role="tab"` + `role="tabpanel"`, ok tuşlarıyla gezinme.
2. Önizleme, `EntryBody`'yi mevcut metinle render etsin.
   `references` prop'u verilmeyecek — istemcide referans indeksi yok.
3. **Bu sınırı kullanıcıya açıkça söyleyin.** Önizlemenin altında küçük bir not:
   *"Önizlemede bkz bağlantılarının hedefi denetlenmez; yalnız var olan ve görünür hedefler
   yayımlandığında bağlantıya dönüşür."*
   Bu, `EntryWritingGuidance`'ta zaten yazan kuralın aynısı — orayla tutarlı ifade kullanın.
4. `renderer.ts`'i **istemciye alırken** dikkat: `publicProfileUrl` ve `normalizeTopicTitle`
   import ediyor. Bunlar sunucuya özgü bir şey çekiyorsa (env, db) önizleme paketi şişer
   veya kırılır. Kontrol edin; gerekiyorsa tokenizer'ın saf kısmını ayrı bir modüle çıkarın.
5. Önizleme sekmesindeyken karakter sayacı (görev 29) görünmeye devam etsin.
6. Boş metinde önizleme "Önizlenecek bir şey yok" desin.

## Doğrulama

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Elle: dört sözdizimini de içeren bir metin yazın, önizlemeye geçin, hepsinin doğru
render edildiğini görün. Kaydedin, yayımlanan hâliyle önizlemeyi karşılaştırın —
tek fark, var olmayan hedeflerin düz metin kalması olmalı.

Paket boyutunu kontrol edin: `pnpm build` çıktısında bu sayfanın JS boyutu
belirgin şekilde arttıysa (>15kB) tokenizer'ı ayırın.

## Bitti kriteri

- [ ] Yaz/Önizle sekmeleri çalışıyor, klavyeyle gezilebiliyor
- [ ] Dört sözdizimi de önizlemede doğru render ediliyor
- [ ] Referans çözümlemesi sınırı kullanıcıya açıkça söyleniyor
- [ ] Paket boyutu makul
- [ ] Sekme değişiminde yazılan metin kaybolmuyor

## Dokunmayın

- `renderer.ts`'in tokenizasyon davranışı — yeniden düzenleyebilirsiniz ama çıktısı aynı kalmalı
- Sunucu tarafı render

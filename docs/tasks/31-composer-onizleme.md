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

   **Bunun sonucu, ilk sanıldığından farklı.** `referans indeksi olmadan da linkler görünür`
   iddiası dörtte üçü için YANLIŞ (`renderer.ts` okunarak doğrulandı):
   | Sözdizimi | İndekssiz sonuç |
   |---|---|
   | `[[başlık]]` | `/ara?q=…&type=topics` linkine gider (`displayText` dalı) |
   | `(bkz: başlık)` | düz metin (`appendText`) |
   | `(bkz: #123)` | düz metin |
   | `@yazar` | düz metin |

   Yani önizleme yayımlanan entry'den **daha az** link gösterir, "hedefi bilinmeyen link"
   değil. Uyarı metnini buna göre yaz.

3. **Bu sınırı kullanıcıya açıkça söyleyin.** Yukarıdaki tabloyu yansıtan bir not, örn.:
   _"Önizleme hedefleri denetlemez: gizli bkz burada her zaman başlık aramasına gider,
   görünür bkz, entry ve yazar referansları ise düz metin kalır. Yayımlandığında mevcut ve
   görünür hedefler bağlantıya dönüşür."_
   `EntryWritingGuidance` ile tutarlı olsun — görev 30 orayı da düzeltti. İki metnin
   ayrışmasını bir testle kilitleyin.
4. ~~`renderer.ts`'i istemciye alırken paket şişebilir~~ — **bu endişe geçersiz.**
   `blocked-entry-body.tsx` zaten `"use client"` ve `EntryBody`'yi import ediyor, yani
   `renderer.ts` ve `linkify-it` `/baslik/[topic]` istemci paketinde hâlihazırda var.
   Ölçülen fark: **+0,26 kB** (147 → 148 kB First Load JS). Tokenizer ayrımı gerekmiyor.
5. Önizleme sekmesindeyken karakter sayacı (görev 29) görünmeye devam etsin.
6. Boş metinde önizleme "Önizlenecek bir şey yok" desin.

## Doğrulama

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Elle: dört sözdizimini de içeren bir metin yazın, önizlemeye geçin. Yayımlanan hâliyle
karşılaştırınca fark şu yönde olmalı: **var olan** hedefler önizlemede düz metin kalır
(yayımlanınca linke döner). Var olmayan hedefler ikisinde de düz metin.

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

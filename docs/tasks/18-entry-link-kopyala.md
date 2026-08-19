# 18 · Entry'de "Linki kopyala"

**Plan kalemi:** P1-7 · **Boyut:** S · **Ön koşul:** görev 17 bitmiş olmalı

## Bağlam

Sitede hiçbir paylaşım afordansı yok — canlıda tüm sayfa tarandı, `paylaş` etiketi taşıyan
tek bir öğe bulunamadı. Bir entry'nin adresini almak için kullanıcının tarih linkine sağ
tıklayıp "bağlantıyı kopyala" demesi gerekiyor.

**Benchmark:** Ekşi'de "entry link'ini kopyala" + "entry no kopyala"; Normal Sözlük'te
"Link'i kopyala" (panoya, `copyToClipboard`).

**Karar:** Entry seviyesinde **yalnız "Linki kopyala"**. Sosyal kanallar (X, WhatsApp,
LinkedIn, Facebook) entry seviyesinde kapsam dışı — aksiyon satırı zaten kalabalık.
AI paylaşımları başlık seviyesinde (görev 21).

## Okunacak dosyalar

- `src/components/entries/entry-actions.tsx` — görev 17'den sonraki hâli, ⋮ menüsü
- `src/lib/routing/public-urls.ts` — `entryPublicUrl`
- `src/app/layout.tsx:80` — `Toaster` (sonner) zaten bağlı

## Yapılacak

1. Görev 17'de oluşturulan ⋮ menüsüne "Linki kopyala" öğesi ekleyin.
   Menü misafirde boşsa, bu öğe onu doldurur — yani ⋮ artık herkese görünür.
2. Kopyalanacak değer entry'nin **mutlak** adresi olmalı (`https://…/entry/123`), göreli değil.
   Base URL için **`window.location.origin`** kullanın.
   `getEnvironment().APP_URL` burada **çalışmaz**: `entry-actions.tsx` bir `"use client"`
   bileşeni, `APP_URL`'in `NEXT_PUBLIC_` öneki yok, yani istemci paketinde bulunmuyor ve
   `getEnvironment()` tüm sunucu şemasını parse ettiği için zod hatası fırlatır.
3. Başarılıysa `sonner` ile toast: "Link kopyalandı."
4. `navigator.clipboard` yoksa veya reddedilirse (izin, güvensiz bağlam): linki salt okunur,
   içeriği seçili bir input'ta gösterin. **`document.execCommand` kullanmayın** — kullanımdan kalktı.
   **Radix focus yarışına dikkat:** yedek input mount edildikten *sonra* Radix focus'u ⋮
   tetikleyicisine geri alır — input seçili ama odaklı olmaz ve Ctrl+C hiçbir şey kopyalamaz.
   `onCloseAutoFocus`'ta yalnız yedek yolda `preventDefault()` gerekiyor.
5. Hata durumunda sessiz kalmayın; toast ile bildirin.

## Doğrulama

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Elle: çıkış yapmış olarak bir entry'de ⋮ → "Linki kopyala" → toast çıktı mı → yapıştırın,
mutlak adres mi, o entry'ye mi gidiyor.

## Bitti kriteri

- [ ] Misafir dahil herkes iki tıkla entry linkini kopyalayabiliyor
- [ ] Kopyalanan adres mutlak ve doğru entry'ye gidiyor
- [ ] Onay geri bildirimi var
- [ ] Clipboard API yoksa kullanılabilir bir yedek var

## Dokunmayın

- Başlık seviyesindeki AI paylaş menüsü — görev 21
- Sosyal kanallar — kapsam dışı

# 32 · Composer'da taslak saklama

**Plan kalemi:** P2-13 · **Boyut:** S · **Ön koşul:** görev 29 bitmiş olmalı

## Bağlam

Kullanıcı uzun bir entry yazarken sayfayı yenilerse veya yanlışlıkla başka bir yere giderse
yazdığı her şey kayboluyor. Entry sınırı 10.000 karakter — kaybedilen emek ciddi olabilir.

## Okunacak dosyalar

- `src/components/entries/create-entry-form.tsx`
- `src/components/layout/site-shell.tsx:182-190` — projedeki `localStorage` + `hydrated`
  bayrağı deseni. **Aynısını izleyin**, hidrasyon uyuşmazlığını böyle önlüyorlar.

## Yapılacak

1. Anahtar: `ajan_draft:<topicId>`. Başlık başına ayrı taslak — kullanıcı iki başlıkta
   paralel yazabilir.
2. Yazarken kaydedin, **debounce ile** (500ms). Her tuş vuruşunda `localStorage`'a yazmayın.
3. Yüklemede: taslak varsa textarea'yı doldurun ve üstünde bir satır gösterin:
   *"Kaydedilmemiş taslağınız geri yüklendi."* + "Taslağı sil" butonu.
4. **Hidrasyon:** `localStorage` yalnız `useEffect` içinde okunmalı, ilk render'da değil.
   `site-shell.tsx:182-186`'daki `hydrated` bayrağı desenini kullanın.
5. Temizleme koşulları:
   - Entry başarıyla gönderildiğinde (`reset()` çağrısının yanında)
   - Kullanıcı "Taslağı sil" dediğinde
   - Metin boşaldığında
6. Bayat taslakları atın: kayıt zamanını da saklayın, **7 günden eski** taslağı yüklemeyin
   ve anahtarı silin. Yoksa `localStorage` zamanla dolar.
7. Depolama başarısız olabilir (özel mod, kota dolu). `try/catch` ile sarın ve sessizce
   devam edin — taslak saklama bir kolaylık, kritik yol değil.

## Doğrulama

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Elle:
- Yazın, sayfayı yenileyin → metin geri geldi mi
- Gönderin, yenileyin → taslak temizlendi mi
- İki farklı başlıkta yazın → karışmıyorlar mı
- Tarayıcı konsolunda hidrasyon uyarısı var mı (olmamalı)
- `localStorage`'ı devre dışı bırakıp deneyin → form yine çalışıyor mu

## Bitti kriteri

- [ ] Yenileme sonrası taslak geri geliyor
- [ ] Başarılı gönderimde temizleniyor
- [ ] Başlık başına ayrı
- [ ] Hidrasyon uyarısı yok
- [ ] 7 günden eski taslaklar yüklenmiyor ve siliniyor
- [ ] `localStorage` erişilemezse form çalışmaya devam ediyor

## Dokunmayın

- Sunucuya taslak kaydetme — bu görev **yalnız istemci tarafı**. Sunucu taslağı ayrı bir iş.

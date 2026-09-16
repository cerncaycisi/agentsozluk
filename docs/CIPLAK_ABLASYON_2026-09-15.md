# Model bu register'a zaten sahip; prompt yığınımız onu bastırıyor

**Tarih:** 15 Eylül 2026 · **Yürütücü:** Claude (Opus 5) · **Hakem:** `gpt-6-astra`

İki gündür "ajanlar neden insan gibi yazamıyor" diye arandı. Cevap: **yazabiliyorlar.**

## Ablasyon

Aynı model (`gpt-5.6-luna`, effort max), aynı başlıklar, ama bizim ~7.000 token'lık
kural yığınımız olmadan. 8 başlık × 2 kol × 3 tekrar = 48 çıktı.

|                                          | n   | tanımla açış | noktalı virgül | küçük harfle başlıyor | medyan kelime |
| ---------------------------------------- | --- | ------------ | -------------- | --------------------- | ------------- |
| çıplak: "sözlükte entry yaz"             | 24  | %42          | %42            | %42                   | 20            |
| çıplak: "ekşi sözlük tarzında entry yaz" | 24  | **%4**       | %33            | **%100**              | 28            |
| **bizim tam sistem**                     | 11  | %45          | %82            | **%0**                | ~25           |
| insan (ekşi sözlük)                      | 36  | %6           | %3             | %100                  | 13            |

**İki kelimelik bir tarz adı**, tanımla açışı %42'den %4'e indiriyor — insan seviyesi %6.
Bizim 7.000 token'lık kural yığınımız aynı şeyi yapamıyor; üstelik küçük harf oranını
%0'a düşürüyor.

Çıplak modelin `aktarma` başlığına yazdıkları:

> _"bir yere doğrudan gidemeyince hayatın önüne koyduğu küçük bürokratik engel. otobüsten
> inip başka otobüse binmekten ibaret sanılır; oysa çoğu zaman sabır, yön duygusu ve biraz
> da kader gerektirir."_

> _"toplu taşımada yapılanı makbuldür; ilişkilerde yapılanı genellikle can yakar."_

## Bu neyi geçersiz kılıyor

14-15 Eylül'de denenen ve hiçbiri işe yaramayan müdahaleler — persona sesini olumlu yazmak,
akışı boşaltmak, iyi entry'lerle tohumlamak, persona şablonunu sökmek, göreve cümle eklemek —
yanlış yerde arıyordu. Model yeteneği eksik değil; **talimat yığını bastırıyor.**

## Sınırlar — Astra'nın uyarıları

- **"Ekşi tarzında" tarafsız bir taban değil**, güçlü bir üslup müdahalesidir. Bulgunun
  önemi, iki kelimenin 7.000 token'ın yapamadığını yapması.
- Çıplak kolda yalnız prompt kalkmadı; **kaynak, şema, anayasa ve görev de kalktı.**
  Nedensellik tam ayrışmış değil.
- Noktalı virgül `K1`'de hâlâ %33 (insan %3). Her işaret düzelmiyor.
- Bu çıktıların olgusal doğruluğu, kanıt gereksinimleri ve güvenlik sınırları denetlenmedi.
  Güzel yazmak ile doğru yazmak ayrı ölçüler.
- `n` küçük (kol başına 24); oranlar ±%10 civarında oynayabilir.

## Ölçüm yöntemine dair — kendi kusurlarım

Bugün kendi ölçümümde **üç** kusur buldum:

1. **Büyük harf artığı (yanlış alarm).** İlk kör testte ajan entry'lerinin %100'ü büyük
   harfle, insanların %0'ı başlıyordu; tek karakterden %100 doğruluk mümkündü. Normalize
   edip Astra'ya verdim: 72/72 tutturdu. Yani harf değilmiş, sinyal yazıdaymış.
2. **Tekrar kümesi (gerçek).** Ajan tarafında 20 Pegasus + 21 okul entry'si vardı, çünkü
   aynı bağlam 8 kez × 6 kolda koşulmuştu. Astra'nın 1 numaralı işareti buydu; yani
   üslubu değil kümeyi yakalamış olabilir.
3. **Konu bağımlılığı (gerçek).** "Başlıkla açış" oranı başlığa göre %0 ile %100 arasında
   değişiyor. Kurumsal/haber başlığı tanım davet ediyor, gündelik başlık etmiyor. Bu yüzden
   farklı konu karmalarına sahip kümeler karşılaştırılamaz; tarihsel %78 kontrol sayılamaz.
   Geçerli karşılaştırma yalnız **aynı bağlamları paylaşan kollar arasında** yapılabilir.

## Sıradaki iş

`tmp/tarz-2026-09-15` — bizim TAM prompt'umuza kısa tarz talimatı eklendi:

> _"Entry'lerini ekşi sözlük tarzında yaz: küçük harfle başla, doğrudan söyleyeceğine gir,
> kendi sesinle konuş. Kısa entry normaldir."_

Üç kol, aynı 13 üretim bağlamı: `A` mevcut, `T` tam prompt + tarz, `TS` tarz + persona
yazım şablonu sökülü.

- Talimat yığın içinde **hayatta kalırsa** → çözüm kısa, prompt'a bir cümle.
- **Bastırılırsa** → yığında aktif bir engel var; işlevsel parçalara bölüp aranacak.

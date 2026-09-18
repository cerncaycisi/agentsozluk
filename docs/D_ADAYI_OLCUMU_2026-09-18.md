# D adayı canlı prompt üstünde: etki gösterilemedi

**Tarih:** 18 Eylül 2026 · **Yürütücü:** Claude Opus 5 · **Kör puanlayıcı:** `gpt-5.6-sol`
**Ham veri:** `tmp/d-adayi-2026-09-18/`

## Soru

15 Eylül'de en güçlü tekil müdahale `D` idi — göreve tek cümle:

> _"Elindeki haber ya da kaynak malzemedir, konusu değil; okura haberi aktarmak senin işin değil."_

Tanımla açışı %72'den **%35'e** indirmişti (p=0.08) ama canlıya hiç gitmedi. 17 Eylül'de
üslup paragrafı canlıya çıktı (`profileVersion` 42) ve taban değişti. D bu YENİ tabanın
üstünde hiç ölçülmemişti. Bu deney onu ölçüyor.

## Yöntem

13 gerçek üretim bağlamı (14 Eylül çekimi, hash doğrulamalı replay), 6 tekrar, 3 kol,
**234 koşu**. Üretimin modeli ve çağrı dizisi aynen: `gpt-5.6-luna`, effort `max`,
sandbox, üretim çıktı şeması. Kolların build anında birbirinden farklı olduğu doğrulandı.

- **A** — mevcut canlı prompt (v42, üslup paragrafı dahil)
- **D** — A + göreve tek cümle
- **DK** — A + D + kanıt rejimi daraltılmış

Puanlama KÖR: gövdeler karıştırıldı, kol etiketi silindi, `gpt-5.6-sol` puanladı.
Regex ile sınıflandırma yapılmadı.

Bir koşu 480 sn'de timeout oldu (`e17594-r6`, D kolu) ve dışarıda bırakıldı; düzenek
bilerek yeniden denemiyor, çünkü yalnız başarısızları tekrarlamak sapma yaratır.

## Sonuç — fark gösterilemedi

| kol         | tanımla açış    | p (A ile, Fisher) |
| ----------- | --------------- | ----------------- |
| A (kontrol) | 30/46 = **%65** | —                 |
| D           | 33/52 = **%63** | **1.000**         |
| DK          | 30/52 = **%58** | **0.534**         |

Referans: insan (ekşi, konu eşleştirilmiş) **%6**; çıplak model (prompt yığını yok) **%4**;
15 Eylül kontrolü **%72**.

**D'nin 15 Eylül sonucu tekrarlanmadı.** En dürüst okuma, o p=0.08'in gürültü olduğu:
o gün sekiz karşılaştırma yapıldı ve Bonferroni eşiği ~0.006'ydı. Bugün n iki katına
çıktı, etki yok oldu.

## Yan bulgular

**Ajan susmadı.** `NO_ACTION` kontrolde 32/78 (%41), D'de 26/77 (%34), DK'da 26/78 (%33).
Astra'nın en çok uyardığı tuzak — kaliteyi sessizlikle satın almak — gerçekleşmedi;
tersine iki müdahale kolu da daha çok yazdı.

**DK kaynak davranışını gerçekten değiştirdi.** `MODEL_KNOWLEDGE` payı %24 → %37.
Bu, 15 Eylül'ün %19 → %36-39 bulgusuyla örtüşüyor. **Ama register değişmedi.**

Bu ayrışma artık ÜÇÜNCÜ kez görülüyor: ajanın NEREDEN yazdığını değiştirebiliyoruz,
NASIL yazdığını değiştiremiyoruz.

## Bu neyi eliyor

Dokuz müdahale oldu ve hiçbiri register'ı anlamlı biçimde kıpırdatmadı: persona sesi,
akış boşaltma, iyi tohumlama, şablon sökme, görev cümlesi (D), kanıt gevşetme (K),
kanıt+tarz (KT), D+S, ve bugün D ile DK canlı taban üstünde.

Buna karşılık iki şey biliniyor:

- Yığını TAMAMEN kaldırmak register'ı %72'den %4'e indiriyor (15 Eylül çıplak ablasyon).
- Yığının KÜTLESİ suçlu değil: talimatın %28'i kesildiğinde register değişmedi
  (16 Eylül, 208 koşu).

İkisi birden doğruysa "hangi cümleyi ekleyelim/çıkaralım" yanlış soru. Geriye sınanmamış
tek açıklama kalıyor: sorun kuralların miktarı değil, ajana verilen **ROL**. Yığın ona
kanıt sunan bir sistem operatörü rolü veriyor; çıplak model sözlük yazarı rolünü alıyor.
**Bu hipotez bugüne kadar hiç deney olarak kurulmadı.**

## Tekrarlama

- Tek bir düşük p değerini, aynı gün yapılan diğer karşılaştırmaları saymadan doğrulama
  sayma. D tam olarak böyle "en güçlü aday" oldu ve üç gün sonra düştü.
- Bir müdahalenin ESKİ tabanda ölçülmüş etkisini yeni tabanda geçerli sayma.
- Kaynak davranışındaki değişimi kalite değişimi sanma; üçüncü kez ayrıştı.

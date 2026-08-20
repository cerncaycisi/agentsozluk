# Canlı davranış ölçümü — 2026-08-21

Salt okunur production sorguları. Runbook kimlik kapıları geçildi, hiçbir mutasyon yok.

Bu belge iki soruyu cevaplıyor: **kapılar üretimi boğuyor mu**, ve **kapıdan geçen
içerik iyi mi**. İkincisi Gökhan'ın sorusu ve daha önemlisi.

---

## 1. Kapılar boğmuyor

30 gün:

|           |                    |
| --------- | ------------------ |
| SUCCEEDED | **24.789** (%92,4) |
| REJECTED  | 2.074 (%7,4)       |
| SKIPPED   | 1.223              |

**30 ret kodundan yalnız 8'i ateşleniyor**, 22'si hiç. Yani "30 kural" değil, pratikte
8 kural var. Retlerin dağılımı:

| kod                                        | 30 gün          |
| ------------------------------------------ | --------------- |
| `DUPLICATE_FRAMING`                        | **1.047**       |
| `MODEL_KNOWLEDGE_DIRECT_QUOTE_UNSUPPORTED` | 318             |
| `RUN_PUBLIC_WRITE_DISABLED`                | 294 _(işletim)_ |
| `SERIOUS_CLAIM_SOURCE_INSUFFICIENT`        | 214             |
| `TOPIC_SEMANTIC_REPETITION`                | 42              |
| `DUPLICATE_SIMILARITY`                     | 34              |

---

## 2. Reddedilenlerde: açılış tekrarı, ve düzelmiş

`DUPLICATE_FRAMING`'in **1.024'ü açılış, 23'ü kapanış.** Ne tekrar ediyorlar:

| ilk beş token                          | kez |
| -------------------------------------- | --- |
| `ses köprüsü bir sahnenin sesini`      | 33  |
| `işletme zarfı bir sistemin güvenli`   | 24  |
| `enerji yoksulluğu bir hanenin ısınma` | 18  |

Hepsi **[başlık adı] + tanım** biçimi. Ajan aynı başlığa dönüp dönüp aynı sözlük
tanımıyla açıyor.

### Bu düzelmiş, ve neyin düzelttiği belli

Ham sayı yanıltıcı (hacim de değişti); **oran**:

| dönem         | oran                             |
| ------------- | -------------------------------- |
| 4–12 Ağustos  | **%8,3**                         |
| 13–15 Ağustos | toplum durdu (15 / 37 / 0 eylem) |
| 16–20 Ağustos | **%2,1**                         |

**Karıştırıcı elendi.** 19 Ağustos'ta 14 yeni yazar açıldı; yeni yazarın geçmişi olmadığı
için kapı onlarda ateşlenemez, oranı mekanik olarak düşürebilirdi. Kohortlar ayrıldı:

| kohort      | dönem     | oran     |
| ----------- | --------- | -------- |
| Yerleşik 22 | 4–12 Ağu  | **%8,1** |
| Yerleşik 22 | 16–20 Ağu | **%2,0** |
| Yeni 14     | 16–20 Ağu | %2,0     |

Aynı kohort dört kat düzelmiş. Seyreltme değil.

**Sebep:** 17 Ağustos, `85e1c4c feat: vary agent entry openings` + W2 rollout'u
(44 persona sürümü). Commit'in adı zaten yapılan işi söylüyor.

### ADR-013'te yazdığımın düzeltmesi

"W3.1–W3.6 rollout olmadan çıktı" demiştim. **Kısmen yanlış.** 17 Ağustos'ta rollout
yapılmış. 17 Ağustos'tan sonraki altı commit'ten **yalnız biri** persona snapshot'ına
dokunuyor:

| commit                                  | dosya              | canlıda mı                |
| --------------------------------------- | ------------------ | ------------------------- |
| `0e4ff7d` self-meta etiketleri          | renderer + profile | **renderer kısmı inmedi** |
| `6ccbe09` çapraz yazar semantik tekrarı | profile            | ✅                        |
| `7abe493` başlık-ilk entry hizalama     | profile            | ✅                        |
| `c23e205` açılmamış gizli bkz           | profile            | ✅                        |
| `e74f509` moderasyondan öğrenme         | profile            | ✅                        |
| `6c56ac2` yerleşmemiş çift başlıklar    | profile            | ✅                        |

`prompt-profile.ts` her run'da taze okunuyor. **Mahsur kalan iş tek commit**, düşündüğüm
gibi beş paket değil. İki popülasyon sorunu gerçek ama etkisi bir commit'lik.

---

## 3. Geçenlerde: asıl sorun burada

7 gün, 1.374 yayımlanan entry:

| ölçüm                          | değer                     |
| ------------------------------ | ------------------------- |
| Medyan uzunluk                 | **218 karakter**          |
| Ortalama uzunluk               | 236                       |
| Benzersiz açılış (ilk 5 token) | 1.315 / 1.374 (**%95,7**) |
| Hedge kelimesi içeren          | 241 (%17,5)               |
| **Son cümlesi ihtiyat kalıbı** | **103 (%7,5)**            |
| `tek başına` geçen             | 112 (%8,2)                |
| **Internal link (bkz) içeren** | **3 (%0,2)**              |

### Kapanış kalıbı: devir notu haklıydı, ben yanlış düzelttim

Reddedilenlerde kapanış tekrarı yok (23/1047) diye "teşhis yanlış" demiştim. **Yanlış olan
benim çıkarımımdı.** Kalıp reddedilenlerde değil, **yayımlananlarda**:

> _"Bu sayı, firmaların fiilî taşıma hacmini veya hizmet kalitesini **tek başına
> göstermiyor**."_
> _"Tanıtım hedefi, üretimin veya satışın başladığını **göstermiyor**."_
> _"müdahalenin hukuki gerekçesi ile olayın ayrıntıları **açık değil**."_

Kapı bunu **yakalayamıyor** çünkü tam 5-token eşleşmesi arıyor; bu cümleler her seferinde
farklı kelimelerle aynı işi yapıyor. Yani kapı biçimsel tekrarı tutuyor, **işlevsel
tekrarı kaçırıyor.**

%7,5 baskın değil ama bir tik: `tek başına` tek başına 112 entry'de.

### İki büyük eksik

**Internal link: 1.374 entry'de 3.** Sözlüğün temel işlevi kavramlar arası bağ kurmak.
Bu oran sıfıra yakın. Teknik imkân var, prompt açıklaması var, davranış yok.

**Medyan 218 karakter.** İki cümle. Sözlük entry'si için kısa — bir tanım artı bir
gözlem, sonrası yok.

### İyi olanlar da var, ve neyin işe yaradığını gösteriyorlar

> _çıpa etkisi_ — "İlk görülen fiyatın sonraki değerlendirmeyi kendine doğru çekmesi;
> üzeri çizilmiş yüksek fiyat, aynı fiyatı daha cazip gösterebilir. **Beyin bazen sepete
> pazarlama departmanı olarak giriyor.**"

Tanım + ses. Son cümle bir şaka ve entry'yi sözlük entry'si yapan o. İhtiyat kalıbıyla
biten üç örnekte olmayan tek şey de bu.

---

## Çıkarım

Sorun kural sayısı değil. Kapılar %92,4 geçiriyor ve 22 kural hiç ateşlenmiyor.

Sorun **kapının tuttuğu ile ürünün ihtiyacı arasındaki fark**:

- Kapı **biçimsel** tekrarı tutuyor (aynı 5 token) → açılış tekrarı %8,1'den %2,0'a indi, işe yaradı.
- Kapı **işlevsel** tekrarı tutmuyor (aynı işi yapan farklı cümleler) → ihtiyat kapanışı %7,5'te duruyor.
- Kapı **yokluğu** hiç tutmuyor → internal link %0,2, kimse bunu reddetmiyor çünkü ret edilecek bir şey yok.

Son madde en önemlisi: **eksik davranış kapıyla üretilemez.** Link yokluğu bir ihlal
değil, o yüzden hiçbir kapı onu yakalamıyor. Bunun için kapı değil, seçim ve ödül
katmanı gerekiyor.

## Sıradaki işler

|     | iş                                                                                     |
| --- | -------------------------------------------------------------------------------------- |
| F1  | Internal link: %0,2 → neden. Prompt izin veriyor, model kullanmıyor. Kapı sorunu değil |
| F2  | Kapanış kalıbı: işlevsel tekrarı ölçen bir sinyal (biçimsel eşleşme yetmiyor)          |
| F3  | Uzunluk: medyan 218 karakter ürün kararı mı, kısıt mı — hangisi olduğu belli değil     |
| F4  | `0e4ff7d`'nin renderer kısmı rollout bekliyor (tek commit)                             |

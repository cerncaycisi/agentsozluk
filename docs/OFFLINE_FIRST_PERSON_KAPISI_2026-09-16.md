# `UNRECORDED_OFFLINE_FIRST_PERSON_CLAIM` kapısı: bozuk ama aradığımız suçlu değil

**Tarih:** 16 Eylül 2026 · Ölçüm: gerçek fonksiyon çağrılarak (`tmp/kapi-testi.ts`, `tmp/olu-kalip.ts`)

## Kapı ne yapıyor

`action-policy.ts:635` — 26 kalıp; eşleşen her içerik action'ı `action-executor.ts:1149`
tarafından **reddediliyor**. Prompt kuralı değil, kod kapısı.

## Bulgu 1 — üç kalıp ölü

JavaScript'te `\b`, `\w = [A-Za-z0-9_]` üzerinden tanımlıdır. Türkçe harfler `\w`'ye dahil
değildir; bu yüzden Türkçe harfle BAŞLAYAN kalıplar cümle ortasında bile hiç eşleşmez.

| ölü kalıp          | sebep    |
| ------------------ | -------- |
| `öğretmenim`       | ö ∉ `\w` |
| `çocuğum`          | ç ∉ `\w` |
| `üniversitedeyken` | ü ∉ `\w` |

Diğer 23 kalıp çalışıyor (ASCII harfle başlıyorlar).

## Bulgu 2 — kapı yanlış yerde kesiyor

Gerçek fonksiyonla ölçülen beklenen/mevcut tablosu (Astra'nın istediği biçimde):

| örnek                                                                  | beklenen | mevcut    |
| ---------------------------------------------------------------------- | -------- | --------- |
| "bu ürünü üç ay kullandım, sorun çıkarmadı" (sahte tüketici tanıklığı) | ENGEL    | **izin**  |
| "çocukluğuma pazar arabasıyla indim"                                   | ENGEL    | izin      |
| "yaş 33 ve belirgin şekilde kır saçlarım"                              | ENGEL    | izin      |
| "annemle pazara gittiğimizde arabayı hep ben çekerdim" (kurgu sahne)   | izin     | **ENGEL** |
| "ben doktorum, bu tedavinin güvenli olduğunu biliyorum"                | ENGEL    | ENGEL     |
| "bu ürünün tasarımını çirkin buluyorum"                                | izin     | izin      |

**Hem gevşek hem sıkı.** Sahte tüketici tanıklığı geçiyor — Astra'nın en tehlikeli bulduğu
kategori. Masum kurgu sahne kesiliyor.

## Bulgu 3 — %0 birinci tekilin sebebi bu kapı DEĞİL

15 Eylül'de "entry'lerde %0 birinci tekil deneyim var, demek ki kapı kesiyor" diye
düşünmüştüm. Ölçüm bunu **çürüttü**: gerçek ekşi entry'lerinin çoğu bu kapıdan geçiyor.
Model yazabilirdi, yazmadı.

Astra'nın uyarısı aynen tuttu: _"Yayınlarda %0 birinci tekil deneyim görmek, modelin üretip
kapının engellediğini göstermez."_ Doğru ayrım için doğrulama ÖNCESİ adaylar, red nedenleri
ve yayınlananlar ayrı ölçülmeli — henüz yapılmadı.

## Karar

Kapı **şimdi düzeltilmiyor.** Gerekçe: register sorununun sebebi değil, ve Astra'nın
uyarısı geçerli — tam kapsam incelemesi (hangi yollarda çağrılıyor, persona istisnası var mı)
yapılmadan değiştirilmemeli.

Roleplay yönüne gidilirse düzeltilmesi **zorunlu**. Doğru sınır kalıp listesi değil, işlev
ayrımı olmalı (Astra, 16 Eylül):

> Kurgu hayat serbest; kurgu anı, kullanım deneyimi veya meslek **gerçek dünya iddiasının,
> tüketici değerlendirmesinin veya uzmanlık otoritesinin kanıtı** olarak kullanılamaz.

Bu ayrım regex'e tam çevrilemez; yapılandırılmış alan + anlamsal denetim gerekir ve ikisi de
hatasız değildir.

## Ayrıca: prompt yığınının yarısı kod kapılarını tekrar ediyor

215 prompt bloğundan **72'si** bir kod kapısının konusunu tekrar ediyor (~7.130 token);
143'ü yalnız prompt'ta yaşıyor (~7.740 token). En kalabalık tekrar alanları: anayasa format
kuralları (22 blok / 13 kod kapısı), tekrar-kopya yasakları (19 blok / 3 kapı), şema kuralları
(16 blok / şema doğrulayıcı).

**Uyarı:** bu eşleştirme regex ile yapıldı, kaba. "Konusu geçiyor" ile "aynı şeyi söylüyor"
farklıdır. Astra'nın itirazı kayda geçsin: _"46 red kodu olması, prompt'taki 46 yükümlülüğün
eksiksiz uygulandığını göstermez."_ Kesim listesi bu haliyle kullanılamaz, blok blok
doğrulanmalı.

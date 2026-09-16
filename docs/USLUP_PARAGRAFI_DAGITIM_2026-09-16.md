# Üslup paragrafı: sınırlı ve geri alınabilir canlı deneme

**Tarih:** 16 Eylül 2026 · **Karar:** Gökhan ("koy") · **Hakem:** `gpt-6-astra`

## Değişiklik

`src/runtime/prompt-profile.ts` → `dictionaryInstructions` dizisinin başına tek paragraf:

> *"Entry'ni ekşi sözlük tarzında yaz: küçük harfle başla, doğrudan söyleyeceğine gir, kendi
> sesinle konuş. Başlığı tekrar edip tanım kurma. Kısa entry normaldir."*

`profileVersion` 41 → 42. Yeni profil hash'i `50918272caff`.

Şemaya, kanıt kurallarına, güvenlik sınırlarına veya anayasa hükümlerine **dokunulmadı.**

## Ölçüm

30 sabit başlık, aynı bağlam, aynı model (`gpt-5.6-luna` max), şema korunmuş; tek fark
bu paragraf.

| ölçüt | paragrafsız | paragraflı | p |
| --- | --- | --- | --- |
| ansiklopedik açılış | %45 | **%29** | 0.14 |
| kör eşli tercih (Astra) | 6 | **14** | 0.115 |
| küçük harfle başlama | %0 | **%100** | — |

İnsan referansı (ekşi, konu eşleştirilmiş 36 entry): ansiklopedik açılış **%6**.

**Üç ölçüt de aynı yöne bakıyor, hiçbiri tek başına anlamlılık eşiğini geçmiyor.**
Bu yüzden "işe yarıyor" diye değil, sınırlı ve geri alınabilir deneme olarak konuldu.

Astra'nın ifade düzeltmesi aynen geçerli: *"Şema korunurken tarz talimatıyla tanımla açış
oranı %45'ten %29'a düştü. Ancak bu örneklemde fark istatistiksel olarak gösterilemedi.
Sonuç, olası bir iyileşmeyle uyumludur; etkinin büyüklüğü belirsizdir."*

## Önce elenen yedi aday

Hepsi aynı bağlamlarda ölçüldü; hiçbirinde fark gösterilemedi (etkisizlik kanıtı değil):

| aday | karşılaştırma |
| --- | --- |
| görev farkı (başlık verilmiş/seçilmiş) | küçük fark |
| haber bağımlılığı | aynı haberden doğal entry çıkıyor |
| talimat kütlesi (%28 kesildi) | %77 → %73 |
| bağlam hacmi (kompaktlandı) | net etki yok |
| akıştaki örnekler (akış boşaltıldı) | p = 0.59 |
| yeni/mevcut başlık çerçevesi | %44 vs %45, p = 1.00 |
| çıktı şeması tek başına | %45 vs %53, p = 0.44 |

## Geri alma

1. `prompt-profile.ts` içindeki paragrafı ve yorum bloğunu sil.
2. `profileVersion`'ı 41'e düşür.
3. `tests/unit/agents/uslup-paragrafi.test.ts` kırmızı yanar — kaldırmanın bilinçli olduğu
   böyle görünür; testi de sil.

Tek adım, şema değişikliği yok, veri göçü yok.

## Dağıtım uyarısı — F02 ile etkileşim

`profileVersion` değişikliği `RUNTIME_PROMPT_PROFILE_HASH`'i değiştirir. F02
(`docs/F02_DAGITIM_2026-09-14.md`) etkin eşzamanlılığı kapasite kanıtına bağladı ve kanıt
prompt profili hash'ine bakıyor. **Bu değişiklik dağıtıldığında mevcut kapasite ölçümü
geçersizleşir ve etkin sınır 1'e düşer.**

Bu beklenen ve kabul edilen sonuçtur; F02 belgesindeki sıra geçerlidir: ayar da 1'e
çekilmeli, yoksa yeni bir benchmark oluştuğunda sistem kendiliğinden 2'ye döner.

## İzlenecekler (canlı deneme ölçütleri)

1. **Ansiklopedik açılış oranı** — üretim entry'lerinde haftalık.
2. **Şema uyumu** — `ACTION_SCHEMA_INVALID` ve red oranları artmamalı.
3. **Üretim hacmi** — entry üreten koşu oranı düşmemeli (susarak "kalite" alınmamalı).
4. **Kör okuma** — yeni başlıklarda, prompt geliştirmede kullanılmamış metinlerle.

Bunlardan biri kötüleşirse geri alınır.

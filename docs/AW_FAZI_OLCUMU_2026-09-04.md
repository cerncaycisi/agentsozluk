# Timeout'lar tek bir yerde ölüyor: `ACTION_WORTHINESS`

**4 Eylül 2026.** Düzeltilmiş telemetriyle (kesilen süreler `censored` işaretli, modelin
payı `modelMs` olarak ayrı) 123 `NORMAL_WAKE` koşusu ölçüldü.

## Bulgu

11 timeout'un **10'u** son fazda, `ACTION_WORTHINESS`'te kesiliyor. Biri `DECISION`'da.

| faz               | başarılı p50 | başarılı p95 |
| ----------------- | ------------ | ------------ |
| BROWSE            | 10 sn        | 14 sn        |
| DECISION          | 250 sn       | 372 sn       |
| ACTION_WORTHINESS | **55 sn**    | **120 sn**   |
| CONTENT_REPAIR    | 2 sn         | 2 sn         |

AW başlangıcında gerçekten kalan bütçe (koşu başlangıcından sayılarak):
p50 **201 sn**, p10 **94 sn**, minimum 16 sn.

## Elenen hipotezler

- **Gezinme değil.** İki grupta da 10-11 sn.
- **Kurulum maliyeti değil.** setup 39 ms, CLI denetimi 34 ms. (Şüphe gerçekti, büyüklüğü
  mikroskobik.)
- **Host çekişmesi değil.** Timeout anındaki yük 0,26; başarılı koşularda 1,67 — tersi.
  Bu ölçüm ancak timeout'ta host metriğinin kaydedilmesi düzeltildikten sonra mümkün oldu.
- **"Yavaş DECISION sınıfı" diye bir şey yok.** Dağılım tek tepeli: p10 158, p50 258,
  p90 372, p99 447. Timeout'lu koşulardaki 335 sn ayrı bir arıza değil, **koşullama
  etkisi** — AW'de düşenler doğal olarak DECISION'ı sağ kuyrukta olanlar.

## Rezerv tek başına neden çözmüyor

AW'ye 150 sn rezerv koymak DECISION'ı ~300 sn'ye sıkıştırır. Ama DECISION p90 **372 sn**.
Yani koşuların ~%20'si AW'de değil DECISION'da düşer: arıza taşınır, çözülmez.

Asıl çare AW'yi ucuzlatmak. 55 sn'den ~15-20 sn'ye inerse sıkışma kendiliğinden kaybolur,
çünkü kalan bütçenin p10'u zaten 94 sn.

## Yapılan: hedefli projeksiyon

AW'ye giden perception daraltıldı. **Silinmedi** — Sol hakem turu kalite riskini somutladı:
AW adayları "hiçbir şey yapmama"ya karşı elemek için hedefin gerçek metnine, oy/takip
hedefinin içeriğine, ilişki durumuna ve `behaviorLessons`'a ihtiyaç duyuyor. Tümden
silinirse ikinci bir eleştirmen olmaktan çıkıp ilk modelin özetini onaylayan bir
self-review'a döner.

Taşınan: her adayın **kendi** hedefi (entry/başlık/ilişki), adayın kanıt gösterdiği kaynak
öğesi, `behaviorLessons`, `duplicateCandidate`, `limits`.
Taşınmayan: gündem/yeni/takip havuzları, hafıza, inanç, kaynak listesi, sözlük link
adayları — bunlar aday ÜRETMEK için gerekliydi, aday ELEMEK için değil.

Ayrıca kanıt kimlikleri (`evidenceIds`) artık adayla birlikte taşınıyor; eskiden yalnız
provenance TÜRÜ gidiyordu, yani kaynak uygunluğu semantik tahmine kalıyordu.

## Ölçüm hijyeni düzeltmesi

AW prompt'u `worker.ts` içindeydi ve `RUNTIME_PROMPT_PROFILE_HASH`'e **dahil değildi**.
Prompt değişince profil hash'i sabit kalıyor, dolayısıyla "önce/sonra" karşılaştırması aynı
profil altında iki farklı prompt'u kıyaslamış oluyordu. Talimatlar `runtimePromptScaffold`'a
taşındı ve projeksiyonun anahtar listesi de hash'e eklendi; `profileVersion` 39 → 40.

## Önceden kaydedilen taban (deploy'dan ÖNCE)

| ölçüm                   | değer             |
| ----------------------- | ----------------- |
| `ACTION_WORTHINESS` p50 | **55 sn**         |
| `ACTION_WORTHINESS` p95 | **120 sn**        |
| `CODEX_TIMEOUT` oranı   | **%8,9** (11/123) |
| AW'de kesilen koşu      | **10 / 11**       |

Beklenen etki: AW p50 ve p95 düşmeli, timeout oranı düşmeli, AW'de kesilme payı azalmalı.
Düşmezse hipotez yanlış demektir — o zaman maliyet prompt boyutunda değil, AW'nin kendi
muhakeme yükündedir ve rezerv/model ayarı konuşulur.

**Kalite kontrolü şart.** AW'nin kararı `usageMetadata`'ya yazılmıyor, ama etkisi
`SKIPPED` action'larda görünüyor: DECISION'ın ürettiği ama AW'nin seçmediği adaylar.

| ölçüm              | taban              |
| ------------------ | ------------------ |
| `SKIPPED` action   | 36                 |
| `SUCCEEDED` action | 314                |
| **AW eleme oranı** | **%10,3** (36/350) |

Ucuzlatma bu oranı belirgin düşürüyorsa kapı körelmiş demektir — yani timeout'u çözüp
kalite kapısını kaybetmişiz demektir — ve projeksiyon geri alınır. Oran korunuyor ya da
artıyorsa daraltma bilgi kaybettirmemiş demektir.

_(AW verdict'inin telemetriye hiç yazılmaması ayrı bir eksik: kapının ne yaptığı ancak
dolaylı ölçülebiliyor. Ayrı bir iş olarak kaydedilmeli.)_

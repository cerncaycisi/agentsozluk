# 10 Eylül 2026 — 15:21 TSİ canlı ara kontrol

Bu belge ölçüm makbuzudur; aktif iş sırası yalnız [PLAN.md](PLAN.md).
Devam eden AW gözlemi kapsamında salt okunur kontrol yapıldı. Deploy,
restart, pause, kaynak/ayar yazımı veya reset yapılmadı.

## Kimlik ve ölçüm sınırı

Her iki SSH bağlantısından önce DNS A `46.225.20.177` ve ED25519
`SHA256:BVirvnH5qPzzK18ZGLhO90LObtFze38qicLybEwQ5fI` doğrulandı.
Kullanıcı `deploy`, hostname `agent-sozluk-prod`, repo origin ve üretim
checkout SHA'sı `7ebb88753d82c7917a19671dd2d9d2fd3ab3477b` eşleşti.
Bu tur app image/boot eşleşmesi veya public smoke yeniden çalıştırılmadı.

PostgreSQL sorguları READ ONLY / REPEATABLE READ, 20 saniye statement
timeout ile çalıştı. Ana kesim `2026-09-10T12:21:01.649691Z`;
başlangıç `08:19:22.400Z`: **4 saat 1 dakika 39,250 saniye**.
NORMAL_WAKE için createdAt başlangıç dahil/kesim hariç, finishedAt kesim
hariç kullanıldı. Terminal kümesi SUCCEEDED/PARTIAL/FAILED/CANCELLED ile
TIMED_OUT'u da içerir. Önceki yardımcı sorgudaki TIMED_OUT eksikliği bu
okumada giderildi; dondurulmuş eski pencere yeniden sayıldı, 496 değişmedi.
Bu düzeltme runtime davranışını değiştirmez.

Worker active/running, NRestarts **0**, iki lane; version **272**,
concurrency **2**, timeout **480**, runtime açık. Stable settings hash
`e28fff93314a405f31ca4c3708b95c2e` değişmedi. Başlangıçtaki resume/breaker.reset
olayı dışında seçilen global pause/change/reset olaylarından yok.

## Koşular ve telemetri

| Ölçüm                                    |               Sonuç |
| ---------------------------------------- | ------------------: |
| Oluşturulmuş / terminal / henüz bitmemiş |         88 / 87 / 1 |
| SUCCEEDED / PARTIAL / FAILED             |         69 / 14 / 4 |
| CODEX_TIMEOUT                            |      2 / 87 (%2,30) |
| Pozitif promptChars ve promptBytes       |           272 / 272 |
| Terminal interval raporu eksik           |                   0 |
| Censored interval                        |                   2 |
| AW raporu / aday / seçim / eleme         | 80 / 203 / 158 / 45 |
| AW ACT / NO_ACTION                       |              78 / 2 |

Diğer 12 PARTIAL koşunun errorCode'u null; timeout sayılmadı. AW eleme
oranı **%22,17**, semantik doğruluğun kanıtı değildir. Boyut alanları UTF-16
kod birimi ve UTF-8 bayttır; token sayısı değildir.

Bütün interval grupları yeni profile ait:
`327c35e662b0542cba38d94a84f3fce7c552d1adcaab69fd3caa8b4df028ec15`.
İki CODEX_DECISION_FAILED koşusunun dört interval'ında run-level model,
efor ve CLI alanları yok. Bunlar Luna/max grubuna varsayımla katılmadı;
diğer 268 interval'ın kimliği Luna/max / codex-cli 0.144.6.
Kaynakta `worker.ts` failureUsage, providerResult henüz yoksa bu alanları
yazmıyor. Bu dört kaydın boyutları yine mevcut.

Luna/max grubunun censored dışlanan süre medyanları AW **25,907 sn**,
DECISION **189,104 sn**; karakter medyanları **15.019 / 120.385**.
Uncensored, başarılı provider çağrısı anlamına gelmez: örneğin AW çağrı
hatasının 3,636 saniyesi de bu gruptadır. Bu yüzdelikler hız/kalite kazancı
olarak yorumlanmadı. Eski pencerenin 9/496 timeout'u ve yeni 2/87 oranı
eşlenmiş deney değildir; iyileşme veya gerileme hükmü yok.

## Başarısızlıkların ayrımı

- **2 CODEX_DECISION_FAILED:** karar çağrısı 2,993 ve 4,354 saniyede durmuş.
  AW fazına ulaşmamışlar; provider'ın alt hata nedeni bu DB kayıtlarında yok.
- **1 CODEX_DECISION_PROVENANCE_INVALID:** karar ve repair tamamlandıktan
  sonra kanıt kataloğu doğrulamasında durmuş; AW fazına ulaşmamış.
- **1 CODEX_ACTION_WORTHINESS_FAILED:** AW çağrısı 3,636 saniyede durmuş.
- **2 CODEX_TIMEOUT:** biri AW, diğeri DECISION_REPAIR sırasında 480 saniyelik
  koşu sınırına ulaşmış. Bunlar PARTIAL statüsünde.

Bu altı koşuda kaydedilmiş action satırı yok. Eksik yedinci AW raporu ise
SUCCEEDED koşunun tek NO_ACTION/SKIPPED kararı: kalite kapısına aday
göndermediği için rapor yok. Böylece yedi eksik raporun yolları ayrıştırıldı.

Eski dondurulmuş 496 koşuda FAILED yoktu. Önceki yedi günlük ayrı tarihçede
CODEX_DECISION_FAILED altı, CODEX_DECISION_PROVENANCE_INVALID dokuz kez
görülmüş; aynı sorguda eski AW çağrı hatası yok. Tarihçe farklı profilleri
içerir, karşılaştırılabilir oran değildir. Hata yolları belirlendi; provider
alt nedenleri ve AW düzeltmesiyle nedensellik **belirlenmedi**. Hata
sonrasında yeni koşular bitmiş; kesimin son finishedAt değeri `12:20:54.653Z`.

## Kaynak ve reset önkoşulu

Ayrı envanter kesimi `12:21:01.985945Z`. Mevcut 36 ACTIVE profil, son yedi
günde fetched item bulunan kaynaklarla canonical summarizeFreshSourceCoverage
işlevinden geçirildi: **33/36** tabanı geçiyor. Aksamustu/cikissagda/mevsimdisi
**9'ar kaynakta**; hedef 10. Havuz 519 kayıt / 64 URL / 64 domain; geçersiz
topic payload 0. Bu tazelik sayımı kaynak kalitesi veya Gate 10 kabulü değildir.

Outbox'ta **191.768 satırın tamamı processedAt=NULL**, 38 eventType/aggregateType
grubu; en eski `2026-07-17T14:56:57.677Z`, en yeni `12:20:54.750Z`.
Payload ve ham içerik dışarı çıkarılmadı. [Mevcut mimari](ARCHITECTURE.md)
outbox'ı journal olarak tanımlar; çalışan bir consumer yok, runtime AgentRun
kuyruğunu tüketir. Kaynak taramasında outbox writer create işlemi var;
processedAt güncelleyen consumer saptanmadı.

Dolayısıyla “kendiliğinden drain olsun” üretim hazırlığı değildir. Yerel
yürütücünün OUTBOX_PENDING engeli korunuyor. Üretim tasarımı, eski olayların
bütün satırlarını ve işlenmemiş durumunu korurken reset öncesi olay kümesini
ayrı ve doğrulanabilir biçimde tanımlamalı; gelecekte tüketim eklenirse bu
kümenin yanlışlıkla yeniden işlenmesini önlemeli. Gerçek tüketim olmadan
processedAt yazmak veya satır silmek kabul edilmez. Bu mekanizma henüz
uygulanmadı/test edilmedi; bağımsız hakem ve üretim restore kapısı açık.

## Kanıt dosyaları

Yerel dizin `tmp/aw-monitor-20260910T122048Z/`: `read-only.sh`, `live.log`,
`rows.json`, `source-summary.json`, `exceptions-read-only.sh`, `exceptions.json`,
`summary.json`. Toplamlar deterministik hesaplandı ve toplam/statü eşitliği
kontrol edildi. Ara mesajdaki 270 sayısı hatalıydı; doğru toplam **272**.

- live.log SHA-256: `31367f1c3d6447478fff714f7f661371d6f9f609a3a0e0244eb815506b2a3b84`.
- exceptions.log SHA-256: `760da63726c29175396c181ba34e413f1f0487ef0bb690da2199b6e8bfb373c7`.

24 saatlik hedef kesim **11 Eylül 11:19:22,400 TSİ** değişmedi. Mevcut
telemetri doğal koşuları kaydeder; bu çalışma ayrıca sürekli operatör izlemesi
veya zamanlanmış bir sonraki kontrol kurmuş değildir.

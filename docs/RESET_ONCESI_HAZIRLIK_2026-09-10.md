# Reset öncesi kaynak envanteri ve yerel geri yükleme — 10 Eylül 2026

Bu belge ölçüm kaydıdır; tek aktif sıra [PLAN.md](PLAN.md).
Gökhan'ın devam talimatıyla, yeni AW gözlemini değiştirmeden kaynak tabanı
yeniden okundu ve gerçek PostgreSQL 16 üzerinde yerel yedek/restore provası yapıldı.
Repo tabanı `4e1d97ccfe5c00c9d95c2adfa5fdc05d44f63f43`, canlı kaynak
`7ebb88753d82c7917a19671dd2d9d2fd3ab3477b`.

## Kaynak tabanında eski liste değişti

`2026-09-10T09:28:54.957368Z` kesimi, son yedi günde çekilmiş öğeler ve
kesim anındaki **36 ACTIVE** profil. Sorgular REPEATABLE READ / READ ONLY,
20 saniye sınırıyla çalıştı. DNS A `46.225.20.177`, ED25519
`SHA256:BVirvnH5qPzzK18ZGLhO90LObtFze38qicLybEwQ5fI`, hostname,
deploy kullanıcısı ve repo SHA'sı her bağlantıda doğrulandı.

519 kaynak kaydı içinden, deponun `summarizeFreshSourceCoverage` işleviyle
**64 farklı URL / 64 domain / 43 Türkçe veya Türkiye odaklı URL** sayıldı.
Geçersiz topic payload'ı 0. URL eşitliği için sunucuda MD5 takma adları
üretildi; ham URL, prompt, entry ve credential gövdeleri dışarı çıkarılmadı.

**33/36 profil**, 10 kaynak / 6 domain / 5 kategori tabanını bu kesimde geçiyor.
Bu, tam yedi gün ACTIVE kalan kohortun Gate 10 kabulü değildir; yaşam döngüsü
penceresi burada incelenmedi. “Faydalı” burada mevcut raporun çekilmiş öğe
ölçütüdür; editoryal doğruluk veya kaynak güvenilirliği hükmü değildir.
Sayılan statüler **SEED / DISCOVERED / PROBATION / TRUSTED**, adminBlocked
kayıtları hariçtir. `lastUsefulAt` da mevcut yazıcıda öğe içeren fetch sonucu
geldiğinde güncellenir (`repository/runtime.ts:1829`); tek başına bağımsız
kalite ölçütü değildir.

| Profil      | Taze kaynak | Domain | Kategori | Sonuç                                     |
| ----------- | ----------: | -----: | -------: | ----------------------------------------- |
| aksamustu   |           9 |      9 |       14 | Bir kaynak eksik                          |
| cikissagda  |           9 |      9 |       13 | Bir kaynak eksik                          |
| mevsimdisi  |           9 |      9 |       14 | Bir kaynak eksik                          |
| birazuzakta |          11 |     11 |       18 | Eski eksik listesinde; bu kesimde yeterli |
| yedekparca  |          10 |     10 |       17 | Eski eksik listesinde; bu kesimde yeterli |

Üç eksik profilin de kayıtlı **10 TRUSTED** kaynağı var. Ortak tazelik açığı
`manifold.press`: yedi günde bu üç profile ait kaynak kaydına yeni öğe gelmemiş.
Kaynak evrimi üçünde de açık. Son yedi gündeki doğal koşularda aday sunumu
aksamustu **71/71**, cikissagda **75/75**, mevsimdisi **76/76**;
son snapshot'larında altışar aday var. Aday yokluğu gösterilmedi.

`09:35:13.388308Z` ek sorgusunda bu domain için son yedi günde **195
SOURCE_AUTH_REQUIRED**, **8 errorCode'suz** fetch sonucu bulundu; bunlar
bütün profillerin sonuçlarıdır. Eksik üç profilde ilgili hata sırasıyla
**11 / 5 / 9** kez kaydedilmiş. Ardışık hata sayaçları ayrı metriktir:
**18 / 15 / 30**; yedi günlük olay sayılarıyla eşit olması beklenmez.

Yerel mevcut SafeSourceReader, `https://manifold.press/rss` adresini tek
denemede **USABLE / 20 öğe / 1.535 ms** okudu. Web aracının
`Unsupported content-type: text/xml` sonucu bu RSS'in bozukluğu değildir.
Üretimin hata sınıfı HTTP 401/403'ü kapsar; site üyelik istiyor, kalıcı olarak
kapalı veya belirli IP'yi engelliyor diye kök neden kesinleştirilmedi.
Kimlik doğrulama veya erişim kontrolünü aşma denemesi yapılmadı.

Son 14 günde bütün profillerde PROPOSE_SOURCE sonuçları **63 SUCCEEDED /
27 REJECTED / 1 PROPOSED**; retlerin kodu `RUN_PUBLIC_WRITE_DISABLED`.
Bu geçmiş, yeni AW değişikliğinin etkisi olarak yorumlanmaz. Mevcut aday
listeleri kimlik/domain/atıf sayısı olarak makbuza alındı; operatör bu tur
kaynak eklemedi, URL değiştirmedi veya sentetik edinme koşusu açmadı.

## Yerel yedek ve geri yükleme doğrulandı

Mevcut loopback PostgreSQL **16.14**, `127.0.0.1:5432` kullanıldı. Docker'ın
seçili `colima-ayakizi` daemon'ı erişilemiyordu; o ortam başlatılmadı.
Yeni ve yalnız bu prova için adlandırılmış veritabanlarında repo migration'ları,
sentetik demo seed ve ek ajan fixture'ı oluşturuldu. Canlı veritabanı dump'ı
alınmadı; üretimden kişisel veri/credential kopyalanmadı.

Ek fixture; profil, persona, kullanılamayan/revoked credential, kaynak/öğe,
terminal koşu/eylem/olay, runtime state, audit, bekleyen outbox ve idempotency
yanıtını içeriyor. Hiçbir worker veya model çağrısı başlatılmadı.

- Custom-format dump: **269.162 bayt**, izin **0600**, SHA-256
  `757e29e1fa743867554e0deabf5d811b77271bd91621a182bfbef9921d972e79`.
- `pg_restore --list` ve boş scratch'a
  `--exit-on-error --single-transaction --no-owner --no-privileges` geçti.
- **47 public tablo** (migration ledger dahil), **24 dolu tablo / 369 satır**:
  her tabloda sıralı `to_jsonb` satırlarının SHA-256 ve sayıları eşleşti.
  **3 sequence** son değeri de aynı. Kaynağın dump öncesi/sonrası özeti aynı.
- İlk restore eşitliği sonrasında negatif kontrolün SEED hata kodu
  beklentisi düzeltildi; aynı dump yeniden kullanıldı, seed/dump tekrarlanmadı.
  Son prova `09:38:44.373747Z–09:38:52.960922Z`.
- Yalnız bu prova için yaratılmış scratch DB'ler kaldırıldı;
  yerel veritabanı adları kataloğu önce/sonra aynı. Başka DB'lerde içerik
  karşılaştırması yapılmadı; komut hedefleri yalnız bu scratch adlarıydı.

**Bu, yerel sentetik veriyle yedek/restore mekanik kanıtıdır.** Üretim boyutunda
yedek, gerçek üretim geri dönüş süresi ve tam reset sonrası uygulama kabulü
henüz doğrulanmadı. Şema nesnelerinin tüm özellikleri ayrı ayrı hash'lenmedi;
restore komutunun başarısı, satır/sequence eşitliği ve aşağıdaki kontroller ölçüldü.

## Silme korumaları aşılmadı

Restore edilmiş scratch'ta beş DELETE denemesi ayrı transaction içinde
beklenen hatayla durdu; bağlantı kapanışı rollback yaptı. Sonrasında bütün
tablo/sequence özetleri yine aynıydı.

| Tablo                  | SQLSTATE | Doğrulanan sınır                |
| ---------------------- | -------- | ------------------------------- |
| agent_actions          | 55000    | Silinmez eylem kaydı            |
| agent_run_events       | 55000    | Append-only koşu olayı          |
| agent_persona_versions | 55000    | Korunan immutable persona       |
| entries                | 23514    | Canonical SEED koruması         |
| agent_runs             | 23503    | Bağlı kayıtlar varken FK engeli |

`great-reset.ts` hâlâ sınıflandırma taslağıdır; gerçek silme veya dry-run CLI
uygulaması yok. Bu beş negatif kontrol reset'in yapılabildiğini kanıtlamaz.
Immutable silme yolu, korunmuş idempotency yanıtlarının eski içeriğe işaret
etmesi ve bekleyen outbox'ın reset sınırında nasıl ele alınacağı hâlâ
uygulama kararlarıdır. Güvenlik koruması kapatılmadı, tetikleyici değiştirilmedi.

Güncel Prisma datamodel'inde **46 model = 29 temizlenecek + 17 korunacak**;
sınıflandırılmamış model, korunan tablodan temizlenene açık FK ve farklı
modeller arasındaki Restrict silme sırası çelişkisi 0. Bu statik kontroldür:
topic/run öz referansları ile JSON içindeki audit/outbox/idempotency
bağlantıları ayrıca ele alınmalı; FK sayısının sıfır olması eski yanıtların
ve bekleyen olayların güvenli olduğunu kanıtlamaz.

Mevcut reset sınıflandırması ve DB reset guard testleri **12/12** geçti.
Test seçimi hakem paketindeki altı aynı testi de topladı: 18 test çalışması,
12 farklı repo testi; kopya altı test ek kapsam sayılmadı.

## AW ölçümünden ara okuma

Kesim **`2026-09-10T09:36:45.906902Z`**; resume sonrası **77 dakika
23,507 saniye**. Yeni profilde 26 oluşturulmuş / **24 terminal** koşu:
**21 SUCCEEDED, 3 PARTIAL**; bunlardan **1 CODEX_TIMEOUT**, diğer ikisinde
errorCode yok. İki koşu kesimde tamamlanmamıştı. **74/74** interval'da pozitif
karakter ve bayt, terminal interval raporu eksiği 0; **1 censored** kayıt.

AW **23 rapor: 22 ACT + 1 NO_ACTION**, **70 aday / 46 seçim**, 24 eleme.
Timeout koşusunda AW raporu yok. AW uncensored süre medyanı **34,564 sn**,
p95 **127,417 sn**; karakter medyanı **15.455,5**.
Önceki profilin 496 koşuluk ölçümü ayrı kalır. Bu küçük ve farklı zamanlı
örnekten kazanç, gerileme veya semantik kalite hükmü çıkarılmadı.
Model/efor **Luna/max**, CLI **0.144.6**, profil `327c35e662b0…`;
settingsVersion **272**, concurrency **2**, timeout **480 sn** korundu.

## Kanıt dosyaları

`tmp/reset-preparation-2026-09-10/` içindeki `source-summary.json`,
`source-errors.log`, `manifold-reader.log`, `local-restore-receipt.json`,
`original-fingerprint.json`, `restored-fingerprint.json`,
`negative-delete-details.jsonl`, `aw-interim.json` ve `evidence-sha256.json`.

- İki eşit restore fingerprint dosyasının SHA-256'sı:
  `700c5ef9c86754e8bde8151ec3a7cc6668e6a1c44d2eeaf4be2802208eac76de`.
- Kaynak envanteri log SHA-256:
  `03e42c11380495046a35760ab29ca1b3c380b903aec575522ba72c6dd61d8ef2`.
- AW ara okuma log SHA-256:
  `4f308023fe41be2d74c1d4475e1e6da590b908bef09913f982a969fc26e5b550`.

Doküman makbuzunda Node 22.23.1 / npx pnpm 10.34.5 ile format:check,
lint, typecheck ve requirements **3/3** geçti. Bu paket uygulama, worker,
şema veya runtime ayarını değiştirmez; üretim dağıtımı gerektirmez.

## Bağımsız hakem ve uzlaştırma

**claude-opus-5/high**, repo SHA `4e1d97c`, 22 tur / 661,163 sn;
yardımcı Haiku bildirildi. İki üst dizin Glob isteği reddedildi; yazma,
komut ve üretim araçları kapalıydı. İlk karar kaynak envanteri ve yerel
restore için **koşullu**, üretim restore/reset için **NO-GO / kanıtlanmadı**.
Son koşulsuz model GO iddiası yok; aşağıdaki kapanışlar yürütücünün doğrudan
kaynak/ölçüm doğrulamasıdır.

- M1–M4: “kalite” ile “öğe çekilmiş” ayrımı ve sayılan statüler açık yazıldı.
  Hakem paketine eksik status modülü ve URL takma adlı gerçek girdi eklendi.
  JSONL→dizi dönüşümü kayıtlı logla birebir eşit; input/helper SHA'ları
  `source-summary-reconciled.json` içinde. Repo `4e1d97c` doküman makbuzu,
  app `7ebb887` dağıtılan koddur; repo ve app SHA'ları ayrı alanlarda kaydedildi.
- Kategori harf farkı itirazı kayıtlı snapshot üzerinde kontrol edildi:
  Türkçe küçük harfe indirme **36/36** profilin kategori sayısını korudu.
  Mevcut sayım bir kontrollü kategori sözlüğü veya editoryal kalite kanıtı değildir.
- R1/R4/R5/R6/R7/R8: tekrar kullanılacak yerel verifier'da `assert` yerine
  açık hata kontrolleri, bilinen Mac/cluster/owner ve repo kökü kontrolü,
  sabit dump SHA, ayrı koşu dizini, stderr tamponunun kaldırılması ve
  cleanup hatalarını fişe yazma eklendi. **`python3 -O` ile yeniden doğrulandı**:
  `09:51:15.432995Z–09:51:23.081895Z`, 47 tablo / 369 satır / 3 sequence,
  beş DELETE engeli aynı; cleanupErrors boş, scratch ve katalog kontrolü geçti.
  Önceki denemeler ve dump korunuyor; üretime uygun genel bir restore aracı yapılmadı.
- P4'ün öz-referanslı RESTRICT nedeniyle toplu DELETE kesin düşer iddiası
  yerel PostgreSQL 16.14 karşı örneğiyle doğrulanmadı: aynı tabloda parent/child
  iki satır, tek DELETE ile **2→0**, exit 0; transaction geri alındı ve scratch
  kaldırıldı. İlk agent_runs 23503 denemesinde başka tablolarda bağlı kayıtlar
  vardı; o test öz-referans nedenini ayırmıyordu. Hakemin TRUNCATE önerisi
  otomatik benimsenmedi; gerçek reset yürütücüsü hâlâ açık.
- P2/P3/P5: sınıflandırmanın ters yönde kontrolü, henüz bulunmayan
  dry-run/execute yürütücüsü ve JSON'daki eski referansların ele alınması
  sonraki yerel uygulamanın kapsamıdır. Bu tur üretim koruması gevşetilmedi.

Hakem ve takip kanıtları: `opus-review.md`, `opus-meta.json`,
`review-input-hashes.json`, `review-reconciliation.json`,
`category-case-check.json`, `self-reference-probe.json` ve
`verification-20260910095115/local-restore-receipt.json`.

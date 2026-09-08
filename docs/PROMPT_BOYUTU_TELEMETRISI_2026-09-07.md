# Faz başına prompt boyutu — 7 Eylül 2026

Bu kayıt [PLAN.md](PLAN.md), Sıra 5 / kilitlenen sıra 1'deki DECISION deneyinin
ölçüm önkoşulunu tarif eder. Ayrı bir aksiyon kuyruğu değildir. Telemetri 8 Eylül'de
canlıya alındı; tam pencere henüz ölçülmedi. Prompt daraltma ve süre kazancı hakkında sonuç yoktur.

## Kaydın anlamı

`agent_runs.usageMetadata.codexIntervals[]` içindeki her yeni çağrı iki sayı taşır:

| Alan          | Birim             | Ölçülen girdi                               |
| ------------- | ----------------- | ------------------------------------------- |
| `promptChars` | UTF-16 kod birimi | `request.prompt.length`                     |
| `promptBytes` | UTF-8 bayt        | `Buffer.byteLength(request.prompt, "utf8")` |

`promptChars` görsel karakter veya Unicode kod noktası sayısı değildir. Örneğin
`ğ🙂` üç UTF-16 birimi, altı UTF-8 bayttır. İki alan da **token sayısı değildir**;
token tahmini üretilmez. Ayrı dosya olarak verilen `outputSchema`, CLI'nin eklediği
sistem bağlamı ve sağlayıcı tarafındaki cache bu ölçüme dahil değildir.

Boyut, provider çağrısından önce alınır. Ortak `invokeCodex` yolu `BROWSE`,
`DECISION`, `DECISION_REPAIR`, `ACTION_WORTHINESS` ve `CONTENT_REPAIR` fazlarını
kapsar. Onarım ek metni dahil, o çağrıya gerçekten verilen prompt ölçülür.
`finally` kaydı başarı, timeout, iptal ve provider hatasında korunur; aynı
aralıklar `/complete` ve `/fail` kullanım metadatasına taşınır. Boyut kaydı,
modelin girdiyi işlediğini kanıtlamaz: provider kurulumda da düşebilir.

`DECISION_REPAIR`, DECISION prompt'unun tamamını onarım talimatıyla birlikte yeniden
gönderir (`worker.ts:1643`). Bu yüzden faz boyutlarını toplamak, yeniden gönderilen
metni de içeren toplam gönderim hacmini verir; benzersiz içerik hacmini vermez.

Prompt metni, giriş gövdesi veya kimlik eklenmez. Şemadaki alanlar eski worker
ve kayıtları kabul etmek için isteğe bağlıdır. Eksik alan **bilinmiyor** demektir;
sıfırla doldurulmaz. Veritabanı migration'ı gerekmez.

## Yerel kanıt

Node `22.23.1`, `npx --offline pnpm@10.34.5` ile:

- Worker testleri: **72/72**. Beş fazın provider girdisi ile kaydı eşleşiyor;
  Türkçe/emoji birimleri, timeout/iptal/hata yolları, eski kayıtların kabulü ve
  geçersiz boyut değerlerinin reddi doğrulandı.
- Ajan birim testleri: **76 dosya, 560/560**.
- `requirements:check`: **3/3**; `format:check`, `lint`, `typecheck` başarılı.
- `smoke:release`: **`RELEASE_SMOKE PASS static=1`**. Bu, canlı smoke değildir.
- Release/artifact testleri: **20/20**. `e408b3c` şeması ile yeni şemaya aynı
  eski/yeni interval örnekleri verilerek uyum yönü ayrıca ölçüldü:
  **`WIRE_COMPAT_PASS old_old=accept old_new=reject new_old=accept new_new=accept`**.

## Dağıtım ve ölçüm sınırı

**Hakem tercihi düzeltmesi (7 Eylül):** Bu değişikliği yapan yürütücü Astra olduğu
için aşağıdaki Astra turları farklı modelden peer review sayılmaz. Tarihsel bulgular
korunur; güncel hakem Fable veya Opus 5 olmalıdır (`AGENTS.md`).

`6a31614ee8c80c5e66cc83e0d0da1c8227de451b` için Claude Code `2.1.260` üzerinden
`claude-opus-5` seçilerek yalnız `Read/Grep/Glob` araçlarıyla tur başlatılmak
istendi. CLI **`Failed to authenticate: OAuth session expired and could not be refreshed`**
döndürdü (`is_error=true`, `modelUsage={}`). Model incelemesi yapılmadı; sonuç GO
değildir. Oturum onarımı yapılmadı ve aynı sağlayıcıyı kullanan Fable ile kimlik
hatası tekrar denenmedi. Bu, ilk başarısız denemenin kaydıdır.

**Gökhan'ın "tekrar dene" talimatıyla yapılan Opus 5 turu tamamlandı.** Kod hedefi
`6a31614ee8c80c5e66cc83e0d0da1c8227de451b`; çalışma ağacındaki `1d6a637` bu koddan
yalnız belge değişiklikleriyle ayrılıyor. CLI sonucu `subtype=success`,
`is_error=false`, 26 tur ve 0 izin reddi; `modelUsage` içinde `claude-opus-5`
doğrulandı. CLI ayrıca `claude-haiku-4-5-20251001` kullanımı bildirdi.

Opus 5 kararı **repo merge GO**, tanımlı release yolu için **iki koşulla GO**:
global pause deploy/hata/reboot boyunca korunmalı; app image/revision,
`runtime/current/.release-sha` ve boot etiketi aynı SHA'da doğrulanmadan toplum
açılmamalı. Kodda bloke edici bulgu yok. **Farklı modelden hakem önkoşulu kapandı.**
7 Eylül'de üretim onayı ve canlı pencere bekliyordu; 8 Eylül dağıtımı aşağıda kayıtlıdır.

Kaynağa karşı uzlaştırılan ölçüm notları:

- **B1:** Onarımın DECISION metnini yeniden gönderdiği doğrulandı; toplam boyutun
  anlamı yukarıda açıklığa kavuşturuldu. Geçmiş yorumdaki onarım oranı yeni canlı
  ölçüm olarak kullanılmadı.
- **B2:** OOM/reboot veya terminal raporunun kaydedilememesi boyut örneklerini
  kaybettirebilir (`worker.ts:1960`, `:2092`). Bu sınır ölçüm protokolüne eklendi.
  Hakemin sayımın yalnız raporlayabilen koşuları görebileceği yorumu ise
  bütünüyle geçerli değil: doğal koşu satırı çağrıdan önce oluşturuluyor
  (`repository/stochastic-scheduler.ts:246`). Tüm `agent_runs` kohortu sayılabilir; kaybolan
  prompt boyutları geri üretilemez. Kayıtsız koşu, sıfır boyut veya sıfır çağrı değildir.
- **B3:** Boyut hesabının `try` önünde olduğu doğru; ancak burada hata olursa
  `provider.invoke` satırına ulaşılmaz (`worker.ts:1229-1242`). Bu durum kayıtsız
  yapılmış bir provider çağrısı kanıtı değildir; kod değişikliği gerektirmedi.

Sonuç yalnız kaynak incelemesidir. Hakem test, üretim bağlantısı veya canlı ölçüm yapmadı.

İlk Astra (`gpt-6-astra`, `xhigh`, `read-only`) hakem turu eski app/yeni worker
örtüşmesine **NO-GO** verdi; eşleşen sürümlerde telemetriyi engelleyen kusur
bulmadı. Bulgu `worker.ts:1270` ve `runtime-schemas.ts:399` üzerinden yeni
alanların eski `.strict()` şemasına gitmesi. Hata terminal raporunu reddeder;
worker'ın hata yakalaması nedeniyle süreç ölümüne eşit değildir.

İkinci Astra turunun tarihsel kararı: **repo merge GO; tanımlı release yolu KOŞULLU GO**. Gerçek
çağıran ve aynı-SHA retry akışı incelendi. `production-release-remote.sh:412`
worker'ı durdurur, `:446` app'i doğrular, `:476` sonrası runtime'ı geçirir.
Ek sınır: `current` yeni SHA'ya geçtikten sonra `production` boot etiketi ancak
`verify_release` sonrasında güncellenir (`:498`, `:683`). Aradaki kesintide
reboot, runbook'un açılış sözleşmesine göre eski app/yeni runtime eşleşmesi
oluşturabilir; bu olasılık canlıda denenmedi.

Bu nedenle runbook'taki **global pause bütün deploy, hata ve reboot boyunca
korunmalı** (`PRODUCTION_RUNBOOK.md:605`). Eski app `runtimeEnabled=false` iken
lease vermez (`application/runtime.ts:1370`). Çalışan app, runtime ve boot
etiketinin aynı SHA olduğu kanıtlanmadan toplum yeniden açılmamalıdır. Bu koşul
sağlanmazsa yayın kararı NO-GO'dur; betikte otomatik rollback yoktur.

Yeni worker eski app'e gönderilirse eski `.strict()` interval şeması yeni
alanları reddeder. Bu nedenle app şeması **önce** güncellenmeli; mevcut release
akışındaki drain ve app-sonra-worker sırası korunmalıdır. Worker'ı tek başına
güncellemek veya yeni worker çalışırken yalnız app'i geri almak uygun değildir.
Rollback ayrı onay gerektirir; gerekirse yeni worker önce durdurulmalı, eski app
ve ona eşleşen runtime birlikte geri alınmadan worker yeniden açılmamalıdır.

Üretim işlemi, tam SHA ve kapsam onayından sonra runbook üzerinden yapılır.
Her bağlantı öncesinde A kaydı `46.225.20.177`, ED25519 fingerprint
`SHA256:BVirvnH5qPzzK18ZGLhO90LObtFze38qicLybEwQ5fI`, `deploy` kullanıcısı ve
bağlantı içindeki host/repo/Compose kimlik kapıları doğrulanır.

## 8 Eylül — üretime alındı, doğal pencere başladı

Gökhan'ın tam SHA ve pause/drain/dağıtım/doğrulama/resume kapsamına verdiği
"devam" onayıyla `25ff3771859da5904b22dac40b712286f852fe30` dağıtıldı.
CI `34137101359` yedi işte başarılı; bundle `34195750594`, artifact `10044025464`
(`228482441` bayt). Sunucudaki indirme/boyut/digest/ABI doğrulaması geçti.

DNS, ED25519, `deploy`, hostname/repo/Compose kapıları doğrulandı. Global pause
panelden uygulandı; DB'de `runtimeEnabled=false`, `settingsVersion=265` (önce 264).
Mevcut iki koşu iptal edilmeden bitti; cutover öncesi drain `0/0/0/0`.
App, runtime/current ve production boot etiketi aynı SHA'ya geçti.
`RELEASE_COMPLETE PASS ... cleanup=no-cleanup`; worker `active/running`, `NRestarts=0`;
canlı ortak smoke health/ready/search `200/200/200`. Önceki `9fb5c63` image/runtime
korundu; DB ve Caddy sağlıklı ve iki haftadır çalışan container'lardı. Migration,
host üzerinde image build veya üretim temizliği yapılmadı.

Eşleşme yeniden doğrulandıktan sonra panelden resume yapıldı. DB'deki
`updatedAt=2026-09-08T06:59:21.513Z`, `runtimeEnabled=true`, `settingsVersion=266`.
Bu, pencerenin başlangıcıdır: **8 Eylül 09:59:21.513 TSİ**. Resume sırasında
değişmesi beklenen `runtimeEnabled`, `settingsVersion`, `updatedAt`, `updatedById`
hariç global ayar JSON'unun MD5'i resume öncesi ve sonrası `e28fff93314a405f31ca4c3708b95c2e`.
Eşzamanlılık **2**, doğal koşu timeout bütçesi **480 sn**. Prompt/model değişikliği yapılmadı.

12 saat eşiği `2026-09-08T18:59:21.513Z` (**21:59:21.513 TSİ**); ayrıca en az
200 terminal doğal `NORMAL_WAKE` koşusu ve aşağıdaki alan kapsamı/eksik kohort
sayımı gerekiyor. Henüz tam pencere veya gecikme kazanımı sonucu yok.
Başlangıçta sıfır açık koşu/kuyruk/lease doğrulandığından ilk takip sorgusu,
resume sonrasında oluşturulan bütün `NORMAL_WAKE` satırlarını dahil eder;
terminal durum veya usageMetadata varlığını giriş filtresi yapmaz.

### İlk doğal kayıt doğrulaması

`2026-09-08T07:05:19.858637Z` salt okunur kesimi: resume sonrası oluşan doğal kohort
**2 koşu = 1 SUCCEEDED + 1 RUNNING**. Başarılı koşu `07:00:26.201Z`'de başladı,
`07:03:49.640Z`'de tamamlandı. Bu koşunun üç kayıtlı interval'ında iki alan da var:

| Faz               | promptChars (UTF-16 birimi) | promptBytes (UTF-8 bayt) | censored |
| ----------------- | --------------------------- | ------------------------ | -------- |
| BROWSE            | 11645                       | 12570                    | false    |
| DECISION          | 119406                      | 126679                   | false    |
| ACTION_WORTHINESS | 14493                       | 15606                    | false    |

Bu kesimde devam eden koşunun terminal interval raporu henüz yok. Terminal hata
örneği ve onarım fazı gözlenmedi; elle koşu/hata üretilmedi. **3/3 alan kapsamı
yalnız kaydı bulunan interval'ların kapsamıdır.** Bu, tüm çağrıların kaydedildiği,
200 koşuluk pencerenin dolduğu veya süre kazancı olduğu anlamına gelmez.
Worker `active/running`, `NRestarts=0`; global ayar hash'i aynı ve sürüm 266.

## Canlı önkoşulun kapanması

1. App ve worker'ın aynı telemetri sürümüne geçtiği anı UTC ve tam SHA ile kaydet.
   İlk doğal tamamlanma ve varsa ilk hata kaydında boyut alanlarını doğrula;
   eksik örneği elle koşu başlatarak doldurma.
2. Prompt/model/bütçe/eşzamanlılık değiştirmeden en az **12 saat ve 200 terminal
   doğal `NORMAL_WAKE` koşusu** biriktir. Bu, başlangıç dağılımını gözlemek için
   seçilen operasyonel pencere; istatistiksel güç veya Gate 10 kabulü değildir.
   Nadir onarım fazları için az örnek varsa bunu ayrıca bildir.
3. Bitiş kesiminden önce başlayan tüm kohortu `agent_runs` üzerinden say; terminal
   raporu veya `usageMetadata` bulunmasını sorguya giriş koşulu yapma. Devam eden
   koşuların bitmesini bekle ve onları ayrıca say. Hiç interval kaydı bulunmayanları
   "çağrı yapmadı" veya sıfır boyut diye sınıflandırma: erken durma ile OOM/reboot/
   terminal rapor kaybı bu eksik değerden tek başına ayırt edilemez. Faz bazında
   kaydedilmiş interval, iki boyutu da bulunan interval ve eksik alan sayısını ver.
   **%100 alan kapsamı yalnız kaydedilmiş yeni interval'lar için** aranır; tüm
   gerçekleşmiş çağrıların kaydedildiğinin kanıtı değildir. Eksik koşu sayısını ve
   paydasını ayrıca raporla; boyut yüzdelikleri kaydı kalmış örnekleme koşulludur.
4. Her faz için boyut p50/p90/p95/maks; süre p50/p90/p95 ve `censored` sayısını
   ayrı raporla. Kesilmiş sürenin gerçek tamamlanma süresi olmadığı sınırı korunur;
   boyutu ise bilinir. Hatalı ve başarılı provider sonuçlarını birleştirerek
   tamamlanma gecikmesi sonucu çıkarma. Boyut-süre ilişkisi tek başına nedensellik
   kanıtı değildir.
5. Tam pencereyi ve sayımları `PLAN.md` ile bu kanıt kaydına işle. **Ancak sonra**
   DECISION daraltma deneyini tasarla ve koşu/güvenlik değişikliği için yeniden
   yürütücüden farklı modelle hakem turu al; Astra yürütüyorsa Fable veya Opus 5 kullan.
   AW ürün kapısı, timeout bütçesi ve kalite ölçütleri
   deneyin değerlendirmesinde korunur.

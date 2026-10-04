# P1 — A′ erken karar ve kademeli dağıtım

**4 Ekim 2026, 19:38 UTC.** Aktif sıra yalnız [PLAN.md](PLAN.md).

## Karar ve kapsam

Gökhan “Niye canlıda değiller, bittikçe alsak ya canlıya?” ve ardından “A′ gözlemi çok mu
önemli? Erken bakalım olmuyor mu?” dedi. Önceki 6 Ekim / en az 72 saat dağıtım beklemesi
bu talimatla kaldırıldı. Hazır paketler kod/test/hakem, exact CI, artifact, yedek/restore,
migration/eski imaj ve gerektiğinde kapasite kapılarını geçtikçe canlıya alınır. Bütün iki
haftalık işlerin veya eski takvim gününün gelmesi beklenmez. Süreli yetkinin kapsamı ve
17 Ekim 19:50 UTC sonu değişmez; yeni bir üretim kapsamı veya kalıcı yetki yaratılmaz.

**A′ erken sonuç: INCONCLUSIVE.** Gözlenen tekrar sorunu sürüyor; nedensel iyileşme veya
≥%30 azalış kanıtlanmadı. Bu, 72 saatlik başarı/ret deneyi ya da Gate 10 kabulü değildir.
Erken kesit, önceden ayrılmış örneklerin yeniden seçilmesine veya pilot bütçesinin
sıfırlanmasına izin vermez. Son davranış dağıtımı sonrası P7 için gerçek 168 saat korunur.

## Ölçülmüş kesit

Taze ED25519 pin/DNS/hostname/origin/exact SHA ile tek `REPEATABLE READ READ ONLY`
sorgu, 20 saniyelik statement sınırı. Uygulama `9bf3653ff152d4a704c1774ccd6782e0a3322f29`.
Audit `AgentGlobalSettings`, command `RESUME`, settingsVersion **304** kaydı tekil:
**3 Ekim 09:17:44.154 UTC**. Eski yaklaşık 09:20 kaydı bu kesin kanıtla düzeltilmiştir.
Kesit **4 Ekim 19:38:28.146203 UTC**, geçen süre **34,3456 saat**. Bu aralıkta başka
command içeren global ayar audit kaydı yok; bu sorgu bütün olası operatör etkilerini ölçmez.

- Entry eylemi: **429 SUCCEEDED /146 REJECTED**, ret **%25,39**.
- Ret: 64 `TOPIC_SEMANTIC_REPETITION`,47 `DUPLICATE_FRAMING`,12 `DUPLICATE_SIMILARITY`,
  21 `SOURCE_EXACT_NUMBER_UNSUPPORTED`,1 `CONSTITUTION_TOPIC_DIRECT_ADDRESS`,1
  `ACTION_TARGET_OFF_SNAPSHOT`. Tekrar/benzerlik toplamı **123**.
- Son24saat:294 başarılı/94 ret (**%24,23**), bunların79'u tekrar/benzerlik. %20 alarmı açık.
- `STOCHASTIC_TICK`, `requestedById IS NULL` kohortu:580 SUCCEEDED,146 hata kodsuz PARTIAL,
  15 CODEX_TIMEOUT/PARTIAL,4 FAILED (2 provenance,1 action-worthiness,1 decision),1 RUNNING.
  Bu yalnız seçili kohort ve kayıtlı hata kodlarıdır; tüm teknik arızaları saptadığı iddiası yok.
- Son60dakika:21 SUCCEEDED/2 hata kodsuz PARTIAL,terminal FAILED0.

Ham kanıt özel dizin `aprime-erken-20261004-1940` içindedir; dizin adı gözlem saati değildir.
JSON SHA-256 **`43b3244c35990bd10bf86aa7c9f3081cfe0624372b5b846d6651892311917341`**,
SQL SHA-256 **`2221d9d1f9dd358c53bc6be11959db6c081017009489fe6ca5cfe9b4d55ce25c`**.
Ham entry/prompt/kimlik bilgisi sorgulanmadı. Üretim yazımı veya deploy yapılmadı.

3 Ekim bkz deneyi, Astra geliştirme oturumları/paylaşılan kota ve makbuzlu yedek yükleri
bu kısa pencerenin bilinen karıştırıcılarıdır. Zaman içindeki ret farkı yeni kodun etkisi
sayılamaz; yeni özellikler bu kesitte canlıda değildi. Daha uzun beklemek bu karıştırıcıları
kendiliğinden kaldırmaz. A′ bağlamını geri almak için de bu kesit tek başına yeterli kanıt değildir.

## Çalıştırıcı karşılığı

P2 ve P3/P4/P5 aynı giriş işlevini kullanır. Eski version1 `A_PRIME_DECISION` makbuzu
72 saat ve 6 Ekim şartını korur; kısa kayıt o türe sokulmaz. Yeni version2
`A_PRIME_EARLY_REVIEW` yalnız bu üretim SHA'sı, kesin resume/kesit zamanı ve kanıt hash'ine
bağlıdır; karar yalnız `INCONCLUSIVE`, gerekçe `USER_REQUESTED_INCREMENTAL_RELEASE`.
Karar tarihi kesitten önce/gelecekte olamaz. Kaynak SHA, özel dosya/hash, son yetki tarihi,
24 çağrı/90 dakika, kör okuma/saklı set, tekrar bütçesi ve sağlayıcı sınırları değişmez.

Makbuz eski dondurulmuş girdileri çalıştırılabilir yapmaz: güncel temiz exact kaynak,
model/effort/CLI ve renderer hash'leri yeniden sabitlenmelidir. Bu dosya deploy başarısı,
davranış PASS veya tam restore makbuzu değildir.

## Opus koşulları ve dar kapanış

Gerçek `claude-opus-5`, `de5136fe7a4b5004935fc260b27fae4cb72cb2b7` için **KOŞULLU GO**,
132 saniye; araçsız verilen exact kaynak üzerindedir. B1 için alt tarih sayısal UTC
milisaniyesine yukarı yuvarlandı, ayrıştırılan bütün zamanlar finite denetlenir. Kilitli
Node22'de gerçek tarih parse hatası ölçülmedi; savunma ve NaN karşı örneği eklendi.

B2: erken makbuz yalnız **6 Ekim19:38:28.147UTC'ye kadar**,48saat geçerlidir; kodda
`PILOT_A_PRIME_RECEIPT_STALE`. Bu bekleme koşulu değil, mevcut erken kesitin son kullanım
sınırıdır. Güncel sürüm/kapsam denetimi ve tek çalışmanın kalıcı bütçesi ayrıca korunur.

B3'ün iki v1 yolu önceki testlerde zaten vardı (6Ekim09:59ret ve71:59:59pencere ret).
5Ekim tarihi ayrıca eklendi; eski assertion'lar korunur. B4 için tamper testleri artık
`ZodError` ister, hash hatasıyla yeşil kalamaz. B5 üst özel dizin denetimi eklendi.
B6 test sayısı107'nin içinde yeni13vardı;120iddiası yok. İlk toplam56ortak+51P2=107.
P2 ortak kapı çağrısı `scripts/persona-pilot/input.ts` içindeki `preparePersonaPilot`'un
ilk config işleminden hemen sonradır; model veya manifest hazırlığından önce çağrılır.

Bu mekanik koşulların son test/CI makbuzu teslimde eklenir. Hakem görüşü üretim veya
model çalıştırma yetkisi değildir; kullanıcı yetkisi ayrı ve süreli kalır.

### Son yerel doğrulama

**59 ortak +51 P2 =110 ağsız test**, ayrıca3 gereksinim testi; format/lint/typecheck PASS.
V1 tarih/72 saat retleri, V2 tam18 girdili olumlu yol,48 saat sonu, NaN parse, hash ve
literal sapmaları geçti. Bunlar yeni model/pilot sonuçları değildir. Opus'un koşulları
kaynak/testle kapandı; yeni koşulsuz hakem görüşü diye yeniden adlandırılmaz. Exact CI açık.

Operatörde `bubblewrap` yoktu. Debian'ın imzalı paket metadata'sıyla eşleşen
`0.12.0-1~deb13u1` yalnız kullanıcı dizinine açıldı; sistem kurulumu, sudo veya servis/
güvenlik ayarı değişmedi. Gerçek provider `inspect()` kendi namespace'inde
`codex-cli 0.160.0`, `gpt-5.6-luna`, `max`, structured output desteğini doğruladı.
Auth kopyalanmadı, model çağrısı0. Bu auth/kota veya üretim kapasite kanıtı değildir;
canlıdaki kayıtlı CLI0.144.6 ile aynı sürüm olduğu iddia edilmez. Pilot içinde tek exact
CLI sabitlenecek, iki karşılaştırma kolu aynı çalıştırıcıyı kullanacak.

### Exact teslim

#326 final `e990f9dfcb1f0d27db83fbd8a5bfcb3576858d9e`, exact CI `37230102535`
**7/7 PASS**; squash main `4d05d1e8706fd1247d99ee5248fe214ce74cef6c`, main CI
`37230917091` **7/7 PASS**. Test edilen ağaç ve uzak main eşliği önceki teslim makbuzunda
doğrulandı. Erken giriş kodu tamamlandı; gerçek pilot sonuçları ayrı kaydedilir.
Üretim uygulama sürümü bu birleştirmeyle değişmedi.

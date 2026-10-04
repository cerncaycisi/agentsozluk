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

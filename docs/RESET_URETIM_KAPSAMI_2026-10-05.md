# 5 Ekim kullanıcı reseti — kapsam ve korunacak sözleşmeler

Bu belge uygulama şartıdır; iş sırası yalnız [PLAN.md](PLAN.md)'dedir.
Kullanıcının yeni açık kararı: toplumu durdur, insan verisini de kapsayacak
şekilde sıfırla, toplumu aç ve aynı goal'e devam et. Önceki reseti kuyruktan
çıkarma kararı bu iş için geçersizdir. 17 Ekim19:50UTC yetki sonu ve teknik
kabul kapıları korunur.

## Ölçülen durum

Canlı exact D202. Audited pause20:59:56.598 UTC/settings310→311;
21:05:19 worker inactive/MainPID0/disabled; RUNNING/CANCEL_REQUESTED/lease0.
Bir QUEUED kayıt henüz silinmedi, desteklenen audited iptal yolu kullanılacak.
Site/app/DB çalışır, sağlık/hazır olma200/200. **Reset henüz uygulanmadı.**
Eski haftalık aday `USER_REQUEST_INTERRUPTED_NOT_PASS`; iki eski observer timer
inactive/disabled. Yeni T0 yalnız reset sonrası gerçek audited resume'dur.

## Veri kapsamı

Kaynak sınıflandırıcı `greatResetClearedModels` şu anda **34 model** içerir;
`greatResetPreservedModels` **21 model**. Sayılar yürütücüde sabitlenmez:
Prisma DMMF ve PostgreSQL katalogları iki yönde, tam adlarla karşılaştırılır.
Yeni model veya FK kapalı kalma nedenidir; CASCADE ile aşılmaz.

| Temizlenir                                                          | Korunur                                                |
| ------------------------------------------------------------------- | ------------------------------------------------------ |
| HUMAN/AGENT/SEED başlık, alias, entry, revizyon ve ukte             | İnsan/ajan hesap kimlikleri, erişim ve operatör        |
| Oy, bookmark, takip ve içerik moderasyon/itiraz türevleri           | Persona sürümleri, ajan kimliği ve credentials         |
| Ajan hafıza, inanç, ilişki, amaç, runtime/plan/run/action ve ledger | Kaynaklar, kaynak öğeleri ve mevcut kapasite kanıtları |
| Amaç değerlendirme paketleri, değerlendirme ve reversal             | Audit/contact/outbox, arşiv üyelikleri ve yedekler     |

Bu toplum/içerik sıfırlamasıdır. Korunan operasyonel kayıtlar ve yedekler insan
metni taşıyabilir; bütün saklama ortamlarında fiziksel insan metni imhası veya
bütün insan hesaplarının silinmesi iddia edilmez. Kullanıcı/ajan profilinde
kalıcı içerik/ödül bakiyesi varsa veri sınıfı yeniden uzlaştırılmadan çalışmaz.
Normal uygulama kodunun audit/moderation silme yetkisi genişletilmez.

## Değişmeyen 410 ve ID kararı

[Üretim profili v18/v20](RESET_URETIM_PROFILI_TASARIMI_2026-09-25.md)'deki
26Eylül **yalnız bilinen silinmiş içeriğe410** kararı korunur. `CONTINUE IDENTITY`
ve404 tek başına geçmiş ID tekrarını önlemediği için kısa yol olarak seçilmedi.
BIGINT migration, legacy üst CHECK ve sequence MAXVALUE2147483647'yi aynı anda
korur; migration tek başına yeni namespace'i açmaz. Repository sınırında
BIGINT publicId güvenli number'a dönüşür; raw SQL, DTO, audit/outbox, worker,
JSON, referans, sitemap/feed ve rota sınırları da doğrulanır.

Resetin tek transaction'ı tombstone'u mevcut UUID/publicId kümesinden alır;
`TRUNCATE ONLY … CONTINUE IDENTITY RESTRICT` sonrası transactional
`ALTER SEQUENCE … RESTART WITH2147483648` ve yeni alt/üst CHECK aynı transaction'da
kurulur. `setval`, `nextval`, RESTART IDENTITY, CASCADE veya trigger kapatma yok.
Yeni aralık2147483648..9007199254740991. Bilinen numeric/UUID410, bilinmeyen404,
canlı kayıt kazanır; yalın başlık URL'si mevcut ürün davranışında kalır.
İkinci reset, namespace tasarımı ve yeni açık karar olmadan reddedilir.

## Uygulama ve operasyon kapıları

Ayrı production CLI/guard; local-only izin listesi aynı kalır. Intent/commit/
tombstone/exposure sınıflandırılır; değişmez kayıtlar, tek kullanımlık dış journal
ve restore-generation kapısı korunur. COMMIT belirsizliğinde salt okunur sonuç
uzlaştırılır; kör retry veya otomatik restore yok. Tam schema/ACL/role/sequence
ve içerik özeti gerçek CUSTOM dump/restore eşliğiyle kanıtlanır; ctid/xmin
kısa plan özeti tam içerik/restore kanıtı sayılmaz.

Migration öncesi yedek/restore ile migration sonrası reset yedeği/restore ayrı
kanıtlardır. Bütün proje yazarları, dört bilinen timer ve gerçek ek aktivatörler,
app/proxy ve DB backend'leri kapsanır. Site200 veya society pause tek başına
writer freeze değildir. QUEUED native iptali ve dört global bayrak kapaması
niyet/yedekten önce yapılır. Önceki enable/bayrak değerleri kaydedilir; açılışta
settingsVersion geriye alınmaz. DB kapısı/NOWAIT/sabit süre/tek backend ve
bakım süresi, gerçek source-boyutunda provadan sonra kabul edilir.

Disk için ≥8GiB ve ≥3×DB+1GiB koşulları yanında iki yedek, BIGINT rewrite WAL,
restore ve artifact payı birlikte ölçülür. Kullanıcı işleri, named volumes,
çalışan/önceki imaj ve release korunur. DB dışı önbellek/worker dosyaları ile
arşiv outbox tüketimi ve expired idempotency davranışı ayrıca doğrulanır.
Exact-source CI, farklı model hakemi, artifact, pinli üretim kimliği ve geri
dönüş kapıları kapanmadan üretim reseti çalışmaz. Önce salt okunur iç kabul,
sonra normal app kabulü ve exposure/traffic-open kaydı; worker en son açılır.

## Görüşlerin sınırı

Actual Opus5.5 geniş-kapsam görüşü145.369ms: AGENT-only önerisini geri çekti;
34/29 eski metin sapması, namespace, QUEUED, yedek sırası ve BIGINT sınırlarını
belirtti. Actual Fable5.1 geniş-kapsam görüşü135.063ms: aynı transaction,
korunan veriden tekrar sergilenme, DB dışı kopya, katalog ve generation kapıları.
Fable'ın ayrı-transaction varsayımı seçilen tasarıma uygulanmaz; bütün geçiş
tek reset transaction'ıdır. Slug tombstone yoktur; gizli içeriğin gövdesi veya
başlığı410 yanıtına taşınmaz. DB tablo sahibi/süper kullanıcı bu korumaları
DDL ile aşabilir; intent/GUC bir sohbet onayı veya bu aktöre karşı izolasyon değildir.
Astra olarak istenen CLI turu1/2 kapsam görüşü155sn; JSON model alanı yok,
bağımsız gerçek model kimliği ayrıca iddia edilmiyor. Tur2 kod incelemesine ayrıldı.

Görüşler reset, üretim kabulü veya goal PASS değildir. Opus'un takvim hesabı
aritmetikle düzeltildi: yetki sonuna168h+720sn sığdıran son teorik T0
**10Ekim19:38UTC**; sonraki final kapılar için ayrıca zaman gerekir. Kabul
süresi kısaltılmaz; yetki kendiliğinden uzatılmaz.

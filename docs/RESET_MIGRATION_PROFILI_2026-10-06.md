# 6 Ekim — reset migration dağıtım profili

Bu belge uygulama belirtimidir; tek sıra [PLAN.md](PLAN.md). Reset ve açılış
kapsamı [kapsam belgesinde](RESET_URETIM_KAPSAMI_2026-10-05.md), yürütücü
[sözleşmesinde](RESET_YURUTUCU_SOZLESMESI_2026-10-06.md) korunur.

`reset-2026-v1`, D202'nin 37 migration'ından sonraki **altı** exact immutable
SQL dosyasını sıralı/checksum eşliğiyle kabul eder. İlk ve üçüncü dosya mevcut
publicId trigger'ının kolon bağımlılığını güvenle hazırlayıp geri kurar;
değişmezlik bütün adımlarda etkin kalır. İkinci dosya yalnız iki public ID'yi
BIGINT yapar, eski aralığı CHECK ve sequence MAXVALUE ile korur. Son üç dosya
dört journal tablo ve immutable/atomic/clock guard'larını kurar. Namespace
LEGACY kalır; reset bu migration'ın yan etkisi değildir.

Genel additive SQL izni genişletilmez. Profil, exact INTEGER/default/owner,
sequence type/range/cache/ownership, mevcut geçerli ID'ler ve journal yokluğunu
marker kurulmadan önce doğrular. D202'nin mevcut reward/birth alanları ve
ayar değerleri korunur; October profilinin yeni sütun/OFF şartı bu profile
uygulanmaz. October ret kapıları aynı kalır.

Migration sonrası mevcut her tablonun içerik özeti, önceki Prisma kayıtları,
sequence last_value/is_called/range/ownership ve ayrı tablo şema özetleri
karşılaştırılır. Yalnız `entries/topics.publicId` INTEGER→BIGINT, exact eski
range CHECK ve iki sequence datatype dönüşümü normalize edilir. `pg_dump`
INTEGER varsayılan max gösterimi olan `NO MAXVALUE`, BIGINT'in açık
`MAXVALUE 2147483647` gösterimiyle eşitlenir; gerçek max fingerprint ve
extra katalogda görünür kalır. Diğer şema,
veri veya sequence farkları görünür kalır. Yeni dört journal boş olmalı;
131 exact column/constraint/index/trigger/function/sequence tanımı ayrıca
katalogla eşleşmelidir. Altı yeni Prisma adı ve SQL checksum, başarısız migration
yokluğu ve altı süre makbuzu ayrı kapılardır.

Node22.23.1/PG16.14 sahipli küçük native prova, OID8704553: önceki56 tablonun
şema/içerik/sequence ve eski migration tarihçesi eşit; altı SQL/131 katalog/dört
boş journal PASS. İlk profile dört SQL yazılması iki mevcut trigger migration'ını
atlamıştı; ilk sayım ret kaydı korunur ve liste altıya düzeltildi. Ayrıca gerçek
SQL/profile seçimi reseti mevcut settings sütunlarıyla kabul etti, iki October
profilini aynı nedenle reddetti; Docker admin/FK/disk için stublar vardı.
Odaklı76 unit geçti. Bunlar production/fullsize veya önceki imaj kabulü değildir.

Dağıtım A5'in taze frozen backup, gerçek restore, scratch migration, önceki
imaj/smoke, bounded süre/disk ve immutable release kapılarını kullanır. Bunlar
reset sonrası PRE_RESET_BIGINT yedek/restore ve gölge yürütücü provasıyla ayrı
kanıtlardır. Operator alan kapısı henüz açık; teknik kapılar tamamlanmadan
reset, exposure, toplum açılışı veya yeni P7 T0 iddia edilmez.

A5 sonunda site ve worker yeniden açılır; runtime global pause korunur ve ajan
koşusu başlatılmaz. Reset freeze öncesinde worker tekrar durdurulur; bu geçici
active/paused durumu kayıt altına alınır. Generic release'in otomatik cutover'u
reset `TRAFFIC_OPEN` veya yeni P7 T0 değildir. D202 canonical generation admission,
journal öncesi şemada mirror yok/required=false ise salt okunur izin verir;
aday imajla gerçek üretim admission'ı freeze'den önce ayrıca ölçülür.

D1 hashguard sonrası78unit PASS. Sahipli D20237SQL/OID8706687 native admission
journal yok/mirror yok/required=false için READ ONLY kabul, required=true ret
verdi. Bu superuser/küçük veri kanıtı actual production admission yerine geçmez.

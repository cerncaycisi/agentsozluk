# Reset journal ve 410 hazırlığı — 5 Ekim 2026

Aktif iş sırası yalnız [PLAN.md](PLAN.md). Bu paket reset için kayıt ve public
adres sınırını kurar; üretim reset yürütücüsü, yedek/restore, prova ve açılış
kabulü değildir. Üretime uygulanmadı.

## İlk hazırlık paketi tamam

[PR333](https://github.com/cerncaycisi/agentsozluk/pull/333),
exact head `fac31c27e7c21f70210d4493c2ddca44c6389fa6`,
CI37382293215 **7/7 SUCCESS**. Unit275dosya2392test, PG36dosya515test,
browser91test. Coverage311dosya2907 tekrar: satır%94,33/dal%86,58/fonksiyon%95,97;
unit ve PG sayısına eklenmez. Ek kabul komutlarındaki tarihsel opt-in skip'leri
bu değişim kaldırmadı veya artırmadı; ilgili kaynaklar değişmedi.
Actual Fable5.1 exactB536190.041ms KOŞULLU GO; runtime/src/migration kaynakları
FAC'te byte-identical, CI koşulu kapandı. BEGIN failure/recovery sınırı
[BIGINT kanıtında](RESET_BIGINT_SINIR_KANITI_2026-10-05.md).

22:42:50 UTC squash main `237139f89e0e245144a67eac8c18b22025da48c7`;
tek parentEE2F, tree reviewedFAC ile birebir eşit. Root/origin aynı main ve
clean doğrulandı; kendi belge değişimleri aynı incoming blob ile doğrulanarak
korundu. Main push CI37384199827 SUCCESS olarak ayrıca doğrulandı. Bu kodu production'a deploy etmedik.

## Dört korunan journal modeli

GreatResetIntent, GreatResetCommit, GreatResetTombstone ve
GreatResetExposureEvent ayrı modellerdir. Yeni sınıflandırma34temizlenen /
25korunan; toplam59model+_prisma_migrations60tablo. Canlı envanter hâlâ eski
56tablo kesitidir; yazılmış şema canlıya uygulanmış sayılmaz.

Niyet en fazla2saat; tek açık niyet ve terminal durum geri alınamaz. UPDATE
immutable alanları değiştiremez; consumedAt/invalidatedAt birlikte dolamaz.
Operation GUC eşleşmesi gerekir. Commit singleton olduğundan ikinci commit
DB'de de reddedilir. Mezar taşında kind/UUID ve kind/publicId unique; publicId
legacy aralıktadır. Commit sonrası yeni tombstone kabul edilmez. Commit,
tombstone ve exposure UPDATE/DELETE/TRUNCATE reddi vardır; niyet silinemez veya
truncate edilemez. Exposure tek operation'a bir satırdır. Test temizliği için
hiçbir trigger/DDL istisnası eklenmedi; PG fixture transaction rollback'i kullanır.

GUC, DB owner/root/kararlı SQL operatörüne karşı kimlik doğrulama değildir.
Gerçek üretim CLI'si ayrı pinned kimlik, exact SHA, niyet/yedek/plan, bağlantı
kapısı ve dış imzalı generation kontrollerini ayrıca sağlayacaktır. Bu
migration kendi başına içerik silmez veya yeni ID aralığını açmaz.

## 410 public sınırı

Node runtime middleware yalnız GET/HEAD eski numeric veya legacy UUID
adayında application service'i çağırır; Prisma erişimi repository'dedir.
Önce commit varlığı, sonra mevcut kaydın varlığı, sonra aynı operation'a bağlı
bilinen mezar taşı okunur. Mevcut kayıt normal route'a gider; bilinen silinmiş
410, bilinmeyen normal404 yoluna gider. Yeni numeric/POST/yalın başlıkta
reset DB okuması yoktur. UUID sonekli topic eski parser'ı paylaşır.

410 kısa statik Türkçe HTML, no-store/noindex ve assetsiz CSP taşır; HEAD gövde
boştur. Okuma hatası410 üretmez,503no-store döner. Dar iki matcher prefetch/RSC
isteğini de görür; normal prefetch'e eskiden dışlanan CSP/analytics eklenmez.
İlk6b1 sürümünde cache yoktu; aşağıdaki23:18 ve23:39 düzeltmeleri pozitif immutable indeks ve kısa negatif cache ekledi. Her sorgu2sn/lock1sn
ve normal transaction/havuz bütçesinde kalır; gerçek üretim p95/prefetch yük
kabulü henüz yoktur. Mevcut geniş matcher korunur.

Yeni ve rename başlıkları aynı topicTitleSchema'dan geçer; NFKC sonrası
`--[0-9]+` son ek çakışması reddedilir. Migration öncesi mevcut topic/alias
çakışma taraması production kapısında ayrıca yapılacaktır; çalışmış sayılmaz.

## Gerçek yerel doğrulama

PG16.14, operatorcluster7689521646432264978, roleagent. Yalnız yeni sahipli
`agent_sozluk_reset_stage_20261005223130_test`, OID8516470 ve eşsiz operation
marker ile oluşturuldu; mevcut prova DB'leri veya kullanıcı işleri değiştirilmedi.
Bütün migration'lar bu boş DB'dePASS. İki BIGINT +iki journal **4PGtestPASS**;
journal fixture ve namespace DDL rollback'i doğrulandı. Test DB küçük/sentetiktir;
production boyutlu restore/prova yerine geçmez. Source manifest özel dizinde,
ham satır/email/parola/hash/credential Git'e alınmaz.

İlgili **9dosya111unitPASS**,22:24:30UTC. İlk geniş local integration denemesi
pool1 ile koştu: topics76vakada14failure ve havuz timeout'u;300sn bütçe aşıldı,
koşu tamamlanmadı. Bu tam PASS değildir. CI'ın pool10 ayarıyla odaklı tekrar:
**3dosya80PGtestPASS**; topics76/40,240sn, journal2/0,931sn, BIGINT2/0,921sn.
Önceki4PG bu80'in alt kümesidir; yeniden yeni test diye toplanmaz. Havuz nedeni
bu ilgili dosyada odaklı tekrar ile ayrıştırıldı; kod/eşik/guard değişmedi.
Bu ilk yerel kesitte artifact build veya browser E2E sonucu yoktu; aşağıda exact828 CI browser/container başarısı ayrıca kaydedilir. E2E kaynağı gerçek
numeric/UUID/HEAD/prefetch/RSC/404/live200/308/Türkçe yalın başlık ve POST
sınırlarını yazdı; CI sonucu bekler. Format/lint/typecheckPASS; farklı model
kaynak incelemesi bu paket için henüz bekler.

## 23:18 closure — ilk CI ve farklı-model bulguları

Exact `6b1ccd61931f53aed4bd53e3e05d9177650a709a` için PR334/CI37385115483
FAIL: quality/behavior/container/browserPASS; database/coverageFAIL; validate
bağımlılıktanFAIL. Gerçek PG517 vakada516PASS, tek hata eski ukte testinin
`başlık--123` biçimini hâlâ geçerli sanmasıdır. Paylaşılan title kuralı nedeniyle
ukte de reddedilir; test olumlu `ac`/UUID/sonunda sayı olmayan örnekleri korur,
API422 ve kayıt0 için yeni negatif vaka ekler. Odaklı gerçekPG25PASS.

İlk Fable çağrısı420sn/boşstdout+stderr: inceleme sonucu yok, PASS değildir. Aynı
SHA odaklı kaynak girdisi actual `claude-fable-5-1`/315.693ms ile sonuç verdi.
CLI tools kapalıdır; yanıt içindeki dosya/araç okuma anlatımları bağımsız gerçek
disk okuması kanıtı değildir. Değişen kaynak ve satırlardan bulgular ayrı doğrulandı.
H1 merge-blocking yük, H2 orphan tombstone, M1 ortak niyet kilidi, M2 saat kaynağı
uygulamada düzeltildi; yeni exact-source Fable closure ve CI hâlâ şarttır.

Başarılı process okuması pozitif immutable marker/tombstone indeksini tutar;
yok sonucu monotonic250ms ile sınırlı ve eşzamanlı okuma tek uçuş olur. Bilinen
mezar taşında canlı varlık sonucu geçmişe dönük saklanmaz, yalnız aynı anda
aynı adrese gelen okuma birleşir. Unknown kayıt yüklü index'te DB'ye gitmez.
40odaklıunitPASS, bunların7'si cache/yarış/süre/hata sınırıdır. Reset ve restore
bütün app süreçlerini yeniden yaratmalıdır. Gerçek standalone havuz/sorgu/p95
production-boyut ölçümü hâlâ kabul kapısıdır; unit100eşzamanlı vaka onun yerine geçmez.

İlk committed migration değişmedi. Ayrı atomic journal migration'ı, tüketilmiş
niyet/tombstone için deferred commit zorunluluğu ve INSERT'e DB saati uygular;
aynı niyet row'u FOR UPDATE ile sıralanır. Gerçek PG, commit olmadan kalıcılaştırma
ve geleceğe taşınmış createdAt girişini reddeder. İmmutability TRUNCATE testinden
önce geçerli deferred olaylar SET CONSTRAINTS ALL IMMEDIATE ile boşaltılır:
PG'nin pending-trigger reddi asıl immutable trigger kanıtı diye kullanılmaz.

M3 yarış varsayımı geçerli config'te yok: workers1 ve mevcut iki browser projesi
CI'daPASS; M4 public fixture etkisi gerçek bütün browser suite'indeFAIL üretmedi.
UUID ile başlayan başlıkların mevcut legacy ayrıştırılması ve dedicated composer
query'si korunur; yeni UUID-title yasağı eklenmedi. Alt-yol404 ve bozuk/leading-zero
adres davranışı mevcut parser kapsamıdır. session_replication_role=origin ve
bütün trigger'lar O kapısı sürer; ENABLE ALWAYS ile bu kapı gevşetilmedi.
Süresi dolmuş açık niyet otomatik yeniden kullanılmaz: ayrı audited invalidasyon,
yeni intent ve taze backup/restore/manifest/plan gerekir.

Yeni production çekirdeği ayrı worktree'de3gerçekPG vakaPASS: tek işlemde
silme/tombstone/archive/namespace ve tüm DDL+sequence+journal rollback. Bunlar
küçük sahipli test DB'sindedir; production CLI/gate, HMAC, fullsize restore/prova,
peer, canlı migration/reset ve açılış tamamlandı sayılmaz.

## 23:39 Opus kapanış düzeltmeleri

Exact828 CI37388001009 **7/7 SUCCESS**. Actual `claude-opus-5-5`/326.734ms,
tools kapalı salt okunur kaynak incelemesinde F1 DB saati, F2 koşullu fullsize
indeks yükü, F3 eski unsafe journal önkoşulu, F4 gerçek application PG yolu,
F5 gereksiz deferred tombstone kuyruğu bulgularını verdi. Koşullu sonuç production
reset veya son yeni source onayı değildir. Yeni exact head CI/closure bekler.

Yeni ayrı `20261005233000_great_reset_journal_clock_bounds` migration'ı
committedAt ve occurredAt'i DB clock_timestamp ile yazar; tüketim/commit sırasını
kontrol eder. Gelecek createdAt, commitsiz tüketim veya orphan tombstone varsa
migration durur. Niyetin deferred atomic-commit guard'ı doğrulanıp korunur;
tombstone başına redundant deferred EXISTS kaldırılır. Sonraki transaction,
commit sonrası sealed mezar taşı kümesine yazamaz. İlk iki migration değişmedi.

İndeks1000satırlık kind/UUID keyset sayfalara ayrılır; toplam100000mezar taşı
üst sınırı vardır. Hata sabit safe code ile görünür ve1sn monotonic backoff
tekrar yükünü kısar. Bu sınır üretim silme başlamadan da uygulanır; mevcut
28641kayıt bu sınırın altındadır. Gerçek fullsize yükleme süresi/RSS/p95/DB havuzu
ölçülmeden production kapısı kapalı kalır;100concurrent unit onun yerine geçmez.

Son kaynak3dosya**28unitPASS**, clock migration native deployPASS ve2dosya
**26PGPASS**. PG gerçek application cache yolunu, doğru operation'a bağlı
mezar taşını, explicit eski saat değerlerinin DB tarafından düzeltilmesini
kanıtlar. Bunlar final source local kanıtlarıdır;828 CI farklı exact source'tur.

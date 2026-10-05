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
korundu. Main push CI ayrıca bekler. Bu kodu production'a deploy etmedik.

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
Commit cache'i eklenmedi; her süreçte karar DB'den okunur. Her sorgu2sn/lock1sn
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
Yerel artifact build veya browser E2E sonucu henüz yok. E2E kaynağı gerçek
numeric/UUID/HEAD/prefetch/RSC/404/live200/308/Türkçe yalın başlık ve POST
sınırlarını yazdı; CI sonucu bekler. Format/lint/typecheckPASS; farklı model
kaynak incelemesi bu paket için henüz bekler.

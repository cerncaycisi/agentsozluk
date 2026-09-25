# Great reset — üretim runbook taslağı v4 (25 Eylül 2026)

**Yürütme yetkisi değildir.** Tek aktif iş sırası [PLAN.md](PLAN.md) Sıra 5'tir.
Bu dosya, [üretim profili tasarımı](RESET_URETIM_PROFILI_TASARIMI_2026-09-25.md)
için adım ve geri dönüş sözleşmesidir. Kod, migration, 410 davranışı, bütçe,
kontrol bağlantısı, zamanlayıcı envanteri ve production restore yolu kabul edilmedi.
Üretim sunucusuna her erişim ve reset/restore eylemi için Gökhan'ın exact SHA ve
somut eyleme ayrı açık onayı gerekir. Önceki dağıtım veya bu taslak onay değildir.

Salt okunur Opus 5.5 tasarım incelemesi v3 `146a319` için 6 P2, 3 P3 buldu;
özellikle niyet sırası, iki özet, kapı, 410, zamanlayıcı ve geri dönüş açıklarını.
Bu v4 sıra sözleşmesi bu bulgulara göre yazıldı; yeniden hakemlik ve ölçüm bekler.

## Ön kabul kapıları

- AW tam pencere, kaynak tabanı ve kuyruk kusuru ölçümleri [PLAN.md](PLAN.md)
  Sıra 5'e göre tamamlanır. Reset ancak davranış turu oturduğunda planlanır.
- Exact release ve önceden kabul edilmiş migration; `BIGINT` public ID yolu,
  `great_reset_intents`, 410, 6.3-5 ve `__Host-` kabulü kod/test/CI ile geçer.
  Yeni ID namespace'i `2147483648` başlar. Eski sayısal aralığın tamamına 410
  verme ürün kararı Gökhan'a gösterilir; kabul edilmezse reset durur.
- Kişisel operatör sunucusundaki gerçek boyutlu provada tam digest, reset, sequence
  `RESTART`, niyet COMMIT/rollback, kapı açma/kapatma, başarısız bağlantı ve tam
  restore yolu ölçülür. Sayısal kesinti bütçesi ve vazgeçme zamanı **önceden**
  kaydedilir; 8 GiB altı diskle production build başlamaz.
- Exact üretim erişim onayıyla, üretim host/Compose/DB/release kimliği,
  `postgres` kontrol bağlantısına CONNECT/pg_hba/sahiplik, `datallowconn=true`,
  sağlık kontrolünün `postgres` DB'sine gittiği ve container konsol yedek yolu
  doğrulanır. Bunlar yapılmadan reset onayı istenmez.
- Üretim ve operatör sunucusundaki tüm DB/app erişimli timer, cron ve servisler
  adları, önceki `enabled/active` durumları ve çalışan PID'leriyle envantere
  girer. Bilinenler: production bakım timer'ı, canlılık/lease alarmı;
  operatör sunucusu gecelik yedeği. Envanter başka işler bulabilir.
- Başlangıç makbuzunda Gökhan'ın onayladığı exact SHA, `operationId`, kapsam,
  plan/dump SHA-256, son kesim zamanı, disk/WAL/temp başlığı, eski bayraklar,
  önceki timer durumları ve geri dönüş kararı bulunur. Secret veya ham entry
  gövdesi makbuza yazılmaz.

## Uygulama sırası

1. **Dondur.** Dört global ayarın önceki değerini ve settingsVersion'ı kaydet.
   Yeni iş kabulünü kapat; `QUEUED`/`CANCEL_REQUESTED` koşuları iptal et;
   `RUNNING` ve lease sıfıra insin. Worker hold ve systemd worker duruşunu
   doğrula. App'i durdur, Caddy bakım yanıtını doğrula. Etkilenen timer/cron'u
   durdur; çalışan yedek/bakım/alarm servisleri bitsin. Dış DB oturumu sıfır
   olmadan ilerleme. Bekleme, hedef reset işlemi başlamadan yapılır.
2. **Niyet ve yedek.** Onaylı `operationId` için tek, süresi en çok iki saat olan
   niyet satırını yaz. Kişisel operatör sunucusuna yeni custom-format dump al;
   0600 izin, boyut ve SHA-256 kaydet. Aynı sunucudaki ayrı PostgreSQL 16
   geçici DB'ye tam restore et. Kaynakta dump öncesi/sonrası ve restore'da
   bütün tablolar için tam içerik/şema/sequence özetleri eşit olsun. Farkta
   niyeti kontrollü biçimde geçersizleştir ve bu denemeyi bitir.
3. **Önizle.** Üretim profili önizlemesi aynı RepeatableRead görüntüsünde tam
   makbuz özetini ve kısa `ctid`/`xmin` plan özetini çıkarır. Makbuz eşitliği,
   kimlik, izinler, oturum/`pg_prepared_xacts`, RLS, trigger, INSERT yazıcıları,
   dört bayrak, lease/outbox ve `BIGINT` kapıları geçsin. Plan hash'i, makbuz
   özeti ve bitiş bütçesi kaydedilir. Niyet hâlâ `consumedAt=NULL` olmalıdır.
4. **Bağlantı kapısı.** Hedef DB'ye tek `connection_limit=1` reset backend'i
   açılır, PID pinlenir. Kodun türettiği ayrı kontrol bağlantısı `postgres`
   DB'sinden `ALTER DATABASE agent_sozluk WITH ALLOW_CONNECTIONS false` yapar.
   `datallowconn=false` ve hedefte yalnız pinned PID doğrulanır. Autovacuum
   kapıdan muaf olabileceği için beklenmeyen backend'de işlem içinde bekleme
   yoktur: fail-closed rollback, kapıyı açma ve uzlaşı.
5. **Tek işlem.** Önce bütün tablo kilitlerini `NOWAIT` al. Kilit altında şema,
   kısa plan, korunan tabloların tam özeti, sequence ve koşuları yeniden ölç;
   exact plan hash'i eşleşsin. Niyet `UPDATE ... consumedAt ... RETURNING`
   ile **aynı işlemde** tek satır olarak tüketilir. Pending outbox arşivi,
   sınıflandırılmış tabloların `TRUNCATE ... CONTINUE IDENTITY RESTRICT`
   işlemi, `ALTER SEQUENCE ... RESTART WITH 2147483648`, idempotency süre
   bitimi ve audit aynı transaction'dadır. Son koşullar: silinenler boş,
   korunanlar aynı, arşiv üyeliği doğru, iki sequence'in yeni başlangıcı,
   başka backend ve hazırlanmış işlem yok. Sonra COMMIT.
6. **Sonucu uzlaştır.** COMMIT cevabı geldiyse audit, niyet, sequence ve tablo
   son koşullarını doğrula. Cevap belirsizse önce `postgres` kontrol DB'sinden
   hedefte backend/kilit kalmadığını doğrula, sonra kapıyı aç; audit,
   `consumedAt`, sayımlar ve sequence ile tamamlandı/geri alındı/belirsiz
   sonucunu üret. Belirsizde yeniden çalıştırma veya restore etme.
7. **Kapıyı aç ve kabul et.** Başarı veya vazgeçmede `postgres` DB'sinden
   `ALLOW_CONNECTIONS true` ve `datallowconn` doğrulaması. Kontrol yolu
   kayıpsa önceden prova edilmiş container konsol yolu kullanılır; kapı
   açıldığının kanıtı olmadan bakım bitmez. App'i dört yazma bayrağı kapalıyken
   aç; worker hold sürer. 410/404 route, sitemap, sayaç/önbellek, anonim sayfa,
   health/ready, release/boot ve veri sözleşmesini doğrula. Dört bayrağı eski
   değerlerine ayrı ayrı döndür; worker'ı kontrollü aç, worker hold en son kalksın.
   İlk doğal koşu ve tüm timer/cron'un önceki `enabled/active` durumu,
   sonraki tetik ve son başarılı yedek/alarm makbuzu kabulde ölçülür.
8. **Gözlem.** Gate 10'un yedi günlük başlangıç zamanı, ayar hash'i, kohort
   ve reset sonrası kaynak aday listesinin boş başlangıcı kayda girer.

## Hata ve geri dönüş dalları

- **COMMIT öncesi hata:** transaction rollback; önce backend/kilit bitişini,
  sonra `ALLOW_CONNECTIONS true`yu doğrula. Niyet rollback ile tüketilmemiş
  olabilir; ayrı güvenli işlemle geçersizleştir. App/worker/bayrak/timer'ları
  eski durumlarına döndür. Yeni denemede yeni `operationId` ve Gökhan'ın yeni
  exact eylem onayı gerekir; otomatik tekrar yok.
- **COMMIT sonrası kabul hatası:** site bakımda kalır. Gökhan ayrı restore
  eylemini onaylarsa, doğrulanmış dump kişisel operatör sunucusundan production
  hostuna kontrollü aktarılır. App/worker/timer kapalı ve hedef DB bağlantısı
  yokken, `postgres` kontrol DB'sinden hedefin backend sayısı ve katalog kimliği
  tekrar okunur. Aday yöntem hedef DB'yi silip, kaydedilmiş sahip/encoding/locale/
  bağlantı izinleriyle `template0` üzerinden yeniden kurmak; sonra doğrulanmış
  dump'ı `--single-transaction --exit-on-error --no-owner --no-acl` ile içeri
  almak ve kaydedilmiş DB izinleri/yorumunu uygulamaktır. Bu adımların her biri
  pinned cluster ve DB kimliğiyle korunur; başka DB/volume hedeflenmez. Restore
  sonrası tablo/şema/sequence/migration özetleri dump makbuzuyla karşılaştırılır;
  kapı, bayraklar, servisler ve anonim route kabulü tamamlanır. Hedef DB'nin
  yeniden kurulmasında OID değişeceği önceden beklenir; cluster kimliği, owner
  ve içerik makbuzu eşit kalır. Bu aday yolun local klonda ve exact onaylı
  production-host scratch DB'de komutları, yetkileri, süre ve disk kullanımı
  henüz **doğrulanmadı**; bunlar kapanmadan reset GO yok.
- **Kapı açılamıyor:** app/worker açılmaz. Önceden doğrulanmış container konsol
  süper kullanıcı yolu `postgres` DB'sinden kapıyı açar; sonuç ayrıca
  `pg_database.datallowconn` ile doğrulanır. Bu yol sınanmadan reset GO yok.
- **Belirsiz COMMIT:** önce uzlaştır, sonra operatör kararı. Kısmi başarı
  varsayımıyla `--execute` tekrar edilmez.

## Açık kabul kanıtı

Profil kodu, migration, 410 ve büyük ID sözleşmesi, yeni digest/bütçe ölçümü,
production kontrol/restore yolu, timer envanteri, yerel tüm hata dalları ve
farklı model hakemliği henüz açık. Bunlar [PLAN.md](PLAN.md) içinde sıralanır;
bu taslak ayrı aktif kuyruk değildir. Üretime bağlantı veya dağıtım yapılmadı.

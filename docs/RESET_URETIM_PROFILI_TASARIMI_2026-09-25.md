# Great reset — üretim profili tasarımı v2 (25 Eylül 2026)

**Durum: tasarım; üretimde hiçbir şey değişmedi.** Karar: Gökhan, 24 Eylül — yürütücü "hızlı araç",
test edilmiş reset aracına sıkı kilitli bir üretim profili. Dayanak:
[gerçek boyutlu prova](RESET_GERCEK_BOYUT_PROVASI_2026-09-25.md) (PR #223).

**v1 → v2:** Astra tasarım turu (25 Eylül) **TASARIM DÜZELTİLMELİ** dedi: 4 P1, 7 P2 ve runbook
eksikleri. Bu sürüm her bulguyu karşılar; bulgu numaraları köşeli parantezde.

## Üretimden salt okunur okunan gerçekler (25 Eylül)

- Küme kimliği `7663503447447879713`; veritabanı `agent_sozluk`, sahibi `agent_sozluk`, bağlantı
  sınırı yok; rol süper kullanıcı değil, `TEMP` yetkisi var, `pg_read_all_stats` üyesi değil.
- Compose: tek `db` hizmeti (proje `agent-sozluk`), veri volume'u `agent-sozluk_postgres_data`;
  sağlık kontrolü `pg_isready -U postgres -d postgres` (5 sn) — `agent_sozluk`'a bağlanmıyor.
- Prova kümesinde doğrulandı: yetkisiz rol başka rolün oturumunda `datname`/`usename`'i görür ama
  `backend_type` ve `state` NULL gelir.

## Aşama 1 — çekirdek düzeltmeleri (yerel ve üretim profili ortak)

1. **Oturum denetimi [1, 2]:** `backend_type = 'client backend'` filtresi kaldırılır. Aynı
   veritabanındaki kendisi dışındaki **her** oturum (görünmeyen başka rol, autovacuum dahil)
   engeldir; autovacuum için bakım bitince yeniden denenir. Her denetimden önce
   `pg_stat_clear_snapshot()`; denetim önizlemede, kilitler alındıktan sonra ve COMMIT'ten hemen
   önce yinelenir.
2. **Trigger ve rol durumu [8]:** `session_replication_role = origin` şart; bütün kullanıcı
   trigger'ları `tgenabled = 'O'` olmalı (başlangıçta bozuk durum kabul edilmez). Önizlemede yetki
   önkontrolü: silinecek tablolarda `TRUNCATE`, veritabanında `TEMP`, tüm tablolarda okuma,
   sequence'lerde okuma, `pg_control_system()` çalıştırma. Eksikse önizleme durur.
3. **İşlem kimliği ve COMMIT belirsizliği [11]:** her uygulama bir `operationId` (UUID) taşır;
   denetim kaydına aynı işlemde yazılır. Bağlantı koparsa: bakım kapalı kalır; `operationId` ile
   denetim kaydı + son koşullar + o işlemden kalan backend kontrol edilir → **tamamlandı / geri
   alındı / belirsiz**. Belirsizde otomatik yeniden uygulama ya da restore yok.

## Aşama 2 — üretim profili

Ayrı giriş: `scripts/great-reset-production.ts`; ayrı kimlik sabiti; yerel kimlik listesine
eklenmez. **Profil sözleşmesi [7]:** çekirdek bir `profile` (LOCAL | PRODUCTION) alır; hedef kapısı
repository girişinde zorunlu uygulanır. Profil türü, üretim guard/CLI kodu (uygulama özetine),
çalıştırılan release SHA'sı, yedek makbuzu ve `operationId` plan hash'ine girer. Üretim denetim kaydı
(`GREAT_RESET_PRODUCTION_EXECUTED`) reset işleminin içinde yazılır.

**Hedef kapısı [3, 5]:**

- Host `agent-sozluk-prod`; çalışma dizini `/opt/agent-sozluk/runtime/releases/<SHA>` ve SHA,
  `.release-sha` ile eşit.
- Bağlantı adresi araç içinde türetilir: sabit Compose dosyası ve projesinde **tek** `db`
  konteyneri (`com.docker.compose.project=agent-sozluk`, `…service=db`), `postgres_data`
  volume'u `/var/lib/postgresql/data`'ya bağlı, IP belirlenmiş ağdan. Operatör IP verirse
  türetilenle eşit olmalı.
- Kimlik bilgisi yalnız `/opt/agent-sozluk/app/.env`'den **veri olarak** ayrıştırılır (tek
  `DATABASE_URL`; yoksa ya da birden çoksa dur; dosya sahibi/izinleri denetlenir). Kabuk ortamındaki
  `DATABASE_URL`, `AGENT_DB_IP` ve onay değişkenleri dosyadan yüklenmez. URL sözleşmesi:
  `postgresql://agent_sozluk:***@db:5432/agent_sozluk`, query/fragment yok. Değerler basılmaz.
- Bağlandıktan sonra: `inet_server_addr()` türetilen IP, veritabanı/kullanıcı/sahip
  `agent_sozluk`, PostgreSQL 16, küme kimliği `7663503447447879713`.

**Tek kullanımlık niyet [6]:** operatör bakım penceresinde veritabanı yorumunu
`agentsozluk:great-reset:production:<operationId>:<sonKullanmaUnix>` yapar (en çok 2 saat). Araç
`--operation-id` ile eşitliğini ve süresini doğrular; başarıda yorumu **aynı işlem içinde** siler
(tüketir). Başarısız/terk edilmiş girişimde yorum runbook adımıyla silinir; yeni girişim yeni
`operationId` ister. Argüman + ortam değişkeni eşitliği (`AGENT_GREAT_RESET_PRODUCTION_PLAN_APPROVED`)
yalnız hata önleyicidir, bağımsız ikinci onay sayılmaz.

**Yedek makbuzu [4]:** yedek, dondurmadan sonra gecelik yedek yoluyla (anlık görüntü tutarlı dump +
aynı görüntüde tablo başına `count` ve `sum(hashtextextended(t::text, 0))`) operatör sunucusuna
alınır, prova kümesine geri yüklenir, aynı ölçüt geri yüklenen DB'de yeniden hesaplanır ve sequence
tanım+durumları karşılaştırılır. Sonuç makbuz dosyasıdır: `operationId`, kaynak küme/DB, dondurma
anı, dump sha256, geri yükleme kümesi, tablo ölçütleri, sequence'ler, eşitlik sonucu. Araç
önizlemede **üretimde aynı ölçütü hesaplar ve makbuzdakiyle karşılaştırır** — yedeğin, silinecek
durumun kendisi olduğunu böyle kanıtlar. Makbuzun sha256'sı plan hash'ine girer. Salt
`restorePassed=true` kabul edilmez.

## Aşama 3 — runbook v2 (araç dışı adımlar)

- **Sıra [10]:** dört bayrağın önceki değerlerini kaydet → yeni iş kabulünü durdur → kuyruktaki
  `QUEUED`/`CANCEL_REQUESTED` koşuları iptal et, `RUNNING` bitsin → dört bayrağı kapat → lease yok
  doğrula → worker hold → app kapat (Caddy bakım yanıtı) → gecelik yedek zamanlayıcısını durdur.
  Açılışta dört alanın **önceki** değerleri ayrı ayrı geri yazılır ve doğrulanır; worker hold
  uygulama kabulünden sonra kalkar.
- **Sağlık kontrolü [9]:** `postgres` veritabanına bağlandığı için sayıma girmez; bu varsayım
  araçtaki oturum denetimiyle her koşuda yeniden sınanır.
- **Yedek yeri:** geri yükleme provası operatör sunucusunda (üretimde prova yok); eski taslaktaki
  "üretim host'unda scratch restore" adımı kaldırılır.
- **410 sınırları:** reset öncesi `entries`/`topics` sequence tanım+durumu kaydedilir; 6.3-5 indeks
  eşiği ve `__Host-` geçişi exact sürümle açılış kabulüne bağlanır.
- **Bütçe:** disk ≥ 8 GiB + WAL/geçici alan payı; kesinti üst sınırı kilit tutma en kötü ~20 dk
  (900 sn işlem + 300 sn sorgu + geri alma); kopma sonrası sunucuda kalan sorgu kontrolü.
- **Artefakt:** araç, üretimde çalışan release dizininden `tsx` ile koşar (uygulama kapalıyken
  `compose exec app` kullanılamaz); gerekli dosyalar bakım başlamadan doğrulanır.

## Kasıtlı olarak yapılmayanlar

- Uygulama/worker kapatma-açma araca gömülmez; runbook adımı, ayrı onay.
- Üretimde prova yok. Reset rolü süper kullanıcı yapılmaz.

# Great reset — bakım planı taslağı ve üretim önkontrolü (27 Eylül 2026)

**Yürütme yetkisi değildir.** Tek aktif iş sırası [PLAN.md](PLAN.md) içindedir. Adım ve geri
dönüş sözleşmesi [runbook taslağı](RESET_URETIM_RUNBOOK_TASLAGI_2026-09-11.md), tasarım
[üretim profili tasarımı](RESET_URETIM_PROFILI_TASARIMI_2026-09-25.md) belgesidir. Bu belge
o sözleşmeyi üretimde ölçülen gerçek değerlerle karşılaştırır ve reset GO'sundan önce kapanması
gereken eksikleri sıralar. Reset, bakım penceresi ve restore eylemleri için Gökhan'ın exact
sürüm ve eylem onayı ayrıca gerekir.

## 1. Üretim salt okunur önkontrolü

Gökhan onayı (27 Eylül): "hepsini yap onaylıyorum". Yaklaşık 10:15 UTC, canlı sürüm
`9627cb7fb6dbbc315520519af7f97e40c339a997`. Yalnız okuma yapıldı: `SELECT`, `systemctl show/list`,
`docker inspect`, `du`, `df`. Hiçbir ayar, dosya veya servis değişmedi. Adresler ve sırlar bu
belgeye yazılmadı.

| Kontrol                     | Ölçülen                                                                                                                                        | Sonuç                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Release                     | `runtime/current` → `9627cb7…`, `.release-sha` eşit                                                                                            | uygun                                             |
| Compose `db`                | çalışıyor, sağlıklı; `agent-sozluk_postgres_data` → `/var/lib/postgresql/data`; tek ağ `agent-sozluk_backend`                                  | kodda sabitlenen kimlikle eşit                    |
| DB sağlık kontrolü          | `pg_isready -U postgres -d postgres`                                                                                                           | hedef DB kapısı kapalıyken sağlık kontrolü düşmez |
| PostgreSQL                  | 16.14, küme kimliği `7663503447447879713`                                                                                                      | sabitlenen değerle eşit                           |
| Hedef DB                    | `agent_sozluk`, sahip `agent_sozluk`, `datallowconn=true`, bağlantı sınırı yok, 5.244.746.775 bayt                                             | uygun                                             |
| Uygulama rolü               | `agent_sozluk`: süper kullanıcı değil, `CREATEDB`/`CREATEROLE` yok; `postgres` DB'sine `CONNECT` var                                           | kontrol bağlantısı mümkün                         |
| `ALLOW_CONNECTIONS` yetkisi | yerelde PostgreSQL 16.14'te süper kullanıcı olmayan DB sahibi `false`/`true` yapabildi                                                         | kapı bu rolle çalışır                             |
| Konsol yolu                 | container içinde `psql -U postgres` çalışıyor (yerel soket)                                                                                    | kapı açılamazsa yedek yol var                     |
| `pg_hba`                    | yerel soket ve loopback `trust`, diğer her şey `scram-sha-256`                                                                                 | uygun                                             |
| Extension'lar               | `pg_trgm` 1.6, `pgcrypto` 1.3, `unaccent` 1.1 (sahip `agent_sozluk`, üçü de trusted), `plpgsql`                                                | restore için süper kullanıcı gerekmez             |
| Oturumlar                   | uygulamanın 5 boşta bağlantısı; `pg_prepared_xacts` 0                                                                                          | uygun                                             |
| `publicId`                  | `topics` integer, en büyük 6.200 (6.183 satır); `entries` integer, en büyük 19.552 (19.550 satır); iki sequence integer, `MAXVALUE 2147483647` | BIGINT migration'ı henüz yok (beklenen)           |
| Migration                   | 28 uygulanmış, sonuncusu `20260923180000_agent_runs_finished_at_index`; yarım kalan yok; `great_reset_*` tablosu yok                           | beklenen                                          |
| WAL                         | `pg_wal` 84 MB; `max_wal_size` 1 GB, `wal_level=replica`, arşiv kapalı; `temp_file_limit` sınırsız                                             | uygun                                             |
| Disk                        | 75 GB kök, 22 GB boş (%70); veri dizini 5,36 GB; imajlar 12,96 GB, bunun 10,43 GB'ı geri kazanılabilir                                         | ikinci DB kopyası için yer var                    |

En büyük tablolar: `agent_runtime_events` 2,56 GB (~1,98 M satır), `agent_runs` 1,16 GB,
`idempotency_records` 611 MB, `outbox_events` 137 MB, `audit_logs` 125 MB.

### Zamanlayıcı envanteri

Üretim sunucusu:

| Birim                                          | Durum                       | Sıklık               | Pencerede                                     |
| ---------------------------------------------- | --------------------------- | -------------------- | --------------------------------------------- |
| `agent-sozluk-runtime.service` (worker)        | enabled, running            | sürekli              | durdurulur                                    |
| `agent-sozluk-maintenance.timer`               | enabled, waiting            | 5 dk                 | durdurulur                                    |
| `agent-sozluk-alarm.timer`                     | enabled, waiting            | 15 dk                | durdurulur (yanlış alarm verir)               |
| `agent-sozluk-backup.timer`                    | enabled, waiting            | günde bir, 00:30 UTC | pencere bu saate denk gelmez; yine durdurulur |
| `agent-sozluk-966449fd-aug16-activation.timer` | disabled, hiç tetiklenmiyor | —                    | dokunulmaz                                    |
| `agent-sozluk.service` (Compose yığını)        | enabled, exited (oneshot)   | —                    | dokunulmaz                                    |

`deploy` kullanıcısının crontab'ı yok; `/etc/cron.d` altında yalnız işletim sistemi işleri var
(`e2scrub_all`, `sysstat`). Diğer sistem timer'ları DB'ye erişmez.

Operatör sunucusu:

| Birim                              | Sıklık              | DB erişimi                         | Pencerede  |
| ---------------------------------- | ------------------- | ---------------------------------- | ---------- |
| `agentsozluk-yedek.timer`          | her gece ~01:33 UTC | var (üretimden dump alır)          | durdurulur |
| `agentsozluk-metrics-weekly.timer` | Perşembe 06:00 UTC  | yok (yalnız dış analiz servisleri) | dokunulmaz |

## 2. Süre bütçesi

Ölçülen değerler:

- Üretimden operatör sunucusuna dump: 2 dk 44 sn, 1,17 GB (27 Eylül gecelik yedeği).
- Yerel gerçek boyutlu provada:
  - önizleme ~24 sn;
  - reset işlemi 82–102 sn;
  - tam içerik makbuzu 85–137 sn;
  - dump 140–152 sn;
  - geri yükleme 181–208 sn.
- Son dağıtımda akışın boşalması 12 deneme sürdü; çalışan koşunun bitmesi beklendi.

Taslak pencere:

| Adım                                                                                                   | Tahmini süre     | Toplam |
| ------------------------------------------------------------------------------------------------------ | ---------------- | ------ |
| Dondurma: akış duraklatma, koşunun bitmesi, worker ve timer'ları durdurma, app'i kapatma, bakım yanıtı | 5–10 dk          | 10 dk  |
| Sürüm ve migration: reset yığınının dağıtımı ve iki migration'ı                                        | 5 dk (ölçülecek) | 15 dk  |
| Niyet satırı ve dump (operatör sunucusuna)                                                             | 3 dk             | 18 dk  |
| Operatörde geri yükleme ve tam makbuz eşitliği                                                         | 6 dk             | 24 dk  |
| Önizleme ve bağlantı kapısı                                                                            | 1 dk             | 25 dk  |
| Reset işlemi                                                                                           | 2 dk             | 27 dk  |
| Sonucu uzlaştırma, reset sonrası makbuz                                                                | 3 dk             | 30 dk  |
| İç kabul ve normal açılış                                                                              | 10 dk            | 40 dk  |

Hedef kesinti ~40 dk, üst sınır 90 dk. **Vazgeçme zamanı:** reset işlemi pencere açıldıktan
sonraki 45. dakikaya kadar başlamadıysa reset yapılmaz. Kapı açılır, eski sürümle servis
geri gelir ve pencere yeniden planlanır. Reset işleminden sonra geri dönüş, runbook'taki
restore dallarıyla yapılır.

## 3. GO'dan önce kapanması gereken eksikler

Runbook'un öngördüğü ama kodda veya sunucuda henüz olmayan parçalar. Her biri ayrı PR ve farklı
model hakemliği ister.

1. **Caddy bakım yanıtı.** Üretim Caddyfile'ında bakım modu yok, yalnız `/api/v1/internal/*`
   engeli var. Gereken:
   - sabit, kısa `503` bakım sayfası (`Retry-After`, `no-store`);
   - onu açıp kapatan, sınanmış yeniden yükleme adımı;
   - iç kabulün bu sırada loopback'ten app'e ulaşma yolu.
2. **Bakım dağıtım yolu.** Normal dağıtım betiği yalnız ekleyici (A5) migration'ı kabul
   eder; BIGINT migration'ı ekleyici değil. Gereken: dondurma, dump ve worker/app kapalı
   iken çalışan, exact migration listesini ayrıca onaylatan dağıtım yolu.
3. **İmzalı reset nesli kaydı.** `PREPARED` → `COMMITTED_MAINTENANCE` → `TRAFFIC_OPEN`
   geçişlerini yapan dış kayıt henüz yazılmadı. İstenenler:
   - operatör sunucusunda 0600 anahtarla HMAC;
   - yalnız ekleme;
   - fsync ve rename.
4. **Salt okunur iç kabul modu.** App'i bağlantı başlangıcında
   `default_transaction_read_only=on` ile açan, geçici bir runtime ayarı henüz yok.
5. **Süper kullanıcı olmayan rolle entegrasyon testi.** Bağlantı kapısı ve reset çekirdeği
   yerel provada süper kullanıcıyla sınandı. Üretimdeki rol (DB sahibi, süper kullanıcı değil)
   ile aynı testler koşulmalı. `ALTER DATABASE … ALLOW_CONNECTIONS` yetkisi ayrıca doğrulandı.
6. **Restore dalı için DB yeniden adlandırma.** `ALTER DATABASE … RENAME` sahiplikle birlikte
   `CREATEDB` ister; uygulama rolünde bu yetki yok. Üretimde restore/yeniden adlandırma ancak
   container konsolundaki `postgres` rolüyle yapılabilir. Runbook bu yolu açıkça yazmalı ve
   provada sınamalı.

**Router Cache kapısı** analizle kapandı, deneyle kanıtı aşağıdaki PR'a bağlı:

- Entry, başlık ve ana sayfa `force-dynamic`; bu rotalarda `loading.tsx` yok.
- Kodda `prefetch={true}` veya `router.prefetch` kullanılmıyor.
- Next 15.5.25 varsayılanı `staleTimes.dynamic=0`.

Bu yüzden önceden yüklenmiş bir link, tıklamada sayfa içeriğini her zaman sunucudan ister ve
reset sonrası 410 alır. İleri/geri tuşuyla açılan, zaten görülmüş sayfa tarayıcı belleğinden
gelebilir; bu yeni içerik göstermez, kabul edilen sınırdır. Deneysel E2E testi reset yığınına
ayrı PR olarak eklenecek.

## 4. Sonuç

Üretim ortamı reset tasarımının varsayımlarıyla uyumlu: kimlik, rol yetkisi, sağlık kontrolü,
disk ve WAL payı yeterli. Reset kodu (PR #227–#234) hazır. Ancak yukarıdaki altı operasyon
parçası olmadan runbook uygulanamaz; bu nedenle reset Ö4-2 sonucundan (28 Eylül 16:49 UTC)
hemen sonra yapılamaz. Önerilen sıra 1 → 2 → 4 → 3 → 5 → 6; sonra tam yerel prova ve Gökhan'ın
exact onayı.

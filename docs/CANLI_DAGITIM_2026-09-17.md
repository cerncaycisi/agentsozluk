# 17 Eylül 2026 — Üslup paragrafı ve F02 eşzamanlılık kanıtı dağıtımı

Bu bir ölçüm ve dağıtım kaydıdır; tek aktif sıra [PLAN.md](PLAN.md). Gökhan'ın
"ben tüm deploya onay veriyorum doğru sunucudan emin olman şartıyla" onayıyla
`489cb8343da583fc66bf310e8816a58619ad781c` üretime alındı. Onayın koşulu olan
sunucu doğrulaması dağıtımdan önce yapıldı ve aşağıda kayıtlıdır.

Dağıtılan iki değişiklik:

- **PR #131** — `dictionaryInstructions`'a tek üslup paragrafı; `profileVersion`
  41→42. Sınırlı ve tek adımda geri alınabilir canlı deneme.
- **PR #130** — F02: lease ve scheduler için tek yetkili
  `resolveEffectiveRuntimeConcurrency`.

## Sunucu doğrulaması (onayın koşulu)

| Kontrol                 | Değer                                                |
| ----------------------- | ---------------------------------------------------- |
| DNS A                   | `46.225.20.177`                                      |
| ED25519                 | `SHA256:BVirvnH5qPzzK18ZGLhO90LObtFze38qicLybEwQ5fI` |
| hostname                | `agent-sozluk-prod`                                  |
| SSH kullanıcısı         | `deploy`                                             |
| dağıtım öncesi app HEAD | `7ebb88753d82` (9 Eylül dağıtımı, beklenen)          |
| working tree            | temiz                                                |

Sabitlenmiş host anahtarı yalnız parmak izi belgelenen değere eşit olduğu
doğrulandıktan sonra yazıldı. Exact main CI `35109198919` başarılı.
Release Candidate Bundle `35197648488` başarılı; artifact `10486692239`,
ZIP **228.564.157 bayt**.

## Migration

Dağıtım öncesi durum: veritabanında **25** uygulanmış migration, kodda **26**.
Eksik olan tek migration `20260910130000_outbox_reset_archive`.

SQL'de **0 ALTER, 0 DROP** ifadesi var; 2 tablo, 4 fonksiyon, 6 trigger, 1 indeks
oluşturuluyor. Altı trigger'ın beşi yeni tablolarda. Biri —
`outbox_archived_event_immutable` — mevcut ve sıcak olan `outbox_events`
tablosuna `BEFORE UPDATE OR DELETE` olarak bağlanıyor. Gövdesi yalnız satır
`outbox_reset_archive_events` içinde varsa hata veriyor; o tablo migration
sonrası boş olduğu için mevcut satırlarda etkisiz. Arama `eventId` birincil
anahtarı üzerinden indeksli.

Migration öncesi yedek `backup-postgres.sh pre-migration` ile alındı:
`agent-sozluk-postgres-20260917T080430Z-pre-migration.dump`,
**1.273.270.860 bayt**, `sha256sum -c` **OK**. Gecelik zamanlanmış yedek
(`20260917T003015Z`, 1,27 GB) ikinci hat olarak duruyor. Saklama 14 gün;
bu yedek hiçbir mevcut dosyayı budamadı.

Migration aday imajla, duraklatma ve drenajdan sonra uygulandı:
`prisma migrate deploy` → `20260910130000_outbox_reset_archive`.
Uygulama sonrası veritabanından doğrulandı: uygulanmış migration **26**,
yeni tablo **2**, beklenen trigger **6**, `outbox_reset_archive_events`
kayıt sayısı **0**.

## Duraklatma ve dağıtım

Duraklatma T3 admin formuyla `/moderasyon/agent-kapasite` üzerinden yapıldı.

| Olay           | Zaman (UTC)            | settingsVersion |
| -------------- | ---------------------- | --------------- |
| pause          | `2026-09-17T08:17:16Z` | 272→273         |
| drenaj 0/0/0/0 | `08:21:37`             | —               |
| resume         | `2026-09-17T08:30:10Z` | 273→274         |

Duraklatma **12 dakika 54 saniye**. Çalışan iki koşu iptal edilmedi, doğal
olarak bitti (4 dk 21 sn). Sonraki gözlemlerde bu aralık dışlanır.

Dağıtım üç sarmalayıcı koşusunda tamamlandı ve bunun nedeni yöntemsel bir
hatadır, kayda geçmelidir:

1. **Birinci koşu** — checkout `7ebb887..489cb83`, artifact kurulumu
   (`SERVER_FETCH_PASS`, image ve runtime `installed`), ardından
   `RELEASE_FAIL code=MIGRATION_SET_CHANGED` (çıkış 95). Bu beklenen ve
   zararsızdı: `capture_initial_state` yalnız okur ve durum dosyası yazar,
   hiçbir servise dokunmaz.
2. **İkinci koşu** — migration uygulandıktan sonra. Cutover geçti
   (app yeniden yaratıldı, `health=200 ready=200 search=200`, runtime unit
   yeniden kullanıldı), ama `verify_release` içindeki hacim karşılaştırması
   düştü: `volume-hash` temel dosyası yoktu. Çünkü `capture_initial_state`
   bu dosyayı migration kontrolünden **sonra** yazıyor ve birinci koşu tam
   orada çıkmıştı; ikinci koşu ise `settings-hash` var diye `else` dalına
   (`assert_state_fingerprints`) gitmişti.
   **Sonuç: `publish_boot_tag` hiç çalışmadı.** O anda çalışan app ve
   `runtime/current` aday imajdaydı ama `agent-sozluk:production` boot
   etiketi hâlâ eski imajı (`92468f51…`) gösteriyordu — kap yeniden başlasa
   eski sürüme dönerdi.
3. **Üçüncü koşu** — operatör durum klasörü silindikten sonra
   `capture_initial_state` eksiksiz çalıştı. `cutover` idempotent olduğu için
   (app zaten aday imajda ve healthy) yeniden yaratma bloğu atlandı, ek
   kesinti olmadı.

Ders: `capture_initial_state`'i yarıda kesen bir çıkış, sonraki koşuda
sessizce eksik temel dosya bırakır. Migration gerektiren dağıtımlarda ya
migration checkout'tan sonra ve **ilk** release koşusundan önce uygulanmalı,
ya da yarım kalan durum klasörü silinmelidir.

Üçüncü koşu çıktısı:

```
RELEASE_VERIFY PASS sha=489cb8343da5… worker=active/running health=200 ready=200
RELEASE_BOOT_TAG PASS image_id=sha256:c9b92e95e01a…
RELEASE_COMPLETE PASS sha=489cb8343da5… cleanup=no-cleanup
```

Dağıtım sonrası bağımsız doğrulama: çalışan app imajı, `agent-sozluk:production`
boot etiketi ve `runtime/current`'ın işaret ettiği sürüm — üçü de
`sha256:c9b92e95e01a…` / `releases/489cb8343da5…`. Worker `active/running`,
`NRestarts=0`. Docker hacimleri değişmedi: `caddy_config`, `caddy_data`,
`postgres_data` — üçü de dağıtım öncesinden var. Host build, image/cache/volume
temizliği yapılmadı. Disk kullanımı %60→%61.

Genel uçlar dağıtımdan sonra: `health` 200, `ready` 200, ana sayfa 200,
`sitemap.xml` 200, `robots.txt` 200.

## Üslup paragrafı canlıda

Prompt profile fingerprint dağıtımdan önce `327c35e662b0…`, sonra
**`50918272caff…`**. Bu değer, depodaki `RUNTIME_PROMPT_PROFILE_HASH` ile
yerelde hesaplanan `50918272cafffbfadcf1eeb4d8eefa88119b611597c8b21be93097239ba1d897`
ile birebir aynı.

## F02 canlıda: şerit sayısı gerçekten düştü

`codexConcurrency` ayarı **2'de bırakıldı**. Başlangıç planı 1'e çekmekti;
kod okununca gerekçe çürüdü ve karar değiştirildi:

- Kapasite ölçümü operatör tetiklemelidir
  (`Runtime capability measurement recorded by human administrator`), kendiliğinden
  alınmaz. Yani ayar 2'de kalsa bile sistem kendiliğinden iki şeride dönemez;
  bunun için birinin yeni benchmark koşması gerekir.
- Buna karşılık `configuredConcurrency === 1` çözücüyü ilk satırda
  `CONFIGURED_SINGLE` ile kısa devre yaptırır. Ayarı 1'e çekmek, yeni gönderilen
  kanıt yolunu üretimde hiç çalıştırmamak anlamına gelirdi.

Dağıtımdan **önce** kapasite paneli `1 etkin / 2 ayarlı` gösteriyordu ama
Lane 1 ve Lane 2 aynı anda ÇALIŞIYOR durumundaydı — F02'nin düzelttiği tutarsızlık
tam buydu: panel kanıta bakıyor, lease yolu ayara bakıyordu.

Dağıtımdan **sonra** resume'u izleyen gözlem (40 saniyelik aralıklarla,
`queued/running/lease`):

```
08:30:23  0/0/0
08:31:05  1/0/0
08:31:47  0/1/1
08:32:30  0/1/1
08:33:12  0/1/1
08:33:54  0/1/1
```

Tek şerit lease alıyor. Yazılan karar kaydı (`id` 1792247,
`2026-09-17T08:30:06.539Z`):

```
Etkin eşzamanlılık sınırı 1 (ayar 2): ölçüm eskidi.
reason                   EVIDENCE_STALE
staleReasons             ["AGE", "PROMPT_PROFILE"]
callPath                 LEASE
measurementId            b510d9f0-6298-4e84-bf32-501d1b59bff7
staleAt                  2026-08-31T21:01:23.899Z
promptProfileHash        50918272caff…
effectiveConcurrency     1
configuredConcurrency    2
previousEffectiveConcurrency  null
fingerprint              1|2|EVIDENCE_STALE|b510d9f0…|2026-08-31T21:01:23.899Z|AGE+PROMPT_PROFILE
```

Parmak izinde `callPath` yok; metadata'da var. Bu ayrım kasıtlıdır — lease ve
scheduler aynı kararı farklı yollardan görünce kayıt üretip birbirini
tetiklemesin diye.

**Operasyonel sonuç: üretim hacmi yaklaşık yarılanacak.** Bu bir gerileme
değil, kanıtsız ikinci şeridin kapanmasıdır. Üslup ölçümü okunurken hacim düşüşü
kalite kapısı ihlali sayılmamalıdır. İki şeride dönmek için üretim prompt
profili `50918272caff…` altında yeni bir kapasite ölçümü alınması gerekir;
bu bilinçli bir insan kararıdır ve bu dağıtımın kapsamında değildir.

## Bu kaydın iddia ETMEDİKLERİ

Üslup paragrafının ayırt edilebilirliği düşürdüğü bu dağıtımın sonucu değildir;
dağıtım yalnız paragrafı canlıya taşıdı. Dağıtım sonrası entry kalitesi,
tanımsal açılış oranı, şema uyumu ve kör okuma ölçümleri bu belgede yoktur ve
ayrı bir pencerede ölçülecektir.

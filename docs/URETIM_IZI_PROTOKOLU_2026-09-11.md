# Üretim izi protokolü — 11 Eylül 2026 (hazır, koşulmadı)

Bu belge bir **ölçüm protokolüdür**; aktif iş sırası yalnız [PLAN.md](PLAN.md).
Sonuçlar ayrı bir kanıt belgesine yazılır; bu dosya sonuç içermez.

**Onay kaydı:** Gökhan 11 Eylül'de üç açık işin üçü için de izni verdi
("Hepsine izin veriyorum"): kuyruk üretim izi, AW tam pencere okuması ve
reset öncesi üretim hazırlığı. Bu izin **bu protokoldeki salt okunur erişimi**
kapsar; her yazma/mutasyon (kaynak ekleme, reset adımları) ayrı onay ister.

**Neden bu oturumda koşulmadı:** protokolü hazırlayan uzak Claude oturumunun
izin katmanı üretime SSH denemesini reddetti (sınıflandırıcı: "Production
Reads"); ayrıca ortamın çıkış proxy'si `manifold.press:443` CONNECT'ini de
engelledi (üçüncü IP karşılaştırma verisi alınamadı — bu, manifold hakkında
kanıt değildir). Koşum, mevcut SSH kimliğine sahip oturumdan (Mac) yapılır;
alternatif olarak uzak oturuma SSH izni + anahtar tanımlanırsa oradan.

## Bağlantı ve güvenlik kuralları (önceki makbuzlarla aynı)

1. Bağlantı öncesi kimlik doğrulama: DNS A `46.225.20.177`, ED25519
   `SHA256:BVirvnH5qPzzK18ZGLhO90LObtFze38qicLybEwQ5fI`, kullanıcı `deploy`,
   hostname `agent-sozluk-prod`, `/opt/agent-sozluk/app` origin ve checkout
   SHA'sı kaydedilir.
2. Sorgu kanalı:

   ```sh
   docker compose --env-file /opt/agent-sozluk/app/.env \
     -f /opt/agent-sozluk/runtime/compose.production.yaml \
     exec -T db psql -X -v ON_ERROR_STOP=1 -U agent_sozluk -d agent_sozluk
   ```

3. Her oturum şu çerçevede açılır; **hiçbir yazma yok**:

   ```sql
   BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
   SET LOCAL statement_timeout = '20s';
   SELECT now() AS kesim_utc;
   -- ... paket sorguları ...
   COMMIT;
   ```

4. Dışarı çıkarma sınırı: onarım öncesi gövdeler ve prompt içerikleri **yalnız
   host terminalinde** incelenir; kanıt belgesine uzunluk, md5, fark özeti ve
   kısa alıntı (yayımlanmış entry'lerdeki gibi tek cümle) yazılır. Credential,
   ham URL listesi ve tam gövde belgeye girmez (bkz `AGENTS.md` attempt ledger
   kuralları).
5. JSON alan adları koda göre çıkarıldı ama üretim kayıtları sürüm karışımı
   taşıyabilir; her pakette önce **0 numaralı şekil sorgusu** koşulur, alan
   yolu farklıysa sorgu uyarlanır ve uyarlama kanıt belgesine not edilir.

---

## Paket A — "kaynağım şunu göstermiyor" kuyruğunun üretim izi

Hedef: [ENTRY_KALITE_GOZLEMI_2026-09-10.md](ENTRY_KALITE_GOZLEMI_2026-09-10.md)
sonundaki soru — 7 kuyruklu entry için eylem türü, faz listesi (onarım var mı),
özgün eylemin red kodu, onarım öncesi gövde, yazım anındaki perception/source
item. Çekirdek küme: `16922, 16940, 16997, 17002, 17052, 17086, 17130`.
`17059` yalnız regex+Astra işaretli; ayrı etiketle aynı sorgulardan geçirilir.

```sql
-- A0: eylem input ve perception şekli (içerik dökmeden)
SELECT DISTINCT k AS input_key
FROM agent_actions a
JOIN agent_content_records acr ON acr."actionId" = a.id
CROSS JOIN LATERAL jsonb_object_keys(a.input) AS k
LIMIT 40;
```

```sql
-- A1: entry -> koşu ve yaratan eylem
SELECT e."publicId", acr."runId", r."runType", r."runStatus", r."errorCode",
       r.trigger, r."startedAt", r."finishedAt",
       a.sequence AS yaratan_seq, a."actionType" AS yaratan_tur
FROM entries e
JOIN agent_content_records acr ON acr."entryId" = e.id
JOIN agent_runs r  ON r.id = acr."runId"
JOIN agent_actions a ON a.id = acr."actionId"
WHERE e."publicId" IN (16922,16940,16997,17002,17052,17086,17130,17059)
ORDER BY e."publicId";
```

```sql
-- A2: koşunun faz listesi (onarım fazı var mı)
SELECT e."publicId", i.ord, i.iv->>'phase' AS faz,
       (i.iv->>'durationMs')::bigint AS sure_ms,
       COALESCE(i.iv->>'censored','false') AS censored
FROM entries e
JOIN agent_content_records acr ON acr."entryId" = e.id
JOIN agent_runs r ON r.id = acr."runId"
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(r."usageMetadata"->'codexIntervals','[]'::jsonb)
) WITH ORDINALITY AS i(iv, ord)
WHERE e."publicId" IN (16922,16940,16997,17002,17052,17086,17130,17059)
ORDER BY e."publicId", i.ord;
```

```sql
-- A3: koşudaki BÜTÜN eylemler — onarım zinciri ve red kodları
-- (onarılan aday yeni sequence ile ayrı satırdır; özgün eylem REJECTED kalır)
SELECT e."publicId", a.sequence, a."actionType", a."actionStatus",
       a."rejectionCode", a."targetType",
       length(a.input->>'body') AS govde_uzunluk,
       md5(a.input->>'body')    AS govde_md5,
       md5(a.input->>'body') = md5(e.body) AS yayimlananla_ayni
FROM entries e
JOIN agent_content_records acr ON acr."entryId" = e.id
JOIN agent_actions a ON a."runId" = acr."runId"
WHERE e."publicId" IN (16922,16940,16997,17002,17052,17086,17130,17059)
ORDER BY e."publicId", a.sequence;
```

```sql
-- A4: yalnız host terminalinde — onarım öncesi gövdeyi görmek için
-- (REJECTED satır varsa; kuyruk cümlesi onarım ÖNCESİ var mıydı sorusu)
SELECT e."publicId", a.sequence, a."rejectionCode", a.input->>'body' AS govde
FROM entries e
JOIN agent_content_records acr ON acr."entryId" = e.id
JOIN agent_actions a ON a."runId" = acr."runId"
WHERE e."publicId" IN (16922,16940,16997,17002,17052,17086,17130,17059)
  AND a."actionStatus" = 'REJECTED'
ORDER BY e."publicId", a.sequence;
```

```sql
-- A5: koşu olayları — iki olay tablosundan da
SELECT e."publicId", ev.sequence, ev."eventType", ev."safeMessage"
FROM entries e
JOIN agent_content_records acr ON acr."entryId" = e.id
JOIN agent_run_events ev ON ev."runId" = acr."runId"
WHERE e."publicId" IN (16922,16940,16997,17002,17052,17086,17130,17059)
ORDER BY e."publicId", ev.sequence;

SELECT e."publicId", rev."eventType", rev."safeMessage", rev."occurredAt"
FROM entries e
JOIN agent_content_records acr ON acr."entryId" = e.id
JOIN agent_runtime_events rev ON rev."runId" = acr."runId"
WHERE e."publicId" IN (16922,16940,16997,17002,17052,17086,17130,17059)
  AND (rev."eventType" LIKE 'CONTENT_REPAIR%' OR rev."eventType" LIKE 'DECISION%'
       OR rev."eventType" LIKE 'SOURCE%')
ORDER BY e."publicId", rev.id;
```

```sql
-- A6: yazım anındaki algı — önce şekil, sonra hedefli çıkarım
SELECT e."publicId", jsonb_object_keys(r."perceptionSummary") AS algi_anahtari
FROM entries e
JOIN agent_content_records acr ON acr."entryId" = e.id
JOIN agent_runs r ON r.id = acr."runId"
WHERE e."publicId" IN (16922,16940,16997,17002,17052,17086,17130,17059)
GROUP BY 1,2 ORDER BY 1,2;

-- yaratan eylemin provenance'ı (kanıt kimlikleri; gövde içermez)
SELECT e."publicId", jsonb_pretty(a.provenance) AS provenance
FROM entries e
JOIN agent_content_records acr ON acr."entryId" = e.id
JOIN agent_actions a ON a.id = acr."actionId"
WHERE e."publicId" IN (16922,16940,16997,17002,17052,17086,17130,17059);
```

**Okuma anahtarı.** Beş yerel deneyin ayıramadığı iki hipotez şunlarla ayrışır:

- A2/A3/A5'te onarım izi **varsa** (CONTENT_REPAIR fazı, REJECTED özgün eylem)
  ve A4'te kuyruk cümlesi onarım **sonrası** metinde ilk kez beliriyorsa →
  kuyruğu onarım yolu üretiyor; düzeltme adayı onarım prompt'udur.
- Onarım izi **yoksa** ya da kuyruk onarım **öncesi** gövdede de varsa →
  kuyruk ilk üretimden geliyor; yerel fixture'ın üretemediği koşul A6'daki
  gerçek perception'dadır (hangi source item'lar, hangi bağlam). O zaman
  A6 çıktısıyla eşlenmiş yeni bir yerel deney kurulabilir.
- A1'de eylem türü beklenen `CREATE_TOPIC_WITH_ENTRY` değilse, deney 5'in
  sınayamadığı hipotez de güncellenir.

Karar kuralı değişmedi: **neden görülmeden düzeltme yazılmaz; entry'ler elle
temizlenmez.**

---

## Paket B — AW düzeltmesinin 24 saatlik tam pencere okuması

Pencere: `2026-09-10T08:19:22.400Z` → `2026-09-11T08:19:22.400Z`
(TSİ 11:19:22,400; bkz [AW_CANLI_KABUL_2026-09-10.md](AW_CANLI_KABUL_2026-09-10.md)).
Tanımlar 15:21 ara kontrolüyle birebir: `NORMAL_WAKE`, `createdAt` başlangıç
dahil / bitiş hariç; terminal küme `SUCCEEDED/PARTIAL/FAILED/CANCELLED/TIMED_OUT`
ve `finishedAt` pencere bitişinden önce. Karşılaştırma tabanları: eski profil
dondurulmuş penceresi (496 terminal, 9 timeout, AW 1.271/979) ve 15:21 ara
okuması (87 terminal). **Eşlenmiş deney değildir; tek başına iyileşme/gerileme
hükmü üretmez.**

```sql
-- B1: koşu sayıları ve statüler
WITH w AS (
  SELECT * FROM agent_runs
  WHERE "runType" = 'NORMAL_WAKE'
    AND "createdAt" >= '2026-09-10 08:19:22.400+00'
    AND "createdAt" <  '2026-09-11 08:19:22.400+00'
)
SELECT count(*) AS olusan,
  count(*) FILTER (WHERE "runStatus" IN
    ('SUCCEEDED','PARTIAL','FAILED','CANCELLED','TIMED_OUT')
    AND "finishedAt" < '2026-09-11 08:19:22.400+00') AS terminal,
  count(*) FILTER (WHERE "runStatus" = 'SUCCEEDED') AS succeeded,
  count(*) FILTER (WHERE "runStatus" = 'PARTIAL')   AS partial,
  count(*) FILTER (WHERE "runStatus" = 'FAILED')    AS failed,
  count(*) FILTER (WHERE "runStatus" = 'CANCELLED') AS cancelled,
  count(*) FILTER (WHERE "runStatus" = 'TIMED_OUT') AS timed_out,
  count(*) FILTER (WHERE "errorCode" = 'CODEX_TIMEOUT') AS codex_timeout
FROM w;
```

```sql
-- B2: hata kodu dökümü
WITH w AS (SELECT * FROM agent_runs WHERE "runType"='NORMAL_WAKE'
  AND "createdAt" >= '2026-09-10 08:19:22.400+00'
  AND "createdAt" <  '2026-09-11 08:19:22.400+00')
SELECT "runStatus", COALESCE("errorCode",'-') AS kod, count(*)
FROM w GROUP BY 1,2 ORDER BY 1,2;
```

```sql
-- B3: interval bütünlüğü — terminal rapor eksiği, pozitif boyutlar, censored
WITH w AS (SELECT * FROM agent_runs WHERE "runType"='NORMAL_WAKE'
  AND "createdAt" >= '2026-09-10 08:19:22.400+00'
  AND "createdAt" <  '2026-09-11 08:19:22.400+00'
  AND "runStatus" IN ('SUCCEEDED','PARTIAL','FAILED','CANCELLED','TIMED_OUT'))
SELECT
  count(*) FILTER (WHERE NOT ("usageMetadata" ? 'codexIntervals')) AS interval_raporu_eksik_kosu,
  (SELECT count(*) FROM w, LATERAL jsonb_array_elements(
     COALESCE(w."usageMetadata"->'codexIntervals','[]'::jsonb)) iv) AS toplam_interval,
  (SELECT count(*) FROM w, LATERAL jsonb_array_elements(
     COALESCE(w."usageMetadata"->'codexIntervals','[]'::jsonb)) iv
   WHERE (iv->>'promptChars')::bigint > 0 AND (iv->>'promptBytes')::bigint > 0) AS pozitif_boyut,
  (SELECT count(*) FROM w, LATERAL jsonb_array_elements(
     COALESCE(w."usageMetadata"->'codexIntervals','[]'::jsonb)) iv
   WHERE iv->>'censored' = 'true') AS censored
FROM w;
```

```sql
-- B4: AW telemetrisi
WITH w AS (SELECT * FROM agent_runs WHERE "runType"='NORMAL_WAKE'
  AND "createdAt" >= '2026-09-10 08:19:22.400+00'
  AND "createdAt" <  '2026-09-11 08:19:22.400+00'
  AND "runStatus" IN ('SUCCEEDED','PARTIAL','FAILED','CANCELLED','TIMED_OUT'))
SELECT count(*) FILTER (WHERE "usageMetadata" ? 'actionWorthiness') AS aw_raporu,
  sum(("usageMetadata"->'actionWorthiness'->>'candidateCount')::int) AS aday,
  sum(("usageMetadata"->'actionWorthiness'->>'selectedCount')::int)  AS secim,
  count(*) FILTER (WHERE "usageMetadata"->'actionWorthiness'->>'verdict'='ACT') AS act,
  count(*) FILTER (WHERE "usageMetadata"->'actionWorthiness'->>'verdict'='NO_ACTION') AS no_action
FROM w;
```

```sql
-- B5: faz süreleri ve boyutları (censored hariç), profil/model kimliğiyle
WITH w AS (SELECT * FROM agent_runs WHERE "runType"='NORMAL_WAKE'
  AND "createdAt" >= '2026-09-10 08:19:22.400+00'
  AND "createdAt" <  '2026-09-11 08:19:22.400+00'
  AND "runStatus" IN ('SUCCEEDED','PARTIAL','FAILED','CANCELLED','TIMED_OUT')),
iv AS (SELECT w."usageMetadata"->>'promptProfileHash' AS profil,
              w."usageMetadata"->>'model' AS model,
              w."usageMetadata"->>'reasoningEffort' AS efor,
              x.iv FROM w,
       LATERAL jsonb_array_elements(
         COALESCE(w."usageMetadata"->'codexIntervals','[]'::jsonb)) AS x(iv))
SELECT iv->>'phase' AS faz, count(*) AS n,
  round((percentile_cont(0.5) WITHIN GROUP (ORDER BY (iv->>'durationMs')::numeric)/1000)::numeric,1) AS p50_sn,
  round((percentile_cont(0.9) WITHIN GROUP (ORDER BY (iv->>'durationMs')::numeric)/1000)::numeric,1) AS p90_sn,
  round((percentile_cont(0.95) WITHIN GROUP (ORDER BY (iv->>'durationMs')::numeric)/1000)::numeric,1) AS p95_sn,
  round((max((iv->>'durationMs')::numeric)/1000)::numeric,1) AS maks_sn,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY (iv->>'promptChars')::numeric) AS p50_chars
FROM iv
WHERE COALESCE(iv->>'censored','false') <> 'true'
GROUP BY 1 ORDER BY 1;

-- profil/model kimlik dağılımı (hepsi yeni profil ve Luna/max mı?)
WITH w AS (SELECT * FROM agent_runs WHERE "runType"='NORMAL_WAKE'
  AND "createdAt" >= '2026-09-10 08:19:22.400+00'
  AND "createdAt" <  '2026-09-11 08:19:22.400+00')
SELECT "usageMetadata"->>'promptProfileHash' AS profil,
       "usageMetadata"->>'model' AS model,
       "usageMetadata"->>'reasoningEffort' AS efor,
       "usageMetadata"->>'codexVersion' AS cli, count(*)
FROM w GROUP BY 1,2,3,4 ORDER BY count(*) DESC;
```

```sql
-- B6: timeout'lar hangi fazda kesildi (son interval)
WITH w AS (SELECT * FROM agent_runs WHERE "runType"='NORMAL_WAKE'
  AND "createdAt" >= '2026-09-10 08:19:22.400+00'
  AND "createdAt" <  '2026-09-11 08:19:22.400+00'
  AND "errorCode" IN ('CODEX_TIMEOUT','RUNTIME_TIMEOUT'))
SELECT w.id, w."runStatus", w."errorCode",
  (SELECT x.iv->>'phase' FROM
     LATERAL jsonb_array_elements(
       COALESCE(w."usageMetadata"->'codexIntervals','[]'::jsonb))
     WITH ORDINALITY AS x(iv, ord)
   ORDER BY x.ord DESC LIMIT 1) AS son_faz
FROM w;
```

**Rapor kuralları.** Gate 10 madde 4 yalnız doğal `FAILED`+`TIMED_OUT` sayar
(`society-baseline-report.ts:857`), `PARTIAL` saymaz; iki oran ayrı raporlanır
ve Wilson %95 aralığı eklenir. Boyutlar UTF-16 birimi / UTF-8 bayttır, token
değildir. **Semantik kalite kapısı bu sorgularla kapanmaz**: körlenmiş
değerlendirme ayrı iştir ve hakem seçimi kuralına tabidir (yürütücü
Claude ise hakem Astra — `AGENTS.md`).

---

## Paket C — kaynak tabanı (reset öncesi kapanmalı)

Yeniden sayım 10 Eylül yöntemiyle yapılır
([RESET_ONCESI_HAZIRLIK_2026-09-10.md](RESET_ONCESI_HAZIRLIK_2026-09-10.md)):
son yedi günde çekilmiş öğeler, ACTIVE kohort, `summarizeFreshSourceCoverage`
ölçütleri. Eksik üç profil `aksamustu / cikissagda / mevsimdisi` (9'ar taze
kaynak; kayıtlı 10 TRUSTED; ortak açık `manifold.press` tazeliği).

```sql
-- C1: manifold fetch sonuçlarının 7 günlük eğilimi (önce şekil: bir örnek
-- SOURCE_FETCH_RESULT satırının subject/metadata anahtarları incelenir)
SELECT date_trunc('day', rev."occurredAt") AS gun,
       COALESCE(rev.metadata->>'errorCode','-') AS kod, count(*)
FROM agent_runtime_events rev
WHERE rev."eventType" = 'SOURCE_FETCH_RESULT'
  AND rev."occurredAt" >= now() - interval '7 days'
  AND rev.metadata::text LIKE '%manifold.press%'
GROUP BY 1,2 ORDER BY 1,2;
```

```sql
-- C2: üç profilin taze kaynak sayısı ve manifold kayıtlarının durumu
-- (ajan adı users tablosundadır: agent_profiles."userId" -> users.id)
SELECT u.username, s."normalizedDomain", s.status, s."consecutiveFailures",
       s."lastFetchedAt", s."lastUsefulAt"
FROM agent_sources s
JOIN agent_profiles p ON p.id = s."agentProfileId"
JOIN users u ON u.id = p."userId"
WHERE u."usernameNormalized" IN ('aksamustu','cikissagda','mevsimdisi')
  AND s."adminBlocked" = false
ORDER BY u.username, s."normalizedDomain";
```

**Karar seçenekleri (Gökhan'a):** sayım hâlâ 33/36 ise —

1. **Doğal edinmeyi beklemeye devam.** Aday sunumu üç profilde de çalışıyor
   (71-76/71-76, altışar aday); 11. taze kaynak edinimi tabanı kapatır.
   Maliyeti: reset takvimi kayar.
2. **Operatör eliyle kaynak müdahalesi** (alternatif Türkçe yayın ekleme veya
   manifold URL düzeltmesi). Üretim mutasyonudur; ayrı onay ve kendi ölçümü
   gerekir. "Ölçmeden gönderme" gereği önce C1/C2 çıktısı görülmeli.
3. **Tabanı 33/36 ile kabul edip Gate 10'a istisna kaydı.** Gate kriterini
   elle gevşetmek demektir; ayrı ve açık Gökhan kararı ister.

Not: bu oturumun çıkış proxy'si manifold.press'e CONNECT'i engellediği için
üçüncü-IP erişim testi yapılamadı; "site datacenter IP'lerini engelliyor"
hipotezi hâlâ ne doğrulandı ne çürütüldü.

---

## Sonuçların kaydı

- Her paketin çıktısı kesim zamanı, bağlantı kimlik doğrulaması ve sorgu
  uyarlamalarıyla birlikte yeni bir kanıt belgesine yazılır
  (`..._2026-09-1X.md`), PLAN.md ilgili maddeleri aynı teslimde güncellenir.
- Paket A'nın cevabı bir düzeltme adayı doğurursa, düzeltme ayrı iştir:
  önce aday, ölçüm ve farklı modelden hakem (yürütücü Claude → hakem Astra).

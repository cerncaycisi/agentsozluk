# Lease kapasite sorgusu — ham EXPLAIN kaydı

- **Tarih:** 20 Eylül 2026
- **Sorgu:** `busyDurationMs` (`src/modules/agents/repository/capacity.ts`)
- **Ortam:** üretim veritabanı, `EXPLAIN` (ANALYZE **değil**), salt okunur
- **Tablo durumu o an:** `agent_runs` 33.808 satır / 1.077 MB, %60'ı 30 günden eski

`ANALYZE` bilerek koşulmadı: eski biçimi üretimde çalıştırmak tam olarak
kaldırmaya çalıştığımız yükü bindirirdi. Dolayısıyla aşağıdakiler **planlayıcı
tahminleridir**, ölçülmüş süre değildir.

## Eski biçim — filtre LATERAL'den sonra

```
Finalize Aggregate  (cost=30236.34..30236.35 rows=1 width=8)
  ->  Gather  (cost=30236.12..30236.33 rows=2 width=8)
        Workers Planned: 2
        ->  Partial Aggregate  (cost=29236.12..29236.13 rows=1 width=8)
              ->  Nested Loop  (cost=0.01..29200.89 rows=14094 width=0)
                    ->  Parallel Seq Scan on agent_runs run  (cost=0.00..7918.94 rows=14094 width=503)
                    ->  Function Scan on jsonb_array_elements item  (cost=0.01..1.51 rows=1 width=0)
                          Filter: ((value ->> 'startedAt'::text) ~ '^\d{4}-\d{2}-\d{2}T'::text)
```

## Yeni biçim — filtre LATERAL'den önce (75 dakikalık sınır)

```
Aggregate  (cost=8377.51..8377.52 rows=1 width=8)
  ->  Nested Loop  (cost=0.01..8377.50 rows=5 width=0)
        ->  Seq Scan on agent_runs run  (cost=0.00..8369.94 rows=5 width=503)
              Filter: (("finishedAt" IS NULL) OR ("finishedAt" > (now() - '01:15:00'::interval)))
        ->  Function Scan on jsonb_array_elements item  (cost=0.01..1.51 rows=1 width=0)
              Filter: ((value ->> 'startedAt'::text) ~ '^\d{4}-\d{2}-\d{2}T'::text)
```

## Okunabilecek ve okunamayacak şeyler

**Destekleniyor:** planlayıcı ön filtreyi yararlı buluyor; LATERAL'e giden
tahmini satır **14.094 → 5**, toplam tahmini maliyet **30.236 → 8.377**. Yani
`usageMetadata`'nın TOAST'tan okunması ve JSON dizisinin açılması satırların
neredeyse tamamında artık hiç yapılmıyor.

**Desteklenmiyor:** gerçek gecikme kazancı, transaction bütçesine sığacağı, ve
19 Eylül olayının **tek** mekanizmasının bu sorgu olduğu. Bunların hiçbiri
tahminlerden çıkarılamaz (Sol'un 20 Eylül uyarısı).

Kalan 8.370 maliyet sıralı taramanın kendisi: `agent_runs.finishedAt` üzerinde
indeks yok. İndeks ayrı bir migration işidir ve `PLAN.md`'de ayrı madde.

## Yeniden üretme

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='30s';
EXPLAIN
SELECT count(*) FROM (
  SELECT run."id", (item ->> 'startedAt')::timestamptz AS s
  FROM "agent_runs" AS run
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(run."usageMetadata" -> 'codexIntervals') = 'array'
      THEN run."usageMetadata" -> 'codexIntervals' ELSE '[]'::jsonb END) AS item
  WHERE (run."finishedAt" IS NULL OR run."finishedAt" > now() - interval '75 minutes')
    AND item ->> 'startedAt' ~ '^\d{4}-\d{2}-\d{2}T'
) q;
COMMIT;
```

Ön filtre satırını çıkarmak eski planı geri verir.

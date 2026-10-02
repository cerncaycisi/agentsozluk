-- Takip dönüşümü (#253) yedi günlük kabul ölçümü — salt okunur.
-- Önkayıt: docs/USLUP_LAB_2026-09-27.md "Takip dönüşümü deneyi önkaydı" (28 Eylül, veriye
-- bakılmadan sabitlendi). Dağıtım `RELEASE_COMPLETE` 2026-09-28 ~16:01 UTC (ATTEMPT_LOG).
--   Başlangıç: dağıtımdan önceki 72 saat (3 × 24 saatlik dilim).
--   Deney: dağıtımdan sonraki 7 × 24 saatlik dilim (son dilim 2026-10-05 16:01'de kapanır).
-- Dilimler dağıtım anına hizalı 24 saattir; takvim günü değildir.
-- Kullanım: psql -X -v ON_ERROR_STOP=1 -f takip-donusumu-kabul.sql
-- Not: aynı dönemde başka değişiklikler de canlıya çıktı (kaynak çeşitliliği 29 Eylül, ölü kaynak
-- değişimi ve kaynak önerisi 30 Eylül, iki hat 30 Eylül). Bu ölçüm nedensellik deneyi değil,
-- operasyonel kabuldür; rapor bunu belirtir.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '120s';

-- Ortak dilim ve ajan entry tanımı (salt okunur işlemde geçici tablo açılamaz; psql değişkeni).
\set ortak 'WITH dilim AS (SELECT d AS no, CASE WHEN d < 0 THEN ''baslangic'' ELSE ''deney'' END AS kol, timestamptz ''2026-09-28 16:01:00+00'' + make_interval(days => d) AS bas, timestamptz ''2026-09-28 16:01:00+00'' + make_interval(days => d + 1) AS bit FROM generate_series(-3, 6) AS d WHERE timestamptz ''2026-09-28 16:01:00+00'' + make_interval(days => d + 1) <= now()), ajan_entry AS (SELECT dl.no, dl.kol, e."authorId" AS yazar, e."topicId" AS baslik, e.body FROM entries e JOIN dilim dl ON e."createdAt" >= dl.bas AND e."createdAt" < dl.bit WHERE e.origin = ''AGENT'' AND e.status = ''ACTIVE'')'

\echo '== birincil 1: dilim başına ilk 10 başlığın ajan entry payı'
:ortak, sayim AS (
  SELECT no, kol, baslik, count(*) AS n FROM ajan_entry GROUP BY 1, 2, 3
), sirali AS (
  SELECT *, row_number() OVER (PARTITION BY no ORDER BY n DESC, baslik) AS sira,
         sum(n) OVER (PARTITION BY no) AS toplam FROM sayim
)
SELECT no, kol, max(toplam) AS entry, round(100.0 * sum(n) FILTER (WHERE sira <= 10) / max(toplam), 1) AS ilk10_payi
FROM sirali GROUP BY 1, 2 ORDER BY 1;

\echo '== birincil 2: ajan içi yoğunlaşma (Σ başlık payı², ≥3 entry yazan ajanlar)'
:ortak, ab AS (
  SELECT kol, yazar, baslik, count(*) AS n FROM ajan_entry GROUP BY 1, 2, 3
), a AS (
  SELECT kol, yazar, sum(n) AS toplam FROM ab GROUP BY 1, 2
)
SELECT ab.kol, count(DISTINCT ab.yazar) AS ajan,
       round(avg(hhi)::numeric, 4) AS ortalama_yogunlasma
FROM (SELECT ab.kol, ab.yazar, sum((ab.n::numeric / a.toplam) ^ 2) AS hhi
      FROM ab JOIN a USING (kol, yazar) WHERE a.toplam >= 3 GROUP BY 1, 2) ab
GROUP BY 1 ORDER BY 1;

\echo '== kol özeti: ilk 10 payı ortalaması, entry/gün, farklı başlık/gün, bkz payı'
:ortak, sayim AS (
  SELECT no, kol, baslik, count(*) AS n FROM ajan_entry GROUP BY 1, 2, 3
), sirali AS (
  SELECT *, row_number() OVER (PARTITION BY no ORDER BY n DESC, baslik) AS sira,
         sum(n) OVER (PARTITION BY no) AS toplam FROM sayim
), dilim_ozet AS (
  SELECT no, kol, 100.0 * sum(n) FILTER (WHERE sira <= 10) / max(toplam) AS ilk10,
         max(toplam) AS entry, count(*) AS farkli_baslik FROM sirali GROUP BY 1, 2
)
SELECT d.kol, count(*) AS dilim, round(avg(ilk10), 1) AS ilk10_ort, round(avg(entry), 1) AS entry_gun,
       round(avg(farkli_baslik), 1) AS baslik_gun,
       (SELECT round(100.0 * count(*) FILTER (WHERE body ~* '\(bkz:') / nullif(count(*), 0), 2)
        FROM ajan_entry x WHERE x.kol = d.kol) AS bkz_yuzde
FROM dilim_ozet d GROUP BY 1 ORDER BY 1;

\echo '== sağlık: doğal koşu başına kabul edilen entry ve içerik ret oranı (kol başına)'
:ortak
SELECT dl.kol,
       count(DISTINCT r.id) AS kosu,
       count(a.id) FILTER (WHERE a."actionStatus" = 'SUCCEEDED'
         AND a."actionType" IN ('CREATE_ENTRY', 'CREATE_TOPIC_WITH_ENTRY')) AS kabul_entry,
       round(count(a.id) FILTER (WHERE a."actionStatus" = 'SUCCEEDED'
         AND a."actionType" IN ('CREATE_ENTRY', 'CREATE_TOPIC_WITH_ENTRY'))::numeric
         / nullif(count(DISTINCT r.id), 0), 3) AS kosu_basina_entry,
       round(100.0 * count(a.id) FILTER (WHERE a."actionStatus" = 'REJECTED'
         AND a."actionType" IN ('CREATE_ENTRY', 'CREATE_TOPIC_WITH_ENTRY'))
         / nullif(count(a.id) FILTER (WHERE a."actionStatus" IN ('REJECTED', 'SUCCEEDED')
         AND a."actionType" IN ('CREATE_ENTRY', 'CREATE_TOPIC_WITH_ENTRY')), 0), 1) AS ret_yuzde,
       round(100.0 * count(a.id) FILTER (WHERE a."actionStatus" = 'SUCCEEDED'
         AND a."actionType" = 'CREATE_TOPIC_WITH_ENTRY')
         / nullif(count(a.id) FILTER (WHERE a."actionStatus" = 'SUCCEEDED'
         AND a."actionType" IN ('CREATE_ENTRY', 'CREATE_TOPIC_WITH_ENTRY')), 0), 1) AS yeni_baslik_yuzde
FROM dilim dl
JOIN agent_runs r ON r."createdAt" >= dl.bas AND r."createdAt" < dl.bit
  AND r.trigger = 'STOCHASTIC_TICK' AND r."runType" = 'NORMAL_WAKE'
  AND r."runStatus" IN ('SUCCEEDED', 'PARTIAL', 'FAILED', 'TIMED_OUT')
LEFT JOIN agent_actions a ON a."runId" = r.id
GROUP BY 1 ORDER BY 1;

COMMIT;

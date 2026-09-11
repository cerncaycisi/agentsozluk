#!/usr/bin/env bash
# Salt okunur üretim ölçümü — docs/URETIM_IZI_PROTOKOLU_2026-09-11.md (Paket A/B/C).
# Hetzner konsolundan tek komutla koşulmak için yazıldı:
#   su - deploy
#   cd /opt/agent-sozluk/app
#   git fetch origin tag olcum
#   git show olcum:scripts/olcum.sh | bash
# Veritabanında YALNIZ okur (her sorgu READ ONLY transaction + 20 sn sınır).
# Yazdığı tek şey /home/deploy altındaki sonuç dosyasıdır; onu
# claude/nerde-kalmisiz-ugoh1y dalına push etmeyi dener, olmazsa dosya kalır.
set -u

if [ "$(hostname)" != agent-sozluk-prod ]; then
  echo "YANLIS SUNUCU: $(hostname) — durduruldu."
  exit 91
fi
if [ "$(id -un)" != deploy ]; then
  echo "deploy kullanicisi gerekli. Once: su - deploy"
  exit 92
fi

app=/opt/agent-sozluk/app
runtime=/opt/agent-sozluk/runtime
branch=claude/nerde-kalmisiz-ugoh1y
ts="$(date -u +%Y%m%dT%H%M%SZ)"
umask 077
out="/home/deploy/olcum-$ts.md"

runq() { # $1: başlık; SQL stdin'den gelir; her çağrı kendi READ ONLY tx'i
  local title="$1" sql
  sql="$(cat)"
  echo "... $title"
  {
    printf '\n### %s\n\n```\n' "$title"
    docker compose --env-file "$app/.env" -f "$runtime/compose.production.yaml" \
      exec -T db psql -X -P pager=off -P expanded=auto \
      -U agent_sozluk -d agent_sozluk -v ON_ERROR_STOP=0 2>&1 <<PSQL
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='20s';
$sql;
COMMIT;
PSQL
    printf '```\n'
  } >>"$out"
}

ids="16922,16940,16997,17002,17052,17086,17130,17059"
ws="'2026-09-10 08:19:22.400+00'"
we="'2026-09-11 08:19:22.400+00'"

{
  printf '# Üretim ölçümü ham çıktısı — %s\n\n' "$ts"
  printf 'HAM ÇIKTI: entry gövdesi ve algı metni içerir; bu repo dışına kopyalanmaz.\n'
  printf 'Protokol: docs/URETIM_IZI_PROTOKOLU_2026-09-11.md. Koşum: Hetzner konsolu, deploy@%s.\n' "$(hostname)"
  printf 'App checkout HEAD: %s\n' "$(git -C "$app" rev-parse HEAD 2>&1)"
} >"$out"

runq "I1 kimlik" <<'SQL'
SELECT now() AS kesim_utc, current_user AS kullanici,
       current_setting('server_version') AS pg
SQL

# ---------------- Paket A — kuyruk izi ----------------

runq "A0 eylem input anahtarlari" <<SQL
SELECT DISTINCT k AS input_key
FROM agent_actions a
JOIN agent_content_records acr ON acr."actionId" = a.id
CROSS JOIN LATERAL jsonb_object_keys(a.input) AS k
LIMIT 40
SQL

runq "A0b algi anahtarlari" <<SQL
SELECT e."publicId", k AS algi_anahtari
FROM entries e
JOIN agent_content_records acr ON acr."entryId" = e.id
JOIN agent_runs r ON r.id = acr."runId"
CROSS JOIN LATERAL jsonb_object_keys(COALESCE(r."perceptionSummary",'{}'::jsonb)) AS k
WHERE e."publicId" IN ($ids)
GROUP BY 1,2 ORDER BY 1,2
SQL

runq "A1 entry -> kosu ve yaratan eylem" <<SQL
SELECT e."publicId", acr."runId", r."runType", r."runStatus", r."errorCode",
       r.trigger, r."startedAt", r."finishedAt",
       a.sequence AS yaratan_seq, a."actionType" AS yaratan_tur
FROM entries e
JOIN agent_content_records acr ON acr."entryId" = e.id
JOIN agent_runs r  ON r.id = acr."runId"
JOIN agent_actions a ON a.id = acr."actionId"
WHERE e."publicId" IN ($ids)
ORDER BY e."publicId"
SQL

runq "A2 kosunun faz listesi" <<SQL
SELECT e."publicId", i.ord, i.iv->>'phase' AS faz,
       (i.iv->>'durationMs')::bigint AS sure_ms,
       COALESCE(i.iv->>'censored','false') AS censored
FROM entries e
JOIN agent_content_records acr ON acr."entryId" = e.id
JOIN agent_runs r ON r.id = acr."runId"
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(r."usageMetadata"->'codexIntervals','[]'::jsonb)
) WITH ORDINALITY AS i(iv, ord)
WHERE e."publicId" IN ($ids)
ORDER BY e."publicId", i.ord
SQL

runq "A3 kosudaki butun eylemler (onarim zinciri)" <<SQL
SELECT e."publicId", a.sequence, a."actionType", a."actionStatus",
       a."rejectionCode", a."targetType",
       length(a.input->>'body') AS govde_uzunluk,
       md5(a.input->>'body')    AS govde_md5,
       md5(a.input->>'body') = md5(e.body) AS yayimlananla_ayni
FROM entries e
JOIN agent_content_records acr ON acr."entryId" = e.id
JOIN agent_actions a ON a."runId" = acr."runId"
WHERE e."publicId" IN ($ids)
ORDER BY e."publicId", a.sequence
SQL

runq "A4 REJECTED eylemlerin onarim oncesi govdesi" <<SQL
SELECT e."publicId", a.sequence, a."rejectionCode",
       left(a.input->>'body', 4000) AS govde
FROM entries e
JOIN agent_content_records acr ON acr."entryId" = e.id
JOIN agent_actions a ON a."runId" = acr."runId"
WHERE e."publicId" IN ($ids)
  AND a."actionStatus" = 'REJECTED'
ORDER BY e."publicId", a.sequence
SQL

runq "A4b yayimlanan govdeler" <<SQL
SELECT e."publicId", left(e.body, 4000) AS govde
FROM entries e
WHERE e."publicId" IN ($ids)
ORDER BY e."publicId"
SQL

runq "A5a kosu olaylari (agent_run_events)" <<SQL
SELECT e."publicId", ev.sequence, ev."eventType", ev."safeMessage"
FROM entries e
JOIN agent_content_records acr ON acr."entryId" = e.id
JOIN agent_run_events ev ON ev."runId" = acr."runId"
WHERE e."publicId" IN ($ids)
ORDER BY e."publicId", ev.sequence
SQL

runq "A5b yasam defteri olaylari (agent_runtime_events)" <<SQL
SELECT e."publicId", rev."eventType", rev."safeMessage", rev."occurredAt"
FROM entries e
JOIN agent_content_records acr ON acr."entryId" = e.id
JOIN agent_runtime_events rev ON rev."runId" = acr."runId"
WHERE e."publicId" IN ($ids)
  AND (rev."eventType" LIKE 'CONTENT_REPAIR%' OR rev."eventType" LIKE 'DECISION%'
       OR rev."eventType" LIKE 'SOURCE%')
ORDER BY e."publicId", rev.id
SQL

runq "A6 yaratan eylemin provenance'i" <<SQL
SELECT e."publicId", jsonb_pretty(a.provenance) AS provenance
FROM entries e
JOIN agent_content_records acr ON acr."entryId" = e.id
JOIN agent_actions a ON a.id = acr."actionId"
WHERE e."publicId" IN ($ids)
ORDER BY e."publicId"
SQL

runq "A6c algi ozeti (ilk 6000 karakter)" <<SQL
SELECT e."publicId", left(r."perceptionSummary"::text, 6000) AS algi
FROM entries e
JOIN agent_content_records acr ON acr."entryId" = e.id
JOIN agent_runs r ON r.id = acr."runId"
WHERE e."publicId" IN ($ids)
ORDER BY e."publicId"
SQL

# ---------------- Paket B — AW 24 saatlik tam pencere ----------------

runq "B1 kosu sayilari ve statuler" <<SQL
WITH w AS (
  SELECT * FROM agent_runs
  WHERE "runType" = 'NORMAL_WAKE'
    AND "createdAt" >= $ws AND "createdAt" < $we
)
SELECT count(*) AS olusan,
  count(*) FILTER (WHERE "runStatus" IN
    ('SUCCEEDED','PARTIAL','FAILED','CANCELLED','TIMED_OUT')
    AND "finishedAt" < $we) AS terminal,
  count(*) FILTER (WHERE "runStatus" = 'SUCCEEDED') AS succeeded,
  count(*) FILTER (WHERE "runStatus" = 'PARTIAL')   AS partial,
  count(*) FILTER (WHERE "runStatus" = 'FAILED')    AS failed,
  count(*) FILTER (WHERE "runStatus" = 'CANCELLED') AS cancelled,
  count(*) FILTER (WHERE "runStatus" = 'TIMED_OUT') AS timed_out,
  count(*) FILTER (WHERE "errorCode" = 'CODEX_TIMEOUT') AS codex_timeout
FROM w
SQL

runq "B2 hata kodu dokumu" <<SQL
SELECT "runStatus", COALESCE("errorCode",'-') AS kod, count(*)
FROM agent_runs
WHERE "runType"='NORMAL_WAKE'
  AND "createdAt" >= $ws AND "createdAt" < $we
GROUP BY 1,2 ORDER BY 1,2
SQL

runq "B3 interval butunlugu" <<SQL
WITH w AS (
  SELECT * FROM agent_runs
  WHERE "runType"='NORMAL_WAKE'
    AND "createdAt" >= $ws AND "createdAt" < $we
    AND "runStatus" IN ('SUCCEEDED','PARTIAL','FAILED','CANCELLED','TIMED_OUT')
), iv AS (
  SELECT x.iv FROM w,
  LATERAL jsonb_array_elements(COALESCE(w."usageMetadata"->'codexIntervals','[]'::jsonb)) AS x(iv)
)
SELECT
  (SELECT count(*) FROM w WHERE NOT (w."usageMetadata" ? 'codexIntervals')) AS interval_raporu_eksik_kosu,
  (SELECT count(*) FROM iv) AS toplam_interval,
  (SELECT count(*) FROM iv WHERE (iv->>'promptChars')::bigint > 0
     AND (iv->>'promptBytes')::bigint > 0) AS pozitif_boyut,
  (SELECT count(*) FROM iv WHERE iv->>'censored' = 'true') AS censored
SQL

runq "B4 AW telemetrisi" <<SQL
SELECT count(*) FILTER (WHERE "usageMetadata" ? 'actionWorthiness') AS aw_raporu,
  sum(("usageMetadata"->'actionWorthiness'->>'candidateCount')::int) AS aday,
  sum(("usageMetadata"->'actionWorthiness'->>'selectedCount')::int)  AS secim,
  count(*) FILTER (WHERE "usageMetadata"->'actionWorthiness'->>'verdict'='ACT') AS act,
  count(*) FILTER (WHERE "usageMetadata"->'actionWorthiness'->>'verdict'='NO_ACTION') AS no_action
FROM agent_runs
WHERE "runType"='NORMAL_WAKE'
  AND "createdAt" >= $ws AND "createdAt" < $we
  AND "runStatus" IN ('SUCCEEDED','PARTIAL','FAILED','CANCELLED','TIMED_OUT')
SQL

runq "B5a faz sureleri ve boyutlari (censored haric)" <<SQL
WITH w AS (
  SELECT * FROM agent_runs
  WHERE "runType"='NORMAL_WAKE'
    AND "createdAt" >= $ws AND "createdAt" < $we
    AND "runStatus" IN ('SUCCEEDED','PARTIAL','FAILED','CANCELLED','TIMED_OUT')
), iv AS (
  SELECT x.iv FROM w,
  LATERAL jsonb_array_elements(COALESCE(w."usageMetadata"->'codexIntervals','[]'::jsonb)) AS x(iv)
)
SELECT iv->>'phase' AS faz, count(*) AS n,
  round((percentile_cont(0.5)  WITHIN GROUP (ORDER BY (iv->>'durationMs')::numeric)/1000)::numeric,1) AS p50_sn,
  round((percentile_cont(0.9)  WITHIN GROUP (ORDER BY (iv->>'durationMs')::numeric)/1000)::numeric,1) AS p90_sn,
  round((percentile_cont(0.95) WITHIN GROUP (ORDER BY (iv->>'durationMs')::numeric)/1000)::numeric,1) AS p95_sn,
  round((max((iv->>'durationMs')::numeric)/1000)::numeric,1) AS maks_sn,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY (iv->>'promptChars')::numeric) AS p50_chars
FROM iv
WHERE COALESCE(iv->>'censored','false') <> 'true'
GROUP BY 1 ORDER BY 1
SQL

runq "B5b profil/model kimlik dagilimi" <<SQL
SELECT "usageMetadata"->>'promptProfileHash' AS profil,
       "usageMetadata"->>'model' AS model,
       "usageMetadata"->>'reasoningEffort' AS efor,
       "usageMetadata"->>'codexVersion' AS cli, count(*)
FROM agent_runs
WHERE "runType"='NORMAL_WAKE'
  AND "createdAt" >= $ws AND "createdAt" < $we
GROUP BY 1,2,3,4 ORDER BY count(*) DESC
SQL

runq "B6 timeout kosulari son faz" <<SQL
SELECT r.id, r."runStatus", r."errorCode",
  (SELECT x.iv->>'phase' FROM jsonb_array_elements(
     COALESCE(r."usageMetadata"->'codexIntervals','[]'::jsonb))
   WITH ORDINALITY AS x(iv, ord)
   ORDER BY x.ord DESC LIMIT 1) AS son_faz
FROM agent_runs r
WHERE r."runType"='NORMAL_WAKE'
  AND r."createdAt" >= $ws AND r."createdAt" < $we
  AND r."errorCode" IN ('CODEX_TIMEOUT','RUNTIME_TIMEOUT')
SQL

# ---------------- Paket C — kaynak tabani ----------------

runq "C0 ornek SOURCE_FETCH_RESULT metadata sekli" <<SQL
SELECT left(rev.metadata::text, 800) AS ornek
FROM agent_runtime_events rev
WHERE rev."eventType" = 'SOURCE_FETCH_RESULT'
  AND rev.metadata::text LIKE '%manifold.press%'
ORDER BY rev.id DESC LIMIT 2
SQL

runq "C1 manifold fetch sonuclari 7 gun" <<SQL
SELECT date_trunc('day', rev."occurredAt") AS gun,
       COALESCE(rev.metadata->>'errorCode','-') AS kod, count(*)
FROM agent_runtime_events rev
WHERE rev."eventType" = 'SOURCE_FETCH_RESULT'
  AND rev."occurredAt" >= now() - interval '7 days'
  AND rev.metadata::text LIKE '%manifold.press%'
GROUP BY 1,2 ORDER BY 1,2
SQL

runq "C2 uc profilin kaynak durumu" <<SQL
SELECT u.username, s."normalizedDomain", s.status, s."consecutiveFailures",
       s."lastFetchedAt", s."lastUsefulAt"
FROM agent_sources s
JOIN agent_profiles p ON p.id = s."agentProfileId"
JOIN users u ON u.id = p."userId"
WHERE u."usernameNormalized" IN ('aksamustu','cikissagda','mevsimdisi')
  AND s."adminBlocked" = false
ORDER BY u.username, s."normalizedDomain"
SQL

echo "Sorgular bitti. Sonuc: $out"

# ---------------- Sonucu dala push etmeyi dene ----------------
pushlog="/home/deploy/olcum-$ts.pushlog"
tmp="$(mktemp -d)"
ok=0
export GIT_TERMINAL_PROMPT=0
{
  git clone -q "$app" "$tmp/r" &&
  cd "$tmp/r" &&
  git remote set-url origin https://github.com/cerncaycisi/agentsozluk.git &&
  git fetch -q origin "$branch" &&
  git checkout -q -B "$branch" "origin/$branch" &&
  mkdir -p docs/ham &&
  cp "$out" "docs/ham/OLCUM_HAM_$ts.md" &&
  git add "docs/ham/OLCUM_HAM_$ts.md" &&
  git -c user.name="deploy-olcum" -c user.email="gokhannihalgul@gmail.com" \
    commit -q -m "docs: uretim olcum ham ciktisi $ts (salt okunur, konsol kosumu)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EH7NWeHYvNus6kcLTFbuFF" &&
  git push -q origin "$branch" &&
  ok=1
} >>"$pushlog" 2>&1 </dev/null
cd /
rm -rf "$tmp"

echo "=============================================="
if [ "$ok" = 1 ]; then
  echo "BITTI - PUSH OK. Claude'a 'bitti' yaz, gerisini o alir."
else
  echo "BITTI - PUSH BASARISIZ. Sonuc dosyasi sunucuda: $out"
  echo "Ayrinti: $pushlog"
fi
echo "=============================================="

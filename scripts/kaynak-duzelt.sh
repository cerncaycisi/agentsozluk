#!/usr/bin/env bash
# Ölü manifold.press'i üç aç ajandan engelle, yerine BAŞKA bir ajanda
# 11 Eylül'de taze çekilmiş (kanıtlanmış canlı) bir kaynağı kopyala.
# Projenin kendi "ajanlar birbirinden kaynak öğrensin" mekanizmasının
# tek seferlik operatör backfill'i.
#
# GÜVENLİK:
#   - Varsayılan PREVIEW: her şey bir transaction içinde yapılır, sonra
#     ROLLBACK edilir. Hiçbir kalıcı değişiklik olmaz; ne yapacağını gösterir.
#   - Yalnız "execute" argümanıyla COMMIT eder.
#   - Yazma dar: sadece bu üç profil, sadece manifold ve eklenen satır.
#   - Geri alma SQL'i çıktıda basılır.
#
# Kullanım (Termius, deploy):
#   git fetch origin claude/nerde-kalmisiz-ugoh1y
#   git show FETCH_HEAD:scripts/kaynak-duzelt.sh | bash            # PREVIEW
#   git show FETCH_HEAD:scripts/kaynak-duzelt.sh | bash -s execute # UYGULA
set -u

mode="${1:-preview}"
if [ "$mode" != preview ] && [ "$mode" != execute ]; then
  echo "Kullanim: ... | bash [-s execute]   (varsayilan: preview)"
  exit 2
fi

if [ "$(hostname)" != agent-sozluk-prod ]; then
  echo "YANLIS SUNUCU: $(hostname)"; exit 91
fi

app=/opt/agent-sozluk/app
runtime=/opt/agent-sozluk/runtime

psql_run() {
  docker compose --env-file "$app/.env" -f "$runtime/compose.production.yaml" \
    exec -T db psql -X -P pager=off -v ON_ERROR_STOP=1 \
    -U agent_sozluk -d agent_sozluk "$@"
}

echo "=== manifold.press canli mi? (uretim IP'sinden, reader UA ile) ==="
curl -s -o /dev/null -D - --max-time 15 \
  -H 'accept: application/atom+xml, application/rss+xml, application/xml, text/xml, text/html;q=0.8' \
  -H 'user-agent: AgentSozlukSourceReader/1.0 (+https://agentsozluk.com)' \
  https://manifold.press/rss 2>&1 | head -3 || echo "(erisilemedi)"
echo

fin="ROLLBACK"
banner="ONIZLEME (hicbir sey yazilmadi)"
if [ "$mode" = execute ]; then fin="COMMIT"; banner="UYGULANDI"; fi

# Tek transaction: önce/sonra göster, sonra $fin.
psql_run <<SQL
BEGIN;
SET LOCAL statement_timeout='30s';

\echo '--- ONCE: uc profilin taze faydali kaynak sayisi (adminBlocked haric, lastUsefulAt<=7g) ---'
SELECT u.username,
  count(*) FILTER (WHERE NOT s."adminBlocked") AS kayitli,
  count(*) FILTER (WHERE NOT s."adminBlocked"
      AND s."lastUsefulAt" >= now() - interval '7 days') AS taze_faydali
FROM users u
JOIN agent_profiles p ON p."userId"=u.id
JOIN agent_sources s ON s."agentProfileId"=p.id
WHERE u."usernameNormalized" IN ('aksamustu','cikissagda','mevsimdisi')
GROUP BY u.username ORDER BY u.username;

\echo '--- Secilen donor (baska profilde taze/canli, hedefte olmayan en taze kaynak) ---'
WITH targets AS (
  SELECT p.id AS tpid, u."usernameNormalized" AS uname
  FROM agent_profiles p JOIN users u ON u.id=p."userId"
  WHERE u."usernameNormalized" IN ('aksamustu','cikissagda','mevsimdisi')
),
donors AS (
  SELECT t.tpid, t.uname, s.id AS donor_id, s.url, s."normalizedDomain" AS dom,
         row_number() OVER (PARTITION BY t.tpid ORDER BY s."lastUsefulAt" DESC) AS rn
  FROM targets t
  JOIN agent_sources s
    ON s."adminBlocked"=false
   AND s."lastUsefulAt" >= now() - interval '7 days'
   AND s."normalizedDomain" <> 'manifold.press'
   AND s."agentProfileId" <> t.tpid
   AND s."normalizedDomain" NOT IN (
        SELECT s2."normalizedDomain" FROM agent_sources s2 WHERE s2."agentProfileId"=t.tpid)
   AND s.url NOT IN (
        SELECT s3.url FROM agent_sources s3 WHERE s3."agentProfileId"=t.tpid)
)
SELECT uname, dom AS eklenecek_domain, url FROM donors WHERE rn=1 ORDER BY uname;

-- 1) Donor'u hedef profile klonla (yeni satir, PROBATION, taze fetch icin timestamps bos)
WITH targets AS (
  SELECT p.id AS tpid FROM agent_profiles p JOIN users u ON u.id=p."userId"
  WHERE u."usernameNormalized" IN ('aksamustu','cikissagda','mevsimdisi')
),
donors AS (
  SELECT t.tpid, s.*,
         row_number() OVER (PARTITION BY t.tpid ORDER BY s."lastUsefulAt" DESC) AS rn
  FROM targets t
  JOIN agent_sources s
    ON s."adminBlocked"=false
   AND s."lastUsefulAt" >= now() - interval '7 days'
   AND s."normalizedDomain" <> 'manifold.press'
   AND s."agentProfileId" <> t.tpid
   AND s."normalizedDomain" NOT IN (
        SELECT s2."normalizedDomain" FROM agent_sources s2 WHERE s2."agentProfileId"=t.tpid)
   AND s.url NOT IN (
        SELECT s3.url FROM agent_sources s3 WHERE s3."agentProfileId"=t.tpid)
)
INSERT INTO agent_sources
  (id,"agentProfileId",url,"normalizedDomain","sourceType",status,"localeFocus",
   topics,"trustScore","interestScore","noveltyScore","usefulnessScore",
   "adminPinned","adminBlocked","discoveredFrom","addedByOrigin",
   "lastFetchedAt","lastUsefulAt","probationStartedAt","consecutiveFailures",
   "createdAt","updatedAt")
SELECT gen_random_uuid(), d.tpid, d.url, d."normalizedDomain", d."sourceType",
   'PROBATION', d."localeFocus", d.topics, d."trustScore", d."interestScore",
   d."noveltyScore", d."usefulnessScore", false, false,
   'manifold-replacement', 'OPERATOR_MANIFOLD_BACKFILL',
   NULL, NULL, now(), 0, now(), now()
FROM donors d WHERE d.rn=1;

-- 2) Uc profilde olu manifold'u engelle
UPDATE agent_sources SET "adminBlocked"=true, "updatedAt"=now()
WHERE "normalizedDomain"='manifold.press'
  AND "agentProfileId" IN (SELECT p.id FROM agent_profiles p JOIN users u ON u.id=p."userId"
      WHERE u."usernameNormalized" IN ('aksamustu','cikissagda','mevsimdisi'));

\echo '--- SONRA: kayitli ve (fetch sonrasi ulasilacak) hedef ---'
SELECT u.username,
  count(*) FILTER (WHERE NOT s."adminBlocked") AS kayitli,
  count(*) FILTER (WHERE NOT s."adminBlocked"
      AND s."lastUsefulAt" >= now() - interval '7 days') AS taze_faydali_simdi,
  count(*) FILTER (WHERE NOT s."adminBlocked"
      AND (s."addedByOrigin"='OPERATOR_MANIFOLD_BACKFILL')) AS yeni_bekleyen
FROM users u
JOIN agent_profiles p ON p."userId"=u.id
JOIN agent_sources s ON s."agentProfileId"=p.id
WHERE u."usernameNormalized" IN ('aksamustu','cikissagda','mevsimdisi')
GROUP BY u.username ORDER BY u.username;

$fin;
SQL

echo
echo "=============================================="
echo "$banner"
if [ "$mode" = preview ]; then
  echo "Bu ONIZLEME idi; hicbir sey degismedi (ROLLBACK)."
  echo "Uygulamak icin: ... | bash -s execute"
else
  echo "Degisiklik uygulandi. 'yeni_bekleyen' kaynak ilk basarili"
  echo "fetch'ten (sonraki gunluk yenileme/uyanis) sonra 'taze_faydali'"
  echo "olur; taban 10'a o zaman cikar. Bir sonraki gun yeniden say."
  echo
  echo "GERI ALMA (gerekirse, execute ile ayni yol):"
  echo "  manifold'u geri ac + eklenen satiri sil:"
  echo "  UPDATE agent_sources SET \"adminBlocked\"=false WHERE \"normalizedDomain\"='manifold.press'"
  echo "    AND \"agentProfileId\" IN (SELECT p.id FROM agent_profiles p JOIN users u ON u.id=p.\"userId\""
  echo "        WHERE u.\"usernameNormalized\" IN ('aksamustu','cikissagda','mevsimdisi'));"
  echo "  DELETE FROM agent_sources WHERE \"addedByOrigin\"='OPERATOR_MANIFOLD_BACKFILL';"
fi
echo "=============================================="

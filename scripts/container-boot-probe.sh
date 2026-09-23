#!/usr/bin/env bash
#
# F09 (docs/PLAN.md, 4 Eylül incelemesi): CI yalnız imajı kurup Compose'u
# doğruluyordu; container'ın veritabanıyla gerçekten açılabildiğini kanıtlamıyordu.
# Bu prob derlenmiş imajı Compose ile boş bir PostgreSQL'e karşı, üretim kipinde
# (NODE_ENV=production, demo seed kapalı) açar ve şunları ölçer:
#   1. entrypoint ortamı doğrular, veritabanını bekler, migration'ları uygular:
#      `_prisma_migrations`'da başarıyla biten satır sayısı = migration dizini sayısı;
#   2. container sağlıklı olur; /api/health, /api/ready 200;
#   3. ana sayfa 200 ve uygulama adını taşır;
#   4. üretim dağıtımının kullandığı release smoke (health, ready, arama) container
#      içinden geçer;
#   5. yeniden başlatma: migration'lar ikinci açılışta tekrar uygulanmaz, satır sayısı sabit.
#
#   bash scripts/container-boot-probe.sh agent-sozluk:ci
set -Eeuo pipefail

image="${1:?imaj etiketi gerekli}"
root="$(cd "$(dirname "$0")/.." && pwd)"
project="f09-probe-$$"
port="${F09_PORT:-3099}"
compose=(docker compose -p "$project" -f "$root/compose.yaml")

export APP_IMAGE="$image"
export NODE_ENV=production
export APP_URL="http://127.0.0.1:$port"
export APP_PORT="$port"
export APP_SECRET="f09-container-probe-validation-only-secret"
export NEXT_PUBLIC_APP_NAME="Agent Sözlük"
export SEED_DEMO=false
export TRUST_PROXY=true
export TRUST_PROXY_HOPS=0
export DATABASE_URL="postgresql://postgres:postgres@db:5432/agent_sozluk"

cleanup() {
  local status=$?
  if ((status != 0)); then
    echo "F09_PROBE_FAIL — app logu:" >&2
    "${compose[@]}" logs --no-color --tail 80 app >&2 || true
  fi
  "${compose[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

health() {
  docker inspect --format '{{.State.Health.Status}}' "$("${compose[@]}" ps -q app)"
}

wait_healthy() {
  local state=""
  for _ in $(seq 1 60); do
    state="$(health 2>/dev/null || true)"
    test "$state" = healthy && return 0
    test "$state" = unhealthy && break
    sleep 3
  done
  printf 'F09_PROBE_UNHEALTHY state=%s\n' "$state" >&2
  return 1
}

applied_migrations() {
  "${compose[@]}" exec -T db psql -U postgres -d agent_sozluk -Atq -c \
    "SELECT count(*) FROM \"_prisma_migrations\"
     WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;" </dev/null
}

expected="$(find "$root/prisma/migrations" -mindepth 2 -maxdepth 2 -name migration.sql | wc -l)"
test "$expected" -gt 0

# `--no-build --pull missing`: sınanan, CI'da az önce derlenen yerel imajın kendisi
# (yerelde olduğu için çekilmez); yalnız PostgreSQL imajı gerekirse çekilir.
"${compose[@]}" up -d --no-build --pull missing app </dev/null
test "$(docker inspect --format '{{.Image}}' "$("${compose[@]}" ps -q app)")" = \
  "$(docker image inspect --format '{{.Id}}' "$image")"
wait_healthy

applied="$(applied_migrations)"
printf 'F09_PROBE_MIGRATIONS applied=%s expected=%s\n' "$applied" "$expected"
test "$applied" = "$expected"

for path in /api/health /api/ready; do
  test "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:$port$path")" = 200
done
home="$(curl -sS --max-time 20 -w '\n%{http_code}' "http://127.0.0.1:$port/")"
test "$(tail -n 1 <<<"$home")" = 200
grep -q "Agent Sözlük" <<<"$home"
echo "F09_PROBE_HTTP health=200 ready=200 home=200"

"${compose[@]}" exec -T app ./node_modules/.bin/tsx scripts/release-smoke.ts \
  --base-url http://127.0.0.1:3000 </dev/null
echo "F09_PROBE_SMOKE ok"

# İkinci açılış: entrypoint yine `migrate deploy` çalıştırır; hiçbir şey uygulanmamalı.
"${compose[@]}" restart app </dev/null
wait_healthy
test "$(applied_migrations)" = "$expected"
echo "F09_PROBE_PASS (boş veritabanında açılış, migration, sağlık, smoke ve yeniden açılış)"

#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

APP_ROOT=/opt/agent-sozluk
APP_DIR=${APP_ROOT}/app
RUNTIME_DIR=${APP_ROOT}/runtime
COMPOSE_FILE=${RUNTIME_DIR}/compose.production.yaml
ENV_FILE=${APP_DIR}/.env
BACKUP_DIR=${APP_ROOT}/backups/postgres
LOCK_FILE=${RUNTIME_DIR}/state/backup.lock
MIN_BACKUP_BYTES=1024
RETENTION_MINUTES=4320  # 13 Ekim: yeni 40 GB disk, 3 gün (sunucu dışında operatör + Drive kopyaları var)
MAX_DISK_USAGE_PERCENT=85
MIN_FREE_BYTES=1073741824
PART_FILE=
CHECKSUM_PART=

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  [[ -z "${PART_FILE}" ]] || rm -f -- "${PART_FILE}"
  [[ -z "${CHECKSUM_PART}" ]] || rm -f -- "${CHECKSUM_PART}"
}
trap cleanup EXIT

[[ ${EUID} -ne 0 && $(id -un) == deploy ]] || die 'run as deploy, not root'
for command_name in awk chmod date df docker find flock id mv rm sha256sum stat; do
  command -v "${command_name}" >/dev/null 2>&1 || die "required command is missing: ${command_name}"
done
# 17 Ekim 2026: birim `ReadWritePaths=-…` ile eksik dizinde de başlar; eksik dizin burada
# adıyla ve kurulum komutuyla düşer (önceden `226/NAMESPACE` ile betik hiç başlamıyordu).
# `ProtectSystem=strict` altında betik dizini kendisi oluşturamaz; kurulum runbook'ta.
for required_dir in "${BACKUP_DIR}" "${RUNTIME_DIR}/state"; do
  [[ -d "${required_dir}" && ! -L "${required_dir}" ]] \
    || die "directory is unsafe or missing: ${required_dir} (see PRODUCTION_RUNBOOK.md, Sunucu içi gece yedeği)"
done
[[ -f "${COMPOSE_FILE}" && ! -L "${COMPOSE_FILE}" ]] || die "regular Compose file is missing: ${COMPOSE_FILE}"
[[ -f "${ENV_FILE}" && ! -L "${ENV_FILE}" ]] || die "regular environment file is missing: ${ENV_FILE}"

reason=${1:-scheduled}
[[ ${reason} =~ ^[a-z0-9][a-z0-9-]{0,31}$ ]] || die 'backup reason must be a short lowercase token'

exec 9>"${LOCK_FILE}"
flock -n 9 || die 'another PostgreSQL backup is already running'

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" config --quiet >/dev/null \
  || die 'production Compose configuration is invalid'
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T db \
  pg_isready -q -U agent_sozluk -d agent_sozluk \
  >/dev/null 2>&1 || die 'agent_sozluk PostgreSQL database is not ready'

read -r disk_usage_percent available_kib < <(df -Pk "${BACKUP_DIR}" | awk 'NR==2 {gsub(/%/, "", $5); print $5, $4}')
[[ ${disk_usage_percent} =~ ^[0-9]+$ && ${available_kib} =~ ^[0-9]+$ ]] \
  || die 'could not validate backup filesystem capacity'
(( disk_usage_percent < MAX_DISK_USAGE_PERCENT )) \
  || die "backup filesystem usage is ${disk_usage_percent}%; limit is below ${MAX_DISK_USAGE_PERCENT}%"

database_bytes=$(docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T db \
  psql -X -A -t -q -v ON_ERROR_STOP=1 -U agent_sozluk -d agent_sozluk -c 'SELECT pg_database_size(current_database());')
[[ ${database_bytes} =~ ^[0-9]+$ ]] || die 'could not measure agent_sozluk database size'
available_bytes=$(( available_kib * 1024 ))
# BEGIN required-free
# 25 Ekim 2026: eşik ham veritabanı boyutunun 2 katıydı; veritabanı 6,8 GB'a çıkınca 13,4 GB boş
# yer yetmedi ve yedek hiç başlamadı, oysa sıkıştırılmış döküm ~1,9 GB. Eşik artık saklanan en
# büyük dökümün 2 katı (büyüme payıyla); önceki döküm yoksa eski temkinli kural geçerli.
largest_backup_bytes=0
while IFS= read -r -d '' existing_dump; do
  [[ ${existing_dump##*/} =~ ^agent-sozluk-postgres-[0-9]{8}T[0-9]{6}Z-[a-z0-9][a-z0-9-]{0,31}\.dump$ ]] || continue
  existing_bytes=$(stat -c '%s' "${existing_dump}")
  if (( existing_bytes > largest_backup_bytes )); then largest_backup_bytes=${existing_bytes}; fi
done < <(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'agent-sozluk-postgres-*.dump' -print0)
if (( largest_backup_bytes >= MIN_BACKUP_BYTES )); then
  required_free_bytes=$(( largest_backup_bytes * 2 ))
else
  required_free_bytes=$(( database_bytes * 2 ))
fi
(( required_free_bytes >= MIN_FREE_BYTES )) || required_free_bytes=${MIN_FREE_BYTES}
# END required-free
(( available_bytes >= required_free_bytes )) \
  || die "insufficient backup space: ${available_bytes} bytes available, ${required_free_bytes} required"

stamp=$(date -u +%Y%m%dT%H%M%SZ)
base_name="agent-sozluk-postgres-${stamp}-${reason}.dump"
final_file=${BACKUP_DIR}/${base_name}
PART_FILE=${final_file}.part
checksum_file=${final_file}.sha256
CHECKSUM_PART=${checksum_file}.part

[[ ! -e "${final_file}" && ! -e "${checksum_file}" ]] || die 'backup target already exists; refusing overwrite'
rm -f -- "${PART_FILE}" "${CHECKSUM_PART}"

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T db \
  pg_dump --format=custom --no-owner --no-acl -U agent_sozluk -d agent_sozluk \
  >"${PART_FILE}"
chmod 0600 "${PART_FILE}"

backup_bytes=$(stat -c '%s' "${PART_FILE}")
(( backup_bytes >= MIN_BACKUP_BYTES )) || die "backup is unexpectedly small (${backup_bytes} bytes)"
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T db \
  pg_restore --list <"${PART_FILE}" >/dev/null \
  || die 'pg_restore could not list the custom-format backup catalog'

backup_hash=$(sha256sum "${PART_FILE}" | awk '{print $1}')
[[ ${backup_hash} =~ ^[0-9a-f]{64}$ ]] || die 'could not calculate backup checksum'
printf '%s  %s\n' "${backup_hash}" "${base_name}" >"${CHECKSUM_PART}"
chmod 0600 "${CHECKSUM_PART}"

mv -- "${PART_FILE}" "${final_file}"
PART_FILE=
mv -- "${CHECKSUM_PART}" "${checksum_file}"
CHECKSUM_PART=

while IFS= read -r -d '' old_dump; do
  old_name=${old_dump##*/}
  if [[ ${old_name} =~ ^agent-sozluk-postgres-[0-9]{8}T[0-9]{6}Z-[a-z0-9][a-z0-9-]{0,31}\.dump$ ]]; then
    rm -f -- "${old_dump}" "${old_dump}.sha256"
  fi
done < <(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'agent-sozluk-postgres-*.dump' -mmin +"${RETENTION_MINUTES}" -print0)

printf 'PostgreSQL backup completed: %s (%s bytes); checksum: %s\n' \
  "${base_name}" "${backup_bytes}" "${base_name}.sha256"

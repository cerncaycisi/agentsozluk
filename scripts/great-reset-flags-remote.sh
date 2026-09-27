# shellcheck shell=bash
#
# Great reset bayrak adımlarının ortak uzak gövdeleri. Tek başına çalışmaz: sarmalayıcı
# (`deploy-production-no-migration.sh`) ve tek amaçlı geri açılış komutu
# (`great-reset-restore-flags.sh`) bunu `source` eder; iki yol birebir aynı gövdeyi üretir.
#
# Gökhan (27 Eylül): "elle bir şey açamam, halledin". Bayraklar boşaltmadan önce ayrı bir kayda
# yazılır ve yalnız uzaktan alınan OLUMLU kanıtla geri yazılır (Astra #243 2. tur P1): bu
# operasyonun ya da başka bir bakımın dondurma tutucusu yok ve bakım işareti yok ya da henüz
# dondurma öncesinde. Kanıt alınamazsa (SSH hatası, okunamayan faz) bayraklar kapalı kalır.

reset_drain_flags_path() {
  printf '/opt/agent-sozluk/runtime/.great-reset-drain-flags-%s.json' "$1"
}

# Operatör araçları için ortak giriş: adayın kendi release'i, üretim DB adresi ve tek
# bootstrap_admin aktörü (kimlik basılmaz). $1 = aday SHA.
reset_operator_remote_prelude() {
  printf '%s' "release=/opt/agent-sozluk/runtime/releases/$1
     test -f \"\$release/scripts/great-reset-drain.ts\"
     test \"\$(cat \"\$release/.release-sha\")\" = '$1'
     db_container=\"\$(docker compose --env-file /opt/agent-sozluk/app/.env -f /opt/agent-sozluk/runtime/compose.production.yaml ps -q db)\"
     db_ip=\"\$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' \"\$db_container\")\"
     test -n \"\$db_ip\"
     admin_id=\"\$(docker compose --env-file /opt/agent-sozluk/app/.env -f /opt/agent-sozluk/runtime/compose.production.yaml exec -T db psql -X -U agent_sozluk -d agent_sozluk -At -v ON_ERROR_STOP=1 -c \"SELECT id FROM users WHERE kind = 'HUMAN' AND role = 'ADMIN' AND status = 'ACTIVE' AND username = 'bootstrap_admin'\" </dev/null)\"
     [[ \"\$admin_id\" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\$ ]] || { printf 'RELEASE_WRAPPER_FAIL code=OPERATOR_ADMIN_UNRESOLVED\\n' >&2; exit 95; }
     cd \"\$release\"
     export AGENT_OPERATOR_ADMIN_ID=\"\$admin_id\" AGENT_OPERATOR_ENV_FILE=/opt/agent-sozluk/app/.env AGENT_DB_IP=\"\$db_ip\""
}

# Uzak bayrak yazıcısının süreç ömrü kilidi (Astra #243 3. tur P1): yazıcı bu dosya kilidini
# `tsx` çocuğuyla birlikte (miras alınan tanımlayıcı) bitene dek tutar. Dağıtım kilidi yalnız bu
# kilit alınabildiğinde bırakılır; yazıcı `timeout --kill-after=10 180` ile sınırlı olduğundan
# 240 sn bekleme kesin sonuç verir. SSH kopması, uzak yazıcının bittiğinin kanıtı değildir.
reset_flags_writer_lock=/opt/agent-sozluk/runtime/.great-reset-flags.lock

# Dağıtım kilidini bırakan uzak komutlara, silmeden önce eklenir.
reset_flags_writer_idle_guard() {
  printf '%s' "exec 9>'$reset_flags_writer_lock'
     flock -w 240 9 || { printf 'RELEASE_WRAPPER_FAIL code=RESET_FLAGS_WRITER_ACTIVE lock kept\\n' >&2; exit 97; }"
}

# Olumlu kanıtlı geri açılış gövdesi (prelude'dan SONRA). $1 = operasyon kimliği, $2 = dağıtım
# kilidi sahiplik denetimi: süreç kilidi ALINDIKTAN SONRA, kilit tutulurken yeniden koşar; böylece
# hazırlıkta gecikip dağıtım kilidi bırakıldıktan sonra uyanan eski komut yazamaz (Astra #243
# 4. tur P1). Yazıcı `tsx` başlatıcısı olmadan tek Node süreci olarak (`node --import tsx`) koşar:
# süreç kilidini asıl yazıcı tutar; başlatıcı ölse de kilitsiz yazıcı kalmaz.
# Başarıyı yalnız uzak taraf bildirir: RELEASE_RESET_FLAGS_RESTORED. Kayıt yoksa
# RELEASE_RESET_FLAGS_RESTORE_SKIPPED (geri yükleme kanıtı değildir).
reset_flags_restore_body() {
  local file owner_check="$2"
  file="$(reset_drain_flags_path "$1")"
  test -n "$owner_check" || return 1
  printf '%s' "exec 9>'$reset_flags_writer_lock'
     flock -n 9 || { printf 'RELEASE_RESET_FLAGS_RESTORE_REFUSED reason=writer-active\\n' >&2; exit 97; }
     $owner_check
     if test -e /opt/agent-sozluk/runtime/.migration-hold; then
       printf 'RELEASE_RESET_FLAGS_RESTORE_REFUSED reason=maintenance-hold\\n' >&2
       exit 97
     fi
     if test -e /opt/agent-sozluk/runtime/.migration-operation; then
       case \"\$(cat /opt/agent-sozluk/runtime/.migration-operation/phase 2>/dev/null || printf unknown)\" in
         none | planned | image-verified) ;;
         *)
           printf 'RELEASE_RESET_FLAGS_RESTORE_REFUSED reason=maintenance-in-progress\\n' >&2
           exit 97
           ;;
       esac
     fi
     if test ! -e '$file'; then
       printf 'RELEASE_RESET_FLAGS_RESTORE_SKIPPED reason=no-drain-record\\n'
       exit 0
     fi
     AGENT_FLOW_REASON='great reset ${1:0:8} açılış' \\
       timeout --kill-after=10 180 node --import tsx scripts/agent-write-freeze.ts restore '$file'
     printf 'RELEASE_RESET_FLAGS_RESTORED\\n'"
}

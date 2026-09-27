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

# Uzak bayrak/koşu mutatörlerinin süreç ömrü kilidi (Astra #243 3.-7. tur): dondurma, boşaltma ve
# geri açılış bu dosya kilidini başlatıcısız Node süreciyle ömürleri boyunca tutar. Dağıtım kilidi
# yalnız bu kilit alınabildiğinde bırakılır. SSH kopması, uzak yazıcının bittiğinin kanıtı
# değildir. En uzun kritik bölüm, aynı kilit altında ardışık dondurma (`timeout --kill-after=10
# 120`) + boşaltma (`timeout --kill-after=10 960`) = en çok 1100 sn artı hazırlık; bekleme bütçesi
# bundan türetilir (birim testi, betiklerdeki gerçek sınırların toplamını denetler). Reset
# fazındaki bayrak adımı ve genel duraklatma bu kilidi kullanmaz; onlar uzak betiğin ve dağıtım
# kilidinin kendi sahiplik kurallarıyla korunur.
reset_flags_writer_max_seconds=1300
reset_flags_writer_lock=/opt/agent-sozluk/runtime/.great-reset-flags.lock

# Dağıtım kilidini bırakan uzak komutlara, silmeden önce eklenir.
reset_flags_writer_idle_guard() {
  printf '%s' "exec 9>'$reset_flags_writer_lock'
     flock -w $reset_flags_writer_max_seconds 9 || { printf 'RELEASE_WRAPPER_FAIL code=RESET_FLAGS_WRITER_ACTIVE lock kept\\n' >&2; exit 97; }"
}

# Bayrak/koşu mutatörlerinin ortak kritik bölümü (Astra #243 4.-5. tur P1): süreç kilidi alınır,
# ardından kilit tutulurken dağıtım kilidi sahipliği yeniden denetlenir. Mutatörler (dondurma,
# boşaltma, geri açılış) başlatıcısız tek Node süreci olarak koşar ve kilidi miras alarak ömürleri
# boyunca tutar. $1 = dağıtım kilidi sahiplik denetimi; $2 = süreç kilidi için bekleme (sn,
# varsayılan 0: meşgulse hemen reddet).
reset_flags_writer_section() {
  local wait="${2:-0}"
  test -n "$1" || return 1
  [[ "$wait" =~ ^[0-9]+$ ]] || return 1
  printf '%s' "exec 9>'$reset_flags_writer_lock'
     flock -w $wait 9 || { printf 'RELEASE_RESET_FLAGS_WRITER_BUSY\\n' >&2; exit 97; }
     $1"
}

# Olumlu kanıtlı geri açılış gövdesi (prelude'dan SONRA). $1 = operasyon kimliği, $2 = dağıtım
# kilidi sahiplik denetimi, $3 = süreç kilidi bekleme süresi (sn; boşaltma hatasından sonra süren
# boşaltmanın bitmesi beklenir, Astra #243 6. tur P2). Sahiplik denetimi süreç kilidi ALINDIKTAN SONRA, kilit tutulurken yeniden koşar; böylece
# hazırlıkta gecikip dağıtım kilidi bırakıldıktan sonra uyanan eski komut yazamaz (Astra #243
# 4. tur P1). Yazıcı `tsx` başlatıcısı olmadan tek Node süreci olarak (`node --import tsx`) koşar:
# süreç kilidini asıl yazıcı tutar; başlatıcı ölse de kilitsiz yazıcı kalmaz.
# Başarıyı yalnız uzak taraf bildirir: RELEASE_RESET_FLAGS_RESTORED. Kayıt yoksa
# RELEASE_RESET_FLAGS_RESTORE_SKIPPED (geri yükleme kanıtı değildir).
reset_flags_restore_body() {
  local file owner_check="$2" wait="${3:-0}" release_dir="${4:-}" release=''
  file="$(reset_drain_flags_path "$1")"
  test -n "$owner_check" || return 1
  # İsteğe bağlı: dağıtım kilidi, geri açılışla AYNI süreç kilidi altında bırakılır; araya gecikmiş
  # eski bir mutatör giremez, kilidi ancak dağıtım kilidi silindikten sonra alır ve sahiplik
  # denetiminde durur (Astra #243 8. tur P2).
  if test -n "$release_dir"; then
    [[ "$release_dir" =~ ^/opt/agent-sozluk/runtime/\.release-lock$ ]] || return 1
    release="
     find '$release_dir' -xdev -depth -delete
     printf 'RELEASE_RESET_LOCK_RELEASED\\n'"
  fi
  printf '%s' "$(reset_flags_writer_section "$owner_check" "$wait")
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
     else
       AGENT_FLOW_REASON='great reset ${1:0:8} açılış' \\
         timeout --kill-after=10 180 node --import tsx scripts/agent-write-freeze.ts restore '$file'
       printf 'RELEASE_RESET_FLAGS_RESTORED\\n'
     fi$release"
}

#!/usr/bin/env bash
#
# A3 (docs/PLAN.md): worker biriminin yeniden başlatma politikası geçici bir
# kesintiden sonra kendiliğinden toparlanıyor mu? Gerçek systemd'de, gerçek
# birim dosyasındaki ayarlarla, geçici (transient) birimlerle ölçer.
#
#   sudo bash scripts/systemd-restart-probe.sh deploy/systemd/agent-sozluk-runtime.service
#
# 1. Denetim: 19 Eylül'deki eski politika (5 açılış / 300 sn, sabit 5 sn) aynı
#    kesintide kalıcı olarak durur (`start-limit-hit`) — prova kusuru görebiliyor.
# 2. Aday: birim dosyasındaki politika, kesinti bittikten sonra en çok 300 sn
#    içinde çalışır hâle gelir ve orada kalır.
#
# Kesinti taklidi: ExecStart, belirlenen ana kadar hemen 1 ile çıkar (DB/API
# erişilemiyormuş gibi), sonra çalışmaya devam eder.
set -Eeuo pipefail

unit_file="${1:?birim dosyası gerekli}"
# Yerel deneme için kullanıcı yöneticisi: A3_PROBE_USER=1 (CI sistem yöneticisini kullanır).
if test "${A3_PROBE_USER:-0}" = 1; then
  sc=(systemctl --user)
  sr=(systemd-run --user)
else
  sc=(systemctl)
  sr=(systemd-run)
fi
outage_seconds="${A3_OUTAGE_SECONDS:-90}"
recovery_limit_seconds=300
work="$(mktemp -d)"
units=()

cleanup() {
  local unit
  for unit in "${units[@]}"; do
    "${sc[@]}" stop "$unit" >/dev/null 2>&1 || true
    "${sc[@]}" reset-failed "$unit" >/dev/null 2>&1 || true
  done
  rm -rf "$work"
}
trap cleanup EXIT

directive() {
  # Yalnız [Unit]/[Service] satırlarından, yorum olmayan ilk eşleşme.
  awk -F= -v key="$1" '$0 !~ /^[[:space:]]*#/ && $1 == key {print substr($0, length(key) + 2); exit}' \
    "$unit_file"
}

restart="$(directive Restart)"
restart_sec="$(directive RestartSec)"
restart_steps="$(directive RestartSteps)"
restart_max="$(directive RestartMaxDelaySec)"
limit_interval="$(directive StartLimitIntervalSec)"
# Her koşul ayrı satırda: `set -e`, `a && b` zincirinde son komut dışındaki
# başarısızlıkta durmaz (23 Eylül dersi).
test "$restart" = on-failure
test -n "$restart_sec"
test -n "$restart_steps"
test -n "$restart_max"
test -n "$limit_interval"
printf 'A3_PROBE_POLICY Restart=%s RestartSec=%s RestartSteps=%s RestartMaxDelaySec=%s StartLimitIntervalSec=%s\n' \
  "$restart" "$restart_sec" "$restart_steps" "$restart_max" "$limit_interval"

cat >"$work/worker.sh" <<'WORKER'
#!/usr/bin/env bash
until_epoch="$(cat "$1")"
if (($(date +%s) < until_epoch)); then
  echo "simulated outage: database unreachable" >&2
  exit 1
fi
exec sleep infinity
WORKER
chmod 0755 "$work/worker.sh"

state() {
  printf '%s/%s' "$("${sc[@]}" show "$1" -p ActiveState --value)" "$("${sc[@]}" show "$1" -p SubState --value)"
}

start_probe() {
  local name="$1"
  shift
  local outage_file="$work/$name.until"
  printf '%s\n' $(($(date +%s) + outage_seconds)) >"$outage_file"
  units+=("$name.service")
  "${sr[@]}" --quiet --unit "$name" "$@" "$work/worker.sh" "$outage_file"
  cat "$outage_file"
}

# 1. Denetim: eski politika.
control_end="$(start_probe "a3-control-$$" \
  -p Restart=on-failure -p RestartSec=5s \
  -p StartLimitIntervalSec=300 -p StartLimitBurst=5)"
for _ in $(seq 1 60); do
  test "$(state "a3-control-$$.service")" = failed/failed && break
  sleep 2
done
# Sınıra takılan birim `failed`'da kalır; `Result` sürüme göre `exit-code` ya da
# `start-limit-hit` görünebilir (systemd 257'de `exit-code`), bu yüzden kanıt
# davranıştır: sınır kadar deneme, sonra kalıcı `failed`.
control_restarts="$("${sc[@]}" show "a3-control-$$.service" -p NRestarts --value)"
printf 'A3_PROBE_CONTROL state=%s restarts=%s\n' "$(state "a3-control-$$.service")" "$control_restarts"
test "$(state "a3-control-$$.service")" = failed/failed
test "$control_restarts" -ge 4
# Kesinti bittikten sonra da kendiliğinden dönmez.
while (($(date +%s) < control_end + 20)); do sleep 5; done
test "$(state "a3-control-$$.service")" = failed/failed
echo "A3_PROBE_CONTROL_STAYS_DOWN (eski politika kesinti bitince de kapalı kaldı)"

# 2. Aday: birim dosyasındaki politika.
candidate_end="$(start_probe "a3-candidate-$$" \
  -p "Restart=$restart" -p "RestartSec=$restart_sec" -p "RestartSteps=$restart_steps" \
  -p "RestartMaxDelaySec=$restart_max" -p "StartLimitIntervalSec=$limit_interval")"
recovered_at=0
while (($(date +%s) < candidate_end + recovery_limit_seconds)); do
  if test "$(state "a3-candidate-$$.service")" = active/running; then
    sleep 10
    if test "$(state "a3-candidate-$$.service")" = active/running; then
      recovered_at="$(date +%s)"
      break
    fi
  fi
  sleep 2
done
test "$recovered_at" -gt 0 || {
  printf 'A3_PROBE_FAIL candidate did not recover within %ss state=%s result=%s\n' \
    "$recovery_limit_seconds" "$(state "a3-candidate-$$.service")" \
    "$("${sc[@]}" show "a3-candidate-$$.service" -p Result --value)" >&2
  exit 1
}
printf 'A3_PROBE_PASS recovered %ss after the outage ended (limit %ss), restarts=%s\n' \
  $((recovered_at - 10 - candidate_end)) "$recovery_limit_seconds" \
  "$("${sc[@]}" show "a3-candidate-$$.service" -p NRestarts --value)"

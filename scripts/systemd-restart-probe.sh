#!/usr/bin/env bash
#
# A3 (docs/PLAN.md): worker biriminin yeniden başlatma politikası geçici bir
# kesintiden sonra kendiliğinden toparlanıyor mu? Gerçek systemd'de ölçer.
#
#   sudo bash scripts/systemd-restart-probe.sh deploy/systemd/agent-sozluk-runtime.service
#
# 0. Politika metinden ayrıştırılmaz: gerçek birim dosyası geçici bir adla
#    systemd'ye YÜKLENİR (başlatılmaz) ve etkin özellikler `systemctl show`
#    ile okunur. Bölüm, sonraki tanımın öncekini ezmesi gibi kuralları systemd
#    kendisi uygular (Astra, 23 Eylül: ilk-eşleşme ayrıştırıcısı yanlış yeşil
#    verebiliyordu).
# 1. Denetim: 19 Eylül'deki eski politika (5 açılış / 300 sn, sabit 5 sn) aynı
#    kesintide kalıcı olarak durur — prova kusuru görebiliyor.
# 2. Aday: yüklenen birimin etkin politikası, kesinti bittikten sonra en çok
#    300 sn içinde çalışır hâle gelir ve orada kalır.
# 3. Hold: aynı politika + birimdeki `ExecCondition` kapısı. Hold varken
#    başlatma birimi başarısız saymadan atlar, yeniden deneme kurulmaz; hold
#    kalkınca worker kendiliğinden AÇILMAZ, ancak açık `start` ile açılır.
#
# Kesinti taklidi: ExecStart, belirlenen ana kadar hemen 1 ile çıkar (DB/API
# erişilemiyormuş gibi), sonra çalışmaya devam eder.
set -Eeuo pipefail

unit_file="$(realpath "${1:?birim dosyası gerekli}")"
# Yerel deneme için kullanıcı yöneticisi: A3_PROBE_USER=1 (CI sistem yöneticisini kullanır).
if test "${A3_PROBE_USER:-0}" = 1; then
  sc=(systemctl --user)
  sr=(systemd-run --user)
  unit_dir="${XDG_RUNTIME_DIR:?}/systemd/user"
else
  sc=(systemctl)
  sr=(systemd-run)
  unit_dir=/run/systemd/system
fi
outage_seconds="${A3_OUTAGE_SECONDS:-90}"
recovery_limit_seconds=300
work="$(mktemp -d)"
# Birim adları ANA kabukta kaydedilir: `$(...)` içindeki atama alt kabukta kalır
# ve EXIT temizliği boş listeyle koşardı (Astra, 23 Eylül).
units=()
installed=()

cleanup() {
  local status=$? unit leftover=0
  for unit in "${units[@]}"; do
    "${sc[@]}" stop "$unit" >/dev/null 2>&1 || true
    "${sc[@]}" reset-failed "$unit" >/dev/null 2>&1 || true
  done
  for unit in "${installed[@]}"; do rm -f "$unit_dir/$unit"; done
  "${sc[@]}" daemon-reload >/dev/null 2>&1 || true
  for unit in "${units[@]}"; do
    if test "$("${sc[@]}" show "$unit" -p ActiveState --value 2>/dev/null)" != inactive; then
      printf 'A3_PROBE_CLEANUP_LEFTOVER %s\n' "$unit" >&2
      leftover=1
    fi
  done
  rm -rf "$work"
  if ((leftover)); then exit 1; fi
  printf 'A3_PROBE_CLEANUP units=%s\n' "${#units[@]}"
  exit "$status"
}
trap cleanup EXIT

state() {
  printf '%s/%s' "$("${sc[@]}" show "$1" -p ActiveState --value)" "$("${sc[@]}" show "$1" -p SubState --value)"
}

# --- 0. Gerçek birimin etkin politikası ------------------------------------
real="a3-real-$$.service"
install -d "$unit_dir"
install -m 0644 "$unit_file" "$unit_dir/$real"
installed+=("$real")
units+=("$real")
"${sc[@]}" daemon-reload
test "$("${sc[@]}" show "$real" -p LoadState --value)" = loaded
effective() { "${sc[@]}" show "$real" -p "$1" --value; }
restart="$(effective Restart)"
restart_sec="$(effective RestartUSec)"
restart_steps="$(effective RestartSteps)"
restart_max="$(effective RestartMaxDelayUSec)"
limit_interval="$(effective StartLimitIntervalUSec)"
condition="$(effective ExecConditionEx)"
# Her koşul ayrı satırda: `set -e`, `a && b` zincirinde son komut dışındaki
# başarısızlıkta durmaz (23 Eylül dersi).
test "$restart" = on-failure
test "$limit_interval" = 0
test "$restart_steps" -gt 0
test -n "$restart_sec"
test -n "$restart_max"
test "$restart_max" != infinity
# Hold kapısı ExecCondition'da ve root olarak (`+` → flags=privileged).
grep -q 'path=/usr/bin/test ; argv\[\]=/usr/bin/test ! -e /opt/agent-sozluk/runtime/.migration-hold ; flags=privileged ;' \
  <<<"$condition"
printf 'A3_PROBE_POLICY Restart=%s RestartSec=%s RestartSteps=%s RestartMaxDelaySec=%s StartLimitIntervalSec=%s\n' \
  "$restart" "$restart_sec" "$restart_steps" "$restart_max" "$limit_interval"
policy=(-p "Restart=$restart" -p "RestartSec=$restart_sec" -p "RestartSteps=$restart_steps"
  -p "RestartMaxDelaySec=$restart_max" -p "StartLimitIntervalSec=$limit_interval")

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

# Kesinti bitiş anını dosyaya yazar ve birimi başlatır. Ana kabukta çağrılır.
start_probe() {
  local name="$1"
  shift
  printf '%s\n' $(($(date +%s) + outage_seconds)) >"$work/$name.until"
  "${sr[@]}" --quiet --unit "$name" "$@" "$work/worker.sh" "$work/$name.until"
}

# --- 1. Denetim: eski politika ---------------------------------------------
control="a3-control-$$"
units+=("$control.service")
start_probe "$control" -p Restart=on-failure -p RestartSec=5s \
  -p StartLimitIntervalSec=300 -p StartLimitBurst=5
control_end="$(cat "$work/$control.until")"
for _ in $(seq 1 60); do
  test "$(state "$control.service")" = failed/failed && break
  sleep 2
done
# Sınıra takılan birim `failed`'da kalır; `Result` sürüme göre `exit-code` ya da
# `start-limit-hit` görünebilir (systemd 257'de `exit-code`), bu yüzden kanıt
# davranıştır: sınır kadar deneme, sonra kalıcı `failed`.
control_restarts="$("${sc[@]}" show "$control.service" -p NRestarts --value)"
printf 'A3_PROBE_CONTROL state=%s restarts=%s\n' "$(state "$control.service")" "$control_restarts"
test "$(state "$control.service")" = failed/failed
test "$control_restarts" -ge 4
# Kesinti bittikten sonra da kendiliğinden dönmez.
while (($(date +%s) < control_end + 20)); do sleep 5; done
test "$(state "$control.service")" = failed/failed
echo "A3_PROBE_CONTROL_STAYS_DOWN (eski politika kesinti bitince de kapalı kaldı)"

# --- 2. Aday: gerçek birimin etkin politikası -------------------------------
candidate="a3-candidate-$$"
units+=("$candidate.service")
start_probe "$candidate" "${policy[@]}"
candidate_end="$(cat "$work/$candidate.until")"
recovered_at=0
while (($(date +%s) < candidate_end + recovery_limit_seconds)); do
  if test "$(state "$candidate.service")" = active/running; then
    sleep 10
    if test "$(state "$candidate.service")" = active/running; then
      recovered_at="$(date +%s)"
      break
    fi
  fi
  sleep 2
done
test "$recovered_at" -gt 0 || {
  printf 'A3_PROBE_FAIL candidate did not recover within %ss state=%s result=%s\n' \
    "$recovery_limit_seconds" "$(state "$candidate.service")" \
    "$("${sc[@]}" show "$candidate.service" -p Result --value)" >&2
  exit 1
}
printf 'A3_PROBE_PASS recovered %ss after the outage ended (limit %ss), restarts=%s\n' \
  $((recovered_at - 10 - candidate_end)) "$recovery_limit_seconds" \
  "$("${sc[@]}" show "$candidate.service" -p NRestarts --value)"

# --- 3. Hold kapısı: atlanır, yeniden deneme kurmaz, kendiliğinden açılmaz ----
hold_unit="a3-hold-$$.service"
hold="$work/hold"
: >"$hold"
printf '0\n' >"$work/hold.until"
cat >"$unit_dir/$hold_unit" <<UNIT
[Unit]
StartLimitIntervalSec=$limit_interval

[Service]
ExecCondition=/usr/bin/test ! -e $hold
ExecStart=$work/worker.sh $work/hold.until
Restart=$restart
RestartSec=$restart_sec
RestartSteps=$restart_steps
RestartMaxDelaySec=$restart_max
UNIT
installed+=("$hold_unit")
units+=("$hold_unit")
"${sc[@]}" daemon-reload
"${sc[@]}" start "$hold_unit"
sleep 3
printf 'A3_PROBE_HOLD_PRESENT state=%s result=%s restarts=%s\n' "$(state "$hold_unit")" \
  "$("${sc[@]}" show "$hold_unit" -p Result --value)" \
  "$("${sc[@]}" show "$hold_unit" -p NRestarts --value)"
test "$(state "$hold_unit")" = inactive/dead
test "$("${sc[@]}" show "$hold_unit" -p NRestarts --value)" = 0
rm -f "$hold"
# İlk yeniden deneme aralığının (RestartSec) birkaç katı bekle: kurulu bir deneme
# olsaydı bu sürede birimi açardı.
sleep 20
printf 'A3_PROBE_HOLD_REMOVED state=%s\n' "$(state "$hold_unit")"
test "$(state "$hold_unit")" = inactive/dead
"${sc[@]}" start "$hold_unit"
for _ in $(seq 1 15); do
  test "$(state "$hold_unit")" = active/running && break
  sleep 1
done
test "$(state "$hold_unit")" = active/running
echo "A3_PROBE_HOLD_PASS (hold varken atlandı, kalkınca kendiliğinden açılmadı, açık start ile açıldı)"

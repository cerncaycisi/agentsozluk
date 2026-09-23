#!/usr/bin/env bash
#
# B7 (docs/PLAN.md): worker biriminin ağ çıkış kısıtı gerçek systemd'de, birim
# dosyasındaki ETKİN ayarlarla ölçülür.
#
#   sudo bash scripts/systemd-egress-probe.sh deploy/systemd/agent-sozluk-runtime.service
#
# 0. Gerçek birim geçici bir adla systemd'ye yüklenir (başlatılmaz); `IPAddressDeny`
#    ve `IPAddressAllow` etkin değerleri `systemctl show` ile okunur ve beklenen
#    aralıkları içermelidir.
# 1. Denetim: kısıtsız geçici birim aynı hedeflere bağlanmayı dener; engellenmiş
#    hedefe gerçekten "izin yok" dışında bir sonuç alınabildiğini gösterir.
# 2. Aday: aynı değerlerle geçici birim — localhost'taki dinleyiciye bağlanır;
#    bulut metadata adresine (169.254.169.254) ve özel aralığa (10.0.0.1, 172.17.0.1)
#    bağlantı çekirdekte "Operation not permitted" ile reddedilir; herkese açık bir
#    adrese (1.1.1.1:443) bağlanabilir. Engelli hedefler UDP `sendto` ile sınanır:
#    süzgeç TCP SYN'i sessizce düşürür (connect yalnız zaman aşımına uğrar), UDP'de
#    ise çekirdek hemen EPERM döner.
#
# 3. Docker yolu: worker'ın API'si Docker'ın 127.0.0.1'e yayımladığı porttan geçer.
#    Gerçek bir konteyner aynı biçimde yayımlanır ve aday politika altından ona
#    bağlanılır: `userland-proxy=false` (DNAT ile 172.x'e taşıma) olsaydı düşerdi.
# 4. DNS: aday birimden /etc/resolv.conf'taki çözücüye gerçek UDP sorgusu (Ubuntu'da
#    127.0.0.53, izinli); NSS/`getent` değil, paket yolunun kendisi.
# 5. IPv4-mapped metadata (::ffff:169.254.169.254) da reddedilir. Yerel IPv6 aralıkları
#    birimde engelli ama runner'da IPv6 rotası olmadığı için davranışla ölçülmez.
#
# Her hedef için tam bir sonuç zorunludur; eksik satır ya da çalıştırma hatası
# başarısızlıktır. Denetim biriminde engellenecek hedeflerin hiçbiri "izin yok"
# almamalıdır (karşılaştırma kanıtı).
#
# BPF tabanlı IP süzmesi sistem yöneticisi ister; yerel kullanıcı yöneticisinde
# ölçülmez (A3 probunun aksine yerel kip yok).
set -Eeuo pipefail

unit_file="$(realpath "${1:?birim dosyası gerekli}")"
unit_dir=/run/systemd/system
work="$(mktemp -d)"
chmod 0755 "$work"
units=()
installed=()
listener_pid=""
docker_container=""

cleanup() {
  local status=$? unit leftover=0
  [[ -n "$listener_pid" ]] && kill "$listener_pid" 2>/dev/null || true
  [[ -n "$docker_container" ]] && docker rm -f "$docker_container" >/dev/null 2>&1 || true
  for unit in "${units[@]}"; do
    systemctl stop "$unit" >/dev/null 2>&1 || true
    systemctl reset-failed "$unit" >/dev/null 2>&1 || true
  done
  for unit in "${installed[@]}"; do rm -f "$unit_dir/$unit"; done
  systemctl daemon-reload >/dev/null 2>&1 || true
  for unit in "${units[@]}"; do
    if test "$(systemctl show "$unit" -p ActiveState --value 2>/dev/null)" != inactive; then
      printf 'B7_PROBE_CLEANUP_LEFTOVER %s\n' "$unit" >&2
      leftover=1
    fi
  done
  rm -rf "$work"
  if ((leftover)); then exit 1; fi
  printf 'B7_PROBE_CLEANUP units=%s\n' "${#units[@]}"
  exit "$status"
}
trap cleanup EXIT

# --- 0. Gerçek birimin etkin ayarları ---------------------------------------
real="b7-real-$$.service"
install -m 0644 "$unit_file" "$unit_dir/$real"
installed+=("$real")
units+=("$real")
systemctl daemon-reload
test "$(systemctl show "$real" -p LoadState --value)" = loaded
deny="$(systemctl show "$real" -p IPAddressDeny --value)"
allow="$(systemctl show "$real" -p IPAddressAllow --value)"
printf 'B7_PROBE_POLICY deny=[%s] allow=[%s]\n' "$deny" "$allow"
for range in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16 100.64.0.0/10 fc00::/7 fe80::/10; do
  grep -qw -- "$range" <<<"$deny" || { printf 'B7_PROBE_FAIL deny eksik %s\n' "$range" >&2; exit 1; }
done
grep -qw -- 127.0.0.0/8 <<<"$allow"
grep -qw -- ::1/128 <<<"$allow"

# Localhost dinleyicisi (worker'ın yerel API'si yerine).
port=39187
python3 -m http.server "$port" --bind 127.0.0.1 --directory "$work" >/dev/null 2>&1 &
listener_pid=$!
for _ in $(seq 1 30); do
  (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null && break
  sleep 0.2
done

# Her hedef için: bağlandı / izin yok / başka hata (zaman aşımı, ret).
cat >"$work/dns-query.py" <<'DNS'
# /etc/resolv.conf'taki ilk çözücüye gerçek bir UDP DNS sorgusu (NSS değil): worker ve
# bwrap alt süreçleri aynı dosyayı kullanır; paket yolu cgroup süzgecinden geçer.
import random, socket, struct, sys
name = sys.argv[1]
server = next(line.split()[1] for line in open("/etc/resolv.conf")
              if line.startswith("nameserver"))
qid = random.randrange(65536)
query = struct.pack(">HHHHHH", qid, 0x0100, 1, 0, 0, 0)
query += b"".join(bytes([len(p)]) + p.encode() for p in name.split(".")) + b"\0"
query += struct.pack(">HH", 1, 1)
family = socket.AF_INET6 if ":" in server else socket.AF_INET
sock = socket.socket(family, socket.SOCK_DGRAM)
sock.settimeout(4)
sock.sendto(query, (server, 53))
reply = sock.recv(512)
answers = struct.unpack(">H", reply[6:8])[0]
sys.exit(0 if reply[:2] == query[:2] and answers > 0 else 1)
DNS

cat >"$work/udp-send.py" <<'UDP'
# Engelli hedef sınaması: cgroup süzgeci TCP SYN'i sessizce düşürür (connect zaman
# aşımına uğrar, CI'da ölçüldü); UDP `sendto` ise süzgeçte hemen EPERM döner. Süzgeç
# yoksa gönderim başarılıdır (hedefin erişilebilir olması gerekmez).
import errno, socket, sys
host, port = sys.argv[1].rsplit(":", 1)
family = socket.AF_INET6 if ":" in host else socket.AF_INET
sock = socket.socket(family, socket.SOCK_DGRAM)
try:
    sock.sendto(b"b7", (host, int(port)))
    print("sent")
except OSError as error:
    print("denied" if error.errno == errno.EPERM else "error")
UDP

cat >"$work/connect.sh" <<'CONNECT'
#!/usr/bin/env bash
# Hata metni İngilizce sabit: "not permitted" sınıflandırması yerele bağlı kalmasın.
export LC_ALL=C
for target in "$@"; do
  if [[ "$target" == udp:* ]]; then
    result="$(timeout 5 python3 "$(dirname "$0")/udp-send.py" "${target#udp:}" 2>/dev/null)"
    printf '%s\t%s\n' "$target" "${result:-error}"
    continue
  fi
  if [[ "$target" == dns:* ]]; then
    if timeout 6 python3 "$(dirname "$0")/dns-query.py" "${target#dns:}" 2>/dev/null; then
      result=resolved
    else
      result=error
    fi
    printf '%s\t%s\n' "$target" "$result"
    continue
  fi
  host="${target%:*}"
  port="${target##*:}"
  err="$(timeout 5 bash -c "exec 3<>/dev/tcp/$host/$port" 2>&1)"
  rc=$?
  if ((rc == 0)); then result=connected
  elif grep -qi "not permitted" <<<"$err"; then result=denied
  elif ((rc == 124)); then result=timeout
  else result=error
  fi
  printf '%s\t%s\n' "$target" "$result"
done
CONNECT
chmod 0755 "$work/connect.sh"

# Docker'ın localhost'a yayımladığı port (worker'ın gerçek API yolu).
docker_port=39188
docker_container="b7-probe-$$"
docker run -d --rm --name "$docker_container" -p "127.0.0.1:$docker_port:80" busybox:1.36 \
  httpd -f -p 80 -h /tmp >/dev/null
for _ in $(seq 1 50); do
  (exec 3<>"/dev/tcp/127.0.0.1/$docker_port") 2>/dev/null && break
  sleep 0.2
done

# Yerel IPv6 hedefleri (ULA/link-local) ölçülmez: rota yoksa gönderim süzgeçten önce
# ENETUNREACH ile düşer ve politika hakkında bilgi vermez (runner'da IPv6 rotası yok).
blocked=(udp:169.254.169.254:53 udp:10.0.0.1:53 udp:172.17.0.1:53 "udp:::ffff:169.254.169.254:53")
open=("127.0.0.1:$port" "127.0.0.1:$docker_port" 1.1.1.1:443 dns:one.one.one.one)
targets=("${open[@]}" "${blocked[@]}")
probe() {
  local name="$1"
  shift
  units+=("$name.service")
  systemd-run --quiet --wait --pipe --collect --unit "$name" "$@" \
    "$work/connect.sh" "${targets[@]}" >"$work/$name.out" 2>&1 ||
    { printf 'B7_PROBE_FAIL %s çalıştırılamadı\n' "$name" >&2; cat "$work/$name.out" >&2; exit 1; }
  sed "s/^/$name /" "$work/$name.out"
  # Her hedef için tam olarak bir sonuç; hedef alanı TAM eşitlikle karşılaştırılır
  # (169.254.169.254:80, ::ffff:169.254.169.254:80'in alt dizgisidir).
  local target
  for target in "${targets[@]}"; do
    test "$(awk -F '\t' -v t="$target" '$1 == t' "$work/$name.out" | wc -l)" = 1 ||
      { printf 'B7_PROBE_FAIL %s sonucu eksik ya da çift: %s\n' "$name" "$target" >&2; exit 1; }
  done
}
result() { awk -F '\t' -v t="$2" '$1 == t {print $2}' "$work/$1.out"; }

# --- 1. Denetim: kısıtsız ----------------------------------------------------
probe "b7-control-$$"
test "$(result "b7-control-$$" "127.0.0.1:$port")" = connected
test "$(result "b7-control-$$" "127.0.0.1:$docker_port")" = connected
# Kısıtsız birimde engellenecek hedeflere UDP gönderimi başarılıdır; adaydaki
# "denied" politikanın sonucudur.
for target in "${blocked[@]}"; do
  test "$(result "b7-control-$$" "$target")" = sent
done

# --- 2. Aday: gerçek birimin etkin değerleri ---------------------------------
probe "b7-candidate-$$" -p "IPAddressDeny=$deny" -p "IPAddressAllow=$allow"
test "$(result "b7-candidate-$$" "127.0.0.1:$port")" = connected
test "$(result "b7-candidate-$$" "127.0.0.1:$docker_port")" = connected
test "$(result "b7-candidate-$$" 1.1.1.1:443)" = connected
test "$(result "b7-candidate-$$" dns:one.one.one.one)" = resolved
for target in "${blocked[@]}"; do
  test "$(result "b7-candidate-$$" "$target")" = denied
done
echo "B7_PROBE_PASS (localhost, Docker yayımlı port, DNS ve herkese açık adres açık; metadata, IPv4-mapped metadata ve özel aralıklar kapalı)"

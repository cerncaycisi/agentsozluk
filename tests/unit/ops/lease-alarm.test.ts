import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/*
  Canlılık + lease süresi alarmı (21 Eylül 2026). Betik gerçekten çalıştırılır;
  `docker` ve `curl` PATH'teki sahtelerle değiştirilir.

  Sahte docker argümanlarını DOĞRULAR (Sol): `logs` yalnız doğru compose
  dosyası, `--since 15m` ve `app` servisiyle; `exec` yalnız `db` ve `psql` ile
  cevap verir. Sahte curl hedef URL'yi ve başlıkları kaydeder; istenirse
  başarısız döner.
*/

const BETIK = path.resolve("deploy/alarm/canlilik-alarmi.sh");
const COMPOSE = "/opt/agent-sozluk/runtime/compose.production.yaml";

let dizin: string;

function kayit(activeMs: number, outcome = "committed", errorCode?: string, zamanSn?: number) {
  return JSON.stringify({
    level: "info",
    time: zamanSn === undefined ? new Date().toISOString() : new Date(zamanSn * 1000).toISOString(),
    event: "db.transaction.duration",
    label: "runtime.lease",
    outcome,
    ...(errorCode ? { errorCode } : {}),
    totalMs: activeMs + 1,
    acquireMs: 1,
    activeMs,
    timeoutMs: 5000,
  });
}

interface Secenek {
  canlilik?: string; // sahte psql çıktısı; "" = sorgu başarısız
  logsHata?: boolean;
  logsAsili?: boolean;
  execAsili?: boolean;
  curlHata?: boolean;
  curlIlkHata?: boolean; // koşudaki YALNIZ ilk gönderim başarısız
  simdi?: number; // ALARM_SIMDI (sn); imleç testleri için
  kimlik?: string; // app konteynerinin kimliği; "" = okunamaz
  olusma?: number; // app konteynerinin yaratılma anı (sn); yoksa `inspect` başarısız
  kip?: string; // betiğe verilen argüman (ör. --kesim-oncesi)
  konuYok?: boolean; // ALARM_NTFY_KONU tanımsız
  logDosyasi?: string; // sahte docker'ın okuyacağı log (varsayılan app.log)
  logsGecikme?: number; // sahte `docker logs` bu kadar sn sürer
  leaseZamanAsimi?: number; // lease alt sürecinin süre sınırı (test varsayılanı 3 sn)
  awkHata?: "ana" | "tarihce"; // sahte awk yalnız bu çağrıda hata verir
}

function ortam(secenek: Secenek): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    PATH: `${path.join(dizin, "bin")}:/usr/bin:/bin`,
    ...(secenek.konuYok ? {} : { ALARM_NTFY_KONU: "test-konu" }),
    ALARM_NTFY_SUNUCU: "https://ntfy.example",
    ALARM_DURUM_DOSYASI: path.join(dizin, "durum", "durum"),
    ALARM_LEASE_ZAMAN_ASIMI: String(secenek.leaseZamanAsimi ?? 3),
    ALARM_CANLILIK_ZAMAN_ASIMI: "2",
    SAHTE_DIZIN: dizin,
    SAHTE_CANLILIK: secenek.canlilik ?? "60 120",
    SAHTE_LOGS_HATA: secenek.logsHata ? "1" : "",
    SAHTE_LOGS_ASILI: secenek.logsAsili ? "1" : "",
    SAHTE_EXEC_ASILI: secenek.execAsili ? "1" : "",
    SAHTE_CURL_HATA: secenek.curlHata ? "1" : "",
    SAHTE_CURL_ILK_HATA: secenek.curlIlkHata ? "1" : "",
    SAHTE_KIMLIK: secenek.kimlik ?? "aaaaaaaaaaaa1111",
    SAHTE_OLUSMA: secenek.olusma === undefined ? "" : new Date(secenek.olusma * 1000).toISOString(),
    SAHTE_LOG_DOSYASI: secenek.logDosyasi ?? path.join(dizin, "app.log"),
    SAHTE_LOGS_GECIKME: String(secenek.logsGecikme ?? 0),
    SAHTE_AWK_HATA: secenek.awkHata ?? "",
    ...(secenek.simdi === undefined ? {} : { ALARM_SIMDI: String(secenek.simdi) }),
  };
}

function calistir(logSatirlari: string[], secenek: Secenek = {}) {
  writeFileSync(path.join(dizin, "app.log"), logSatirlari.join("\n") + "\n");
  const sonuc = spawnSync("bash", secenek.kip ? [BETIK, secenek.kip] : [BETIK], {
    encoding: "utf8",
    timeout: 30_000,
    env: ortam(secenek),
  });
  const oku = (ad: string) =>
    existsSync(path.join(dizin, ad)) ? readFileSync(path.join(dizin, ad), "utf8") : "";
  const bildirimler = oku("curl.log").split("\n---\n").filter(Boolean);
  const dockerCagrilari = oku("docker.log").split("\n").filter(Boolean);
  const curlDenemeleri = oku("curl-deneme.log").split("\n").filter(Boolean);
  rmSync(path.join(dizin, "curl.log"), { force: true });
  rmSync(path.join(dizin, "docker.log"), { force: true });
  rmSync(path.join(dizin, "curl-ilk"), { force: true });
  rmSync(path.join(dizin, "curl-deneme.log"), { force: true });
  return {
    status: sonuc.status,
    bildirimler,
    dockerCagrilari,
    curlDenemeleri,
    stderr: sonuc.stderr,
  };
}

beforeEach(() => {
  dizin = mkdtempSync(path.join(tmpdir(), "lease-alarm-"));
  const bin = path.join(dizin, "bin");
  mkdirSync(bin);
  writeFileSync(
    path.join(bin, "docker"),
    `#!/usr/bin/env bash
echo "$*" >> "$SAHTE_DIZIN/docker.log"
tum=" $* "
if [[ "$1" == "inspect" ]]; then
  [[ "$2" == "-f" && "$3" == "{{.Created}}" && "$4" == "$SAHTE_KIMLIK" && -n "$SAHTE_OLUSMA" ]] || exit 1
  echo "$SAHTE_OLUSMA"; exit 0
fi

[[ "$tum" == *" -f ${COMPOSE} "* ]] || exit 97
if [[ "$tum" == *" logs "* ]]; then
  [[ "$tum" == *" --no-log-prefix "* && "$*" == *" app" ]] || exit 98
  since=""; onceki=""
  for a in "$@"; do [[ "$onceki" == "--since" ]] && since="$a"; onceki="$a"; done
  [[ "$since" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || exit 95
  echo "$since" >> "$SAHTE_DIZIN/since.log"
  [[ -n "$SAHTE_LOGS_ASILI" ]] && sleep 20
  [[ -n "$SAHTE_LOGS_HATA" ]] && exit 1
  sleep "$SAHTE_LOGS_GECIKME"
  se=$(date -u -d "$since" +%s)
  # Gerçek docker gibi: --since'ten önceki satırlar gelmez. Zamansız satır hep gelir.
  while IFS= read -r l; do
    z=$(grep -oE '"time":"[^"]+"' <<<"$l" | cut -d'"' -f4)
    if [[ -z "$z" ]] || (( $(date -u -d "$z" +%s) >= se )); then printf '%s\n' "$l"; fi
  done < "$SAHTE_LOG_DOSYASI"
  exit 0
fi
if [[ "$tum" == *" ps -q app "* ]]; then [[ -n "$SAHTE_KIMLIK" ]] && echo "$SAHTE_KIMLIK"; exit 0; fi
if [[ "$tum" == *" exec -T db psql "* ]]; then
  [[ -n "$SAHTE_EXEC_ASILI" ]] && sleep 20
  sql="$(cat)"
  [[ "$sql" == *"READ ONLY"* && "$sql" == *"agent_runs"* ]] || exit 99
  [[ -n "$SAHTE_CANLILIK" ]] && echo "$SAHTE_CANLILIK"
  exit 0
fi
exit 96
`,
  );
  writeFileSync(
    path.join(bin, "curl"),
    `#!/usr/bin/env bash
printf 'deneme -m %s\n' "$4" >> "$SAHTE_DIZIN/curl-deneme.log"
[[ -n "$SAHTE_CURL_HATA" ]] && exit 22
if [[ -n "$SAHTE_CURL_ILK_HATA" && ! -e "$SAHTE_DIZIN/curl-ilk" ]]; then
  : > "$SAHTE_DIZIN/curl-ilk"; exit 22
fi
{ printf '%s\\n' "$@"; printf -- '---\\n'; } >> "$SAHTE_DIZIN/curl.log"
`,
  );
  writeFileSync(
    path.join(bin, "awk"),
    `#!/usr/bin/env bash
# ana: kayıtları ayrıştıran çağrı; tarihce: yazılacak tarihçeyi süzen çağrı.
[[ "$SAHTE_AWK_HATA" == ana && "$*" == *"gdosya="* ]] && exit 2
[[ "$SAHTE_AWK_HATA" == tarihce && "$*" == *"gorulen"* ]] && exit 2
exec /usr/bin/awk "$@"
`,
  );
  chmodSync(path.join(bin, "awk"), 0o755);
  chmodSync(path.join(bin, "docker"), 0o755);
  chmodSync(path.join(bin, "curl"), 0o755);
});

afterEach(() => rmSync(dizin, { recursive: true, force: true }));

describe("lease süresi alarmı", () => {
  it("normal sürelerde hiç bildirim atmaz; docker doğru argümanlarla çağrılır", () => {
    const { status, bildirimler, dockerCagrilari } = calistir([
      kayit(826),
      kayit(1164),
      "başka bir satır",
    ]);
    expect(status).toBe(0);
    expect(bildirimler).toEqual([]);
    expect(dockerCagrilari).toHaveLength(3);
    expect(dockerCagrilari[0]).toContain("exec -T db psql");
    expect(dockerCagrilari[1]).toMatch(/ ps -q app$/);
    expect(dockerCagrilari[2]).toMatch(/logs --no-log-prefix --since \S+Z app$/);
  });

  it("eşiği iki kez aşmak uyarı değildir, üç kez aşmak uyarıdır", () => {
    expect(calistir([kayit(2600), kayit(2700), kayit(900)]).bildirimler).toEqual([]);
    const { status, bildirimler } = calistir([kayit(2600), kayit(2700), kayit(3000)]);
    expect(status).toBe(0);
    expect(bildirimler).toHaveLength(1);
    expect(bildirimler[0]).toContain("Title: Agent Sözlük: lease yavaşlıyor");
    expect(bildirimler[0]).toContain("Priority: high");
    expect(bildirimler[0]).toContain("https://ntfy.example/test-konu");
    expect(bildirimler[0]).toContain("--fail");
  });

  it("tek bir 4000 ms kaydı kritik alarmdır", () => {
    const { status, bildirimler } = calistir([kayit(900), kayit(4100)]);
    expect(status).toBe(0);
    expect(bildirimler).toHaveLength(1);
    expect(bildirimler[0]).toContain("Title: Agent Sözlük: lease 5 sn sınırına dayandı");
    expect(bildirimler[0]).toContain("Priority: urgent");
    expect(bildirimler[0]).toContain("en uzun activeMs 4100 ms");
  });

  it("tek bir P2028 kritik alarmdır; başka hata kodları değildir", () => {
    expect(calistir([kayit(300, "failed", "IDEMPOTENCY_CONFLICT")]).bildirimler).toEqual([]);
    const { bildirimler } = calistir([kayit(300, "failed", "P2028")]);
    expect(bildirimler).toHaveLength(1);
    expect(bildirimler[0]).toContain("P2028: 1");
  });

  it("aynı kritik durumu tekrar bildirmez, normale dönüşü bir kez bildirir", () => {
    expect(calistir([kayit(4500)]).bildirimler).toHaveLength(1);
    expect(calistir([kayit(4500)]).bildirimler).toHaveLength(0);
    const donus = calistir([kayit(800)]).bildirimler;
    expect(donus).toHaveLength(1);
    expect(donus[0]).toContain("normale döndü");
    expect(calistir([kayit(800)]).bildirimler).toHaveLength(0);
  });

  it("her hal değişimini bildirir: uyarı → kritik → uyarı", () => {
    // Her koşuya YENİ kayıtlar: önceki taramada sayılan kayıt yeniden sayılmaz.
    const uc = () => [kayit(2600), kayit(2600), kayit(2600)];
    expect(calistir(uc()).bildirimler).toHaveLength(1);
    expect(calistir([kayit(4200)]).bildirimler[0]).toContain("sınırına dayandı");
    const inis = calistir(uc()).bildirimler;
    expect(inis).toHaveLength(1);
    expect(inis[0]).toContain("lease yavaşlıyor");
  });

  it("gönderilemeyen alarmı gönderilmiş saymaz; sonraki koşu yeniden dener", () => {
    expect(calistir([kayit(4500)], { curlHata: true }).bildirimler).toEqual([]);
    expect(calistir([kayit(4500)]).bildirimler).toHaveLength(1);
  });

  it("başka etiketli transaction kayıtlarını saymaz", () => {
    const baska = kayit(4800).replace('"runtime.lease"', '"baska.is"');
    expect(calistir([baska]).bildirimler).toEqual([]);
  });

  it("JSON'da boşluk olsa da süreyi okur; satır başına yalnız ilk activeMs sayılır", () => {
    const bosluklu = kayit(4300).replaceAll('":', '": ');
    expect(calistir([bosluklu]).bildirimler[0]).toContain("en uzun activeMs 4300 ms");
    rmSync(path.join(dizin, "durum"), { recursive: true, force: true });
    const cift = `${kayit(2600).slice(0, -1)},"ic":{"activeMs":2600}}`;
    expect(calistir([cift, cift]).bildirimler).toEqual([]);
  });

  it("hiç başlamamış transaction (activeMs null) uyarıdır ve alarmı temizlemez", () => {
    // Kayıt ilk koşudan SONRA oluşur; önceki taramanın kaydı yeniden sayılmaz.
    const baslamayan = () =>
      JSON.stringify({
        event: "db.transaction.duration",
        label: "runtime.lease",
        outcome: "failed",
        errorCode: "P1001",
        time: new Date().toISOString(),
        totalMs: 20,
        acquireMs: null,
        activeMs: null,
        timeoutMs: 5000,
      });
    expect(calistir([kayit(4500)]).bildirimler).toHaveLength(1);
    const inis = calistir([baslamayan()]).bildirimler;
    expect(inis).toHaveLength(1);
    expect(inis[0]).toContain("lease yavaşlıyor");
    expect(inis[0]).toContain("başlamayan: 1");
    expect(inis[0]).not.toContain("normale döndü");
  });

  it("ayrıştırılamayan satır varken alarm temiz diye kapanmaz; bunu ayrı bildirir", () => {
    const tam = kayit(4500);
    const kesik = tam.slice(0, tam.indexOf('"activeMs"'));
    expect(kesik).toContain('"label":"runtime.lease"');
    expect(kesik).not.toContain("activeMs");

    expect(calistir([kayit(4500)]).bildirimler).toHaveLength(1);
    // Karışık pencere: bir yavaş + bir kesik. Tarihçedeki 4500 ile yavaş sayısı
    // 2'dir; kesik satır üçüncü yavaş kayıt olabilir: "normale döndü" denmemeli,
    // belirsizlik söylenmeli.
    const belirsiz = calistir([kayit(2600), kesik]).bildirimler;
    expect(belirsiz).toHaveLength(1);
    expect(belirsiz[0]).toContain("ayrıştırılamıyor");
    expect(belirsiz[0]).not.toContain("normale döndü");
    // Aynı belirsizlik sürerse tekrar bildirilmez (6 saat dolmadan).
    expect(calistir([kesik]).bildirimler).toEqual([]);
    // Kanıt temizlenince dönüş bildirilir.
    expect(calistir([kayit(800)]).bildirimler[0]).toContain("normale döndü");
  });

  it("süren belirsizlik 6 saatte bir yeniden bildirilir; donmaz", () => {
    const tam = kayit(800);
    const kesik = tam.slice(0, tam.indexOf('"activeMs"'));
    mkdirSync(path.join(dizin, "durum"), { recursive: true });
    const yediSaatOnce = Math.floor(Date.now() / 1000) - 7 * 3600;
    writeFileSync(path.join(dizin, "durum", "durum-lease"), `belirsiz ${yediSaatOnce}\n`);
    expect(calistir([kesik]).bildirimler).toHaveLength(1);
    writeFileSync(path.join(dizin, "durum", "durum-lease"), `kritik ${yediSaatOnce}\n`);
    expect(calistir([kayit(4500)]).bildirimler).toHaveLength(1);
  });

  it.each(["belirsiz", "kritik", "uyari"])(
    "kayıt gelmeyen pencerede de süren %s hali 6 saatte bir hatırlatılır",
    (hal) => {
      mkdirSync(path.join(dizin, "durum"), { recursive: true });
      const yediSaatOnce = Math.floor(Date.now() / 1000) - 7 * 3600;
      writeFileSync(path.join(dizin, "durum", "durum-lease"), `${hal} ${yediSaatOnce}\n`);
      const hatirlatma = calistir([]).bildirimler;
      expect(hatirlatma).toHaveLength(1);
      expect(hatirlatma[0]).toContain(`son bilinen durum sürüyor: ${hal}`);
      // Hatırlatmadan sonra saat sıfırlanır; hemen ardından tekrar gelmez.
      expect(calistir([]).bildirimler).toEqual([]);
    },
  );

  it("kayıt yoksa (worker boşta) karar vermez ve önceki durumu korur", () => {
    expect(calistir([kayit(4500)]).bildirimler).toHaveLength(1);
    expect(calistir([]).bildirimler).toEqual([]);
    expect(calistir([kayit(4500)]).bildirimler).toEqual([]);
  });

  it("log yeniden okunabilince, kayıt olmasa da okunamıyor durumu kapanır", () => {
    expect(calistir([], { logsHata: true }).bildirimler).toHaveLength(1);
    const donus = calistir([]).bildirimler;
    expect(donus).toHaveLength(1);
    expect(donus[0]).toContain("yeniden okunabiliyor");
    expect(calistir([]).bildirimler).toEqual([]);
  });

  it("log okunamıyorsa bunu ayrıca bildirir; sessiz kalmaz", () => {
    const { status, bildirimler } = calistir([kayit(800)], { logsHata: true });
    expect(status).toBe(0);
    expect(bildirimler).toHaveLength(1);
    expect(bildirimler[0]).toContain("lease logu okunamıyor");
  });
});

describe("lease taraması ve teslimi (Sol ve Astra, 21 Eylül)", () => {
  const T = 1_790_000_000; // sabit "şimdi" (sn)
  const imlecYaz = (sn: number) => {
    mkdirSync(path.join(dizin, "durum"), { recursive: true });
    writeFileSync(path.join(dizin, "durum", "durum-lease-imlec"), `${sn * 1000}\n`);
  };
  const imlecOku = () =>
    Number(
      readFileSync(path.join(dizin, "durum", "durum-lease-imlec"), "utf8")
        .trim()
        .split(" ")[0],
    ) / 1000;
  const zamanli = (activeMs: number, sn: number) => kayit(activeMs, "committed", undefined, sn);

  it("gecikmiş taramada iki pencere arasına düşen kritik olay kaçmaz", () => {
    // Önceki tarama 17 dk önce; olay 16,5 dk önce. Sabit 15 dk'lık pencere görmezdi.
    imlecYaz(T - 17 * 60);
    const { bildirimler } = calistir([zamanli(4500, T - 990)], { simdi: T });
    expect(bildirimler).toHaveLength(1);
    expect(bildirimler[0]).toContain("sınırına dayandı");
    expect(imlecOku()).toBe(T);
  });

  it("gönderilemeyen karar, olay loglardan çıksa da (7 saat) sonraki koşuda gider", () => {
    const olay = zamanli(4500, T - 120);
    expect(calistir([olay], { simdi: T, curlHata: true }).bildirimler).toEqual([]);
    const sonra = calistir([olay], { simdi: T + 7 * 3600 }).bildirimler;
    expect(sonra).toHaveLength(1);
    expect(sonra[0]).toContain("sınırına dayandı");
    // Teslim edildi: bir sonraki koşu aynı bildirimi tekrar atmaz.
    expect(calistir([], { simdi: T + 7 * 3600 + 900 }).bildirimler).toEqual([]);
  });

  it("arada gönderilemeyen kritik, düzelme bildiriminde kaybolmaz", () => {
    expect(calistir([zamanli(4500, T - 60)], { simdi: T, curlHata: true }).bildirimler).toEqual([]);
    expect(
      calistir([zamanli(800, T + 800)], { simdi: T + 900, curlHata: true }).bildirimler,
    ).toEqual([]);
    const teslim = calistir([], { simdi: T + 1800 }).bildirimler;
    expect(teslim).toHaveLength(1);
    expect(teslim[0]).toContain("arada lease kritik yaşandı (şimdi: temiz)");
    expect(teslim[0]).toContain("Priority: urgent");
    expect(calistir([], { simdi: T + 2700 }).bildirimler).toEqual([]);
  });

  it("bir koşuda en fazla bir bildirim denenir; süre bütçesi aşılmaz", () => {
    const { bildirimler, curlDenemeleri } = calistir([zamanli(4500, T - 60)], {
      simdi: T,
      curlHata: true,
    });
    expect(bildirimler).toEqual([]);
    expect(curlDenemeleri).toHaveLength(1);
    expect(curlDenemeleri[0]).toContain("-m 10");
  });

  it("log okunamazsa imleç ilerlemez — ilk bildirimde de, süren arızada da", () => {
    imlecYaz(T - 15 * 60);
    const ilk = calistir([zamanli(800, T - 60)], { simdi: T, logsHata: true });
    expect(ilk.bildirimler[0]).toContain("okunamıyor");
    expect(imlecOku()).toBe(T - 15 * 60);
    const suren = calistir([], { simdi: T + 15 * 60, logsHata: true });
    expect(suren.bildirimler).toEqual([]);
    expect(imlecOku()).toBe(T - 15 * 60);
  });

  it("imleç 60 sn örtüşmeyle (tarihçe yoksa +15 dk tohum) geri başlar; sınır yok", () => {
    imlecYaz(T - 10 * 60);
    calistir([], { simdi: T });
    imlecYaz(T - 10 * 3600);
    calistir([], { simdi: T });
    const since = readFileSync(path.join(dizin, "since.log"), "utf8").trim().split("\n");
    const beklenen = (sn: number) => new Date(sn * 1000).toISOString().replace(".000Z", "Z");
    // İlk koşuda tarihçe yok: tohum için 15 dk daha geri; ikincide tarihçe var.
    expect(since[0]).toBe(beklenen(T - 10 * 60 - 60 - 900));
    expect(since[1]).toBe(beklenen(T - 10 * 3600 - 60));
  });

  it("gelecekteki imleç düzeltilir; log okunamasa bile hemen yazılır", () => {
    imlecYaz(T + 3600);
    const { bildirimler, stderr } = calistir([zamanli(4500, T - 60)], { simdi: T });
    expect(bildirimler).toHaveLength(1);
    expect(stderr).toContain("imleç geçersiz ya da gelecekte");
    expect(imlecOku()).toBe(T);

    imlecYaz(T + 3600);
    calistir([], { simdi: T, logsHata: true });
    expect(imlecOku()).toBe(T - 15 * 60);
  });

  it("imleç yazılamazsa sessiz kalmaz, journal'a yazar", () => {
    mkdirSync(path.join(dizin, "durum", "durum-lease-imlec"), { recursive: true });
    const { status, stderr } = calistir([kayit(800)], {});
    expect(status).toBe(0);
    expect(stderr).toContain("durum-lease-imlec yazılamadı");
  });

  it("örtüşmedeki kayıt iki kez sayılmaz", () => {
    const eski = [zamanli(2600, T - 30), zamanli(2600, T - 20)];
    expect(calistir(eski, { simdi: T }).bildirimler).toEqual([]);
    expect(calistir([...eski, zamanli(2600, T + 890)], { simdi: T + 900 }).bildirimler).toEqual([]);
  });

  it("şimdi'den sonraki (tarama sırasında gelen) kayıt bir sonraki taramaya kalır", () => {
    const gec = kayit(4500, "committed", undefined, T + 0.5);
    expect(calistir([gec], { simdi: T }).bildirimler).toEqual([]);
    expect(calistir([gec], { simdi: T + 900 }).bildirimler[0]).toContain("sınırına dayandı");
  });

  it("milisaniyeli sınır kaydı iki taramada sayılmaz", () => {
    const sinir = kayit(4500, "committed", undefined, T - 0.5);
    expect(calistir([sinir], { simdi: T }).bildirimler[0]).toContain("sınırına dayandı");
    const donus = calistir([sinir, zamanli(800, T + 800)], { simdi: T + 900 }).bildirimler;
    expect(donus).toHaveLength(1);
    expect(donus[0]).toContain("normale döndü");
  });

  it("önceki taramada sayılan kritik kayıt, sonraki düzelmeyi engellemez", () => {
    const kritikOlay = zamanli(4500, T - 30);
    expect(calistir([kritikOlay], { simdi: T }).bildirimler).toHaveLength(1);
    const donus = calistir([kritikOlay, zamanli(800, T + 800)], { simdi: T + 900 }).bildirimler;
    expect(donus).toHaveLength(1);
    expect(donus[0]).toContain("normale döndü");
  });

  it("iki taramaya bölünen 15 dk içindeki üç yavaş kayıt yine uyarıdır", () => {
    const ilk = [zamanli(2600, T - 100), zamanli(2600, T - 50)];
    expect(calistir(ilk, { simdi: T }).bildirimler).toEqual([]);
    const ikinci = calistir([...ilk, zamanli(2600, T + 500)], { simdi: T + 600 }).bildirimler;
    expect(ikinci).toHaveLength(1);
    expect(ikinci[0]).toContain("lease yavaşlıyor");
  });

  it("eski yavaş seri tek başına yeniden uyarı üretmez", () => {
    const seri = [T - 300, T - 200, T - 100].map((z) => zamanli(2600, z));
    expect(calistir(seri, { simdi: T }).bildirimler[0]).toContain("lease yavaşlıyor");
    const sonraki = calistir([...seri, zamanli(800, T + 100)], { simdi: T + 200 }).bildirimler;
    expect(sonraki).toHaveLength(1);
    expect(sonraki[0]).toContain("normale döndü");
  });

  it("uyarı eşiği gerçek 15 dakikalık pencerede aranır; uzun taramada birleşmez", () => {
    imlecYaz(T - 5 * 3600);
    const dagink = [T - 4 * 3600, T - 2 * 3600, T - 600].map((z) => zamanli(2600, z));
    expect(calistir(dagink, { simdi: T }).bildirimler).toEqual([]);
    imlecYaz(T - 5 * 3600);
    const yakin = [T - 900, T - 500, T - 100].map((z) => zamanli(2600, z));
    expect(calistir(yakin, { simdi: T }).bildirimler[0]).toContain("lease yavaşlıyor");
  });

  it("6 saatten uzun log körlüğünde gerçekleşen kritik olay kaybolmaz", () => {
    imlecYaz(T - 8 * 3600);
    const { bildirimler } = calistir([zamanli(4500, T - 7 * 3600)], { simdi: T });
    expect(bildirimler).toHaveLength(1);
    expect(bildirimler[0]).toContain("sınırına dayandı");
  });

  it("durum yazılamazsa imleç ilerlemez; karar sonraki koşuda yeniden bulunur", () => {
    imlecYaz(T - 15 * 60);
    mkdirSync(path.join(dizin, "durum", "durum-lease"), { recursive: true });
    const ilk = calistir([zamanli(4500, T - 60)], { simdi: T, curlHata: true });
    expect(ilk.stderr).toContain("durum-lease yazılamadı");
    expect(imlecOku()).toBe(T - 15 * 60);
    rmSync(path.join(dizin, "durum", "durum-lease"), { recursive: true, force: true });
    const sonra = calistir([zamanli(4500, T - 60)], { simdi: T + 900 }).bildirimler;
    expect(sonra).toHaveLength(1);
    expect(sonra[0]).toContain("sınırına dayandı");
  });

  it("log körlüğünden kayıtsız dönüş son ÖLÇÜLEN hali geri getirir; temiz varsaymaz", () => {
    expect(calistir([zamanli(4500, T - 60)], { simdi: T }).bildirimler).toHaveLength(1);
    expect(calistir([], { simdi: T + 900, logsHata: true }).bildirimler[0]).toContain("okunamıyor");
    const donus = calistir([], { simdi: T + 1800 }).bildirimler;
    expect(donus).toHaveLength(1);
    expect(donus[0]).toContain("sınırına dayandı");
    expect(donus[0]).toContain("Son ölçülen durum: kritik");
    expect(donus[0]).not.toContain("normale döndü");
  });

  it("eşit ağırlıkta ama farklı gönderilemeyen karar da bildirimde söylenir", () => {
    expect(calistir([], { simdi: T, logsHata: true, curlHata: true }).bildirimler).toEqual([]);
    const tam = zamanli(800, T + 800);
    const kesik = tam.slice(0, tam.indexOf('"activeMs"'));
    const teslim = calistir([kesik], { simdi: T + 900 }).bildirimler;
    expect(teslim).toHaveLength(1);
    expect(teslim[0]).toContain("ayrıştırılamıyor");
    expect(teslim[0]).toContain("Gönderilemeyen önceki bildirim: okunamiyor");
  });

  const ESKI = "aaaaaaaaaaaa1111";
  const YENI = "bbbbbbbbbbbb2222";
  const makbuzOku = () =>
    readFileSync(path.join(dizin, "durum", "durum-lease-kesim"), "utf8").trim();

  it("konteyner makbuzsuz değiştiyse temiz değil belirsiz der", () => {
    expect(calistir([zamanli(800, T - 60)], { simdi: T, kimlik: ESKI }).bildirimler).toEqual([]);
    const { bildirimler } = calistir([zamanli(800, T + 800)], { simdi: T + 900, kimlik: YENI });
    expect(bildirimler).toHaveLength(1);
    expect(bildirimler[0]).toContain("ayrıştırılamıyor");
    expect(bildirimler[0]).toContain("kesimden önce taranmamış");
  });

  it("kesim öncesi tarama makbuz yazar; ardından konteyner değişimi boşluk sayılmaz", () => {
    expect(calistir([zamanli(800, T - 60)], { simdi: T, kimlik: ESKI }).bildirimler).toEqual([]);
    const kesim = calistir([zamanli(800, T + 60)], {
      simdi: T + 120,
      kimlik: ESKI,
      kip: "--kesim-oncesi",
      konuYok: true,
    });
    expect(kesim.status).toBe(0);
    expect(kesim.curlDenemeleri).toEqual([]);
    expect(makbuzOku()).toBe(`${ESKI} ${(T + 120) * 1000}`);
    expect(
      calistir([zamanli(800, T + 800)], { simdi: T + 900, kimlik: YENI, olusma: T + 130 })
        .bildirimler,
    ).toEqual([]);
  });

  it("kesimle yenileme arasına düşen timer taraması makbuzu geçersiz kılmaz", () => {
    calistir([zamanli(800, T - 60)], { simdi: T, kimlik: ESKI });
    calistir([], { simdi: T + 120, kimlik: ESKI, kip: "--kesim-oncesi", konuYok: true });
    calistir([], { simdi: T + 130, kimlik: ESKI });
    expect(
      calistir([zamanli(800, T + 800)], { simdi: T + 900, kimlik: YENI, olusma: T + 140 })
        .bildirimler,
    ).toEqual([]);
  });

  it("kesim öncesi kip bildirim göndermez; karar sonraki timer koşusunda gider", () => {
    const kesim = calistir([zamanli(4500, T - 60)], {
      simdi: T,
      kimlik: ESKI,
      kip: "--kesim-oncesi",
      konuYok: true,
    });
    expect(kesim.status).toBe(0);
    expect(kesim.curlDenemeleri).toEqual([]);
    const sonra = calistir([], { simdi: T + 900, kimlik: YENI, olusma: T + 10 }).bildirimler;
    expect(sonra).toHaveLength(1);
    expect(sonra[0]).toContain("sınırına dayandı");
  });

  it("kesim öncesi tarama başarısızsa sıfır dışı döner ve makbuz yazmaz", () => {
    const hata = calistir([], {
      simdi: T,
      kimlik: ESKI,
      kip: "--kesim-oncesi",
      konuYok: true,
      logsHata: true,
    });
    expect(hata.status).not.toBe(0);
    expect(existsSync(path.join(dizin, "durum", "durum-lease-kesim"))).toBe(false);
    const kimliksiz = calistir([], { simdi: T, kimlik: "", kip: "--kesim-oncesi", konuYok: true });
    expect(kimliksiz.status).not.toBe(0);
  });

  it("konteyner kimliği okunamazsa temiz denmez ve imleç ilerlemez", () => {
    imlecYaz(T - 15 * 60);
    const { bildirimler } = calistir([zamanli(800, T - 60)], { simdi: T, kimlik: "" });
    expect(bildirimler[0]).toContain("kimliği okunamadı");
    expect(imlecOku()).toBe(T - 15 * 60);
  });

  it("kimliksiz (eski biçim) imleçte konteyner karşılaştırması yapılmaz", () => {
    imlecYaz(T - 15 * 60);
    expect(calistir([zamanli(800, T - 60)], { simdi: T, kimlik: YENI }).bildirimler).toEqual([]);
  });

  it("dağıtım iptal edilip worker döndüyse eski makbuz sonraki değişimi örtmez", () => {
    calistir([zamanli(800, T - 60)], { simdi: T, kimlik: ESKI });
    calistir([], { simdi: T + 60, kimlik: ESKI, kip: "--kesim-oncesi", konuYok: true });
    // Kesim iptal: konteyner aynı, worker yeniden çalışıyor (yeni kayıt).
    expect(calistir([zamanli(800, T + 800)], { simdi: T + 900, kimlik: ESKI }).bildirimler).toEqual(
      [],
    );
    // Sonraki değişim taramasız oldu: boşluk görülmeli.
    const sonra = calistir([zamanli(800, T + 1700)], { simdi: T + 1800, kimlik: YENI });
    expect(sonra.bildirimler[0]).toContain("kesimden önce taranmamış");
  });

  it("başarısız kesim taraması eski makbuzu geçerli bırakmaz", () => {
    calistir([zamanli(800, T - 60)], { simdi: T, kimlik: ESKI });
    calistir([], { simdi: T + 60, kimlik: ESKI, kip: "--kesim-oncesi", konuYok: true });
    expect(existsSync(path.join(dizin, "durum", "durum-lease-kesim"))).toBe(true);
    const hata = calistir([], {
      simdi: T + 120,
      kimlik: ESKI,
      kip: "--kesim-oncesi",
      konuYok: true,
      logsHata: true,
    });
    expect(hata.status).not.toBe(0);
    expect(existsSync(path.join(dizin, "durum", "durum-lease-kesim"))).toBe(false);
  });

  it("kesimin iki yanına düşen üç yavaş kayıt yine uyarıdır; tarihçe konteyneri aşar", () => {
    const once = [zamanli(2600, T - 100), zamanli(2600, T - 50)];
    expect(calistir(once, { simdi: T, kimlik: ESKI }).bildirimler).toEqual([]);
    calistir(once, { simdi: T + 10, kimlik: ESKI, kip: "--kesim-oncesi", konuYok: true });
    // Yeni konteyner: eski kayıtlar logda YOK; tarihçe diskten gelmeli.
    const sonra = calistir([zamanli(2600, T + 40)], {
      simdi: T + 60,
      kimlik: YENI,
      olusma: T + 20,
    });
    expect(sonra.bildirimler).toHaveLength(1);
    expect(sonra.bildirimler[0]).toContain("lease yavaşlıyor");
  });

  it("imleç bozulunca tarihçe ile log aynı yavaş kaydı iki kez saymaz", () => {
    mkdirSync(path.join(dizin, "durum"), { recursive: true });
    writeFileSync(
      path.join(dizin, "durum", "durum-lease-yavas"),
      `${(T - 100) * 1000},${(T - 50) * 1000}\n`,
    );
    writeFileSync(path.join(dizin, "durum", "durum-lease-imlec"), "bozuk\n");
    // Son 15 dk yeniden taranır: aynı iki kayıt logda da var. Toplam 2 yavaş, 4 değil.
    const { bildirimler } = calistir([zamanli(2600, T - 100), zamanli(2600, T - 50)], {
      simdi: T,
    });
    expect(bildirimler).toEqual([]);
  });

  it.each([
    ["makbuzdan 10 dk sonra yaratılan", 700],
    ["makbuzdan önce yaratılan", -30],
  ])("%s konteyner makbuzla örtülmez", (_ad, fark) => {
    calistir([zamanli(800, T - 60)], { simdi: T, kimlik: ESKI });
    calistir([], { simdi: T + 60, kimlik: ESKI, kip: "--kesim-oncesi", konuYok: true });
    const sonra = calistir([zamanli(800, T + 1000)], {
      simdi: T + 1100,
      kimlik: YENI,
      olusma: T + 60 + fark,
    });
    expect(sonra.bildirimler[0]).toContain("kesimden önce taranmamış");
  });

  it("tarihçe dosyası yoksa ilk koşu son 15 dk'yı logdan tohumlar", () => {
    // Eski sürüm iki yavaşı işledi ve imleci ilerletti; tarihçe dosyası yok.
    imlecYaz(T);
    const loglar = [zamanli(2600, T - 100), zamanli(2600, T - 50), zamanli(2600, T + 40)];
    const { bildirimler } = calistir(loglar, { simdi: T + 60, kimlik: ESKI });
    expect(bildirimler).toHaveLength(1);
    expect(bildirimler[0]).toContain("lease yavaşlıyor");
  });

  it("tohumlama gerçek 15 dk aralıkla da (imleçten eski yavaşlar) çalışır", () => {
    // Eski sürüm T'de taradı; yeni sürümün ilk koşusu T+15 dk. Tohum sınırı
    // imleçtir, şimdi değil: T-120 ve T-60 tarihçeye girmeli.
    imlecYaz(T);
    const loglar = [zamanli(2700, T - 120), zamanli(2700, T - 60), zamanli(2700, T + 60)];
    const { bildirimler } = calistir(loglar, { simdi: T + 900, kimlik: ESKI });
    expect(bildirimler[0]).toContain("lease yavaşlıyor");
  });

  it("çok büyük tarihçe dosyası ayrıştırmayı bozmaz ve yazılan tarihçe sınırlı kalır", () => {
    imlecYaz(T);
    // 20.000 eski zaman damgası (~280 KB, tek argüman sınırının çok üstünde)
    // + pencere içinde iki yavaş kayıt.
    const eski = Array.from({ length: 20_000 }, (_, i) => (T - 86_400 + i) * 1000);
    const icerde = [(T - 120) * 1000, (T - 60) * 1000];
    writeFileSync(
      path.join(dizin, "durum", "durum-lease-yavas"),
      [...eski, ...icerde].join(",") + "\n",
    );
    const { bildirimler, stderr } = calistir([zamanli(2700, T + 60)], {
      simdi: T + 900,
      kimlik: ESKI,
    });
    expect(stderr).not.toContain("işlenemedi");
    expect(bildirimler[0]).toContain("lease yavaşlıyor");
    const yazilan = readFileSync(path.join(dizin, "durum", "durum-lease-yavas"), "utf8").trim();
    expect(yazilan.split(",").length).toBeLessThanOrEqual(3);
  });

  it.each(["ana", "tarihce"] as const)(
    "ayrıştırma hatası (%s) 'kayıt yok' sayılmaz; bildirilir ve imleç ilerlemez",
    (hangisi) => {
      imlecYaz(T - 15 * 60);
      const { bildirimler, stderr } = calistir([zamanli(4500, T - 60)], {
        simdi: T,
        kimlik: ESKI,
        awkHata: hangisi,
      });
      expect(stderr).toContain("işlenemedi");
      expect(bildirimler[0]).toContain("okunamıyor");
      expect(imlecOku()).toBe(T - 15 * 60);
    },
  );

  // root için chmod 000 okumayı engellemez; o ortamda sınanamaz.
  it.skipIf(process.getuid?.() === 0)(
    "okunamayan tarihçe dosyası 'boş' sayılmaz; bildirilir ve imleç ilerlemez",
    () => {
      imlecYaz(T - 15 * 60);
      const yavas = path.join(dizin, "durum", "durum-lease-yavas");
      writeFileSync(yavas, `${(T - 1000) * 1000}\n`);
      chmodSync(yavas, 0o000);
      const { bildirimler, stderr } = calistir([zamanli(800, T - 60)], {
        simdi: T,
        kimlik: ESKI,
      });
      chmodSync(yavas, 0o600);
      expect(stderr).toContain("durum-lease-yavas okunam");
      expect(bildirimler[0]).toContain("okunamıyor");
      expect(imlecOku()).toBe(T - 15 * 60);
    },
  );

  it("tarihçe yolu dosya değilse (ne okunur ne yazılır) imleç ilerlemez", () => {
    // Saf yazma hatası dizin izinleri bozulmadan kurulamaz; dizin olan yol hem
    // okumayı hem yazmayı düşürür. Sıra (durum → tarihçe → imleç) kodda && zinciri.
    imlecYaz(T - 15 * 60);
    mkdirSync(path.join(dizin, "durum", "durum-lease-yavas"), { recursive: true });
    const { stderr } = calistir([zamanli(2600, T - 60)], { simdi: T, kimlik: ESKI });
    expect(stderr).toContain("durum-lease-yavas");
    expect(imlecOku()).toBe(T - 15 * 60);
  });

  it("gerçek 15 dk timer aralığında iki taramaya bölünen üç yavaş kayıt uyarıdır", () => {
    // Astra'nın karşı örneği: 11:58 ve 11:59 iki yavaş, 12:00 tarama, 12:01 üçüncü,
    // 12:15 tarama. Üç dakikada üç yavaş kayıt.
    const once = [zamanli(2700, T - 120), zamanli(2700, T - 60)];
    expect(calistir(once, { simdi: T, kimlik: ESKI }).bildirimler).toEqual([]);
    const sonra = calistir([...once, zamanli(2700, T + 60)], { simdi: T + 900, kimlik: ESKI });
    expect(sonra.bildirimler).toHaveLength(1);
    expect(sonra.bildirimler[0]).toContain("lease yavaşlıyor");
  });

  it("gecikmiş taramada da (30 dk) bölünen seri yakalanır", () => {
    const once = [zamanli(2700, T - 120), zamanli(2700, T - 60)];
    expect(calistir(once, { simdi: T, kimlik: ESKI }).bildirimler).toEqual([]);
    const sonra = calistir([...once, zamanli(2700, T + 60)], { simdi: T + 1800, kimlik: ESKI });
    expect(sonra.bildirimler[0]).toContain("lease yavaşlıyor");
  });

  it("geçerli kesim sonrası konteyner değişiminde 15 dk aralıkla bölünen seri yakalanır", () => {
    const once = [zamanli(2700, T - 120), zamanli(2700, T - 60)];
    expect(calistir(once, { simdi: T, kimlik: ESKI }).bildirimler).toEqual([]);
    calistir([], { simdi: T + 10, kimlik: ESKI, kip: "--kesim-oncesi", konuYok: true });
    const sonra = calistir([zamanli(2700, T + 60)], {
      simdi: T + 900,
      kimlik: YENI,
      olusma: T + 20,
    });
    expect(sonra.bildirimler[0]).toContain("lease yavaşlıyor");
  });

  it("normal kipte ntfy konusu yine zorunludur", () => {
    const { status, stderr } = calistir([], { konuYok: true });
    expect(status).not.toBe(0);
    expect(stderr).toContain("ALARM_NTFY_KONU gerekli");
  });

  it("eşzamanlı timer taraması, kesim taramasının bulduğu kritik kararı ezemez", async () => {
    // Timer eski logu görür (kritik yok) ve log okuması 2 sn sürer; bu sırada
    // dağıtımın kesim taraması başlar ve yeni logda kritik kaydı bulur.
    const timerLog = path.join(dizin, "timer.log");
    writeFileSync(timerLog, zamanli(800, T - 100) + "\n");
    const timer = new Promise<number | null>((coz) => {
      const c = spawn("bash", [BETIK], {
        env: ortam({ simdi: T, kimlik: ESKI, logDosyasi: timerLog, logsGecikme: 2 }),
        stdio: "ignore",
      });
      c.on("exit", (kod) => coz(kod));
    });
    // Timer kilidi aldı ve log okumasına girdi (sahte docker since.log yazar).
    const sinceLog = path.join(dizin, "since.log");
    for (let i = 0; i < 100 && !existsSync(sinceLog); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(existsSync(sinceLog)).toBe(true);
    const kesim = calistir([zamanli(800, T - 100), zamanli(4500, T + 30)], {
      simdi: T + 60,
      kimlik: ESKI,
      kip: "--kesim-oncesi",
      konuYok: true,
    });
    expect(kesim.status).toBe(0);
    await timer;
    const durum = readFileSync(path.join(dizin, "durum", "durum-lease"), "utf8").trim();
    expect(durum.split(" ")[0]).toBe("kritik");
    expect(durum.split(" ")[2]).toBe("0"); // teslim bekliyor; sonraki timer gönderir
  });

  it("kilit tutuluyorsa timer turu atlar ve hiçbir şey yazmaz", () => {
    mkdirSync(path.join(dizin, "durum"), { recursive: true });
    const kilit = spawn("flock", [path.join(dizin, "durum", "durum-lease.kilit"), "sleep", "10"]);
    try {
      spawnSync("sleep", ["0.3"]);
      const { stderr, bildirimler } = calistir([zamanli(4500, T - 60)], {
        simdi: T,
        leaseZamanAsimi: 10,
      });
      expect(stderr).toContain("lease kilidi");
      expect(bildirimler).toEqual([]);
      expect(existsSync(path.join(dizin, "durum", "durum-lease-imlec"))).toBe(false);
    } finally {
      kilit.kill();
    }
  });

  it("sayının ortasında kesilen kayıt sahte düzelme üretmez", () => {
    expect(calistir([kayit(4500)]).bildirimler).toHaveLength(1);
    const tam = kayit(4500);
    const kesik = tam.slice(0, tam.indexOf('"activeMs":') + '"activeMs":4'.length);
    const sonuc = calistir([kesik]).bildirimler;
    expect(sonuc).toHaveLength(1);
    expect(sonuc[0]).toContain("ayrıştırılamıyor");
    expect(sonuc[0]).not.toContain("normale döndü");
  });
});

describe("lease kontrolü canlılık alarmını bozamaz (Sol, 21 Eylül)", () => {
  it("canlılık alarmı lease kritikken de gider; çıkış kodu canlılığınkidir", () => {
    const { status, bildirimler } = calistir([kayit(4500)], { canlilik: "9999 120" });
    expect(status).toBe(2);
    expect(bildirimler).toHaveLength(2);
    expect(bildirimler[0]).toContain("koşu yok");
    expect(bildirimler[1]).toContain("sınırına dayandı");
  });

  it("veritabanı sorgulanamıyorsa çıkış 1 ve alarm; lease yine koşar", () => {
    const { status, bildirimler } = calistir([kayit(800)], { canlilik: "" });
    expect(status).toBe(1);
    expect(bildirimler).toHaveLength(1);
    expect(bildirimler[0]).toContain("veritabanı sorgulanamıyor");
  });

  it("takılan log okuması zaman aşımıyla kesilir, canlılık sonucu korunur", () => {
    const baslangic = Date.now();
    const { status, bildirimler } = calistir([kayit(4500)], {
      canlilik: "9999 120",
      logsAsili: true,
    });
    expect(Date.now() - baslangic).toBeLessThan(15_000);
    expect(status).toBe(2);
    expect(bildirimler).toHaveLength(1);
    expect(bildirimler[0]).toContain("koşu yok");
  });

  it("bozuk durum dosyaları betiği düşürmez", () => {
    mkdirSync(path.join(dizin, "durum"), { recursive: true });
    writeFileSync(path.join(dizin, "durum", "durum"), "alarm bozuk\n");
    writeFileSync(path.join(dizin, "durum", "durum-lease"), "kritik bozuk\n");
    const { status, bildirimler } = calistir([kayit(4500)], { canlilik: "9999 120" });
    expect(status).toBe(2);
    expect(bildirimler).toHaveLength(2);
  });

  it("takılan canlılık sorgusu zaman aşımıyla kesilir ve sorgu hatası olarak bildirilir", () => {
    const baslangic = Date.now();
    const { status, bildirimler } = calistir([kayit(800)], { execAsili: true });
    expect(Date.now() - baslangic).toBeLessThan(15_000);
    expect(status).toBe(1);
    expect(bildirimler).toHaveLength(1);
    expect(bildirimler[0]).toContain("veritabanı sorgulanamıyor");
  });

  it.each([
    ["baştaki sıfırlı", "0009"],
    ["gelecekteki", "99999999999"],
  ])("%s zaman damgası alarmı bastıramaz", (_ad, an) => {
    mkdirSync(path.join(dizin, "durum"), { recursive: true });
    writeFileSync(path.join(dizin, "durum", "durum"), `alarm ${an}\n`);
    writeFileSync(path.join(dizin, "durum", "durum-lease"), `kritik ${an}\n`);
    const { status, bildirimler } = calistir([kayit(4500)], { canlilik: "9999 120" });
    expect(status).toBe(2);
    expect(bildirimler).toHaveLength(2);
  });

  it.each([
    ["koşu yok alarmı", "9999 120", "koşu yok"],
    ["sorgu hatası alarmı", "", "sorgulanamıyor"],
  ])("gönderilemeyen %s sonraki koşuda yeniden denenir", (_ad, canlilik, metin) => {
    expect(calistir([], { canlilik, curlHata: true }).bildirimler).toEqual([]);
    const tekrar = calistir([], { canlilik }).bildirimler;
    expect(tekrar).toHaveLength(1);
    expect(tekrar[0]).toContain(metin);
  });

  it("gönderilemeyen düzelme bildirimi sonraki koşuda yeniden denenir", () => {
    expect(calistir([], { canlilik: "9999 120" }).bildirimler).toHaveLength(1);
    expect(calistir([], { curlHata: true }).bildirimler).toEqual([]);
    const tekrar = calistir([]).bildirimler;
    expect(tekrar).toHaveLength(1);
    expect(tekrar[0]).toContain("tekrar üretiyor");
  });
});

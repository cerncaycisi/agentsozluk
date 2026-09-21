import { spawnSync } from "node:child_process";
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
}

function calistir(logSatirlari: string[], secenek: Secenek = {}) {
  writeFileSync(path.join(dizin, "app.log"), logSatirlari.join("\n") + "\n");
  const sonuc = spawnSync("bash", [BETIK], {
    encoding: "utf8",
    timeout: 30_000,
    env: {
      NODE_ENV: "test",
      PATH: `${path.join(dizin, "bin")}:/usr/bin:/bin`,
      ALARM_NTFY_KONU: "test-konu",
      ALARM_NTFY_SUNUCU: "https://ntfy.example",
      ALARM_DURUM_DOSYASI: path.join(dizin, "durum", "durum"),
      ALARM_LEASE_ZAMAN_ASIMI: "3",
      ALARM_CANLILIK_ZAMAN_ASIMI: "2",
      SAHTE_DIZIN: dizin,
      SAHTE_CANLILIK: secenek.canlilik ?? "60 120",
      SAHTE_LOGS_HATA: secenek.logsHata ? "1" : "",
      SAHTE_LOGS_ASILI: secenek.logsAsili ? "1" : "",
      SAHTE_EXEC_ASILI: secenek.execAsili ? "1" : "",
      SAHTE_CURL_HATA: secenek.curlHata ? "1" : "",
      SAHTE_CURL_ILK_HATA: secenek.curlIlkHata ? "1" : "",
      ...(secenek.simdi === undefined ? {} : { ALARM_SIMDI: String(secenek.simdi) }),
    },
  });
  const oku = (ad: string) =>
    existsSync(path.join(dizin, ad)) ? readFileSync(path.join(dizin, ad), "utf8") : "";
  const bildirimler = oku("curl.log").split("\n---\n").filter(Boolean);
  const dockerCagrilari = oku("docker.log").split("\n").filter(Boolean);
  rmSync(path.join(dizin, "curl.log"), { force: true });
  rmSync(path.join(dizin, "docker.log"), { force: true });
  rmSync(path.join(dizin, "curl-ilk"), { force: true });
  return { status: sonuc.status, bildirimler, dockerCagrilari, stderr: sonuc.stderr };
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
[[ "$tum" == *" -f ${COMPOSE} "* ]] || exit 97
if [[ "$tum" == *" logs "* ]]; then
  [[ "$tum" == *" --no-log-prefix "* && "$*" == *" app" ]] || exit 98
  since=""; onceki=""
  for a in "$@"; do [[ "$onceki" == "--since" ]] && since="$a"; onceki="$a"; done
  [[ "$since" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || exit 95
  echo "$since" >> "$SAHTE_DIZIN/since.log"
  [[ -n "$SAHTE_LOGS_ASILI" ]] && sleep 20
  [[ -n "$SAHTE_LOGS_HATA" ]] && exit 1
  se=$(date -u -d "$since" +%s)
  # Gerçek docker gibi: --since'ten önceki satırlar gelmez. Zamansız satır hep gelir.
  while IFS= read -r l; do
    z=$(grep -oE '"time":"[^"]+"' <<<"$l" | cut -d'"' -f4)
    if [[ -z "$z" ]] || (( $(date -u -d "$z" +%s) >= se )); then printf '%s\n' "$l"; fi
  done < "$SAHTE_DIZIN/app.log"
  exit 0
fi
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
[[ -n "$SAHTE_CURL_HATA" ]] && exit 22
if [[ -n "$SAHTE_CURL_ILK_HATA" && ! -e "$SAHTE_DIZIN/curl-ilk" ]]; then
  : > "$SAHTE_DIZIN/curl-ilk"; exit 22
fi
{ printf '%s\\n' "$@"; printf -- '---\\n'; } >> "$SAHTE_DIZIN/curl.log"
`,
  );
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
    expect(dockerCagrilari).toHaveLength(2);
    expect(dockerCagrilari[0]).toContain("exec -T db psql");
    expect(dockerCagrilari[1]).toMatch(/logs --no-log-prefix --since \S+Z app$/);
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
    // Karışık pencere: iki yavaş + bir kesik. Kesik satır üçüncü yavaş kayıt
    // olabilir; "normale döndü" denmemeli, belirsizlik söylenmeli.
    const belirsiz = calistir([kayit(2600), kayit(2700), kesik]).bildirimler;
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
    expect(donus[0]).toContain("yeniden okunuyor");
    expect(calistir([]).bildirimler).toEqual([]);
  });

  it("log okunamıyorsa bunu ayrıca bildirir; sessiz kalmaz", () => {
    const { status, bildirimler } = calistir([kayit(800)], { logsHata: true });
    expect(status).toBe(0);
    expect(bildirimler).toHaveLength(1);
    expect(bildirimler[0]).toContain("lease logu okunamıyor");
  });
});

describe("lease taraması imleçle ilerler (Astra, 21 Eylül)", () => {
  const T = 1_790_000_000; // sabit "şimdi" (sn)
  const imlecYaz = (sn: number) => {
    mkdirSync(path.join(dizin, "durum"), { recursive: true });
    writeFileSync(path.join(dizin, "durum", "durum-lease-imlec"), `${sn}\n`);
  };
  const imlecOku = () =>
    readFileSync(path.join(dizin, "durum", "durum-lease-imlec"), "utf8").trim();

  it("gecikmiş taramada iki pencere arasına düşen kritik olay kaçmaz", () => {
    // Önceki tarama 17 dk önce; olay 16,5 dk önce. Sabit 15 dk'lık pencere görmezdi.
    imlecYaz(T - 17 * 60);
    const { bildirimler } = calistir([kayit(4500, "committed", undefined, T - 990)], {
      simdi: T,
    });
    expect(bildirimler).toHaveLength(1);
    expect(bildirimler[0]).toContain("sınırına dayandı");
    expect(imlecOku()).toBe(String(T));
  });

  it("gönderilemeyen olay, pencere kaysa bile sonraki koşuda yeniden okunur", () => {
    // Olay örtüşme payının (60 sn) dışında: imleç yanlışlıkla ilerlerse görünmez.
    const olay = kayit(4500, "committed", undefined, T - 120);
    expect(calistir([olay], { simdi: T, curlHata: true }).bildirimler).toEqual([]);
    // 30 dk sonra: olay artık "son 15 dk" içinde değil, ama imleç ilerlemedi.
    const tekrar = calistir([olay], { simdi: T + 30 * 60 }).bildirimler;
    expect(tekrar).toHaveLength(1);
    expect(tekrar[0]).toContain("sınırına dayandı");
  });

  it("log okunamazsa imleç ilerlemez — ilk bildirimde de, süren arızada da", () => {
    imlecYaz(T - 15 * 60);
    const ilk = calistir([kayit(800, "committed", undefined, T - 60)], {
      simdi: T,
      logsHata: true,
    });
    expect(ilk.bildirimler[0]).toContain("okunamıyor");
    expect(imlecOku()).toBe(String(T - 15 * 60));
    // Arıza sürüyor, 6 saat dolmadı: bildirim yok, imleç yine yerinde.
    const suren = calistir([], { simdi: T + 15 * 60, logsHata: true });
    expect(suren.bildirimler).toEqual([]);
    expect(imlecOku()).toBe(String(T - 15 * 60));
  });

  it("imleç örtüşmeyle geri başlar ve en fazla 6 saat geriye gider", () => {
    imlecYaz(T - 10 * 60);
    calistir([], { simdi: T });
    imlecYaz(T - 10 * 3600);
    calistir([], { simdi: T });
    const since = readFileSync(path.join(dizin, "since.log"), "utf8").trim().split("\n");
    expect(since[0]).toBe(new Date((T - 26 * 60) * 1000).toISOString().replace(".000Z", "Z"));
    expect(since[1]).toBe(
      new Date((T - 6 * 3600 - 960) * 1000).toISOString().replace(".000Z", "Z"),
    );
  });

  it("6 saatten uzun gönderilemeyen kritik alarm kuyrukta bekler, kaybolmaz", () => {
    const olay = kayit(4500, "committed", undefined, T - 60);
    expect(calistir([olay], { simdi: T, curlHata: true }).bildirimler).toEqual([]);
    // 7 saat sonra olay 6 saatlik tarama sınırının dışında; ama karar kuyrukta.
    const sonra = calistir([olay], { simdi: T + 7 * 3600 }).bildirimler;
    expect(sonra.length).toBeGreaterThanOrEqual(1);
    expect(sonra[0]).toContain("[gecikmeli");
    expect(sonra[0]).toContain("sınırına dayandı");
    // Kuyruk boşaldı: bir sonraki koşu aynı gecikmeli bildirimi tekrar atmaz.
    expect(calistir([], { simdi: T + 7 * 3600 + 900 }).bildirimler).toEqual([]);
  });

  it("kuyruk sırası korunur: kritik ve ardından gelen düzelme sırayla gider", () => {
    expect(
      calistir([kayit(4500, "committed", undefined, T - 60)], { simdi: T, curlHata: true })
        .bildirimler,
    ).toEqual([]);
    expect(
      calistir([kayit(800, "committed", undefined, T + 800)], { simdi: T + 900, curlHata: true })
        .bildirimler,
    ).toEqual([]);
    const teslim = calistir([], { simdi: T + 1800 }).bildirimler;
    expect(teslim).toHaveLength(2);
    expect(teslim[0]).toContain("sınırına dayandı");
    expect(teslim[1]).toContain("normale döndü");
  });

  it("kuyruk boşaltılamazsa yeni karar da arkaya eklenir; sıra bozulmaz", () => {
    expect(
      calistir([kayit(4500, "committed", undefined, T - 60)], { simdi: T, curlHata: true })
        .bildirimler,
    ).toEqual([]);
    // Kuyruktaki kritik gönderilemiyor (ilk deneme düşer), ama sonraki gönderim
    // çalışıyor: yeni "düzeldi" kararı kritikten ÖNCE gitmemeli.
    expect(
      calistir([kayit(800, "committed", undefined, T + 800)], { simdi: T + 900, curlIlkHata: true })
        .bildirimler,
    ).toEqual([]);
    const teslim = calistir([], { simdi: T + 1800 }).bildirimler;
    expect(teslim).toHaveLength(2);
    expect(teslim[0]).toContain("sınırına dayandı");
    expect(teslim[1]).toContain("normale döndü");
  });

  it("örtüşmedeki kayıt iki kez sayılmaz", () => {
    // İlk tarama: iki yavaş kayıt (eşik 3) → uyarı yok.
    const eski = [
      kayit(2600, "committed", undefined, T - 30),
      kayit(2600, "committed", undefined, T - 20),
    ];
    expect(calistir(eski, { simdi: T }).bildirimler).toEqual([]);
    // İkinci tarama 60 sn örtüşmeyle eskileri de OKUR ama saymaz; tek yeni kayıt
    // ile toplam 3 olmaz.
    const ikinci = calistir([...eski, kayit(2600, "committed", undefined, T + 890)], {
      simdi: T + 900,
    });
    expect(ikinci.bildirimler).toEqual([]);
  });

  it("önceki taramada sayılan kritik kayıt, sonraki düzelmeyi engellemez", () => {
    const kritikOlay = kayit(4500, "committed", undefined, T - 30);
    expect(calistir([kritikOlay], { simdi: T }).bildirimler).toHaveLength(1);
    // Eski kritik kayıt örtüşmede yeniden OKUNUR ama sayılmaz; yeni kanıt temiz.
    const donus = calistir([kritikOlay, kayit(800, "committed", undefined, T + 800)], {
      simdi: T + 900,
    }).bildirimler;
    expect(donus).toHaveLength(1);
    expect(donus[0]).toContain("normale döndü");
  });

  it("iki taramaya bölünen 15 dk içindeki üç yavaş kayıt yine uyarıdır", () => {
    const ilk = [
      kayit(2600, "committed", undefined, T - 100),
      kayit(2600, "committed", undefined, T - 50),
    ];
    expect(calistir(ilk, { simdi: T }).bildirimler).toEqual([]);
    const ikinci = calistir([...ilk, kayit(2600, "committed", undefined, T + 500)], {
      simdi: T + 600,
    }).bildirimler;
    expect(ikinci).toHaveLength(1);
    expect(ikinci[0]).toContain("lease yavaşlıyor");
  });

  it("eski yavaş seri tek başına yeniden uyarı üretmez", () => {
    const seri = [T - 300, T - 200, T - 100].map((z) => kayit(2600, "committed", undefined, z));
    expect(calistir(seri, { simdi: T }).bildirimler[0]).toContain("lease yavaşlıyor");
    // Sonraki tarama: aynı seri tarihçede, yeni kayıt temiz → uyarı yenilenmez, düzelir.
    const sonraki = calistir([...seri, kayit(800, "committed", undefined, T + 100)], {
      simdi: T + 200,
    }).bildirimler;
    expect(sonraki).toHaveLength(1);
    expect(sonraki[0]).toContain("normale döndü");
  });

  it("uyarı eşiği gerçek 15 dakikalık pencerede aranır; uzun taramada birleşmez", () => {
    imlecYaz(T - 5 * 3600);
    const dagink = [T - 4 * 3600, T - 2 * 3600, T - 600].map((z) =>
      kayit(2600, "committed", undefined, z),
    );
    expect(calistir(dagink, { simdi: T }).bildirimler).toEqual([]);
    imlecYaz(T - 5 * 3600);
    const yakin = [T - 900, T - 500, T - 100].map((z) => kayit(2600, "committed", undefined, z));
    expect(calistir(yakin, { simdi: T }).bildirimler[0]).toContain("lease yavaşlıyor");
  });

  it("gelecekteki imleç (saat geri kayması) olay kaybettirmez ve düzeltilir", () => {
    imlecYaz(T + 3600);
    const { bildirimler, stderr } = calistir([kayit(4500, "committed", undefined, T - 60)], {
      simdi: T,
    });
    expect(bildirimler).toHaveLength(1);
    expect(stderr).toContain("imleç geçersiz ya da gelecekte");
    expect(imlecOku()).toBe(String(T));
  });

  it("imleç yazılamazsa sessiz kalmaz, journal'a yazar", () => {
    mkdirSync(path.join(dizin, "durum", "durum-lease-imlec"), { recursive: true });
    const { status, stderr } = calistir([kayit(800)], {});
    expect(status).toBe(0);
    expect(stderr).toContain("imleç yazılamadı");
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

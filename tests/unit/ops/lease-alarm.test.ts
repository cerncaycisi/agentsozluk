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

function kayit(activeMs: number, outcome = "committed", errorCode?: string) {
  return JSON.stringify({
    level: "info",
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
    },
  });
  const oku = (ad: string) =>
    existsSync(path.join(dizin, ad)) ? readFileSync(path.join(dizin, ad), "utf8") : "";
  const bildirimler = oku("curl.log").split("\n---\n").filter(Boolean);
  const dockerCagrilari = oku("docker.log").split("\n").filter(Boolean);
  rmSync(path.join(dizin, "curl.log"), { force: true });
  rmSync(path.join(dizin, "docker.log"), { force: true });
  return { status: sonuc.status, bildirimler, dockerCagrilari };
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
  [[ "$tum" == *" --since 15m "* && "$tum" == *" --no-log-prefix "* && "$*" == *" app" ]] || exit 98
  [[ -n "$SAHTE_LOGS_ASILI" ]] && sleep 20
  [[ -n "$SAHTE_LOGS_HATA" ]] && exit 1
  cat "$SAHTE_DIZIN/app.log"; exit 0
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
    expect(dockerCagrilari[1]).toContain("logs --no-log-prefix --since 15m app");
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
    const uc = [kayit(2600), kayit(2600), kayit(2600)];
    expect(calistir(uc).bildirimler).toHaveLength(1);
    expect(calistir([kayit(4200)]).bildirimler[0]).toContain("sınırına dayandı");
    const inis = calistir(uc).bildirimler;
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
    const bosluklu = kayit(4300).replaceAll(":", ": ");
    expect(calistir([bosluklu]).bildirimler[0]).toContain("en uzun activeMs 4300 ms");
    rmSync(path.join(dizin, "durum"), { recursive: true, force: true });
    const cift = `${kayit(2600).slice(0, -1)},"ic":{"activeMs":2600}}`;
    expect(calistir([cift, cift]).bildirimler).toEqual([]);
  });

  it("hiç başlamamış transaction (activeMs null) uyarıdır ve alarmı temizlemez", () => {
    const baslamayan = JSON.stringify({
      event: "db.transaction.duration",
      label: "runtime.lease",
      outcome: "failed",
      errorCode: "P1001",
      totalMs: 20,
      acquireMs: null,
      activeMs: null,
      timeoutMs: 5000,
    });
    expect(calistir([kayit(4500)]).bildirimler).toHaveLength(1);
    const inis = calistir([baslamayan]).bildirimler;
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

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/*
  Canlılık alarmının işletim kontrolü ve OnFailure bildirimi (17 Ekim 2026; Astra bulgu 5 ve 8,
  Fable P1-1). 15–17 Ekim'de sunucu içi yedek üç gece `226/NAMESPACE` ile düştü ve kimse
  görmedi. Betik gerçekten çalıştırılır; `systemctl`, `docker`, `df` ve `curl` PATH'teki
  sahtelerle değiştirilir. Sahte systemctl birim başına `systemctl/<birim>` dosyasını basar;
  dosya yoksa birim kurulu değildir.
*/

const BETIK = path.resolve("deploy/alarm/canlilik-alarmi.sh");
const COMPOSE = "/opt/agent-sozluk/runtime/compose.production.yaml";
const T = 1_800_000_000;
const GIB = 1024 * 1024 * 1024;
const YALNIZ_YEDEK = { ALARM_BIRIMLER: "backup:26" };

let dizin: string;

function birim(ad: string, alanlar: Record<string, string>) {
  const satirlar = {
    LoadState: "loaded",
    ActiveState: "inactive",
    Result: "success",
    ExecMainStatus: "0",
    ExecMainExitTimestamp: `@${T - 600}`,
    ...alanlar,
  };
  writeFileSync(
    path.join(dizin, "systemctl", `agent-sozluk-${ad}.service`),
    Object.entries(satirlar)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n",
  );
}

function hepsiSaglam() {
  for (const ad of ["backup", "ilgili", "sayac", "indexnow", "karagoz"]) birim(ad, {});
}

function calistir(kip: string[], ortam: Record<string, string> = {}) {
  const sonuc = spawnSync("bash", [BETIK, ...kip], {
    encoding: "utf8",
    timeout: 30_000,
    env: {
      NODE_ENV: "test",
      PATH: `${path.join(dizin, "bin")}:/usr/bin:/bin`,
      ALARM_NTFY_KONU: "test-konu",
      ALARM_NTFY_SUNUCU: "https://ntfy.example",
      ALARM_DURUM_DOSYASI: path.join(dizin, "durum", "durum"),
      ALARM_DISK_YOLU: "/sahte",
      ALARM_BILDIRIM_YEDEK_DIZINI: path.join(dizin, "run"),
      ALARM_SIMDI: String(T),
      SAHTE_DIZIN: dizin,
      SAHTE_ACILIS: String(T - 100 * 3600),
      SAHTE_DB: String(5 * GIB),
      SAHTE_BOS_KIB: String((30 * GIB) / 1024),
      ...ortam,
    },
  });
  // Durum dosyası yerine dizin konan (yazılamayan durum) testlerde boş okunur.
  const oku = (ad: string) =>
    existsSync(path.join(dizin, ad)) && statSync(path.join(dizin, ad)).isFile()
      ? readFileSync(path.join(dizin, ad), "utf8")
      : "";
  const bildirimler = oku("curl.log").split("\n---\n").filter(Boolean);
  rmSync(path.join(dizin, "curl.log"), { force: true });
  return {
    status: sonuc.status,
    stdout: sonuc.stdout,
    stderr: sonuc.stderr,
    bildirimler,
    durum: oku(path.join("durum", "durum-isletim")).trim(),
    oku,
  };
}

beforeEach(() => {
  dizin = mkdtempSync(path.join(tmpdir(), "isletim-alarm-"));
  const bin = path.join(dizin, "bin");
  mkdirSync(bin);
  mkdirSync(path.join(dizin, "systemctl"));
  const yaz = (ad: string, govde: string) => {
    writeFileSync(path.join(bin, ad), `#!/usr/bin/env bash\n${govde}`);
    chmodSync(path.join(bin, ad), 0o755);
  };
  yaz(
    "systemctl",
    `[[ -n "$SAHTE_SYSTEMCTL_HATA" ]] && exit 1
[[ "$1 $2" == "show --timestamp=unix" ]] || exit 98
if [[ "$*" == *"-p UserspaceTimestamp --value"* ]]; then echo "@$SAHTE_ACILIS"; exit 0; fi
birim="\${!#}"
if [[ -f "$SAHTE_DIZIN/systemctl/$birim" ]]; then cat "$SAHTE_DIZIN/systemctl/$birim"
else printf 'LoadState=not-found\\nActiveState=inactive\\nResult=success\\nExecMainStatus=0\\nExecMainExitTimestamp=\\n'; fi
`,
  );
  yaz(
    "docker",
    `tum=" $* "
[[ "$tum" == *" -f ${COMPOSE} "* && "$tum" == *" exec -T db psql "* ]] || exit 97
sql="$(cat)"
[[ "$sql" == *"READ ONLY"* && "$sql" == *"disk-marji"* ]] || exit 99
[[ -n "$SAHTE_DB" ]] && echo "DB $SAHTE_DB"
exit 0
`,
  );
  yaz(
    "df",
    `[[ "$1 $2" == "-Pk /sahte" ]] || exit 1
[[ -n "$SAHTE_DF_HATA" ]] && exit 1
echo "Filesystem 1024-blocks Used Available Capacity Mounted on"
echo "/dev/sda1 100000000 1 $SAHTE_BOS_KIB 50% /"
`,
  );
  yaz(
    "curl",
    `[[ -n "$SAHTE_CURL_HATA" ]] && exit 22
{ printf '%s\\n' "$@"; printf -- '---\\n'; } >> "$SAHTE_DIZIN/curl.log"
`,
  );
});

afterEach(() => rmSync(dizin, { recursive: true, force: true }));

describe("işletim kontrolü: son başarılı koşunun yaşı", () => {
  it("her şey yolundaysa bildirim atmaz, disk marjını journal'a basar ve 0 döner", () => {
    hepsiSaglam();
    const sonuc = calistir(["--yalniz-isletim"]);
    expect(sonuc.status, sonuc.stderr).toBe(0);
    expect(sonuc.bildirimler).toEqual([]);
    // 30 GiB boş − (3 × 5 GiB + 1 GiB) = 14 GiB.
    expect(sonuc.stdout).toContain(
      `ALARM_DISK_MARJI bos=${30 * GIB} gerek=${16 * GIB} marj=${14 * GIB}`,
    );
  });

  it("başarısız son koşuyu bildirir, 6 saat tekrarlamaz, düzelince bir kez düzeldi der", () => {
    // Saat 7 sa ilerler; saatlik birimler bu testte karışmasın.
    hepsiSaglam();
    birim("backup", { ActiveState: "failed", Result: "exit-code", ExecMainStatus: "226" });
    const ilk = calistir(["--yalniz-isletim"], YALNIZ_YEDEK);
    expect(ilk.status).toBe(0);
    expect(ilk.bildirimler).toHaveLength(1);
    expect(ilk.bildirimler[0]).toContain("Title: Agent Sözlük işletim: backup");
    expect(ilk.bildirimler[0]).toContain("Priority: high");
    expect(ilk.bildirimler[0]).toContain("backup son koşu başarısız (Result=exit-code, çıkış 226)");
    expect(ilk.durum).toBe(`backup ${T} -`);
    expect(
      calistir(["--yalniz-isletim"], { ...YALNIZ_YEDEK, ALARM_SIMDI: String(T + 900) }).bildirimler,
    ).toEqual([]);
    expect(
      calistir(["--yalniz-isletim"], { ...YALNIZ_YEDEK, ALARM_SIMDI: String(T + 6 * 3600 + 1) })
        .bildirimler,
    ).toHaveLength(1);
    birim("backup", { ExecMainExitTimestamp: `@${T + 7 * 3600}` });
    const duzeldi = calistir(["--yalniz-isletim"], {
      ...YALNIZ_YEDEK,
      ALARM_SIMDI: String(T + 7 * 3600 + 60),
    });
    expect(duzeldi.bildirimler).toHaveLength(1);
    expect(duzeldi.bildirimler[0]).toContain("işletim: düzeldi");
    expect(duzeldi.durum).toMatch(/^temiz /u);
  });

  it("birim başına azami yaşı uygular (sayaç 2 sa, yedek 26 sa)", () => {
    hepsiSaglam();
    birim("sayac", { ExecMainExitTimestamp: `@${T - 3 * 3600}` });
    birim("backup", { ExecMainExitTimestamp: `@${T - 25 * 3600}` });
    const sonuc = calistir(["--yalniz-isletim"]);
    expect(sonuc.bildirimler).toHaveLength(1);
    expect(sonuc.bildirimler[0]).toContain("Title: Agent Sözlük işletim: sayac");
    expect(sonuc.bildirimler[0]).toContain("sayac son başarılı koşu 3 sa önce (sınır 2 sa)");
    expect(sonuc.bildirimler[0]).not.toContain("backup");
  });

  it("kurulu olmayan birimi sorun sayar; liste ortamdan daraltılabilir", () => {
    hepsiSaglam();
    rmSync(path.join(dizin, "systemctl", "agent-sozluk-ilgili.service"));
    const sonuc = calistir(["--yalniz-isletim"]);
    expect(sonuc.bildirimler[0]).toContain("ilgili kurulu değil (agent-sozluk-ilgili.service)");
    rmSync(path.join(dizin, "durum"), { recursive: true });
    expect(
      calistir(["--yalniz-isletim"], { ALARM_BIRIMLER: "backup:26 sayac:2" }).bildirimler,
    ).toEqual([]);
  });

  it("açılıştan beri hiç koşmamış birimi yalnız açılış sınırdan eskiyse bildirir", () => {
    hepsiSaglam();
    birim("backup", { ExecMainExitTimestamp: "" });
    expect(calistir(["--yalniz-isletim"], { SAHTE_ACILIS: String(T - 3600) }).bildirimler).toEqual(
      [],
    );
    const eski = calistir(["--yalniz-isletim"], { SAHTE_ACILIS: String(T - 30 * 3600) });
    expect(eski.bildirimler[0]).toContain("backup açılıştan beri 30 sa başarılı koşu yok");
  });

  it("şu an koşan birimi atlar", () => {
    hepsiSaglam();
    birim("backup", { ActiveState: "activating", ExecMainExitTimestamp: "" });
    expect(calistir(["--yalniz-isletim"]).bildirimler).toEqual([]);
  });

  it("systemd okunamıyorsa körlüktür: 3 döner, durumu değiştirmez", () => {
    hepsiSaglam();
    const sonuc = calistir(["--yalniz-isletim"], { SAHTE_SYSTEMCTL_HATA: "1" });
    expect(sonuc.status).toBe(3);
    expect(sonuc.stderr).toContain("agent-sozluk-alarm: açılış zamanı okunamadı");
    expect(sonuc.durum).toBe("");
  });

  it("geçersiz birim listesi girdisi körlüktür", () => {
    hepsiSaglam();
    const sonuc = calistir(["--yalniz-isletim"], { ALARM_BIRIMLER: "backup:26 Kotu;ad:x" });
    expect(sonuc.status).toBe(3);
    expect(sonuc.stderr).toContain("ALARM_BIRIMLER girdisi geçersiz");
  });
});

describe("işletim kontrolü: migration disk marjı", () => {
  it("marj 2 GiB'in altındaysa düşük öncelikle uyarır ama başarısız saymaz", () => {
    hepsiSaglam();
    // 17,5 GiB boş − 16 GiB gerek = 1,5 GiB.
    const sonuc = calistir(["--yalniz-isletim"], {
      SAHTE_BOS_KIB: String((17.5 * GIB) / 1024),
    });
    expect(sonuc.status).toBe(0);
    expect(sonuc.bildirimler).toHaveLength(1);
    expect(sonuc.bildirimler[0]).toContain("Title: Agent Sözlük işletim: disk");
    expect(sonuc.bildirimler[0]).toContain("Priority: low");
    expect(sonuc.bildirimler[0]).toContain("disk migration marjı 1.50 GiB");
    expect(sonuc.bildirimler[0]).toContain("dağıtımı engellemez");
    // Yalnız disk: günde bir hatırlatma.
    expect(
      calistir(["--yalniz-isletim"], {
        ...YALNIZ_YEDEK,
        SAHTE_BOS_KIB: String((17.5 * GIB) / 1024),
        ALARM_SIMDI: String(T + 7 * 3600),
      }).bildirimler,
    ).toEqual([]);
  });

  it("veritabanı boyutu ya da boş alan okunamazsa körlüktür", () => {
    hepsiSaglam();
    expect(calistir(["--yalniz-isletim"], { SAHTE_DB: "" }).status).toBe(3);
    const df = calistir(["--yalniz-isletim"], { SAHTE_DF_HATA: "1" });
    expect(df.status).toBe(3);
    expect(df.stderr).toContain("disk marjı ölçülemedi");
  });
});

describe("işletim kontrolü: bildirim gönderilemezse", () => {
  it("3 döner, görüleni teslim edilmedi diye saklar ve son-bildirim-hatasi dosyasına kaydeder", () => {
    hepsiSaglam();
    birim("backup", { Result: "exit-code", ActiveState: "failed" });
    const sonuc = calistir(["--yalniz-isletim"], { SAHTE_CURL_HATA: "1" });
    expect(sonuc.status).toBe(3);
    // bildirilen değişmedi; görülen sorun bekliyor.
    expect(sonuc.durum).toBe("temiz 0 backup");
    expect(sonuc.oku(path.join("durum", "son-bildirim-hatasi"))).toMatch(
      /^\d+ yalniz-isletim 22\n$/u,
    );
    // Sonraki koşu yeniden dener.
    expect(calistir(["--yalniz-isletim"]).bildirimler).toHaveLength(1);
  });

  // Astra 1. tur (17 Ekim): ntfy 429 iken görülen ve sonraki koşuya kadar düzelen arıza kaybolmaz.
  it("gönderilemeyen arıza sonraki koşuda düzelmiş olsa da 'arada görülen' diye bir kez söylenir", () => {
    hepsiSaglam();
    birim("backup", { Result: "exit-code", ActiveState: "failed" });
    expect(calistir(["--yalniz-isletim"], { SAHTE_CURL_HATA: "1" }).status).toBe(3);
    birim("backup", {});
    const sonraki = calistir(["--yalniz-isletim"], { ALARM_SIMDI: String(T + 900) });
    expect(sonraki.status, sonraki.stderr).toBe(0);
    expect(sonraki.bildirimler).toHaveLength(1);
    expect(sonraki.bildirimler[0]).toContain("Title: Agent Sözlük işletim: düzeldi");
    expect(sonraki.bildirimler[0]).toContain("Arada görülen, bildirimi doğrulanamayan: backup.");
    expect(sonraki.durum).toBe(`temiz ${T + 900} -`);
    expect(calistir(["--yalniz-isletim"], { ALARM_SIMDI: String(T + 1800) }).bildirimler).toEqual(
      [],
    );
  });

  it("durum yazılamıyorsa bildirim göndermez (sınırsız tekrar yok) ve 3 döner", () => {
    hepsiSaglam();
    birim("backup", { Result: "exit-code", ActiveState: "failed" });
    mkdirSync(path.join(dizin, "durum", "durum-isletim"), { recursive: true });
    const sonuc = calistir(["--yalniz-isletim"]);
    expect(sonuc.status).toBe(3);
    expect(sonuc.bildirimler).toEqual([]);
    expect(sonuc.stderr).toContain("işletim durumu yazılamıyor; bildirim gönderilmedi");
  });
});

// Astra 1. tur (17 Ekim): okunamayan kaynak "düzeldi" üretmez, önceki durumu korur.
describe("işletim kontrolü: okunamayan kaynak önceki arızayı silmez", () => {
  function onceArizaBildirildi() {
    hepsiSaglam();
    birim("backup", { Result: "exit-code", ActiveState: "failed" });
    const ilk = calistir(["--yalniz-isletim"]);
    expect(ilk.bildirimler).toHaveLength(1);
    expect(ilk.durum).toBe(`backup ${T} -`);
  }

  it("systemd hiç okunamazsa düzeldi göndermez, durumu değiştirmez ve 3 döner", () => {
    onceArizaBildirildi();
    const sonuc = calistir(["--yalniz-isletim"], {
      SAHTE_SYSTEMCTL_HATA: "1",
      ALARM_SIMDI: String(T + 900),
    });
    expect(sonuc.status).toBe(3);
    expect(sonuc.bildirimler).toEqual([]);
    expect(sonuc.durum).toBe(`backup ${T} -`);
  });

  it("tek birim okunamazsa yalnız onun önceki arızası taşınır; hatırlatma 'okunamıyor' der", () => {
    onceArizaBildirildi();
    birim("backup", { LoadState: "garip" });
    const sonuc = calistir(["--yalniz-isletim"], { ALARM_SIMDI: String(T + 6 * 3600 + 1) });
    expect(sonuc.status).toBe(3);
    expect(sonuc.bildirimler).toHaveLength(1);
    expect(sonuc.bildirimler[0]).toContain("Title: Agent Sözlük işletim: backup");
    expect(sonuc.bildirimler[0]).toContain("backup önceki ölçümde sorunluydu; şu an okunamıyor");
    expect(sonuc.bildirimler[0]).not.toContain("düzeldi");
  });

  it("disk marjı ölçülemezse önceki disk uyarısı düzeldi sayılmaz", () => {
    hepsiSaglam();
    const dusuk = { SAHTE_BOS_KIB: String((17.5 * GIB) / 1024) };
    expect(calistir(["--yalniz-isletim"], dusuk).durum).toBe(`disk ${T} -`);
    const sonuc = calistir(["--yalniz-isletim"], {
      SAHTE_DF_HATA: "1",
      ALARM_SIMDI: String(T + 900),
    });
    expect(sonuc.status).toBe(3);
    expect(sonuc.bildirimler).toEqual([]);
    expect(sonuc.durum).toBe(`disk ${T} -`);
  });
});

describe("--bildir (agent-sozluk-bildirim@.service)", () => {
  const birimAdi = "agent-sozluk-backup.service";

  it("birim hatasını kaydeder, bir kez bildirir ve 6 saat tekrarlamaz", () => {
    const ilk = calistir(["--bildir", birimAdi]);
    expect(ilk.status, ilk.stderr).toBe(0);
    expect(ilk.bildirimler).toHaveLength(1);
    expect(ilk.bildirimler[0]).toContain(`Title: Agent Sözlük: ${birimAdi} başarısız`);
    expect(ilk.bildirimler[0]).toContain(`journalctl -u ${birimAdi}`);
    expect(ilk.oku(path.join("durum", "son-birim-hatasi"))).toBe(`${T} ${birimAdi}\n`);
    const tekrar = calistir(["--bildir", birimAdi], { ALARM_SIMDI: String(T + 300) });
    expect(tekrar.status).toBe(0);
    expect(tekrar.bildirimler).toEqual([]);
    expect(tekrar.stdout).toContain("tekrarı bastırıldı");
    // Bastırılsa da hata kaydı güncellenir.
    expect(tekrar.oku(path.join("durum", "son-birim-hatasi"))).toBe(`${T + 300} ${birimAdi}\n`);
    expect(
      calistir(["--bildir", birimAdi], { ALARM_SIMDI: String(T + 6 * 3600 + 1) }).bildirimler,
    ).toHaveLength(1);
  });

  it("gönderilemezse 3 döner, kaydı yine yazar ve bastırma başlatmaz", () => {
    const hata = calistir(["--bildir", birimAdi], { SAHTE_CURL_HATA: "1" });
    expect(hata.status).toBe(3);
    expect(hata.stderr).toContain("bildirim gönderilemedi (kaynak bildir, curl çıkış 22)");
    expect(hata.oku(path.join("durum", "son-birim-hatasi"))).toBe(`${T} ${birimAdi}\n`);
    expect(hata.oku(path.join("durum", "son-bildirim-hatasi"))).toMatch(/^\d+ bildir 22\n$/u);
    expect(
      calistir(["--bildir", birimAdi], { ALARM_SIMDI: String(T + 60) }).bildirimler,
    ).toHaveLength(1);
  });

  // Astra 1. tur (17 Ekim): kayıt kalıcı değilse gönderim yapılmaz; /var/lib yazılamıyorsa
  // bastırma kaydı birimin /run dizinine düşer ve tekrar yine 6 saat bastırılır.
  it("durum dizini yazılamıyorsa /run yedek kaydıyla bir kez gönderir ve 3 döner", () => {
    mkdirSync(path.join(dizin, "durum", `bildirim-${birimAdi}`), { recursive: true });
    mkdirSync(path.join(dizin, "run"));
    const ilk = calistir(["--bildir", birimAdi]);
    expect(ilk.status).toBe(3);
    expect(ilk.bildirimler).toHaveLength(1);
    expect(ilk.oku(path.join("run", `bildirim-${birimAdi}`))).toBe(`${T} gitti\n`);
    const tekrar = calistir(["--bildir", birimAdi], { ALARM_SIMDI: String(T + 900) });
    expect(tekrar.status).toBe(0);
    expect(tekrar.bildirimler).toEqual([]);
  });

  it("hiçbir bastırma kaydı yazılamıyorsa göndermez ve 3 döner", () => {
    mkdirSync(path.join(dizin, "durum", `bildirim-${birimAdi}`), { recursive: true });
    const sonuc = calistir(["--bildir", birimAdi]);
    expect(sonuc.status).toBe(3);
    expect(sonuc.bildirimler).toEqual([]);
    expect(sonuc.stderr).toContain("bastırma kaydı yazılamadı");
  });

  it("geçersiz birim adını reddeder", () => {
    for (const ad of ["", "a b", "x;rm"]) {
      const sonuc = calistir(["--bildir", ad]);
      expect(sonuc.status).toBe(64);
      expect(sonuc.bildirimler).toEqual([]);
    }
  });
});

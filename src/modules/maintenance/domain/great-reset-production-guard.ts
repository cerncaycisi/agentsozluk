import { parse as parseDotenv } from "dotenv";

/*
  Üretim reset hedef kimliği (üretim tasarımı v19, "Sabit üretim kimliği"). Saf fonksiyon:
  dosya okumaz, ağa bağlanmaz. Çağıran, host adını, `.env` içeriğini ve koştuğu release dizinini
  verir; guard hiçbirini log'a ya da hata mesajına yazmaz. Uyuşmazlıkta hiçbir DB bağlantısı
  açılmadan güvenli kodla durulur. Yerel prova hostları bu listede değildir; üretim hostu da
  yerel izin listesinde değildir (`great-reset-local-guard.ts`).

  Veritabanı düzeyindeki kimlik (sunucu adresi, sahip, sürüm, küme kimliği) bağlantıdan sonra
  repository katmanında ayrıca doğrulanır.
*/
export const productionResetIdentity = {
  hostname: "agent-sozluk-prod",
  databaseName: "agent_sozluk",
  owner: "agent_sozluk",
  clusterId: "7663503447447879713",
  envFile: "/opt/agent-sozluk/app/.env",
  releasesRoot: "/opt/agent-sozluk/runtime/releases",
} as const;

export type ProductionResetTarget = {
  databaseName: string;
  databaseUrl: string;
  controlUrl: string;
  releaseSha: string;
};

/*
  `.env` atamaları tırnak, çok satırlı tırnaklı değer ve satır sonu yorumu izlenerek sayılır:
  başka bir değerin içinde geçen `DATABASE_URL=` satırı atama değildir (Astra, PR #231 P2).
  Tam bir `DATABASE_URL` ataması şarttır; değer ayrıca `dotenv`'in çözümüyle birebir aynı
  olmalıdır, ki uygulama ile guard aynı credential'ı görsün. Biçim dışı satır varsa dosya
  bütünüyle reddedilir (fail-closed).
*/
function databaseUrlFromEnv(contents: string): string {
  const lines = contents.split(/\r?\n/u);
  const values: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (!line || line.startsWith("#")) continue;
    const assignment = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u.exec(line);
    if (!assignment) throw new Error("GREAT_RESET_PRODUCTION_DATABASE_URL_INVALID");
    const key = assignment[1]!;
    let rest = assignment[2]!;
    let value: string;
    const quote = rest[0];
    if (quote === '"' || quote === "'" || quote === "`") {
      let body = rest.slice(1);
      let close = body.indexOf(quote);
      while (close === -1) {
        index += 1;
        if (index >= lines.length) throw new Error("GREAT_RESET_PRODUCTION_DATABASE_URL_INVALID");
        body += `\n${lines[index]!}`;
        close = body.indexOf(quote);
      }
      value = body.slice(0, close);
      rest = body.slice(close + 1).trim();
      if (rest && !rest.startsWith("#"))
        throw new Error("GREAT_RESET_PRODUCTION_DATABASE_URL_INVALID");
    } else {
      value = rest.replace(/\s+#.*$/u, "").trim();
    }
    if (key === "DATABASE_URL") values.push(value);
  }
  if (values.length !== 1) throw new Error("GREAT_RESET_PRODUCTION_DATABASE_URL_INVALID");
  if (parseDotenv(contents).DATABASE_URL !== values[0])
    throw new Error("GREAT_RESET_PRODUCTION_DATABASE_URL_INVALID");
  return values[0]!;
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function productionResetTarget(input: {
  hostname: string;
  envFileContents: string;
  releaseDirectory: string;
  releaseShaFileContents: string;
}): ProductionResetTarget {
  const identity = productionResetIdentity;
  if (input.hostname !== identity.hostname) throw new Error("GREAT_RESET_PRODUCTION_HOST_REQUIRED");
  const releaseSha = input.releaseShaFileContents.trim();
  if (
    !/^[a-f0-9]{40}$/u.test(releaseSha) ||
    input.releaseDirectory !== `${identity.releasesRoot}/${releaseSha}`
  )
    throw new Error("GREAT_RESET_PRODUCTION_RELEASE_MISMATCH");
  let url: URL;
  try {
    url = new URL(databaseUrlFromEnv(input.envFileContents));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("GREAT_RESET_")) throw error;
    throw new Error("GREAT_RESET_PRODUCTION_DATABASE_URL_INVALID");
  }
  if (
    url.protocol !== "postgresql:" ||
    !url.hostname ||
    !/^[0-9]+$/u.test(url.port || "5432") ||
    safeDecode(url.username) !== identity.owner ||
    url.pathname !== `/${identity.databaseName}` ||
    url.search ||
    url.hash
  )
    throw new Error("GREAT_RESET_PRODUCTION_DATABASE_URL_INVALID");
  // Bağlantı sınırları kodda sabitlenir; operatör ayrı URL ya da parametre vermez.
  const target = new URL(url);
  target.searchParams.set("connection_limit", "1");
  target.searchParams.set("connect_timeout", "5");
  const control = new URL(target);
  control.pathname = "/postgres";
  return {
    databaseName: identity.databaseName,
    databaseUrl: target.toString(),
    controlUrl: control.toString(),
    releaseSha,
  };
}

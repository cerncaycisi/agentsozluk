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

function databaseUrlFromEnv(contents: string): string {
  const values = contents
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .filter((line) => /^(?:export\s+)?DATABASE_URL\s*=/u.test(line))
    .map((line) => line.replace(/^(?:export\s+)?DATABASE_URL\s*=\s*/u, ""));
  if (values.length !== 1) throw new Error("GREAT_RESET_PRODUCTION_DATABASE_URL_INVALID");
  const raw = values[0]!;
  const quoted = /^(["'])(.*)\1$/u.exec(raw);
  return quoted ? quoted[2]! : raw;
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
    decodeURIComponent(url.username) !== identity.owner ||
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

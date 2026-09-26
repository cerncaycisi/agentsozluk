const rehearsalMarker = "agentsozluk:great-reset:synthetic:v1";

/**
 * Yalnız bilinen prova makinelerindeki, bu prova için ayrılmış DB'ler. Her makine kendi
 * PostgreSQL küme kimliğine ve sahibine bağlı; üretim hostu (`agent-sozluk-prod`) bu listede
 * YOK ve olmayacak — üretim reset'i ayrı, onaylı bir profil ister.
 *
 * `agentic-server` (25 Eylül 2026): Mac'in yerini alan kişisel operatör sunucusu. Kullanıcı
 * dizinindeki PostgreSQL 16.14 prova kümesi yalnız 127.0.0.1:5432'yi dinler; gerçek boyutlu
 * prova için üretim yedeğinin kopyası buraya geri yüklenir.
 */
export const localResetIdentities = [
  {
    hostname: "MacBook-Pro-26.local",
    clusterId: "7663213515019154520",
    owner: "gokhannihalgul",
    marker: rehearsalMarker,
  },
  {
    hostname: "agentic-server",
    clusterId: "7689521646432264978",
    owner: "agent",
    marker: rehearsalMarker,
  },
] as const;

export type LocalResetIdentity = (typeof localResetIdentities)[number];

/** Geriye dönük uyumluluk: ilk (Mac) kimliği. Yeni kod `localResetIdentityFor` kullanmalı. */
export const localResetIdentity = localResetIdentities[0];

export function localResetIdentityFor(hostname: string): LocalResetIdentity {
  const identity = localResetIdentities.find((candidate) => candidate.hostname === hostname);
  if (!identity) throw new Error("GREAT_RESET_LOCAL_HOST_REQUIRED");
  return identity;
}

export function localResetTarget(value: string | undefined, hostname: string) {
  const identity = localResetIdentityFor(hostname);
  let url: URL;
  try {
    url = new URL(value ?? "");
  } catch {
    throw new Error("GREAT_RESET_INVALID_TARGET");
  }
  if (
    url.protocol !== "postgresql:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "5432" ||
    url.search ||
    url.hash ||
    url.username !== identity.owner ||
    !/^\/agent_sozluk_reset_rehearsal_[0-9]{14}_(source|restored|execution)_test$/u.test(
      url.pathname,
    )
  ) {
    throw new Error("GREAT_RESET_LOCAL_SYNTHETIC_TARGET_REQUIRED");
  }
  // Kullanıcı tarafından query parametresi yok; host/socket/schema yönlendirmesi yok.
  url.searchParams.set("connection_limit", "1");
  url.searchParams.set("connect_timeout", "5");
  return { databaseName: url.pathname.slice(1), databaseUrl: url.toString(), identity };
}

/*
  Namespace provası (üretim tasarımı v19): `--namespace <operationId> <releaseSha> <receiptSha256>`
  bayrağı niyet tüketimi, mezar taşı, RESTART ve commit işaretini aynı transaction'da çalıştırır.
  Biçim burada, anlam ve niyetin varlığı repository kapısında denetlenir.
*/
function takeNamespace(args: readonly string[]) {
  const index = args.indexOf("--namespace");
  if (index === -1) return { args, namespace: undefined };
  const [operationId, releaseSha, receiptSha256] = args.slice(index + 1, index + 4);
  if (
    !operationId ||
    !releaseSha ||
    !receiptSha256 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      operationId,
    ) ||
    !/^[a-f0-9]{40}$/u.test(releaseSha) ||
    !/^[a-f0-9]{64}$/u.test(receiptSha256) ||
    args.indexOf("--namespace", index + 1) !== -1
  )
    throw new Error("GREAT_RESET_INVALID_ARGUMENTS");
  return {
    args: [...args.slice(0, index), ...args.slice(index + 4)],
    namespace: { operationId, releaseSha, receiptSha256 },
  };
}

export function parseLocalResetArguments(input: readonly string[]) {
  const taken = takeNamespace(input);
  let args = taken.args;
  const namespaceOption = taken.namespace ? { namespace: taken.namespace } : {};
  const archiveOutbox = args.at(-1) === "--archive-outbox";
  if (archiveOutbox) args = args.slice(0, -1);
  if (!args.length || (args.length === 1 && args[0] === "--dry-run")) {
    return {
      mode: "DRY_RUN" as const,
      ...(archiveOutbox ? { archiveOutbox: true as const } : {}),
      ...namespaceOption,
    };
  }
  if (
    args.length === 5 &&
    args[0] === "--execute" &&
    args[1] === "--database" &&
    args[3] === "--plan-sha256" &&
    /^[a-f0-9]{64}$/u.test(args[4] ?? "")
  ) {
    return {
      mode: "EXECUTE" as const,
      databaseName: args[2]!,
      planSha256: args[4]!,
      ...(archiveOutbox ? { archiveOutbox: true as const } : {}),
      ...namespaceOption,
    };
  }
  throw new Error("GREAT_RESET_INVALID_ARGUMENTS");
}

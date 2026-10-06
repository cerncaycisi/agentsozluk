import { isIP } from "node:net";

export const productionResetIdentity = {
  hostname: "agent-sozluk-prod",
  databaseName: "agent_sozluk",
  owner: "agent_sozluk",
  clusterId: "7663503447447879713",
  databaseOid: "16385",
  port: 5432,
} as const;
export const resetScope = "ALL_DICTIONARY_AND_AGENT_STATE_KEEP_IDENTITIES_V1";
export const legacyPublicIdMaximum = 2147483647n;
export const resetPublicIdMinimum = 2147483648n;
export const resetPublicIdMaximum = 9007199254740991n;

export type ProductionResetInvocation = {
  hostname: string;
  cwd: string;
  releaseSha: string;
  approvedSha: string | undefined;
  databaseIp: string;
};

/** Saf hedef kapısı. Docker/host/artifact pinleri CLI tarafından ayrıca ölçülür. */
export function productionResetTarget(
  value: string | undefined,
  invocation: ProductionResetInvocation,
) {
  if (
    invocation.hostname !== productionResetIdentity.hostname ||
    !/^[a-f0-9]{40}$/u.test(invocation.releaseSha) ||
    invocation.approvedSha !== invocation.releaseSha ||
    invocation.cwd !== `/opt/agent-sozluk/runtime/releases/${invocation.releaseSha}`
  )
    throw new Error("GREAT_RESET_PRODUCTION_RELEASE_REQUIRED");
  // Yalnız pinli Docker inspect sonucu; loopback, public IP, IPv6 ve host adı alınmaz.
  if (
    isIP(invocation.databaseIp) !== 4 ||
    !/^172\.(1[6-9]|2[0-9]|3[01])\./u.test(invocation.databaseIp)
  )
    throw new Error("GREAT_RESET_PRODUCTION_DATABASE_IP_REQUIRED");
  let url: URL;
  try {
    url = new URL(value ?? "");
  } catch {
    throw new Error("GREAT_RESET_INVALID_TARGET");
  }
  if (
    url.protocol !== "postgresql:" ||
    url.hostname !== "db" ||
    url.port !== "5432" ||
    url.username !== productionResetIdentity.owner ||
    !url.password ||
    url.pathname !== "/agent_sozluk" ||
    url.search ||
    url.hash
  )
    throw new Error("GREAT_RESET_PRODUCTION_TARGET_REQUIRED");
  url.hostname = invocation.databaseIp;
  url.searchParams.set("connection_limit", "1");
  url.searchParams.set("connect_timeout", "5");
  const control = new URL(url);
  control.pathname = "/postgres";
  return {
    databaseName: productionResetIdentity.databaseName,
    databaseUrl: url.toString(),
    controlUrl: control.toString(),
    host: invocation.databaseIp,
    identity: productionResetIdentity,
    releaseSha: invocation.releaseSha,
  };
}

export function assertResetOperation(operationId: string): void {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(operationId))
    throw new Error("GREAT_RESET_OPERATION_REQUIRED");
}

/** Ayrı gerçek prova profili; eski local-only izin listesi değiştirilmez. */
export function rehearsalResetTarget(
  value: string | undefined,
  operationId: string,
  machine: string,
) {
  assertResetOperation(operationId);
  if (machine !== "agentic-server") throw new Error("GREAT_RESET_REHEARSAL_HOST_REQUIRED");
  let url: URL;
  try {
    url = new URL(value ?? "");
  } catch {
    throw new Error("GREAT_RESET_INVALID_TARGET");
  }
  const name = `agent_sozluk_reset_${operationId.replaceAll("-", "")}_test`;
  if (
    url.protocol !== "postgresql:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "5432" ||
    !["agent", "agent_sozluk"].includes(url.username) ||
    url.pathname !== `/${name}` ||
    url.search ||
    url.hash
  )
    throw new Error("GREAT_RESET_REHEARSAL_TARGET_REQUIRED");
  url.searchParams.set("connection_limit", "1");
  url.searchParams.set("connect_timeout", "5");
  const control = new URL(url);
  control.pathname = "/postgres";
  return {
    databaseName: name,
    databaseUrl: url.toString(),
    controlUrl: control.toString(),
    host: "127.0.0.1",
    identity: {
      hostname: machine,
      databaseName: name,
      owner: url.username,
      clusterId: "7689521646432264978",
      marker: `agentsozluk:production-reset-rehearsal:${operationId}`,
      port: 5432,
    },
  };
}

/** Aynı production cluster'da yalnız yeni, nonce'lu gölge; canonical URL aynen doğrulanır. */
export function productionShadowResetTarget(
  value: string | undefined,
  invocation: ProductionResetInvocation,
  operationId: string,
  expectedOid: string,
) {
  assertResetOperation(operationId);
  if (!/^[1-9][0-9]*$/u.test(expectedOid) || expectedOid === productionResetIdentity.databaseOid)
    throw new Error("GREAT_RESET_SHADOW_OID_REQUIRED");
  const source = productionResetTarget(value, invocation);
  const databaseName = `agent_sozluk_reset_${operationId.replaceAll("-", "")}_test`;
  const url = new URL(source.databaseUrl);
  url.pathname = `/${databaseName}`;
  return {
    databaseName,
    databaseUrl: url.toString(),
    controlUrl: source.controlUrl,
    host: source.host,
    identity: {
      hostname: productionResetIdentity.hostname,
      databaseName,
      owner: productionResetIdentity.owner,
      clusterId: productionResetIdentity.clusterId,
      marker: `agentsozluk:production-reset-shadow:${operationId}`,
      port: productionResetIdentity.port,
    },
    expectedOid,
  };
}

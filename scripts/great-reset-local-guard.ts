/** Yalnız bilinen Mac'teki, bu prova için ayrılmış sentetik DB'ler. */
export const localResetIdentity = {
  hostname: "MacBook-Pro-26.local",
  clusterId: "7663213515019154520",
  owner: "gokhannihalgul",
  marker: "agentsozluk:great-reset:synthetic:v1",
} as const;

export function localResetTarget(value: string | undefined, hostname: string) {
  if (hostname !== localResetIdentity.hostname) throw new Error("GREAT_RESET_LOCAL_HOST_REQUIRED");
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
    url.username !== localResetIdentity.owner ||
    !/^\/agent_sozluk_reset_rehearsal_[0-9]{14}_(source|restored|execution)_test$/u.test(
      url.pathname,
    )
  ) {
    throw new Error("GREAT_RESET_LOCAL_SYNTHETIC_TARGET_REQUIRED");
  }
  // Kullanıcı tarafından query parametresi yok; host/socket/schema yönlendirmesi yok.
  url.searchParams.set("connection_limit", "1");
  url.searchParams.set("connect_timeout", "5");
  return { databaseName: url.pathname.slice(1), databaseUrl: url.toString() };
}

export function parseLocalResetArguments(args: readonly string[]) {
  if (!args.length || (args.length === 1 && args[0] === "--dry-run")) {
    return { mode: "DRY_RUN" as const };
  }
  if (
    args.length === 5 &&
    args[0] === "--execute" &&
    args[1] === "--database" &&
    args[3] === "--plan-sha256" &&
    /^[a-f0-9]{64}$/u.test(args[4] ?? "")
  ) {
    return { mode: "EXECUTE" as const, databaseName: args[2]!, planSha256: args[4]! };
  }
  throw new Error("GREAT_RESET_INVALID_ARGUMENTS");
}

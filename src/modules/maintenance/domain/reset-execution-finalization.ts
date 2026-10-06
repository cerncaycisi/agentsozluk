export type ResetGateSessions = { others: number; pinned: number; prepared: number };
/** Yalnız açılışta eski backend'in asenkron ayrılması için sınırlı bekleme; kill/retry yok. */
export async function waitForResetGateSessions(
  read: () => Promise<ResetGateSessions | undefined>,
  allow: boolean,
  pinnedPid: number | null,
): Promise<void> {
  for (let attempt = 0; attempt < (allow ? 21 : 1); attempt++) {
    const sessions = await read();
    if (
      sessions &&
      sessions.others === 0 &&
      sessions.prepared === 0 &&
      (pinnedPid === null || sessions.pinned === 1)
    )
      return;
    if (!sessions || sessions.prepared !== 0 || !allow || attempt === 20)
      throw new Error("GREAT_RESET_CONTROL_CONNECTIONS_PRESENT");
    await new Promise<void>((resolve) => setTimeout(resolve, 250));
  }
}

/** Cleanup hatası doğrulanmış COMMIT sonucunu yutmaz; belirsiz işlem başarı sayılmaz. */
export async function finalizeResetExecution<T>(
  execute: () => Promise<T>,
  disconnect: () => Promise<void>,
  reopen: () => Promise<void>,
  disconnectControl: () => Promise<void>,
): Promise<{ result: T; connectionGate: "OPEN" | "CLOSED_UNCERTAIN" }> {
  let result!: T;
  let failed = false;
  let original: unknown;
  let connectionGate: "OPEN" | "CLOSED_UNCERTAIN" = "OPEN";
  try {
    result = await execute();
  } catch (error) {
    failed = true;
    original = error;
  }
  try {
    await disconnect();
    await reopen();
  } catch {
    connectionGate = "CLOSED_UNCERTAIN";
  } finally {
    try {
      await disconnectControl();
    } catch {
      connectionGate = "CLOSED_UNCERTAIN";
    }
  }
  if (failed) throw original;
  return { result, connectionGate };
}

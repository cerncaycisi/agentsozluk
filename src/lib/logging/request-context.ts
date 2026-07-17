import { AsyncLocalStorage } from "node:async_hooks";

interface RequestLogContext {
  actorId: string | null;
}

const requestLogStorage = new AsyncLocalStorage<RequestLogContext>();

export function withRequestLogContext<T>(work: () => Promise<T>): Promise<T> {
  return requestLogStorage.run({ actorId: null }, work);
}

export function setRequestActorId(actorId: string): void {
  const context = requestLogStorage.getStore();
  if (context) context.actorId = actorId;
}

export function getRequestActorId(): string | null {
  return requestLogStorage.getStore()?.actorId ?? null;
}

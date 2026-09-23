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

/**
 * Kimliği doğrulanmış sayılan aktörü geri alır.
 *
 * `requestSession` CSRF kontrolünden ÖNCE aktörü yazıyor. Bir uç, geçersiz
 * CSRF'i yutup isteği anonim olarak sürdürüyorsa istek logu da anonim
 * kalmalı; yoksa aynı işlem iki ayrı kimlikle kaydedilir (Sol, 22 Eylül).
 */
export function clearRequestActorId(): void {
  const context = requestLogStorage.getStore();
  if (context) context.actorId = null;
}

export function getRequestActorId(): string | null {
  return requestLogStorage.getStore()?.actorId ?? null;
}

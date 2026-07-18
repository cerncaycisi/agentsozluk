import { RuntimeProviderCancelledError, RuntimeProviderTimeoutError } from "@/runtime/provider";
import {
  RuntimeControlPlaneError,
  type RuntimeRequestOptions,
} from "@/runtime/control-plane-client";

type StopReason = { kind: "cancelled" } | { kind: "timeout" } | { kind: "failure"; error: unknown };

export class RuntimeRunDeadline {
  readonly #controller = new AbortController();
  readonly #deadlineAtMs: number;
  readonly #timer: NodeJS.Timeout | null;
  #stopReason: StopReason | null = null;

  constructor(startedAt: string | Date, timeoutSeconds: number) {
    const startedAtMs = startedAt instanceof Date ? startedAt.getTime() : Date.parse(startedAt);
    if (!Number.isFinite(startedAtMs) || !Number.isInteger(timeoutSeconds) || timeoutSeconds <= 0) {
      throw new TypeError("Runtime deadline girdisi geçersizdir.");
    }
    this.#deadlineAtMs = startedAtMs + timeoutSeconds * 1000;
    const remainingMs = this.#deadlineAtMs - Date.now();
    if (remainingMs <= 0) {
      this.#timer = null;
      this.requestTimeout();
    } else {
      this.#timer = setTimeout(() => this.requestTimeout(), remainingMs);
      this.#timer.unref();
    }
  }

  get signal(): AbortSignal {
    return this.#controller.signal;
  }

  get deadlineAt(): Date {
    return new Date(this.#deadlineAtMs);
  }

  requestCancel(): void {
    this.#stop({ kind: "cancelled" });
  }

  requestTimeout(): void {
    this.#stop({ kind: "timeout" });
  }

  recordFailure(error: unknown): void {
    this.#stop({ kind: "failure", error });
  }

  #stop(reason: StopReason): void {
    if (this.#stopReason) return;
    this.#stopReason = reason;
    this.#controller.abort();
  }

  remainingMs(): number {
    this.throwIfStopped();
    return Math.max(1, Math.ceil(this.#deadlineAtMs - Date.now()));
  }

  requestOptions(): RuntimeRequestOptions {
    return { signal: this.signal, timeoutMs: this.remainingMs() };
  }

  throwIfStopped(): void {
    if (!this.#stopReason && Date.now() >= this.#deadlineAtMs) this.requestTimeout();
    if (!this.#stopReason) return;
    if (this.#stopReason.kind === "timeout") throw new RuntimeProviderTimeoutError();
    if (this.#stopReason.kind === "cancelled") throw new RuntimeProviderCancelledError();
    throw this.#stopReason.error;
  }

  normalizeError(error: unknown): unknown {
    if (error instanceof RuntimeControlPlaneError) {
      if (error.code === "AGENT_RUN_DEADLINE_EXCEEDED") this.requestTimeout();
      if (error.code === "AGENT_RUN_CANCEL_REQUESTED") this.requestCancel();
    }
    try {
      this.throwIfStopped();
    } catch (stoppedError) {
      return stoppedError;
    }
    return error;
  }

  close(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#controller.abort();
  }
}

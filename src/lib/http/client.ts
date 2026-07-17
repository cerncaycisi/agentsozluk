"use client";

export class ClientApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly fieldErrors: Record<string, string[]> = {},
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ClientApiError";
  }
}

interface ApiEnvelope<T> {
  data: T;
  requestId: string;
}

interface ApiErrorEnvelope {
  error: {
    message: string;
    code: string;
    fieldErrors?: Record<string, string[]>;
    [key: string]: unknown;
  };
}

function clientApiError(error: ApiErrorEnvelope["error"]): ClientApiError {
  const { message, code, fieldErrors, ...details } = error;
  delete details.requestId;
  return new ClientApiError(message, code, fieldErrors ?? {}, details);
}

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
  const payload = (await response.json()) as ApiEnvelope<{ csrfToken: string }> | ApiErrorEnvelope;
  if (!response.ok || !("data" in payload)) {
    const error =
      "error" in payload
        ? payload.error
        : { message: "Güvenlik anahtarı alınamadı.", code: "CSRF_INVALID" };
    throw clientApiError(error);
  }
  return payload.data.csrfToken;
}

export async function apiRequest<T>(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    csrf?: boolean;
    idempotency?: boolean | string;
  } = {},
): Promise<T> {
  const headers = new Headers({ Accept: "application/json" });
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.csrf) headers.set("X-CSRF-Token", await csrfToken());
  if (options.idempotency) {
    headers.set(
      "Idempotency-Key",
      typeof options.idempotency === "string" ? options.idempotency : crypto.randomUUID(),
    );
  }
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    cache: "no-store",
  });
  const payload = (await response.json()) as ApiEnvelope<T> | ApiErrorEnvelope;
  if (!response.ok || !("data" in payload)) {
    const error =
      "error" in payload
        ? payload.error
        : { message: "İstek tamamlanamadı.", code: "INTERNAL_ERROR", fieldErrors: {} };
    throw clientApiError(error);
  }
  return payload.data;
}

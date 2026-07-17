import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import {
  applyAuthenticationCookieRenewal,
  withAuthenticationCookieContext,
} from "@/lib/auth/response-cookie-context";
import { AppError, validationError } from "@/lib/http/errors";
import { readJsonBody } from "@/lib/http/json-body";
import { requestIdFrom } from "@/lib/http/request";
import { logRequest, safeErrorCode } from "@/lib/logging/logger";
import { getRequestActorId, withRequestLogContext } from "@/lib/logging/request-context";

export interface ApiContext {
  requestId: string;
}

export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let value: unknown;
  try {
    value = await readJsonBody(request);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("VALIDATION_ERROR", 422, "Geçerli bir JSON gövdesi gönderin.");
  }
  const result = schema.safeParse(value);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

export function success<T>(data: T, context: ApiContext, status = 200): NextResponse {
  return NextResponse.json(
    { data, requestId: context.requestId },
    { status, headers: { "X-Request-Id": context.requestId } },
  );
}

export async function runApi(
  request: Request,
  handler: (context: ApiContext) => Promise<NextResponse>,
): Promise<NextResponse> {
  const requestId = requestIdFrom(request);
  const startedAt = Date.now();
  return withAuthenticationCookieContext(() =>
    withRequestLogContext(async () => {
      try {
        const response = await handler({ requestId });
        response.headers.set("X-Request-Id", requestId);
        applyAuthenticationCookieRenewal(response);
        logRequest({
          requestId,
          method: request.method,
          path: request.url,
          status: response.status,
          durationMs: Date.now() - startedAt,
          actorId: getRequestActorId(),
        });
        return response;
      } catch (error) {
        const known =
          error instanceof AppError
            ? error
            : error instanceof ZodError
              ? validationError(error)
              : new AppError("INTERNAL_ERROR", 500, "Beklenmeyen bir hata oluştu.");
        const response = NextResponse.json(
          {
            error: {
              code: known.code,
              message: known.message,
              ...(known.fieldErrors ? { fieldErrors: known.fieldErrors } : {}),
              ...(known.details ?? {}),
              requestId,
            },
          },
          { status: known.status, headers: { "X-Request-Id": requestId } },
        );
        for (const [key, value] of Object.entries(known.headers ?? {}))
          response.headers.set(key, value);
        applyAuthenticationCookieRenewal(response);
        logRequest({
          requestId,
          method: request.method,
          path: request.url,
          status: known.status,
          durationMs: Date.now() - startedAt,
          actorId: getRequestActorId(),
          errorCode: safeErrorCode(error),
        });
        return response;
      }
    }),
  );
}

export function successList<T>(
  data: T[],
  context: ApiContext,
  input: { page: number; pageSize: number; totalItems: number },
): NextResponse {
  const totalPages = Math.max(1, Math.ceil(input.totalItems / input.pageSize));
  return NextResponse.json(
    {
      data,
      meta: {
        page: input.page,
        pageSize: input.pageSize,
        totalItems: input.totalItems,
        totalPages,
        hasNextPage: input.page < totalPages,
        hasPreviousPage: input.page > 1,
      },
      requestId: context.requestId,
    },
    { headers: { "X-Request-Id": context.requestId } },
  );
}

import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AppError, validationError } from "@/lib/http/errors";
import { requestIdFrom } from "@/lib/http/request";

export interface ApiContext {
  requestId: string;
}

export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
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
  try {
    const response = await handler({ requestId });
    response.headers.set("X-Request-Id", requestId);
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
          requestId,
        },
      },
      { status: known.status, headers: { "X-Request-Id": requestId } },
    );
    for (const [key, value] of Object.entries(known.headers ?? {}))
      response.headers.set(key, value);
    return response;
  }
}

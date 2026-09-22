import type { NextRequest } from "next/server";
import { csrfSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { parseJson, runApi, success } from "@/lib/http/api";
import { AppError } from "@/lib/http/errors";
import { assertValidOrigin } from "@/lib/security/origin";
import { submitContactMessage } from "@/modules/contact/application/contact";
import { contactMessageCreateSchema } from "@/modules/contact/validation/schemas";
import { enforceRateLimit, requestIp } from "@/modules/rate-limit/application/rate-limit";

export const runtime = "nodejs";

/**
 * İletişim ve içerik kaldırma formu. Giriş gerektirmez: bir içeriğin
 * kaldırılmasını isteyen kişinin çoğu zaman hesabı yoktur.
 *
 * Gönderen kimliği yalnız oturum VE geçerli CSRF anahtarı varken kaydedilir;
 * aksi hâlde ileti anonim yazılır. Böylece başka bir siteden zorlanan bir
 * gönderim, oturumu açık bir yazarın adına kaydedilemez ama kullanıcıyı da
 * hata ekranına düşürmez.
 */
export function POST(request: NextRequest) {
  return runApi(request, async (context) => {
    assertValidOrigin(request);
    const input = await parseJson(request, contactMessageCreateSchema);
    const database = getDatabase();
    const ip = requestIp(request);
    await enforceRateLimit(database, `iletisim:${ip}`, {
      action: "contact:ip",
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    const session = await csrfSession(request).catch((error: unknown) => {
      if (error instanceof AppError) return null;
      throw error;
    });
    const result = await submitContactMessage(database, input, {
      ip,
      submitterId: session?.userId ?? null,
      requestId: context.requestId,
    });
    return success({ message: { id: result.id, createdAt: result.createdAt } }, context, 201);
  });
}

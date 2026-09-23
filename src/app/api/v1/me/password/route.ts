import type { NextRequest } from "next/server";
import { setAuthenticationCookies } from "@/lib/auth/cookies";
import { csrfSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { parseJson, runApi, success } from "@/lib/http/api";
import { requestIp } from "@/modules/rate-limit/application/rate-limit";
import { changePassword } from "@/modules/auth/application/accounts";
import { passwordChangeSchema } from "@/modules/auth/validation/schemas";

export const runtime = "nodejs";

export function POST(request: NextRequest) {
  return runApi(request, async (context) => {
    // Süre uzatılmaz: bu istek yenileme kaydetseydi, eşzamanlı ikinci bir şifre
    // isteğinin hata yanıtı iptal edilmiş eski token'ı yeni cookie'nin üstüne
    // yazabilirdi (Astra, F06).
    const session = await csrfSession(request, { extendExpiration: false });
    const input = await parseJson(request, passwordChangeSchema);
    // Mevcut oturum da yenilenir (F06): yanıt yeni oturum ve CSRF cookie'lerini taşır.
    const issued = await changePassword(
      getDatabase(),
      session.userId,
      session.id,
      input,
      context.requestId,
      { userAgent: request.headers.get("user-agent"), ip: requestIp(request) },
    );
    const response = success(
      { changed: true, otherSessionsRevoked: true, sessionRotated: true },
      context,
    );
    setAuthenticationCookies(response, issued);
    return response;
  });
}

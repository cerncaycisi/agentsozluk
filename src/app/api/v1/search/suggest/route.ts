import { NextResponse, type NextRequest } from "next/server";
import { optionalRequestSession } from "@/lib/auth/request-session";
import { getDatabase } from "@/lib/db/client";
import { runApi } from "@/lib/http/api";
import {
  enforceRateLimit,
  ipRateLimitIdentifier,
  RATE_LIMIT_RULES,
  requestIp,
  userRateLimitIdentifier,
} from "@/modules/rate-limit/application/rate-limit";
import { normalizeSuggestQuery, searchSuggestions } from "@/modules/search/application/suggest";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  return runApi(request, async (context) => {
    const database = getDatabase();
    const url = new URL(request.url);
    const query = normalizeSuggestQuery(url.searchParams.get("q") ?? "");
    // `/ara` sayfasındaki desen: veritabanına gidilmeyen kısa sorgu kotayı yakmaz.
    // Limit aşımında `enforceRateLimit` AppError("RATE_LIMITED", 429) fırlatır ve
    // `runApi` bunu 500 değil 429 olarak yanıtlar.
    const session = query.length >= 2 ? await optionalRequestSession(request) : null;
    if (query.length >= 2) {
      await enforceRateLimit(
        database,
        session
          ? userRateLimitIdentifier(session.userId)
          : ipRateLimitIdentifier(requestIp(request)),
        session ? RATE_LIMIT_RULES.searchAuthenticated : RATE_LIMIT_RULES.searchVisitor,
      );
    }
    const suggestions = await searchSuggestions(database, { query });
    return NextResponse.json(suggestions, {
      headers: {
        // Gövde kullanıcıya özel değildir, ancak oturumlu istekte `runApi` oturum
        // çerezini yenileyebilir; paylaşımlı önbelleğin Set-Cookie saklamaması için
        // oturum varken `private` kullanılır.
        "Cache-Control": session ? "private, max-age=30" : "public, max-age=30",
        Vary: "Cookie",
        "X-Request-Id": context.requestId,
      },
    });
  });
}

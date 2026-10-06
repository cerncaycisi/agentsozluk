import { NextResponse, type NextRequest } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { resetGoneCandidate } from "@/modules/maintenance/domain/reset-gone";
import { getResetGoneDecision } from "@/modules/maintenance/application/reset-gone";
import {
  resetBoundaryContentSecurityPolicy,
  resetBoundaryPage,
} from "@/modules/maintenance/domain/reset-boundary-page";
import {
  PRODUCT_ANALYTICS_SURFACE_HEADER,
  SENSITIVE_LOCATION_HEADER,
  SYNTHETIC_ANALYTICS_OPTOUT_HEADER,
  classifyProductAnalyticsSurface,
  isSensitiveAnalyticsLocation,
} from "@/lib/analytics/product-analytics";
import { createContentSecurityPolicy } from "@/lib/security/content-security-policy";

function resetBoundaryResponse(method: string, status: 410 | 503) {
  return new NextResponse(method === "HEAD" ? null : resetBoundaryPage(status), {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      "Content-Security-Policy": resetBoundaryContentSecurityPolicy,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...(status === 503 ? { "Retry-After": "60" } : {}),
    },
  });
}

export async function middleware(request: NextRequest) {
  const candidate = resetGoneCandidate(request.method, request.nextUrl.pathname);
  if (candidate) {
    try {
      if ((await getResetGoneDecision(getDatabase(), candidate)) === "GONE")
        return resetBoundaryResponse(request.method, 410);
    } catch {
      // DB hatası silinmiş içerik kanıtı değildir; raw SQL/hata/credential çıktısı yok.
      return resetBoundaryResponse(request.method, 503);
    }
  }
  // Dar permalink matcher prefetch'i de görür; normal prefetch'e CSP/analytics eklemeyiz.
  if (request.headers.has("next-router-prefetch") || request.headers.get("purpose") === "prefetch")
    return NextResponse.next();
  const nonce = btoa(crypto.randomUUID());
  const contentSecurityPolicy = createContentSecurityPolicy(
    nonce,
    process.env.NODE_ENV === "development",
  );
  const requestHeaders = new Headers(request.headers);
  const analyticsSurface = classifyProductAnalyticsSurface({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    doNotTrack: request.headers.get("dnt") === "1",
    globalPrivacyControl: request.headers.get("sec-gpc") === "1",
    syntheticSmoke: request.headers.get(SYNTHETIC_ANALYTICS_OPTOUT_HEADER) === "1",
  });
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(PRODUCT_ANALYTICS_SURFACE_HEADER, analyticsSurface);
  requestHeaders.set(
    SENSITIVE_LOCATION_HEADER,
    isSensitiveAnalyticsLocation(request.nextUrl.pathname, request.nextUrl.search) ? "1" : "0",
  );
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return response;
}

export const config = {
  runtime: "nodejs",
  matcher: [
    "/baslik/:segment",
    "/entry/:segment",
    {
      source: "/((?!api/health|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

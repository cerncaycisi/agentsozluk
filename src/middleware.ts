import { NextResponse, type NextRequest } from "next/server";
import { getDatabase } from "@/lib/db/client";
import {
  PRODUCT_ANALYTICS_SURFACE_HEADER,
  SENSITIVE_LOCATION_HEADER,
  SYNTHETIC_ANALYTICS_OPTOUT_HEADER,
  classifyProductAnalyticsSurface,
  isSensitiveAnalyticsLocation,
} from "@/lib/analytics/product-analytics";
import { logger, safeErrorCode } from "@/lib/logging/logger";
import {
  goneResponse,
  isPrefetchRequest,
  removedContentCandidate,
  removedContentUnavailableResponse,
} from "@/lib/routing/removed-content-gate";
import { createContentSecurityPolicy } from "@/lib/security/content-security-policy";
import { decideRemovedContent } from "@/modules/maintenance/application/removed-content";

export async function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const contentSecurityPolicy = createContentSecurityPolicy(
    nonce,
    process.env.NODE_ENV === "development",
  );

  /*
    Great reset 410 kapısı (tasarım v18 madde 4). Aday yalnız sözdiziminden seçilir; aday
    olmayan istek veritabanına dokunmaz. Commit işareti yoksa, canlı kayıt varsa ya da kimlik
    mezar taşında değilse normal akış sürer. Sorgu hatasında 410 uydurulmaz.
  */
  const candidate = removedContentCandidate(request.method, request.nextUrl.pathname);
  if (candidate) {
    try {
      const decision = await decideRemovedContent(
        getDatabase(),
        candidate.kind,
        candidate.reference,
      );
      if (decision.status === "GONE") return goneResponse(request.method, contentSecurityPolicy);
    } catch (error) {
      logger.error(
        { event: "removed_content.decision_failed", errorCode: safeErrorCode(error) },
        "Removed content decision failed",
      );
      return removedContentUnavailableResponse(request.method, contentSecurityPolicy);
    }
  }
  // Prefetch'te yalnız 410 kararı çalışır; normal yanıtın CSP/analytics davranışı değişmez.
  if (isPrefetchRequest(request.headers)) return NextResponse.next();

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
  // Veritabanı kararı için Node runtime (Next.js 15.5 kararlı); Edge'de Prisma çalışmaz.
  runtime: "nodejs",
  matcher: [
    {
      source: "/((?!api/health|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    // İkinci, dar eşleşme: eski içerik adresleri prefetch'te de 410 kararından geçer.
    { source: "/baslik/:segment" },
    { source: "/entry/:segment" },
  ],
};

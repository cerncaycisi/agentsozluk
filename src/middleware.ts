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

    Prefetch istekleri eskisi gibi middleware'e hiç uğramaz (matcher `missing`). Next adaptörü
    `next-router-prefetch` başlığını middleware'den önce sildiği için middleware prefetch'i ayırt
    edemez; dar bir prefetch matcher'ı prefetch yanıtına CSP/analytics eklerdi (Astra, PR #229).
    Silinmiş adrese tıklamak prefetch değil RSC navigasyonudur: 410 alır, yanıt RSC olmadığı
    için istemci tam sayfa gezinmesine düşer ve 410 sayfası görünür.
  */
  const candidate = removedContentCandidate(request.method, request.nextUrl.pathname);
  if (candidate) {
    try {
      const database = getDatabase();
      const decision = await decideRemovedContent(database, candidate.kind, candidate.reference);
      const alternate =
        decision.status === "GONE" && candidate.alternate
          ? await decideRemovedContent(database, candidate.kind, candidate.alternate)
          : null;
      const alternateIsLive = alternate?.status === "PASS" && alternate.reason === "LIVE";
      if (decision.status === "GONE" && !alternateIsLive)
        return goneResponse(request.method, contentSecurityPolicy);
    } catch (error) {
      logger.error(
        { event: "removed_content.decision_failed", errorCode: safeErrorCode(error) },
        "Removed content decision failed",
      );
      return removedContentUnavailableResponse(request.method, contentSecurityPolicy);
    }
  }
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
  ],
};

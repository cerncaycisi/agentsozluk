import { NextResponse, type NextRequest } from "next/server";
import {
  PRODUCT_ANALYTICS_SURFACE_HEADER,
  SYNTHETIC_ANALYTICS_OPTOUT_HEADER,
  classifyProductAnalyticsSurface,
} from "@/lib/analytics/product-analytics";
import { createContentSecurityPolicy } from "@/lib/security/content-security-policy";

export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const contentSecurityPolicy = createContentSecurityPolicy(
    nonce,
    process.env.NODE_ENV === "development",
  );
  const requestHeaders = new Headers(request.headers);
  const analyticsSurface = classifyProductAnalyticsSurface({
    pathname: request.nextUrl.pathname,
    doNotTrack: request.headers.get("dnt") === "1",
    globalPrivacyControl: request.headers.get("sec-gpc") === "1",
    syntheticSmoke: request.headers.get(SYNTHETIC_ANALYTICS_OPTOUT_HEADER) === "1",
  });
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(PRODUCT_ANALYTICS_SURFACE_HEADER, analyticsSurface);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return response;
}

export const config = {
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

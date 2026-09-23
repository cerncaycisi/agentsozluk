import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import {
  PRODUCT_ANALYTICS_SURFACE_HEADER,
  SENSITIVE_LOCATION_HEADER,
  classifyProductAnalyticsSurface,
  shouldLoadProductAnalytics,
} from "@/lib/analytics/product-analytics";
import { middleware } from "@/middleware";

function istekBasligi(url: string, ad: string): string | null {
  // Middleware'in yönlendirdiği istek başlıkları yanıtta `x-middleware-request-*` olarak durur.
  return middleware(new NextRequest(url)).headers.get(`x-middleware-request-${ad}`);
}

function kaynakDosyalari(kok: string): string[] {
  return readdirSync(kok).flatMap((ad) => {
    const tam = path.join(kok, ad);
    if (statSync(tam).isDirectory()) return kaynakDosyalari(tam);
    return /\.(ts|tsx)$/u.test(ad) ? [tam] : [];
  });
}

const productionSite = { nodeEnv: "production", appUrl: "https://agentsozluk.com" };

describe("product analytics traffic policy", () => {
  it("measures ordinary anonymous public traffic", () => {
    const surface = classifyProductAnalyticsSurface({
      pathname: "/baslik/gitar--42",
      search: "",
      doNotTrack: false,
      globalPrivacyControl: false,
      syntheticSmoke: false,
    });

    expect(surface).toBe("PUBLIC");
    expect(shouldLoadProductAnalytics({ ...productionSite, authenticated: false, surface })).toBe(
      true,
    );
  });

  it.each(["/giris", "/kayit", "/ara", "/ayarlar/guvenlik", "/moderasyon/agentlar", "/baslik/ac"])(
    "never measures the sensitive surface %s",
    (pathname) => {
      const surface = classifyProductAnalyticsSurface({
        pathname,
        search: "",
        doNotTrack: false,
        globalPrivacyControl: false,
        syntheticSmoke: false,
      });

      expect(surface).toBe("SENSITIVE");
      expect(shouldLoadProductAnalytics({ ...productionSite, authenticated: false, surface })).toBe(
        false,
      );
    },
  );

  /*
    A1 (22 Eylül): başlık içi arama herkese açık bir yolda koşar. Sınıflandırıcı yol
    ile sorguyu birlikte alır; "arama sayfalarında ölçüm yapılmaz" sözü onu da kapsar.
  */
  it.each([
    ["/ara", "?q=gitar"],
    ["/ara", ""],
    ["/baslik/gitar--42", "?q=akor"],
    ["/baslik/gitar--42", "?page=2&q=akor"],
    ["/baslik/gitar--42", "?q="],
    ["/entry/42", "?q=x"],
  ])("never measures a search location %s%s", (pathname, search) => {
    const surface = classifyProductAnalyticsSurface({
      pathname,
      search,
      doNotTrack: false,
      globalPrivacyControl: false,
      syntheticSmoke: false,
    });
    expect(surface).toBe("SENSITIVE");
    expect(shouldLoadProductAnalytics({ ...productionSite, authenticated: false, surface })).toBe(
      false,
    );
  });

  it("keeps a topic page without a search query measurable", () => {
    for (const search of ["", "?page=2", "?sort=newest"]) {
      expect(
        classifyProductAnalyticsSurface({
          pathname: "/baslik/gitar--42",
          search,
          doNotTrack: false,
          globalPrivacyControl: false,
          syntheticSmoke: false,
        }),
        search,
      ).toBe("PUBLIC");
    }
  });

  it("lets DNT/GPC win over a search location as well", () => {
    for (const signals of [
      { doNotTrack: true, globalPrivacyControl: false },
      { doNotTrack: false, globalPrivacyControl: true },
    ]) {
      expect(
        classifyProductAnalyticsSurface({
          pathname: "/baslik/gitar--42",
          search: "?q=akor",
          syntheticSmoke: false,
          ...signals,
        }),
      ).toBe("PRIVACY_OPTOUT");
    }
  });

  it("never measures an authenticated session, including operator sessions", () => {
    expect(
      shouldLoadProductAnalytics({ ...productionSite, authenticated: true, surface: "PUBLIC" }),
    ).toBe(false);
  });

  it("keeps public entry revision history in the anonymous measurement surface", () => {
    const surface = classifyProductAnalyticsSurface({
      pathname: "/entry/42/revizyonlar",
      search: "",
      doNotTrack: false,
      globalPrivacyControl: false,
      syntheticSmoke: false,
    });

    expect(surface).toBe("PUBLIC");
    expect(shouldLoadProductAnalytics({ ...productionSite, authenticated: false, surface })).toBe(
      true,
    );
  });

  it.each([
    { doNotTrack: true, globalPrivacyControl: false, syntheticSmoke: false },
    { doNotTrack: false, globalPrivacyControl: true, syntheticSmoke: false },
    { doNotTrack: false, globalPrivacyControl: false, syntheticSmoke: true },
  ])("honors privacy and synthetic opt-out signals", (signals) => {
    const surface = classifyProductAnalyticsSurface({ pathname: "/son", search: "", ...signals });

    expect(surface).toBe("PRIVACY_OPTOUT");
    expect(shouldLoadProductAnalytics({ ...productionSite, authenticated: false, surface })).toBe(
      false,
    );
  });

  it("fails closed when middleware did not classify the request", () => {
    expect(
      shouldLoadProductAnalytics({ ...productionSite, authenticated: false, surface: null }),
    ).toBe(false);
  });

  it.each(["development", "test", undefined])("does not measure the %s environment", (nodeEnv) => {
    expect(
      shouldLoadProductAnalytics({
        ...productionSite,
        nodeEnv,
        authenticated: false,
        surface: "PUBLIC",
      }),
    ).toBe(false);
  });

  it.each([
    "http://127.0.0.1:3000",
    "http://localhost:3188",
    "http://[::1]:3000",
    "https://staging.agentsozluk.com",
    "https://agentsozluk.com.example.org",
    "http://agentsozluk.com",
    "https://agentsozluk.com:444",
    "invalid",
    undefined,
  ])("does not measure production builds configured for %s", (appUrl) => {
    expect(
      shouldLoadProductAnalytics({
        ...productionSite,
        appUrl,
        authenticated: false,
        surface: "PUBLIC",
      }),
    ).toBe(false);
  });

  it("accepts the production origin with a trailing slash", () => {
    expect(
      shouldLoadProductAnalytics({
        ...productionSite,
        appUrl: "https://agentsozluk.com/",
        authenticated: false,
        surface: "PUBLIC",
      }),
    ).toBe(true);
  });

  describe("A1 — sunucu ve kaynak koruması", () => {
    it("tam GET yüklemesinde (form gönderimi) middleware başlık içi aramayı hassas sınıflar", () => {
      const arama = "https://agentsozluk.com/baslik/gitar--42?q=akor";
      expect(istekBasligi(arama, PRODUCT_ANALYTICS_SURFACE_HEADER)).toBe("SENSITIVE");
      expect(istekBasligi(arama, SENSITIVE_LOCATION_HEADER)).toBe("1");
      const sayfa = "https://agentsozluk.com/baslik/gitar--42?page=2";
      expect(istekBasligi(sayfa, PRODUCT_ANALYTICS_SURFACE_HEADER)).toBe("PUBLIC");
      expect(istekBasligi(sayfa, SENSITIVE_LOCATION_HEADER)).toBe("0");
    });

    it("kaynakta doğrudan programatik gezinme yok; hepsi navigateWithinApp'ten geçer", () => {
      /*
        GTM'in geçmiş dinleyicisi `router.push`/`history.pushState` ile yapılan
        gezinmeyi istemci yeniden yüklemeden ÖNCE görebilir (Astra, A1). Hedefin
        nasıl kurulduğundan bağımsız koruma için bütün programatik gezinmeler
        hedefi çalışma anında sınıflandıran `navigateWithinApp`'ten geçer. Bu test,
        `useRouter()`'dan alınan HER adla (takma ad, yapı bozma, zincir) doğrudan
        push/replace'i ve History API'yi yasaklar.
      */
      const yardimci = path.join("src", "lib", "navigation", "app-navigation.ts");
      const ihlaller: string[] = [];
      for (const dosya of kaynakDosyalari(path.join(process.cwd(), "src"))) {
        if (dosya.endsWith(yardimci)) continue;
        const kaynak = readFileSync(dosya, "utf8");
        if (/history\s*\.\s*(push|replace)State\s*\(/u.test(kaynak)) {
          ihlaller.push(`${dosya}: History API`);
        }
        if (/useRouter\(\)\s*\.\s*(push|replace)\b/u.test(kaynak)) {
          ihlaller.push(`${dosya}: useRouter().push/replace`);
        }
        if (/\{[^}]*\b(push|replace)\b[^}]*\}\s*=\s*useRouter\s*\(/u.test(kaynak)) {
          ihlaller.push(`${dosya}: useRouter yapı bozma ile push/replace`);
        }
        for (const [, ad] of kaynak.matchAll(
          /\b(?:const|let|var)\s+(\w+)\s*=\s*useRouter\s*\(/gu,
        )) {
          if (new RegExp(`\\b${ad}\\s*\\.\\s*(push|replace)\\s*\\(`, "u").test(kaynak)) {
            ihlaller.push(`${dosya}: ${ad}.push/replace`);
          }
        }
      }
      expect(ihlaller).toEqual([]);
    });
  });
});

// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { navigateWithinApp, useAppRouter } from "@/lib/navigation/app-navigation";

const gtm = vi.hoisted(() => ({ yuklendi: true }));
vi.mock("@/lib/analytics/gtm-state", () => ({ gtmYuklendiMi: () => gtm.yuklendi }));

const nextRouter = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nextRouter }));

const assign = vi.fn();
const replace = vi.fn();

function konumuAyarla(yol: string) {
  const url = new URL(yol, "https://agentsozluk.com");
  vi.stubGlobal("location", {
    ...window.location,
    href: url.href,
    origin: url.origin,
    pathname: url.pathname,
    search: url.search,
    assign,
    replace,
  });
}

beforeEach(() => {
  gtm.yuklendi = true;
  assign.mockReset();
  replace.mockReset();
  nextRouter.push.mockReset();
  nextRouter.replace.mockReset();
  nextRouter.refresh.mockReset();
  konumuAyarla("/son");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const hassasHedefler: Array<[string, () => string]> = [
  [
    "değişkende kurulmuş başlık içi arama",
    () => `/baslik/x?${new URLSearchParams({ q: "gizli" })}`,
  ],
  ["genel arama", () => "/ara?q=gizli"],
  ["giriş", () => "/giris"],
  ["moderasyon", () => "/moderasyon/agentlar/1"],
];

describe("navigateWithinApp (A1)", () => {
  it("herkese açık hedefe istemci içi gezinir", () => {
    const router = { push: vi.fn(), replace: vi.fn() };
    navigateWithinApp(router, "/baslik/gitar--42");
    navigateWithinApp(router, "/", "replace");
    expect(router.push).toHaveBeenCalledWith("/baslik/gitar--42");
    expect(router.replace).toHaveBeenCalledWith("/");
    expect(assign).not.toHaveBeenCalled();
  });

  it.each(hassasHedefler)("GTM yüklü belgede hassas hedefi (%s) tam yükler", (_ad, hedef) => {
    const router = { push: vi.fn(), replace: vi.fn() };
    navigateWithinApp(router, hedef());
    expect(router.push).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledTimes(1);
    navigateWithinApp(router, hedef(), "replace");
    expect(router.replace).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it.each(hassasHedefler)(
    "herkese açık belgeden hassas hedefe (%s) GTM henüz yüklenmemişken de tam yükler",
    (_ad, hedef) => {
      // Gezinme beklerken onay verilip GTM açılabilir (Astra, A1 4. tur).
      gtm.yuklendi = false;
      const router = { push: vi.fn(), replace: vi.fn() };
      navigateWithinApp(router, hedef());
      expect(router.push).not.toHaveBeenCalled();
      expect(assign).toHaveBeenCalledTimes(1);
    },
  );

  it.each(hassasHedefler)(
    "zaten hassas, GTM'siz belgeden hassas hedefe (%s) istemci içi gezinir; bildirim kaybolmaz",
    (_ad, hedef) => {
      gtm.yuklendi = false;
      konumuAyarla("/moderasyon/agentlar/1/duzenle");
      const router = { push: vi.fn(), replace: vi.fn() };
      navigateWithinApp(router, hedef());
      expect(router.push).toHaveBeenCalledWith(hedef());
      expect(assign).not.toHaveBeenCalled();
    },
  );

  it("hassas belgede GTM yüklüyse (geçiş anı) yine tam yükler", () => {
    gtm.yuklendi = true;
    konumuAyarla("/ara?q=eski");
    const router = { push: vi.fn(), replace: vi.fn() };
    navigateWithinApp(router, "/ara?q=yeni");
    expect(router.push).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it("başka kökene GTM olsun olmasın istemci içi gezinmez", () => {
    for (const yuklendi of [true, false]) {
      gtm.yuklendi = yuklendi;
      const router = { push: vi.fn(), replace: vi.fn() };
      navigateWithinApp(router, "https://baska.example/x");
      expect(router.push).not.toHaveBeenCalled();
    }
    expect(assign).toHaveBeenCalledTimes(2);
  });
});

describe("useAppRouter (A1)", () => {
  it("push/replace korumadan geçer, refresh aynen iletilir, nesne kararlıdır", () => {
    const { result, rerender } = renderHook(() => useAppRouter());
    const ilk = result.current;
    rerender();
    expect(result.current).toBe(ilk);

    result.current.push("/ara?q=gizli");
    expect(nextRouter.push).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith("https://agentsozluk.com/ara?q=gizli");

    result.current.replace("/baslik/gitar--42");
    expect(nextRouter.replace).toHaveBeenCalledWith("/baslik/gitar--42");

    result.current.refresh();
    expect(nextRouter.refresh).toHaveBeenCalledTimes(1);
  });
});

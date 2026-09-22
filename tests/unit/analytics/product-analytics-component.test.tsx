// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PropsWithChildren, ScriptHTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
  Çerez onayı (22 Eylül 2026). Sol'un bulguları burada sabitleniyor: istemci
  tarafında yüzey/DNT/GPC yeniden değerlendirilir; GTM yüklü belgede hassas
  adrese geçiş tam yüklemeye döner ve GTM'e görünmez; sıfırlama ve geri tuşu
  önbelleği sayfayı yeniden yükler.
*/

const yol = vi.hoisted(() => ({ ad: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => yol.ad }));

vi.mock("next/script", () => ({
  default: (
    props: PropsWithChildren<ScriptHTMLAttributes<HTMLScriptElement> & { strategy?: string }>,
  ) => {
    const scriptProps = { ...props };
    delete scriptProps.strategy;
    delete scriptProps.children;
    return <script {...scriptProps}>{props.children}</script>;
  },
}));

const ADI = "as_cerez_onayi";
const reload = vi.fn();
const assign = vi.fn();
const asilPushState = window.history.pushState;
const asilReplaceState = window.history.replaceState;

function cerezleriTemizle() {
  for (const parca of document.cookie.split(";")) {
    const ad = parca.split("=")[0]?.trim();
    if (ad) document.cookie = `${ad}=; Path=/; Max-Age=0`;
  }
}

async function bilesen() {
  vi.resetModules();
  return import("@/components/analytics/product-analytics");
}

beforeEach(() => {
  cerezleriTemizle();
  yol.ad = "/";
  reload.mockReset();
  assign.mockReset();
  vi.stubGlobal("location", {
    ...window.location,
    href: "https://agentsozluk.com/",
    hostname: "agentsozluk.com",
    protocol: "http:", // jsdom http://localhost: Secure çerez yazılamaz
    pathname: "/",
    reload,
    assign,
  });
  Object.defineProperty(navigator, "doNotTrack", { value: null, configurable: true });
  window.history.pushState = asilPushState;
  window.history.replaceState = asilReplaceState;
});

afterEach(() => {
  cleanup();
  cerezleriTemizle();
  vi.unstubAllGlobals();
  window.history.pushState = asilPushState;
  window.history.replaceState = asilReplaceState;
});

describe("ProductAnalytics — çerez onayı", () => {
  it("uygun olmayan trafikte ne şerit ne etiket çizer", async () => {
    const { ProductAnalytics } = await bilesen();
    const { container } = render(<ProductAnalytics enabled={false} nonce="n" />);
    expect(container.innerHTML).toBe("");
  });

  it("onay yokken yalnız şerit çizer; ölçüm etiketi YÜKLENMEZ", async () => {
    const { ProductAnalytics } = await bilesen();
    const { container } = render(<ProductAnalytics enabled nonce="n" />);
    expect(screen.getByRole("region", { name: "Çerez tercihi" })).toBeVisible();
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain("GTM-MTGXSB7H");
  });

  it("Kabul et: çerez yazılır ve GTM yüklenir; Hotjar ve noscript yoktur", async () => {
    const { ProductAnalytics } = await bilesen();
    const { container } = render(<ProductAnalytics enabled nonce="n" />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Kabul et" }));
    });
    expect(document.cookie).toContain(`${ADI}=kabul`);
    const script = container.querySelector("script#google-tag-manager");
    expect(script?.textContent).toContain("GTM-MTGXSB7H");
    expect(script?.getAttribute("nonce")).toBe("n");
    expect(container.innerHTML).not.toMatch(/hotjar|6753780/iu);
    expect(container.querySelector("noscript, iframe")).toBeNull();
  });

  it("Reddet: çerez yazılır, etiket yüklenmez ve şerit kapanır", async () => {
    const { ProductAnalytics } = await bilesen();
    const { container } = render(<ProductAnalytics enabled nonce="n" />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Reddet" }));
    });
    expect(document.cookie).toContain(`${ADI}=red`);
    expect(container.innerHTML).toBe("");
  });

  it("tanınmayan çerez değeri onay sayılmaz", async () => {
    const { ProductAnalytics } = await bilesen();
    document.cookie = `${ADI}=evet; Path=/`;
    const { container } = render(<ProductAnalytics enabled nonce="n" />);
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByRole("region", { name: "Çerez tercihi" })).toBeVisible();
  });

  it("sayfa içi gezinmeyle hassas yüzeye gelindiyse şerit çıkmaz, onay alınmaz", async () => {
    const { ProductAnalytics } = await bilesen();
    yol.ad = "/giris";
    const { container } = render(<ProductAnalytics enabled nonce="n" />);
    expect(container.innerHTML).toBe("");
  });

  it("tarayıcı Do Not Track bildiriyorsa şerit çıkmaz", async () => {
    const { ProductAnalytics } = await bilesen();
    Object.defineProperty(navigator, "doNotTrack", { value: "1", configurable: true });
    const { container } = render(<ProductAnalytics enabled nonce="n" />);
    expect(container.innerHTML).toBe("");
  });

  it("GTM yüklü belgede hassas adrese pushState tam yüklemeye döner; iç zincire ulaşmaz", async () => {
    const { ProductAnalytics } = await bilesen();
    const ic = vi.fn();
    window.history.pushState = ic;
    document.cookie = `${ADI}=kabul; Path=/`;
    render(<ProductAnalytics enabled nonce="n" />);

    window.history.pushState({}, "", "/ara?q=gizli");
    expect(assign).toHaveBeenCalledWith("/ara?q=gizli");
    expect(ic).not.toHaveBeenCalled();

    window.history.pushState({}, "", "/entry/1");
    expect(ic).toHaveBeenCalledTimes(1);
  });

  it("GTM sonradan kendi sarmalayıcısını eklese de koruma en dışa geri döner", async () => {
    vi.useFakeTimers();
    try {
      const { ProductAnalytics } = await bilesen();
      document.cookie = `${ADI}=kabul; Path=/`;
      render(<ProductAnalytics enabled nonce="n" />);
      const bizim = window.history.pushState;
      const gtmIci = vi.fn();
      window.history.pushState = gtmIci; // GTM'in sarmalayıcısı gibi
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(window.history.pushState).toBe(bizim);
      window.history.pushState({}, "", "/moderasyon");
      expect(assign).toHaveBeenCalledWith("/moderasyon");
      expect(gtmIci).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("GTM yüklüyken adres hassas yüzeye döndüyse sayfa yeniden yüklenir", async () => {
    const { ProductAnalytics } = await bilesen();
    document.cookie = `${ADI}=kabul; Path=/`;
    const { rerender } = render(<ProductAnalytics enabled nonce="n" />);
    yol.ad = "/ayarlar";
    rerender(<ProductAnalytics enabled nonce="n" />);
    expect(reload).toHaveBeenCalled();
  });

  it("geri tuşu önbelleğinden dönüşte onay silinmişse sayfa yeniden yüklenir", async () => {
    const { ProductAnalytics } = await bilesen();
    document.cookie = `${ADI}=kabul; Path=/`;
    render(<ProductAnalytics enabled nonce="n" />);
    cerezleriTemizle();
    const olay = new Event("pageshow") as PageTransitionEvent;
    Object.defineProperty(olay, "persisted", { value: true });
    window.dispatchEvent(olay);
    expect(reload).toHaveBeenCalled();
  });

  it("sıfırlama tercih ve GA çerezlerini siler, sayfayı yeniden yükler", async () => {
    const { cerezTercihiniSifirla } = await bilesen();
    document.cookie = `${ADI}=kabul; Path=/`;
    document.cookie = "_ga=GA1.1.1; Path=/";
    document.cookie = "_ga_ABC=GS1.1; Path=/";
    cerezTercihiniSifirla();
    expect(document.cookie).not.toContain(`${ADI}=`);
    expect(document.cookie).not.toContain("_ga");
    expect(reload).toHaveBeenCalled();
  });

  it("gizlilik sayfasındaki düğme sıfırlamayı çağırır", async () => {
    vi.resetModules();
    const { CerezTercihiSifirla } = await import("@/components/analytics/cerez-tercihi-sifirla");
    document.cookie = `${ADI}=kabul; Path=/`;
    render(<CerezTercihiSifirla />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Çerez tercihimi sıfırla" }));
    });
    expect(document.cookie).not.toContain(`${ADI}=`);
    expect(reload).toHaveBeenCalled();
  });
});

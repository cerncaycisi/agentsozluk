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

const yol = vi.hoisted(() => ({ ad: "/", sorgu: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => yol.ad,
  useSearchParams: () => new URLSearchParams(yol.sorgu),
}));

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
  yol.sorgu = "";
  reload.mockReset();
  assign.mockReset();
  vi.stubGlobal("location", {
    ...window.location,
    href: "https://agentsozluk.com/",
    hostname: "agentsozluk.com",
    protocol: "http:", // jsdom http://localhost: Secure çerez yazılamaz
    pathname: "/",
    search: "",
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
    const serit = screen.getByRole("region", { name: "Çerez tercihi" });
    expect(serit).toBeVisible();
    // Opak arka plan: sitenin RGB üçlüsü değişkenleriyle çalışan sınıf (saydam kalmasın).
    expect(serit.className).toContain("bg-surface");
    expect(serit.className).not.toMatch(/bg-\[var\(/u);
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain("GTM-MTGXSB7H");
    expect(container.innerHTML).not.toContain("6753780");
    expect(container.querySelector("#hotjar-tracking")).toBeNull();
  });

  it("Kabul et: çerez yazılır, GTM ve Hotjar yüklenir; noscript yoktur", async () => {
    const { ProductAnalytics } = await bilesen();
    const { container } = render(<ProductAnalytics enabled nonce="n" />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Kabul et" }));
    });
    expect(document.cookie).toContain(`${ADI}=kabul-v2`);
    const script = container.querySelector("script#google-tag-manager");
    expect(script?.textContent).toContain("GTM-MTGXSB7H");
    expect(script?.getAttribute("nonce")).toBe("n");
    const hotjar = container.querySelector("script#hotjar-tracking");
    expect(hotjar?.textContent).toContain("6753780");
    expect(hotjar?.getAttribute("nonce")).toBe("n");
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

  it("eski sürüm (yalnız GA4'ü kapsayan) kabul yeni kapsama onay sayılmaz; şerit yeniden sorar", async () => {
    const { ProductAnalytics } = await bilesen();
    document.cookie = `${ADI}=kabul; Path=/`;
    const { container } = render(<ProductAnalytics enabled nonce="n" />);
    expect(screen.getByRole("region", { name: "Çerez tercihi" })).toBeVisible();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("#hotjar-tracking")).toBeNull();
  });

  it("eski sürümdeki ret korunur", async () => {
    const { ProductAnalytics } = await bilesen();
    document.cookie = `${ADI}=red; Path=/`;
    const { container } = render(<ProductAnalytics enabled nonce="n" />);
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

  it("GTM yüklü belgede hassas bağlantı tıklaması tam yüklemeye döner; Next'e ulaşmaz", async () => {
    const { ProductAnalytics } = await bilesen();
    document.cookie = `${ADI}=kabul-v2; Path=/`;
    render(<ProductAnalytics enabled nonce="n" />);
    const nextLink = vi.fn();
    const gtmBelge = vi.fn();
    const gtmBelgeYakalama = vi.fn();
    const govde = document.createElement("div");
    govde.innerHTML = '<a href="/ara?q=gizli"><span>ara</span></a><a href="/entry/1">entry</a>';
    govde.addEventListener("click", nextLink); // Next Link/React kök dinleyicisi gibi
    // GTM'in aynı `document` üzerindeki dinleyicileri (hem kabarcık hem yakalama).
    document.addEventListener("click", gtmBelge);
    document.addEventListener("click", gtmBelgeYakalama, true);
    // GTM bizden SONRA `window` yakalama aşamasına da kaydolabilir.
    const gtmPencere = vi.fn();
    window.addEventListener("click", gtmPencere, true);
    document.body.append(govde);
    try {
      fireEvent.click(govde.querySelector("span")!);
      expect(assign).toHaveBeenCalledWith(expect.stringMatching(/\/ara\?q=gizli$/u));
      expect(nextLink).not.toHaveBeenCalled();
      expect(gtmBelge).not.toHaveBeenCalled();
      expect(gtmBelgeYakalama).not.toHaveBeenCalled();
      expect(gtmPencere).not.toHaveBeenCalled();

      fireEvent.click(govde.querySelectorAll("a")[1]!);
      expect(assign).toHaveBeenCalledTimes(1);
      expect(nextLink).toHaveBeenCalledTimes(1);
      expect(gtmBelge).toHaveBeenCalledTimes(1);

      // Yeni sekme / değiştirici tuşlar tarayıcıya bırakılır.
      fireEvent.click(govde.querySelector("a")!, { ctrlKey: true });
      expect(assign).toHaveBeenCalledTimes(1);
    } finally {
      govde.remove();
      document.removeEventListener("click", gtmBelge);
      document.removeEventListener("click", gtmBelgeYakalama, true);
      window.removeEventListener("click", gtmPencere, true);
    }
  });

  it("geri/ileri hassas girdiye dönerse GTM'in geçmiş dinleyicisi susturulur ve yeniden yüklenir", async () => {
    const { ProductAnalytics } = await bilesen();
    document.cookie = `${ADI}=kabul-v2; Path=/`;
    render(<ProductAnalytics enabled nonce="n" />);
    const gtmGecmis = vi.fn(); // GTM sonradan kaydolur
    window.addEventListener("popstate", gtmGecmis);
    try {
      vi.stubGlobal("location", { ...window.location, pathname: "/giris", reload, assign });
      window.dispatchEvent(new PopStateEvent("popstate"));
      expect(reload).toHaveBeenCalled();
      expect(gtmGecmis).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("popstate", gtmGecmis);
    }
  });

  it("onay yokken tıklamalara dokunulmaz", async () => {
    const { ProductAnalytics } = await bilesen();
    render(<ProductAnalytics enabled nonce="n" />);
    const baglanti = document.createElement("a");
    baglanti.href = "/giris";
    document.body.append(baglanti);
    try {
      fireEvent.click(baglanti);
      expect(assign).not.toHaveBeenCalled();
    } finally {
      baglanti.remove();
    }
  });

  it("History API sarmalanmaz; GTM'in kendi sarmalayıcısıyla döngü kurulamaz", async () => {
    const { ProductAnalytics } = await bilesen();
    document.cookie = `${ADI}=kabul-v2; Path=/`;
    const once = window.history.pushState;
    render(<ProductAnalytics enabled nonce="n" />);
    expect(window.history.pushState).toBe(once);
  });

  it("herkese açıktan hassasa geçerken şerit AYNI render'da kaybolur", async () => {
    const { ProductAnalytics } = await bilesen();
    const { container, rerender } = render(<ProductAnalytics enabled nonce="n" />);
    expect(screen.getByRole("region", { name: "Çerez tercihi" })).toBeVisible();
    yol.ad = "/giris";
    rerender(<ProductAnalytics enabled nonce="n" />);
    expect(container.innerHTML).toBe("");
  });

  it("onay başka sekmede geri çekildiyse sekmeye dönüşte sayfa yeniden yüklenir", async () => {
    const { ProductAnalytics } = await bilesen();
    document.cookie = `${ADI}=kabul-v2; Path=/`;
    render(<ProductAnalytics enabled nonce="n" />);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(reload).not.toHaveBeenCalled();
    cerezleriTemizle();
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(reload).toHaveBeenCalled();
  });

  it("onay geri çekildiyse sonraki herkese açık sayfa değişiminde de yeniden yüklenir", async () => {
    const { ProductAnalytics } = await bilesen();
    document.cookie = `${ADI}=kabul-v2; Path=/`;
    const { rerender } = render(<ProductAnalytics enabled nonce="n" />);
    cerezleriTemizle();
    yol.ad = "/entry/2";
    rerender(<ProductAnalytics enabled nonce="n" />);
    expect(reload).toHaveBeenCalled();
  });

  it("GTM yüklüyken adres hassas yüzeye döndüyse sayfa yeniden yüklenir", async () => {
    const { ProductAnalytics } = await bilesen();
    document.cookie = `${ADI}=kabul-v2; Path=/`;
    const { rerender } = render(<ProductAnalytics enabled nonce="n" />);
    yol.ad = "/ayarlar";
    rerender(<ProductAnalytics enabled nonce="n" />);
    expect(reload).toHaveBeenCalled();
  });

  it("geri tuşu önbelleğinden dönüşte onay silinmişse sayfa yeniden yüklenir", async () => {
    const { ProductAnalytics } = await bilesen();
    document.cookie = `${ADI}=kabul-v2; Path=/`;
    render(<ProductAnalytics enabled nonce="n" />);
    cerezleriTemizle();
    const olay = new Event("pageshow") as PageTransitionEvent;
    Object.defineProperty(olay, "persisted", { value: true });
    window.dispatchEvent(olay);
    expect(reload).toHaveBeenCalled();
  });

  it("sıfırlama tercih, GA ve Hotjar çerezlerini siler, sayfayı yeniden yükler", async () => {
    const { cerezTercihiniSifirla } = await bilesen();
    document.cookie = `${ADI}=kabul-v2; Path=/`;
    document.cookie = "_ga=GA1.1.1; Path=/";
    document.cookie = "_ga_ABC=GS1.1; Path=/";
    document.cookie = "_hjSessionUser_6753780=x; Path=/";
    cerezTercihiniSifirla();
    expect(document.cookie).not.toContain(`${ADI}=`);
    expect(document.cookie).not.toContain("_ga");
    expect(document.cookie).not.toContain("_hj");
    expect(reload).toHaveBeenCalled();
  });

  it("gizlilik sayfasındaki düğme sıfırlamayı çağırır", async () => {
    vi.resetModules();
    const { CerezTercihiSifirla } = await import("@/components/analytics/cerez-tercihi-sifirla");
    document.cookie = `${ADI}=kabul-v2; Path=/`;
    render(<CerezTercihiSifirla />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Çerez tercihimi sıfırla" }));
    });
    expect(document.cookie).not.toContain(`${ADI}=`);
    expect(reload).toHaveBeenCalled();
  });

  describe("A1 — çapraz matris: onay × konum × gizlilik sinyali", () => {
    const konumlar = [
      { ad: "genel arama", yol: "/ara", sorgu: "q=gitar", hassas: true },
      { ad: "başlık içi arama", yol: "/baslik/gitar--42", sorgu: "q=akor", hassas: true },
      { ad: "başlık sayfası", yol: "/baslik/gitar--42", sorgu: "", hassas: false },
    ];
    const onaylar = [
      { ad: "onaysız", cerez: null },
      { ad: "onaylı", cerez: "kabul-v2" },
    ];
    const sinyaller = [
      { ad: "sinyal yok", dnt: null, gpc: undefined },
      { ad: "DNT", dnt: "1", gpc: undefined },
      { ad: "GPC", dnt: null, gpc: true },
    ];
    const vakalar = konumlar.flatMap((konum) =>
      onaylar.flatMap((onay) => sinyaller.map((sinyal) => ({ konum, onay, sinyal }))),
    );

    it.each(vakalar)("$konum.ad × $onay.ad × $sinyal.ad", async ({ konum, onay, sinyal }) => {
      const { ProductAnalytics } = await bilesen();
      if (onay.cerez) document.cookie = `${ADI}=${onay.cerez}; Path=/`;
      Object.defineProperty(navigator, "doNotTrack", { value: sinyal.dnt, configurable: true });
      Object.defineProperty(navigator, "globalPrivacyControl", {
        value: sinyal.gpc,
        configurable: true,
      });
      yol.ad = konum.yol;
      yol.sorgu = konum.sorgu;
      try {
        const { container } = render(<ProductAnalytics enabled nonce="n" />);
        const acik = !konum.hassas && sinyal.dnt === null && sinyal.gpc === undefined;
        const gtm = container.querySelector("script#google-tag-manager") !== null;
        const serit = container.querySelector('[role="region"]') !== null;
        expect(gtm).toBe(acik && onay.cerez === "kabul-v2");
        expect(serit).toBe(acik && onay.cerez === null);
      } finally {
        Object.defineProperty(navigator, "globalPrivacyControl", {
          value: undefined,
          configurable: true,
        });
      }
    });
  });

  describe("A1 — hassas konumdan çıkış sorguyu referrer ile taşımaz", () => {
    it("hassas konumda belge referrer politikası origin, herkese açıkta varsayılan", async () => {
      const { ProductAnalytics } = await bilesen();
      yol.ad = "/baslik/gitar--42";
      yol.sorgu = "q=akor";
      const { rerender } = render(<ProductAnalytics enabled nonce="n" />);
      const etiket = () =>
        document.head.querySelector<HTMLMetaElement>('meta[name="referrer"]')?.content;
      expect(etiket()).toBe("origin");
      yol.sorgu = "";
      rerender(<ProductAnalytics enabled nonce="n" />);
      expect(etiket()).toBe("strict-origin-when-cross-origin");
      yol.ad = "/giris";
      rerender(<ProductAnalytics enabled={false} nonce="n" />);
      // Ölçüm kapalı olsa bile (oturum, DNT) politika uygulanır.
      expect(etiket()).toBe("origin");
      document.head.querySelector('meta[name="referrer"]')?.remove();
    });
  });

  describe("A1 — başlık içi arama ölçülmez", () => {
    it.each([
      ["onaysız", null],
      ["onaylı", "kabul-v2"],
    ])("%s ziyaretçide başlık içi aramada şerit de etiket de yok", async (_ad, onay) => {
      const { ProductAnalytics } = await bilesen();
      if (onay) document.cookie = `${ADI}=${onay}; Path=/`;
      yol.ad = "/baslik/gitar--42";
      yol.sorgu = "q=akor";
      const { container } = render(<ProductAnalytics enabled nonce="n" />);
      expect(container.innerHTML).toBe("");
    });

    it("yalnız sorgusu değişen istemci içi gezinmede GTM yüklü belge yeniden yüklenir", async () => {
      const { ProductAnalytics } = await bilesen();
      document.cookie = `${ADI}=kabul-v2; Path=/`;
      yol.ad = "/baslik/gitar--42";
      const { container, rerender } = render(<ProductAnalytics enabled nonce="n" />);
      expect(container.querySelector("script#google-tag-manager")).not.toBeNull();
      expect(reload).not.toHaveBeenCalled();
      yol.sorgu = "q=akor&page=2";
      rerender(<ProductAnalytics enabled nonce="n" />);
      expect(reload).toHaveBeenCalled();
      expect(container.querySelector("script#google-tag-manager")).toBeNull();
    });

    it("GTM yüklü belgede başlık içi arama bağlantısı tam yüklemeye döner", async () => {
      const { ProductAnalytics } = await bilesen();
      document.cookie = `${ADI}=kabul-v2; Path=/`;
      yol.ad = "/baslik/gitar--42";
      render(<ProductAnalytics enabled nonce="n" />);
      const baglanti = document.createElement("a");
      baglanti.href = "/baslik/gitar--42?q=akor&page=2";
      document.body.append(baglanti);
      try {
        fireEvent.click(baglanti);
        expect(assign).toHaveBeenCalledWith(
          expect.stringMatching(/\/baslik\/gitar--42\?q=akor&page=2$/u),
        );
      } finally {
        baglanti.remove();
      }
    });

    it("geri/ileri başlık içi arama girdisine dönerse yeniden yüklenir", async () => {
      const { ProductAnalytics } = await bilesen();
      document.cookie = `${ADI}=kabul-v2; Path=/`;
      yol.ad = "/baslik/gitar--42";
      render(<ProductAnalytics enabled nonce="n" />);
      vi.stubGlobal("location", {
        ...window.location,
        pathname: "/baslik/gitar--42",
        search: "?q=akor",
        reload,
        assign,
      });
      window.dispatchEvent(new PopStateEvent("popstate"));
      expect(reload).toHaveBeenCalled();
    });

    it("tarayıcı GPC bildiriyorsa başlık sayfasında da şerit çıkmaz", async () => {
      const { ProductAnalytics } = await bilesen();
      Object.defineProperty(navigator, "globalPrivacyControl", { value: true, configurable: true });
      try {
        yol.ad = "/baslik/gitar--42";
        const { container } = render(<ProductAnalytics enabled nonce="n" />);
        expect(container.innerHTML).toBe("");
      } finally {
        Object.defineProperty(navigator, "globalPrivacyControl", {
          value: undefined,
          configurable: true,
        });
      }
    });
  });
});

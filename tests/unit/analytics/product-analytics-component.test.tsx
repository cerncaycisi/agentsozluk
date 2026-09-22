// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PropsWithChildren, ScriptHTMLAttributes } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CerezTercihiSifirla } from "@/components/analytics/cerez-tercihi-sifirla";
import { CEREZ_ONAYI_ADI, ProductAnalytics } from "@/components/analytics/product-analytics";

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

function cerezleriTemizle() {
  for (const parca of document.cookie.split(";")) {
    const ad = parca.split("=")[0]?.trim();
    if (ad) document.cookie = `${ad}=; Path=/; Max-Age=0`;
  }
}

beforeEach(cerezleriTemizle);
afterEach(() => {
  cleanup();
  cerezleriTemizle();
});

describe("ProductAnalytics — çerez onayı", () => {
  it("uygun olmayan trafikte ne şerit ne etiket çizer", () => {
    const { container } = render(<ProductAnalytics enabled={false} nonce="n" />);
    expect(container.innerHTML).toBe("");
  });

  it("onay yokken yalnız şerit çizer; ölçüm etiketi YÜKLENMEZ", () => {
    const { container } = render(<ProductAnalytics enabled nonce="n" />);
    expect(screen.getByRole("region", { name: "Çerez tercihi" })).toBeVisible();
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain("GTM-MTGXSB7H");
  });

  it("Kabul et: çerez yazılır ve GTM yüklenir; Hotjar yoktur", () => {
    const { container } = render(<ProductAnalytics enabled nonce="n" />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Kabul et" }));
    });
    expect(document.cookie).toContain(`${CEREZ_ONAYI_ADI}=kabul`);
    const script = container.querySelector("script#google-tag-manager");
    expect(script?.textContent).toContain("GTM-MTGXSB7H");
    expect(script?.getAttribute("nonce")).toBe("n");
    expect(container.innerHTML).not.toMatch(/hotjar|6753780/iu);
    expect(container.querySelector("noscript, iframe")).toBeNull();
    expect(screen.queryByRole("region", { name: "Çerez tercihi" })).toBeNull();
  });

  it("Reddet: çerez yazılır, etiket yüklenmez ve şerit kapanır", () => {
    const { container } = render(<ProductAnalytics enabled nonce="n" />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Reddet" }));
    });
    expect(document.cookie).toContain(`${CEREZ_ONAYI_ADI}=red`);
    expect(container.innerHTML).toBe("");
  });

  it("önceki tercih hatırlanır: kabul → etiket, red → hiçbir şey", () => {
    document.cookie = `${CEREZ_ONAYI_ADI}=kabul; Path=/`;
    const kabul = render(<ProductAnalytics enabled nonce="n" />);
    expect(kabul.container.querySelector("script#google-tag-manager")).not.toBeNull();
    kabul.unmount();

    document.cookie = `${CEREZ_ONAYI_ADI}=red; Path=/`;
    const red = render(<ProductAnalytics enabled nonce="n" />);
    expect(red.container.innerHTML).toBe("");
  });

  it("tanınmayan çerez değeri onay sayılmaz", () => {
    document.cookie = `${CEREZ_ONAYI_ADI}=evet; Path=/`;
    const { container } = render(<ProductAnalytics enabled nonce="n" />);
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByRole("region", { name: "Çerez tercihi" })).toBeVisible();
  });

  it("gizlilik sayfasındaki düğme tercihi siler", () => {
    document.cookie = `${CEREZ_ONAYI_ADI}=kabul; Path=/`;
    render(<CerezTercihiSifirla />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Çerez tercihimi sıfırla" }));
    });
    expect(document.cookie).not.toContain(`${CEREZ_ONAYI_ADI}=`);
    expect(screen.getByRole("status")).toHaveTextContent("yeniden sorulacak");
  });
});

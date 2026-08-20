// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeSettings } from "@/components/account/theme-settings";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { applyPreference } from "@/lib/theme/preference";

/** İşletim sistemi temasını taklit eder ve `change` dinleyicisini elde tutar. */
function stubSystemTheme(dark: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    matches: dark,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(media));
  return {
    change(nextDark: boolean) {
      media.matches = nextDark;
      act(() => {
        for (const listener of listeners) listener();
      });
    },
  };
}

function readThemeCookie() {
  return document.cookie
    .split("; ")
    .find((part) => part.startsWith("ajan_theme="))
    ?.slice("ajan_theme=".length);
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.cookie = "ajan_theme=; Path=/; Max-Age=0; SameSite=Lax";
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("tema düğmesi", () => {
  it("seçim yokken işletim sistemi temasını gösterir", async () => {
    stubSystemTheme(true);
    render(<ThemeToggle />);
    const button = await screen.findByRole("button", { name: "Koyu tema" });
    // Koyu sistemde düğme basılı görünür; hiçbir kayıt yazılmamıştır.
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(window.localStorage.getItem("ajan_theme")).toBeNull();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("açık sistemde güneş durumunda başlar ve tıklamayla koyuya sabitlenir", async () => {
    stubSystemTheme(false);
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const button = await screen.findByRole("button", { name: "Koyu tema" });
    expect(button).toHaveAttribute("aria-pressed", "false");

    await user.click(button);

    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("ajan_theme")).toBe("dark");
    expect(readThemeCookie()).toBe("dark");
  });

  it("sisteme bağlıyken işletim sistemi değişimini izler, seçim yapılınca izlemez", async () => {
    const system = stubSystemTheme(false);
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const button = await screen.findByRole("button", { name: "Koyu tema" });

    system.change(true);
    expect(button).toHaveAttribute("aria-pressed", "true");

    // Artık açık tema açıkça seçildi: sistem koyuya dönse de değişmemeli.
    await user.click(button);
    expect(button).toHaveAttribute("aria-pressed", "false");
    system.change(true);
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("düğmede yalnız iki durum var: üçüncü bir sistem ikonu döngüde yok", async () => {
    stubSystemTheme(false);
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const button = await screen.findByRole("button", { name: "Koyu tema" });

    await user.click(button);
    await user.click(button);

    // İki tıklama başa döndürür; hiçbir adımda "sistem" durumuna düşmez.
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(window.localStorage.getItem("ajan_theme")).toBe("light");
  });
});

describe("ayarlardaki tema tercihi", () => {
  it("sistem seçeneği attribute'u, localStorage'ı ve cookie'yi birden temizler", async () => {
    stubSystemTheme(true);
    const user = userEvent.setup();
    applyPreference("light");
    expect(window.localStorage.getItem("ajan_theme")).toBe("light");
    expect(readThemeCookie()).toBe("light");

    render(<ThemeSettings />);
    await user.click(await screen.findByRole("radio", { name: /Sistem temasını takip et/u }));

    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(window.localStorage.getItem("ajan_theme")).toBeNull();
    expect(readThemeCookie()).toBeUndefined();
  });

  it("sisteme dönüldüğünde hangi temanın geçerli olduğunu söyler", async () => {
    stubSystemTheme(true);
    const user = userEvent.setup();
    render(<ThemeSettings />);

    await user.click(await screen.findByRole("radio", { name: /Her zaman açık/u }));
    expect(screen.getByRole("status")).toHaveTextContent("sizin seçiminiz geçerli: açık tema");

    await user.click(screen.getByRole("radio", { name: /Sistem temasını takip et/u }));
    expect(screen.getByRole("status")).toHaveTextContent("sistem ayarı geçerli: koyu tema");
  });
});

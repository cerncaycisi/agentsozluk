// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { navigateWithinApp } from "@/lib/navigation/app-navigation";

const assign = vi.fn();
const replace = vi.fn();

beforeEach(() => {
  assign.mockReset();
  replace.mockReset();
  vi.stubGlobal("location", {
    ...window.location,
    href: "https://agentsozluk.com/son",
    origin: "https://agentsozluk.com",
    assign,
    replace,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("navigateWithinApp (A1)", () => {
  it("herkese açık hedefe istemci içi gezinir", () => {
    const router = { push: vi.fn(), replace: vi.fn() };
    navigateWithinApp(router, "/baslik/gitar--42");
    navigateWithinApp(router, "/", "replace");
    expect(router.push).toHaveBeenCalledWith("/baslik/gitar--42");
    expect(router.replace).toHaveBeenCalledWith("/");
    expect(assign).not.toHaveBeenCalled();
  });

  it.each([
    [
      "değişkende kurulmuş başlık içi arama",
      () => `/baslik/x?${new URLSearchParams({ q: "gizli" })}`,
    ],
    ["genel arama", () => "/ara?q=gizli"],
    ["giriş", () => "/giris"],
    ["moderasyon", () => "/moderasyon/agentlar/1"],
  ])("hassas hedefi (%s) tam sayfa yüklemesiyle açar", (_ad, hedef) => {
    const router = { push: vi.fn(), replace: vi.fn() };
    navigateWithinApp(router, hedef());
    expect(router.push).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledTimes(1);
    navigateWithinApp(router, hedef(), "replace");
    expect(router.replace).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("başka kökene istemci içi gezinmez", () => {
    const router = { push: vi.fn(), replace: vi.fn() };
    navigateWithinApp(router, "https://baska.example/x");
    expect(router.push).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith("https://baska.example/x");
  });
});

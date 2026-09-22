// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
  Moderasyon kuyruğu ziyaretçinin yazdığı metni ve adresi çiziyor. Buradaki
  soru tek: kullanıcı metni HTML'e dönüşüyor mu, ve site dışına çıkan bir
  adres bağlantı olarak çiziliyor mu (Sol'un test boşluğu bulgusu, 22 Eylül).
*/
const iletiler = vi.hoisted(() => ({ liste: [] as unknown[], toplam: 0 }));

vi.mock("@/lib/auth/server-session", () => ({
  requireModerationPage: async () => ({
    userId: "22222222-2222-4222-8222-222222222222",
    user: { kind: "HUMAN", role: "MODERATOR" },
  }),
  withModerationCapability: async (load: () => Promise<unknown>) => load(),
}));
vi.mock("@/lib/db/client", () => ({ getDatabase: () => ({}) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/moderasyon/iletisim",
}));
vi.mock("@/modules/contact/application/contact", () => ({
  getContactMessages: async () => [iletiler.liste, iletiler.toplam],
}));

const { default: ContactMessagesPage } = await import("@/app/moderasyon/iletisim/page");

function ileti(overrides: Record<string, unknown> = {}) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    kind: "CONTENT_REMOVAL",
    subjectUrl: "/entry/42",
    message: "Adım geçiyor, kaldırın.",
    replyEmail: null,
    status: "OPEN",
    handledAt: null,
    handledNote: null,
    createdAt: new Date("2026-09-22T10:00:00.000Z"),
    handledBy: null,
    submitter: null,
    ...overrides,
  };
}

afterEach(cleanup);

describe("moderasyon iletişim kuyruğu", () => {
  it("kullanıcı metnini HTML'e çevirmeden, düz metin olarak çizer", async () => {
    iletiler.liste = [ileti({ message: "<img src=x onerror=alert(1)> kaldırın" })];
    iletiler.toplam = 1;
    const { container } = render(await ContactMessagesPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText(/<img src=x onerror=alert\(1\)> kaldırın/u)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("site dışına çıkan adresi bağlantı yapmaz", async () => {
    iletiler.liste = [ileti({ subjectUrl: "//baska-site.example/phish" })];
    iletiler.toplam = 1;
    const { container } = render(await ContactMessagesPage({ searchParams: Promise.resolve({}) }));
    const disari = [...container.querySelectorAll("a")].filter((link) =>
      (link.getAttribute("href") ?? "").includes("baska-site.example"),
    );
    expect(disari).toHaveLength(0);
    // Adres bağlantıya dönmeyince listede "—" ile gösteriliyor.
    expect(container.textContent).not.toContain("baska-site.example");
  });

  it("site içi adresi bağlantı olarak çizer", async () => {
    iletiler.liste = [ileti({ subjectUrl: "/baslik/agent-sozluk" })];
    iletiler.toplam = 1;
    const { container } = render(await ContactMessagesPage({ searchParams: Promise.resolve({}) }));
    expect(
      [...container.querySelectorAll("a")].some(
        (link) => link.getAttribute("href") === "/baslik/agent-sozluk",
      ),
    ).toBe(true);
  });
});

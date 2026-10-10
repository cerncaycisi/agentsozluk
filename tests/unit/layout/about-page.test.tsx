// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AboutPage, { metadata } from "@/app/hakkinda/page";

afterEach(cleanup);

vi.mock("@/lib/db/client", () => ({ getDatabase: () => ({}) }));
vi.mock("@/modules/entries/application/entries", () => ({
  getEntryReferenceIndex: async () => ({}),
}));

describe("about page public writer disclosure", () => {
  it("describes the site as an artificial writer community without a human writer promise (G1/K9)", async () => {
    render(await AboutPage());

    expect(screen.getByRole("heading", { level: 2, name: "Yazar topluluğu" })).toBeInTheDocument();
    expect(
      screen.getByText(/tamamına yakını, platformun yönettiği yapay yazarlara aittir/u),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/yeni yazar alımı kapalı; üye olanlar okur olarak/u),
    ).toBeInTheDocument();
    expect(screen.queryByText(/insan yazarlarla birlikte/u)).toBeNull();
    expect(metadata.description).toContain("kendi karakterleri olan yapay yazarların");
    expect(metadata.description).not.toContain("insanlarla");
  });

  it("explains the constitution and post-publication moderation model", async () => {
    render(await AboutPage());

    expect(
      screen.getByRole("heading", { level: 2, name: "Anayasa ve ardıl moderasyon" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/yayımlanmadan önce moderatör onayına alınmaz/u)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Yürürlükteki Agent Sözlük Anayasası’nı oku" }),
    ).toHaveAttribute("href", "/kurallar");
  });

  it("gives an operator imprint under a pseudonym and a contact/removal path", async () => {
    render(await AboutPage());

    expect(
      screen.getByRole("heading", { level: 2, name: "Künye ve iletişim" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/“Agent Sözlük” takma adıyla işletilen/u)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "iletişim ve içerik kaldırma formunu" }),
    ).toHaveAttribute("href", "/iletisim");
  });
});

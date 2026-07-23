// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AboutPage, { metadata } from "@/app/hakkinda/page";

afterEach(cleanup);

describe("about page public writer disclosure", () => {
  it("discloses managed artificial writers without splitting the public flow", () => {
    render(<AboutPage />);

    expect(screen.getByRole("heading", { level: 2, name: "Yazar topluluğu" })).toBeInTheDocument();
    expect(screen.getByText(/platform tarafından yönetilen yapay yazarlar/u)).toBeInTheDocument();
    expect(screen.getByText(/ayrı akışlara veya ayrı sıralamalara bölünmez/u)).toBeInTheDocument();
    expect(metadata.description).toContain("platform tarafından yönetilen yapay yazar");
  });

  it("explains the constitution and post-publication moderation model", () => {
    render(<AboutPage />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Anayasa ve ardıl moderasyon" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/yayımlanmadan önce moderatör onayına alınmaz/u)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Yürürlükteki Agent Sözlük Anayasası’nı oku" }),
    ).toHaveAttribute("href", "/kurallar");
  });
});

// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import RulesPage, { metadata } from "@/app/kurallar/page";

afterEach(cleanup);

describe("public constitution page", () => {
  it("renders the versioned 52-article constitution with stable anchors", async () => {
    render(await RulesPage());

    expect(
      screen.getByRole("heading", { level: 1, name: "Sözlük formatı ve moderasyon kuralları" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Sürüm 1\.0\.0 · 23 Temmuz 2026 · 52 madde/u)).toBeInTheDocument();
    expect(document.querySelector("#madde-1")).toHaveTextContent(
      "Madde 1 — Sözlük formatının amacı",
    );
    expect(document.querySelector("#madde-52")).toHaveTextContent(
      "Madde 52 — İspiyonlamadan önce karar testi",
    );
    expect(screen.getByRole("navigation", { name: "Anayasa maddeleri" })).toBeInTheDocument();
    expect(metadata.title).toBe("Anayasa ve topluluk kuralları");
  });

  it("does not expose historical person or platform attribution", async () => {
    render(await RulesPage());
    const publicText = document.body.textContent?.toLocaleLowerCase("tr-TR") ?? "";

    expect(publicText).not.toContain("ekşi");
    expect(publicText).not.toContain("ssg");
    expect(publicText).not.toContain("armonipolisi");
    expect(publicText).not.toContain("crown");
    expect(publicText).not.toContain("cern");
    expect(publicText).not.toContain("eksisozluk.com");
  });
});

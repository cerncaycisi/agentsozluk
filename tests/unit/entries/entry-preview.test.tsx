// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { EntryPreview } from "@/components/entries/entry-preview";

describe("entry card acceptance state", () => {
  it("exposes its anchor plus hidden and edited indicators", () => {
    const { container } = render(
      <EntryPreview
        entry={{
          id: "00000000-0000-4000-8000-000000000201",
          publicId: 201,
          body: "Gizlenmiş fakat yetkili kullanıcıya gösterilen entry metni.",
          score: 3,
          status: "HIDDEN",
          edited: true,
          createdAt: new Date("2026-01-02T10:00:00.000Z"),
          topic: {
            id: "00000000-0000-4000-8000-000000000101",
            publicId: 101,
            title: "Kanonik başlık",
            slug: "kanonik-baslik",
          },
          author: {
            id: "00000000-0000-4000-8000-000000000001",
            username: "writer",
            displayName: "Writer",
          },
        }}
      />,
    );

    expect(container.querySelector("article")).toHaveAttribute("id", "entry-201");
    expect(screen.getByText("gizlenmiş entry")).toBeVisible();
    expect(screen.getByLabelText("Entry düzenlendi")).toBeVisible();
    expect(screen.queryByText("kalıcı bağlantı")).not.toBeInTheDocument();
    expect(container.querySelector('a[href="/entry/201"]')).toHaveTextContent("2 Oca 2026 13:00");
    expect(screen.getByRole("link", { name: "Writer" })).toHaveAttribute("href", "/yazar/writer");
    expect(screen.getByRole("link", { name: "Writer" })).toHaveClass("text-primary");
  });

  it("can hide the topic title when the surrounding page already shows it", () => {
    render(
      <EntryPreview
        showTopicTitle={false}
        entry={{
          id: "00000000-0000-4000-8000-000000000202",
          publicId: 202,
          body: "Başlık detayında tekrar başlık göstermeyen entry metni.",
          score: 1,
          createdAt: new Date("2026-01-02T10:00:00.000Z"),
          topic: {
            id: "00000000-0000-4000-8000-000000000101",
            publicId: 101,
            title: "Tekrarlanmayan başlık",
            slug: "tekrarlanmayan-baslik",
          },
          author: {
            id: "00000000-0000-4000-8000-000000000001",
            username: "writer",
            displayName: "Writer",
          },
        }}
      />,
    );

    expect(screen.queryByRole("link", { name: "Tekrarlanmayan başlık" })).not.toBeInTheDocument();
  });
});

describe("akış kartlarında görsel kırpma", () => {
  afterEach(() => cleanup());

  const longBody = "uzun entry gövdesi ".repeat(40).trim();
  const shortBody = "kısa entry gövdesi.";

  const baseEntry = {
    id: "00000000-0000-4000-8000-000000000203",
    publicId: 203,
    score: 5,
    createdAt: new Date("2026-01-02T10:00:00.000Z"),
    topic: {
      id: "00000000-0000-4000-8000-000000000101",
      publicId: 101,
      title: "Akış başlığı",
      slug: "akis-basligi",
    },
    author: {
      id: "00000000-0000-4000-8000-000000000001",
      username: "writer",
      displayName: "Writer",
    },
  };

  it("keeps the whole body in the DOM while clipping it with CSS only", () => {
    expect(longBody.length).toBeGreaterThan(600);
    const { container } = render(
      <EntryPreview collapsible entry={{ ...baseEntry, body: longBody }} />,
    );

    expect(container.textContent).toContain(longBody);
    const clipped = container.querySelector(".overflow-hidden");
    expect(clipped).not.toBeNull();
    expect(clipped?.className).toContain("max-h-[10.5rem]");
    expect(clipped?.className).toContain("after:from-surface");
    expect(clipped?.className).toContain("peer-checked:max-h-none");
    expect(clipped?.className).not.toContain("from-white");
  });

  it("offers a pure CSS expand toggle bound to the clipped body", () => {
    const { container } = render(
      <EntryPreview collapsible entry={{ ...baseEntry, body: longBody }} />,
    );

    const toggle = container.querySelector("input[type=checkbox]");
    expect(toggle).toHaveClass("peer");
    expect(toggle).toHaveAttribute("id", "entry-203-govde-genislet");
    expect(screen.getByText("Devamını göster")).toHaveAttribute("for", "entry-203-govde-genislet");
    expect(screen.getByText("Daha az göster")).toHaveAttribute("for", "entry-203-govde-genislet");
  });

  it("collapses bodies that stay short in characters but run over eight lines", () => {
    const manyLines = Array.from({ length: 12 }, (_, index) => `satır ${index + 1}`).join("\n");
    expect(manyLines.length).toBeLessThan(600);
    const { container } = render(
      <EntryPreview collapsible entry={{ ...baseEntry, body: manyLines }} />,
    );

    expect(container.querySelector(".overflow-hidden")).not.toBeNull();
  });

  it("leaves short bodies untouched, without mask or toggle", () => {
    const { container } = render(
      <EntryPreview collapsible entry={{ ...baseEntry, body: shortBody }} />,
    );

    expect(container.querySelector(".overflow-hidden")).toBeNull();
    expect(container.querySelector("input[type=checkbox]")).toBeNull();
    expect(screen.queryByText("Devamını göster")).not.toBeInTheDocument();
  });

  it("never clips when collapsible is not requested, as on topic pages", () => {
    const { container } = render(<EntryPreview entry={{ ...baseEntry, body: longBody }} />);

    expect(container.querySelector(".overflow-hidden")).toBeNull();
    expect(screen.queryByText("Devamını göster")).not.toBeInTheDocument();
    expect(container.textContent).toContain(longBody);
  });
  it("ships the entire body in the server markup, so it survives with JavaScript disabled", () => {
    const markup = renderToStaticMarkup(
      <EntryPreview collapsible entry={{ ...baseEntry, body: longBody }} />,
    );

    expect(markup).toContain(longBody);
    expect(markup).not.toContain("<script");
    expect(markup).toContain('type="checkbox"');
  });
});

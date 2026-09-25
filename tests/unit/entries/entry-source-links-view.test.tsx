// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntryPreview } from "@/components/entries/entry-preview";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => cleanup());

const entry = {
  id: "00000000-0000-4000-8000-000000000801",
  publicId: 801,
  body: "Kaynağa dayanan entry metni.",
  score: 3,
  createdAt: new Date("2026-09-25T10:00:00.000Z"),
  topic: {
    id: "00000000-0000-4000-8000-000000000102",
    publicId: 102,
    title: "Kaynaklı başlık",
    slug: "kaynakli-baslik",
  },
  author: { id: "00000000-0000-4000-8000-000000000002", username: "ajan", displayName: "Ajan" },
};

describe("entry kartında kaynak satırı (plan 6.3-1)", () => {
  it("kaynak varsa alan adıyla, izlenmeyen dış bağlantı olarak gösterir", () => {
    render(
      <EntryPreview
        entry={entry}
        sourceLinks={[
          { url: "https://ornek.com/haber", domain: "ornek.com" },
          { url: "https://diger.org/x", domain: "diger.org" },
        ]}
      />,
    );
    expect(screen.getByText(/kaynak:/u)).toBeTruthy();
    const link = screen.getByRole("link", { name: "ornek.com" });
    expect(link).toHaveAttribute("href", "https://ornek.com/haber");
    expect(link).toHaveAttribute("rel", "nofollow noopener noreferrer ugc");
    expect(screen.getByRole("link", { name: "diger.org" })).toBeTruthy();
  });

  it("kaynak yoksa hiçbir şey çizmez ('kaynak yok' etiketi yok)", () => {
    render(<EntryPreview entry={entry} />);
    expect(screen.queryByText(/kaynak/u)).toBeNull();
    render(<EntryPreview entry={{ ...entry, publicId: 802 }} sourceLinks={[]} />);
    expect(screen.queryByText(/kaynak/u)).toBeNull();
  });

  it("okurun engellediği yazarın entry'sinde kaynağı da göstermez", () => {
    render(
      <EntryPreview
        entry={{ ...entry, blockedByViewer: true }}
        sourceLinks={[{ url: "https://ornek.com/haber", domain: "ornek.com" }]}
      />,
    );
    expect(screen.queryByRole("link", { name: "ornek.com" })).toBeNull();
  });
});

// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EntryPreview } from "@/components/entries/entry-preview";
import { safeSourceLink, sourceItemIdsFromProvenance } from "@/modules/entries/domain/source-links";

afterEach(cleanup);

const itemId = "727a0d48-e6a5-4cc7-8fe6-b502dad0d2af";

describe("kaynak bağlantısı (G3)", () => {
  it("reads source item ids only from sourced provenance", () => {
    expect(
      sourceItemIdsFromProvenance({ evidenceType: "TRUSTED_SOURCE", evidenceIds: [itemId, "x"] }),
    ).toEqual([itemId]);
    expect(
      sourceItemIdsFromProvenance({ evidenceType: "MODEL_KNOWLEDGE", evidenceIds: [itemId] }),
    ).toEqual([]);
    expect(sourceItemIdsFromProvenance(null)).toEqual([]);
    expect(sourceItemIdsFromProvenance({ evidenceType: "TRUSTED_SOURCE" })).toEqual([]);
  });

  it("accepts only plain http(s) links and shows the registered domain", () => {
    expect(safeSourceLink("https://www.theguardian.com/a?b=1", "www.theguardian.com")).toEqual({
      url: "https://www.theguardian.com/a?b=1",
      domain: "theguardian.com",
    });
    expect(safeSourceLink("javascript:alert(1)", "evil.com")).toBeNull();
    expect(safeSourceLink("data:text/html,x", "evil.com")).toBeNull();
    expect(safeSourceLink("https://user:pass@site.com/", "site.com")).toBeNull();
    expect(safeSourceLink("not a url", "site.com")).toBeNull();
    expect(safeSourceLink("https://site.com/", "<b>site</b>")).toBeNull();
  });

  const entry = {
    id: "00000000-0000-4000-8000-000000000301",
    publicId: 301,
    body: "Kaynaklı entry metni.",
    score: 0,
    createdAt: new Date("2026-10-09T15:36:00.000Z"),
    topic: { id: "t", publicId: 1, title: "Başlık", slug: "baslik" },
    author: { id: "a", username: "raf_arasi", displayName: "raf arası" },
  };

  it("renders the domain as a nofollow link below the body, nothing when absent", () => {
    render(
      <EntryPreview
        entry={entry}
        sourceLinks={[{ url: "https://www.theguardian.com/a", domain: "theguardian.com" }]}
      />,
    );
    const link = screen.getByRole("link", { name: "theguardian.com" });
    expect(link).toHaveAttribute("href", "https://www.theguardian.com/a");
    expect(link.getAttribute("rel")).toContain("nofollow");
    expect(link).toHaveAttribute("target", "_blank");
    cleanup();
    render(<EntryPreview entry={entry} />);
    expect(screen.queryByText(/kaynak:/u)).toBeNull();
  });
});

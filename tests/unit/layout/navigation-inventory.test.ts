import { describe, expect, it } from "vitest";
import { moderationNavSections, publicFooterSections } from "@/config/navigation";

function hrefs(sections: ReadonlyArray<{ links: ReadonlyArray<{ href: string }> }>): string[] {
  return sections.flatMap((section) => section.links.map((link) => link.href));
}

describe("navigation inventory", () => {
  it("keeps every standalone public discovery and policy page in global navigation", () => {
    const publicHrefs = hrefs(publicFooterSections);
    expect(publicHrefs).toEqual(
      expect.arrayContaining([
        "/rastgele",
        "/son",
        "/gundem",
        "/yeni",
        "/debe",
        "/hakkinda",
        "/kurallar",
        "/gizlilik",
        "/gelistirici/api",
      ]),
    );
    expect(new Set(publicHrefs).size).toBe(publicHrefs.length);
  });

  it("keeps the account pages reachable from the footer as well as the header", () => {
    expect(hrefs(publicFooterSections)).toEqual(
      expect.arrayContaining(["/giris", "/kayit"]),
    );
  });

  it("exposes the syndication feeds declared in the root layout as external links", () => {
    // `src/app/layout.tsx` -> metadata.alternates.types
    const feeds = publicFooterSections
      .flatMap((section) => section.links)
      .filter((link) => link.href.endsWith(".xml"));

    expect(feeds.map((link) => [link.href, link.label])).toEqual([
      ["/feed.xml", "RSS"],
      ["/atom.xml", "Atom"],
    ]);
    // Route handler'lar `next/link` ile client-side gezinemez.
    expect(feeds.every((link) => link.external === true)).toBe(true);
  });

  it("keeps every standalone moderation workspace in moderation navigation", () => {
    const moderationHrefs = hrefs(moderationNavSections);
    expect(moderationHrefs).toEqual(
      expect.arrayContaining([
        "/moderasyon",
        "/moderasyon/raporlar",
        "/moderasyon/canlandirma",
        "/moderasyon/basliklar",
        "/moderasyon/seedler",
        "/moderasyon/kullanicilar",
        "/moderasyon/audit",
        "/moderasyon/agentlar",
        "/moderasyon/agent-icerikleri",
        "/moderasyon/agentlar/olaylar",
        "/moderasyon/agentlar/kaynaklar",
        "/moderasyon/agent-kapasite",
        "/moderasyon/agentlar/ayarlar",
        "/moderasyon/agentlar/yeni",
      ]),
    );
    expect(new Set(moderationHrefs).size).toBe(moderationHrefs.length);
  });
});

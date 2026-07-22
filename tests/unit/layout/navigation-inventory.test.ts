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

  it("keeps every standalone moderation workspace in moderation navigation", () => {
    const moderationHrefs = hrefs(moderationNavSections);
    expect(moderationHrefs).toEqual(
      expect.arrayContaining([
        "/moderasyon",
        "/moderasyon/raporlar",
        "/moderasyon/basliklar",
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

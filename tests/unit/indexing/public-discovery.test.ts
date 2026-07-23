import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import { GET as getLlmsText } from "@/app/llms.txt/route";

describe("public crawler and LLM discovery policy", () => {
  it("keeps private surfaces blocked for search/retrieval bots and blocks training-only bots", () => {
    const policy = robots();
    expect(policy.sitemap).toBe("http://localhost:3000/sitemap.xml");
    expect(policy.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userAgent: "*",
          disallow: expect.arrayContaining(["/moderasyon", "/api", "/ayarlar"]),
        }),
        expect.objectContaining({
          userAgent: expect.arrayContaining([
            "Googlebot",
            "Bingbot",
            "OAI-SearchBot",
            "Claude-SearchBot",
            "PerplexityBot",
            "Google-Extended",
          ]),
          allow: "/",
          disallow: expect.arrayContaining(["/moderasyon", "/api", "/ayarlar"]),
        }),
        {
          userAgent: ["GPTBot", "ClaudeBot", "CCBot"],
          disallow: "/",
        },
      ]),
    );
  });

  it("publishes a bounded public-only llms.txt without claiming authorization or training consent", async () => {
    const response = getLlmsText();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    const body = await response.text();
    expect(body).toContain("# Agent Sözlük");
    expect(body).toContain("http://localhost:3000/sitemap.xml");
    expect(body).toContain("http://localhost:3000/feed.xml");
    expect(body).toContain("http://localhost:3000/atom.xml");
    expect(body).toContain("Erişim yetkisi, eğitim lisansı");
    expect(body).not.toMatch(/moderasyon|api\/v1|agentProfile|adminInstruction|prompt/iu);
  });
});

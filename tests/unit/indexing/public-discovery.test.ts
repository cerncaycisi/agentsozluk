import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import { GET as getLlmsText } from "@/app/llms.txt/route";

const baseUrl = new URL(process.env.APP_URL ?? "http://localhost:3000").origin;

describe("public crawler and LLM discovery policy", () => {
  it("keeps private surfaces blocked for search/retrieval bots and blocks training-only bots", () => {
    const policy = robots();
    expect(policy.sitemap).toBe(`${baseUrl}/sitemap.xml`);
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

  it("blocks the topic-creation page without blocking topics whose address starts with it", () => {
    const { rules } = robots();
    // Yalnız tarayan botların kuralları: eğitim botları zaten `/` ile tamamen kapalı.
    const disallowed = (Array.isArray(rules) ? rules : [rules])
      .filter((rule) => rule.allow === "/")
      .flatMap((rule) =>
        Array.isArray(rule.disallow) ? rule.disallow : rule.disallow ? [rule.disallow] : [],
      );
    // `Disallow` öneke bakar: çıplak `/baslik/ac` bir zamanlar `acik-kaynak--12`yi
    // de kapatıyordu. Sonlandırıcı olmadan hiçbir `/baslik/` kuralı kalmamalı.
    expect(disallowed).toContain("/baslik/ac$");
    expect(disallowed).toContain("/baslik/ac?");
    const blocks = (url: string) =>
      disallowed.some((path) =>
        path.endsWith("$") ? url === path.slice(0, -1) : url.startsWith(path),
      );
    expect(blocks("/baslik/ac")).toBe(true);
    for (const topic of [
      "/baslik/acik-kaynak--12",
      "/baslik/acele-karar--3",
      "/baslik/ac%C4%B1k%20kaynak",
    ])
      expect(blocks(topic)).toBe(false);
  });

  it("publishes a bounded public-only llms.txt without claiming authorization or training consent", async () => {
    const response = getLlmsText();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    const body = await response.text();
    expect(body).toContain("# Agent Sözlük");
    expect(body).toContain(`${baseUrl}/sitemap.xml`);
    expect(body).toContain(`${baseUrl}/feed.xml`);
    expect(body).toContain(`${baseUrl}/atom.xml`);
    expect(body).toContain("Erişim yetkisi, eğitim lisansı");
    expect(body).not.toMatch(/moderasyon|api\/v1|agentProfile|adminInstruction|prompt/iu);
  });
});

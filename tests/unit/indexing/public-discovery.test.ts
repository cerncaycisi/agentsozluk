import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as TopicsModule from "@/modules/topics";

const densest = vi.hoisted(() => ({ result: [] as unknown[] | Error }));
vi.mock("@/lib/db/client", () => ({ getDatabase: () => ({}) }));
vi.mock("@/modules/topics", async (importOriginal) => ({
  ...(await importOriginal<typeof TopicsModule>()),
  getDensestIndexableTopics: async () => {
    if (densest.result instanceof Error) throw densest.result;
    return densest.result;
  },
}));

import robots from "@/app/robots";
import { GET as getLlmsText } from "@/app/llms.txt/route";
import { GET as getLogo } from "@/app/logo.png/route";

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
            // Eğitim botları 19 Ekim'den beri aynı grupta (Gökhan: "Eğitime aç").
            "GPTBot",
            "ClaudeBot",
            "CCBot",
          ]),
          allow: "/",
          disallow: expect.arrayContaining(["/moderasyon", "/api", "/ayarlar"]),
        }),
      ]),
    );
  });

  it("blocks the topic-creation page without blocking topics whose address starts with it", () => {
    const { rules } = robots();
    // Bütün grupların kuralları; 19 Ekim'den beri hiçbir grup `/` ile tamamen kapalı değil.
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

  beforeEach(() => {
    densest.result = [];
  });

  it("publishes a bounded public-only llms.txt without claiming authorization or training consent", async () => {
    const response = await getLlmsText();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    const body = await response.text();
    expect(body).toContain("# Agent Sözlük");
    expect(body).toContain(`${baseUrl}/sitemap.xml`);
    expect(body).toContain(`${baseUrl}/feed.xml`);
    expect(body).toContain(`${baseUrl}/atom.xml`);
    expect(body).toContain(`${baseUrl}/basliklar`);
    expect(body).toContain("Erişim yetkisi, eğitim lisansı");
    expect(body).not.toMatch(/moderasyon|api\/v1|agentProfile|adminInstruction|prompt/iu);
  });

  // Talep stratejisi 4d: en dolu başlıklar, kanonik adres ve entry sayısıyla.
  it("lists the densest indexable topics with canonical links", async () => {
    densest.result = [
      { id: "a", publicId: 12, slug: "isik-kirliligi", title: "ışık kirliliği", entryCount: 41 },
      { id: "b", publicId: 7, slug: "x", title: "köşeli [parantez]\nsatır", entryCount: 9 },
    ];
    const body = await (await getLlmsText()).text();
    expect(body).toContain("## En dolu başlıklar");
    expect(body).toContain(`- [ışık kirliliği](${baseUrl}/baslik/isik-kirliligi--12): 41 entry`);
    expect(body).toContain(`- [köşeli parantez satır](${baseUrl}/baslik/x--7): 9 entry`);
    expect(body.indexOf("## En dolu başlıklar")).toBeLessThan(body.indexOf("## Kullanım sınırı"));
  });

  it("still publishes llms.txt without the topic list when the database is unavailable", async () => {
    densest.result = new Error("db down");
    const response = await getLlmsText();
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).not.toContain("## En dolu başlıklar");
    expect(body).toContain("## Kullanım sınırı");
  });

  it("serves a 512×512 PNG logo for Organization structured data", async () => {
    const response = getLogo();
    expect(response.headers.get("Content-Type")).toBe("image/png");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(bytes.buffer);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([512, 512]);
  });
});

it("no crawler group disallows the whole site", () => {
  const { rules } = robots();
  for (const rule of Array.isArray(rules) ? rules : [rules]) {
    const disallow = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow];
    expect(disallow).not.toContain("/");
  }
});

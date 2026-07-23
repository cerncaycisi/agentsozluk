import { describe, expect, it } from "vitest";
import {
  parseArguments,
  runPublicDiscoveryBaseline,
} from "../../../scripts/public-discovery-report";

const origin = "https://agentsozluk.test";
const publicUrls = [
  `${origin}/son`,
  `${origin}/hakkinda`,
  `${origin}/kurallar`,
  `${origin}/gizlilik`,
  `${origin}/baslik/ornek--1`,
  `${origin}/entry/2`,
];

function document(url: string, body: string, contentType: string): Response {
  const response = new Response(body, { status: 200, headers: { "Content-Type": contentType } });
  Object.defineProperties(response, {
    url: { value: url },
    redirected: { value: false },
  });
  return response;
}

function robotsText(): string {
  const retrieval = [
    "Googlebot",
    "Bingbot",
    "OAI-SearchBot",
    "Claude-SearchBot",
    "Claude-User",
    "PerplexityBot",
    "Perplexity-User",
    "Google-Extended",
  ]
    .map(
      (agent) =>
        `User-agent: ${agent}\nAllow: /\nDisallow: /moderasyon\nDisallow: /api\nDisallow: /ayarlar\n`,
    )
    .join("\n");
  const training = ["GPTBot", "ClaudeBot", "CCBot"]
    .map((agent) => `User-agent: ${agent}\nDisallow: /\n`)
    .join("\n");
  return `${retrieval}\n${training}`;
}

function fixtures(canonicalOverride?: string): Map<string, Response> {
  const sitemapIndex = [
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `<sitemap><loc>${origin}/sitemaps/static.xml</loc></sitemap>`,
    `<sitemap><loc>${origin}/sitemaps/topics/0.xml</loc></sitemap>`,
    `<sitemap><loc>${origin}/sitemaps/entries/0.xml</loc></sitemap>`,
    "</sitemapindex>",
  ].join("");
  const staticSitemap = `<urlset>${publicUrls
    .slice(0, 4)
    .map((url) => `<url><loc>${url}</loc></url>`)
    .join("")}</urlset>`;
  const topicSitemap = `<urlset><url><loc>${publicUrls[4]}</loc></url></urlset>`;
  const entrySitemap = `<urlset><url><loc>${publicUrls[5]}</loc></url></urlset>`;
  const rss = `<rss><channel><item><guid isPermaLink="true">${publicUrls[5]}</guid></item></channel></rss>`;
  const atom = `<feed><entry><id>${publicUrls[5]}</id></entry></feed>`;
  const llms = [
    `[Hakkında](${origin}/hakkinda)`,
    `[Kurallar](${origin}/kurallar)`,
    `[Gizlilik](${origin}/gizlilik)`,
    `[Sitemap](${origin}/sitemap.xml)`,
    `[RSS](${origin}/feed.xml)`,
    `[Atom](${origin}/atom.xml)`,
  ].join("\n");
  const values = new Map<string, Response>([
    [`${origin}/robots.txt`, document(`${origin}/robots.txt`, robotsText(), "text/plain")],
    [`${origin}/sitemap.xml`, document(`${origin}/sitemap.xml`, sitemapIndex, "application/xml")],
    [
      `${origin}/sitemaps/static.xml`,
      document(`${origin}/sitemaps/static.xml`, staticSitemap, "application/xml"),
    ],
    [
      `${origin}/sitemaps/topics/0.xml`,
      document(`${origin}/sitemaps/topics/0.xml`, topicSitemap, "application/xml"),
    ],
    [
      `${origin}/sitemaps/entries/0.xml`,
      document(`${origin}/sitemaps/entries/0.xml`, entrySitemap, "application/xml"),
    ],
    [`${origin}/feed.xml`, document(`${origin}/feed.xml`, rss, "application/rss+xml")],
    [`${origin}/atom.xml`, document(`${origin}/atom.xml`, atom, "application/atom+xml")],
    [`${origin}/llms.txt`, document(`${origin}/llms.txt`, llms, "text/plain")],
  ]);
  for (const url of publicUrls) {
    const isTopic = url.includes("/baslik/");
    const rss = isTopic ? `${url}/feed.xml` : `${origin}/feed.xml`;
    const atom = isTopic ? `${url}/atom.xml` : `${origin}/atom.xml`;
    values.set(
      url,
      document(
        url,
        [
          "<html><head>",
          `<link rel="canonical" href="${canonicalOverride ?? url}">`,
          `<link rel="alternate" type="application/rss+xml" href="${rss}">`,
          `<link rel="alternate" type="application/atom+xml" href="${atom}">`,
          "</head></html>",
        ].join(""),
        "text/html",
      ),
    );
  }
  return values;
}

function mockFetch(values: Map<string, Response>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    const response = values.get(url);
    if (!response) throw new Error(`UNEXPECTED_URL:${url}`);
    return response.clone();
  }) as typeof fetch;
}

describe("public discovery baseline report", () => {
  it("requires a credential-free origin and bounded sample arguments", () => {
    expect(parseArguments(["--base-url", origin, "--sample-size", "12"])).toMatchObject({
      baseUrl: new URL(origin),
      sampleSize: 12,
    });
    expect(parseArguments(["--", "--base-url", origin])).toMatchObject({
      baseUrl: new URL(origin),
      sampleSize: 24,
    });
    expect(() => parseArguments(["--base-url", `${origin}/path`])).toThrow("BASE_URL_INVALID");
    expect(() => parseArguments(["--base-url", "https://user:pass@example.com"])).toThrow(
      "BASE_URL_INVALID",
    );
    expect(() => parseArguments(["--base-url", origin, "--sample-size", "101"])).toThrow(
      "SAMPLE_SIZE_INVALID",
    );
  });

  it("passes a complete same-origin crawler, feed, sitemap and canonical contract", async () => {
    const report = await runPublicDiscoveryBaseline(
      { baseUrl: new URL(origin), sampleSize: 100, timeoutMs: 1_000 },
      mockFetch(fixtures()),
    );
    expect(report).toMatchObject({
      verdict: "PASS",
      endpoints: {
        robots: true,
        sitemapIndex: true,
        sitemapFiles: 3,
        rss: true,
        atom: true,
        llms: true,
      },
      sitemap: { urlCount: 6 },
      feeds: { rssItems: 1, atomEntries: 1 },
      canonicalSample: { requested: 6, passed: 6 },
      llmsLinks: 6,
      issues: [],
    });
  });

  it("returns a safe issue code instead of accepting a canonical mismatch", async () => {
    const report = await runPublicDiscoveryBaseline(
      { baseUrl: new URL(origin), sampleSize: 100, timeoutMs: 1_000 },
      mockFetch(fixtures(`${origin}/yanlis`)),
    );
    expect(report.verdict).toBe("FAIL");
    expect(report.issues).toContainEqual({
      code: "CANONICAL_SAMPLE_FAILED",
      target: "/entry/2",
    });
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  assertPublicSourceAddresses,
  parseSourceFeed,
  robotsAllows,
  SafeSourceReader,
  sanitizeSourceHtml,
} from "@/runtime/source-reader";

describe("safe external source reader", () => {
  it("blocks any DNS answer set containing a private address", () => {
    expect(() =>
      assertPublicSourceAddresses([
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]),
    ).toThrow("SOURCE_SSRF_BLOCKED");
    expect(() =>
      assertPublicSourceAddresses([{ address: "93.184.216.34", family: 4 }]),
    ).not.toThrow();
  });

  it("revalidates redirect targets and blocks redirects to metadata IPs", async () => {
    const requester = vi.fn().mockImplementation(async (url: URL) => {
      if (url.pathname === "/robots.txt")
        return { status: 404, headers: {}, body: Buffer.alloc(0), url: url.toString() };
      return {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data" },
        body: Buffer.alloc(0),
        url: url.toString(),
      };
    });
    const reader = new SafeSourceReader({
      minimumDomainIntervalMs: 0,
      resolver: vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]),
      requester,
    });
    await expect(reader.read("https://example.com/article")).rejects.toThrow(/Private|local/u);
  });

  it("honors longest matching robots rule", () => {
    const robots = `
      User-agent: *
      Disallow: /private
      Allow: /private/public
    `;
    expect(robotsAllows(robots, "/news")).toBe(true);
    expect(robotsAllows(robots, "/private/report")).toBe(false);
    expect(robotsAllows(robots, "/private/public/item")).toBe(true);
  });

  it("removes executable and navigation HTML before returning safe text", () => {
    const result = sanitizeSourceHtml(`
      <html><head><title>Örnek &amp; Başlık</title><script>steal()</script></head>
      <body><nav>menü</nav><main><h1>Haber</h1><p>Güvenli metin.</p></main>
      <form><input name="secret"></form></body></html>
    `);
    expect(result.title).toBe("Örnek & Başlık");
    expect(result.safeText).toContain("Haber Güvenli metin.");
    expect(result.safeText).not.toMatch(/steal|menü|secret/iu);
  });

  it("parses bounded RSS items into hashed safe records", () => {
    const items = parseSourceFeed(
      `<rss><channel><item><title>Başlık</title><link>/post/1</link><description><![CDATA[<p>İçerik</p><script>x</script>]]></description><pubDate>Fri, 17 Jul 2026 10:00:00 GMT</pubDate></item></channel></rss>`,
      new URL("https://example.com/feed.xml"),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      canonicalUrl: "https://example.com/post/1",
      title: "Başlık",
      safeText: "İçerik",
      publishedAt: "2026-07-17T10:00:00.000Z",
    });
    expect(items[0]!.contentHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("prefers a declared RSS feed over HTML fallback text", async () => {
    const requester = vi.fn().mockImplementation(async (url: URL) => {
      if (url.pathname === "/robots.txt")
        return { status: 404, headers: {}, body: Buffer.alloc(0), url: url.toString() };
      if (url.pathname === "/feed.xml")
        return {
          status: 200,
          headers: { "content-type": "application/rss+xml" },
          body: Buffer.from(
            `<rss><channel><item><title>Feed item</title><link>/feed-post</link><description>Feed metni</description></item></channel></rss>`,
          ),
          url: url.toString(),
        };
      return {
        status: 200,
        headers: { "content-type": "text/html" },
        body: Buffer.from(
          `<html><head><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head><body>HTML fallback</body></html>`,
        ),
        url: url.toString(),
      };
    });
    const reader = new SafeSourceReader({
      minimumDomainIntervalMs: 0,
      resolver: vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]),
      requester,
    });
    const items = await reader.read("https://example.com/");
    expect(items[0]).toMatchObject({ title: "Feed item", safeText: "Feed metni" });
    expect(items[0]!.safeText).not.toContain("HTML fallback");
  });
});

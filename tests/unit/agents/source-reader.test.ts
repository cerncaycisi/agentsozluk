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

  it("blocks IPv4-mapped IPv6 DNS answers that resolve to private IPv4 space", () => {
    expect(() => assertPublicSourceAddresses([{ address: "::ffff:a9fe:a9fe", family: 6 }])).toThrow(
      "SOURCE_SSRF_BLOCKED",
    );
    expect(() =>
      assertPublicSourceAddresses([{ address: "::ffff:93.184.216.34", family: 6 }]),
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

  it("paces consecutive same-domain requests by the configured minimum interval", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T12:00:00.000Z"));
    try {
      const requestedAt: number[] = [];
      const requester = vi.fn(async (url: URL) => {
        requestedAt.push(Date.now());
        return url.pathname === "/robots.txt"
          ? { status: 404, headers: {}, body: Buffer.alloc(0), url: url.toString() }
          : {
              status: 200,
              headers: { "content-type": "text/html" },
              body: Buffer.from("<html><title>Paced</title><body>content</body></html>"),
              url: url.toString(),
            };
      });
      const reader = new SafeSourceReader({
        minimumDomainIntervalMs: 1000,
        resolver: vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]),
        requester,
      });

      const pending = reader.read("https://example.com/article");
      await vi.advanceTimersByTimeAsync(0);
      expect(requester).toHaveBeenCalledOnce();

      await vi.advanceTimersByTimeAsync(999);
      expect(requester).toHaveBeenCalledOnce();

      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toHaveLength(1);
      expect(requestedAt).toEqual([
        new Date("2026-07-18T12:00:00.000Z").getTime(),
        new Date("2026-07-18T12:00:01.000Z").getTime(),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects response bodies larger than the hard 2 MB limit", async () => {
    const requester = vi.fn().mockImplementation(async (url: URL) => {
      if (url.pathname === "/robots.txt")
        return { status: 404, headers: {}, body: Buffer.alloc(0), url: url.toString() };
      return {
        status: 200,
        headers: { "content-type": "text/html" },
        body: Buffer.alloc(2 * 1024 * 1024 + 1, "a"),
        url: url.toString(),
      };
    });
    const reader = new SafeSourceReader({
      minimumDomainIntervalMs: 0,
      resolver: vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]),
      requester,
    });

    await expect(reader.read("https://example.com/article")).rejects.toThrow("SOURCE_TOO_LARGE");
  });

  it("caps a caller-supplied source read budget at ten seconds", async () => {
    const requester = vi.fn().mockImplementation(async (url: URL) =>
      url.pathname === "/robots.txt"
        ? { status: 404, headers: {}, body: Buffer.alloc(0), url: url.toString() }
        : {
            status: 200,
            headers: { "content-type": "text/html" },
            body: Buffer.from("<html><title>Bounded</title><body>content</body></html>"),
            url: url.toString(),
          },
    );
    const reader = new SafeSourceReader({
      minimumDomainIntervalMs: 0,
      resolver: vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]),
      requester,
    });

    await expect(
      reader.read("https://example.com/article", { timeoutMs: 60_000 }),
    ).resolves.toHaveLength(1);
    expect(requester).toHaveBeenCalledTimes(2);
    expect(requester.mock.calls.every((call) => call[3] <= 10_000)).toBe(true);
  });

  it.each([401, 403, 407])(
    "does not bypass authentication or proxy protection on HTTP %i",
    async (status) => {
      const requester = vi.fn().mockImplementation(async (url: URL) => {
        if (url.pathname === "/robots.txt")
          return { status: 404, headers: {}, body: Buffer.alloc(0), url: url.toString() };
        return { status, headers: {}, body: Buffer.alloc(0), url: url.toString() };
      });
      const reader = new SafeSourceReader({
        minimumDomainIntervalMs: 0,
        resolver: vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]),
        requester,
      });

      await expect(reader.read("https://example.com/protected")).rejects.toThrow(
        "SOURCE_AUTH_REQUIRED",
      );
    },
  );

  it("carries cancellation into an in-flight source request", async () => {
    const controller = new AbortController();
    const requester = vi.fn(
      async (
        _url: URL,
        _address: string,
        _family: number,
        _timeoutMs: number,
        signal?: AbortSignal,
      ) =>
        new Promise<never>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("SOURCE_CANCELLED")), {
            once: true,
          });
        }),
    );
    const reader = new SafeSourceReader({
      minimumDomainIntervalMs: 0,
      resolver: vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]),
      requester,
    });
    const pending = reader.read("https://example.com/article", {
      signal: controller.signal,
      timeoutMs: 1000,
    });

    await vi.waitFor(() => expect(requester).toHaveBeenCalledOnce());
    controller.abort();

    await expect(pending).rejects.toThrow("SOURCE_CANCELLED");
    expect(requester).toHaveBeenCalledOnce();
    expect(requester.mock.calls[0]?.[4]).toBe(controller.signal);
  });

  it("bounds the complete robots-and-content read by the supplied remaining deadline", async () => {
    const reader = new SafeSourceReader({
      minimumDomainIntervalMs: 0,
      resolver: vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]),
      requester: vi.fn(async () => new Promise<never>(() => undefined)),
    });

    await expect(reader.read("https://example.com/article", { timeoutMs: 10 })).rejects.toThrow(
      "SOURCE_TIMEOUT",
    );
  });
});

import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { setTimeout as delay } from "node:timers/promises";
import { createHash } from "node:crypto";
import { isPrivateSourceAddress, parseSafeSourceUrl } from "@/modules/agents";

const maximumResponseBytes = 2 * 1024 * 1024;
const defaultTimeoutMs = 10_000;

export interface SourceReadItem {
  canonicalUrl: string;
  title: string;
  publishedAt: string | null;
  safeText: string;
  contentHash: string;
}

interface SourceResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  url: string;
}

export interface SourceReaderOptions {
  resolver?: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
  requester?: (
    url: URL,
    address: string,
    family: number,
    timeoutMs: number,
  ) => Promise<SourceResponse>;
  minimumDomainIntervalMs?: number;
  timeoutMs?: number;
}

export function assertPublicSourceAddresses(
  addresses: Array<{ address: string; family: number }>,
): void {
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateSourceAddress(address)))
    throw new Error("SOURCE_SSRF_BLOCKED");
}

function normalizeHeaders(headers: NodeJS.Dict<string | string[]>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).flatMap(([key, value]) =>
      value === undefined
        ? []
        : [[key.toLowerCase(), Array.isArray(value) ? value.join(",") : value]],
    ),
  );
}

function defaultRequester(
  url: URL,
  address: string,
  family: number,
  timeoutMs: number,
): Promise<SourceResponse> {
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
      method: "GET",
      headers: {
        accept:
          "application/atom+xml, application/rss+xml, application/xml, text/xml, text/html;q=0.8",
        "user-agent": "AgentSozlukSourceReader/1.0 (+https://agentsozluk.com)",
      },
      lookup: (_hostname, _options, callback) => callback(null, address, family === 6 ? 6 : 4),
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error("SOURCE_TIMEOUT")));
    request.on("error", reject);
    request.on("response", (response) => {
      const headers = normalizeHeaders(response.headers);
      const declaredLength = Number(headers["content-length"] ?? 0);
      if (declaredLength > maximumResponseBytes) {
        response.destroy(new Error("SOURCE_TOO_LARGE"));
        return;
      }
      const chunks: Buffer[] = [];
      let received = 0;
      response.on("data", (chunk: Buffer) => {
        received += chunk.length;
        if (received > maximumResponseBytes) response.destroy(new Error("SOURCE_TOO_LARGE"));
        else chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () =>
        resolve({
          status: response.statusCode ?? 0,
          headers,
          body: Buffer.concat(chunks),
          url: url.toString(),
        }),
      );
    });
    request.end();
  });
}

function decodeEntities(value: string): string {
  return value
    .replaceAll(/&nbsp;/giu, " ")
    .replaceAll(/&amp;/giu, "&")
    .replaceAll(/&lt;/giu, "<")
    .replaceAll(/&gt;/giu, ">")
    .replaceAll(/&quot;/giu, '"')
    .replaceAll(/&#39;/giu, "'")
    .replaceAll(/&#(\d+);/gu, (_match, code: string) => String.fromCodePoint(Number(code)));
}

export function sanitizeSourceHtml(html: string): { title: string; safeText: string } {
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/iu)?.[1] ?? "Başlıksız")
    .replaceAll(/\s+/gu, " ")
    .trim()
    .slice(0, 500);
  const safeText = decodeEntities(
    html
      .replaceAll(
        /<(script|style|nav|footer|header|aside|form|noscript)[^>]*>[\s\S]*?<\/\1>/giu,
        " ",
      )
      .replaceAll(/<!--([\s\S]*?)-->/gu, " ")
      .replaceAll(/<[^>]+>/gu, " "),
  )
    .replaceAll(/\s+/gu, " ")
    .trim();
  return { title, safeText };
}

function xmlText(value: string): string {
  return decodeEntities(value.replaceAll(/<!\[CDATA\[|\]\]>/gu, "").replaceAll(/<[^>]+>/gu, " "))
    .replaceAll(/\s+/gu, " ")
    .trim();
}

export function parseSourceFeed(xml: string, baseUrl: URL): SourceReadItem[] {
  const blocks = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/giu)].slice(0, 50);
  return blocks.flatMap(([, , block]) => {
    if (!block) return [];
    const title = xmlText(block.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1] ?? "Başlıksız");
    const rawLink =
      block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/iu)?.[1] ??
      xmlText(block.match(/<link\b[^>]*>([\s\S]*?)<\/link>/iu)?.[1] ?? "");
    const description =
      block.match(
        /<(content:encoded|content|summary|description)\b[^>]*>([\s\S]*?)<\/\1>/iu,
      )?.[2] ?? "";
    const safeText = sanitizeSourceHtml(
      description.replaceAll(/<!\[CDATA\[|\]\]>/gu, ""),
    ).safeText.slice(0, 20_000);
    if (!safeText || !rawLink) return [];
    let canonicalUrl: string;
    try {
      canonicalUrl = new URL(rawLink, baseUrl).toString();
      parseSafeSourceUrl(canonicalUrl);
    } catch {
      return [];
    }
    const dateValue = xmlText(
      block.match(/<(published|updated|pubDate)\b[^>]*>([\s\S]*?)<\/\1>/iu)?.[2] ?? "",
    );
    const parsedDate = Date.parse(dateValue);
    return [
      {
        canonicalUrl,
        title: title.slice(0, 500),
        publishedAt: Number.isNaN(parsedDate) ? null : new Date(parsedDate).toISOString(),
        safeText,
        contentHash: createHash("sha256").update(`${canonicalUrl}\n${safeText}`).digest("hex"),
      },
    ];
  });
}

export function robotsAllows(robotsText: string, pathname: string): boolean {
  let applies = false;
  let decision: { length: number; allowed: boolean } | null = null;
  for (const rawLine of robotsText.split(/\r?\n/u)) {
    const line = rawLine.replace(/#.*$/u, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      applies =
        value === "*" || value.toLowerCase() === "agentsozlukSourcereader/1.0".toLowerCase();
      continue;
    }
    if (!applies || !["allow", "disallow"].includes(key) || !value || !pathname.startsWith(value))
      continue;
    if (!decision || value.length > decision.length)
      decision = { length: value.length, allowed: key === "allow" };
  }
  return decision?.allowed ?? true;
}

export class SafeSourceReader {
  readonly #options: SourceReaderOptions;
  readonly #lastDomainRequest = new Map<string, number>();

  constructor(options: SourceReaderOptions = {}) {
    this.#options = options;
  }

  async #paced(hostname: string): Promise<void> {
    const interval = this.#options.minimumDomainIntervalMs ?? 1000;
    const wait = (this.#lastDomainRequest.get(hostname) ?? 0) + interval - Date.now();
    if (wait > 0) await delay(wait);
    this.#lastDomainRequest.set(hostname, Date.now());
  }

  async #request(url: URL, redirects = 0): Promise<SourceResponse> {
    if (redirects > 5) throw new Error("SOURCE_REDIRECT_LIMIT");
    parseSafeSourceUrl(url.toString());
    await this.#paced(url.hostname);
    const addresses = await (
      this.#options.resolver ?? ((hostname) => lookup(hostname, { all: true }))
    )(url.hostname);
    assertPublicSourceAddresses(addresses);
    const selected = addresses[0]!;
    const response = await (this.#options.requester ?? defaultRequester)(
      url,
      selected.address,
      selected.family,
      this.#options.timeoutMs ?? defaultTimeoutMs,
    );
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.location;
      if (!location) throw new Error("SOURCE_REDIRECT_WITHOUT_LOCATION");
      return this.#request(new URL(location, url), redirects + 1);
    }
    if ([401, 403, 407].includes(response.status)) throw new Error("SOURCE_AUTH_REQUIRED");
    if (response.status < 200 || response.status >= 300)
      throw new Error(`SOURCE_HTTP_${response.status}`);
    return response;
  }

  async read(value: string): Promise<SourceReadItem[]> {
    const url = parseSafeSourceUrl(value);
    const robotsUrl = new URL("/robots.txt", url.origin);
    let robots: SourceResponse | null = null;
    try {
      robots = await this.#request(robotsUrl);
    } catch (error) {
      if (!(error instanceof Error && error.message === "SOURCE_HTTP_404")) throw error;
    }
    if (robots && !robotsAllows(robots.body.toString("utf8"), url.pathname))
      throw new Error("SOURCE_ROBOTS_DISALLOWED");
    const response = await this.#request(url);
    const contentType = response.headers["content-type"]?.toLowerCase() ?? "";
    const text = response.body.toString("utf8");
    if (contentType.includes("xml") || /<(rss|feed)\b/iu.test(text.slice(0, 1000)))
      return parseSourceFeed(text, new URL(response.url));
    if (!contentType.includes("html") && !contentType.startsWith("text/"))
      throw new Error("SOURCE_CONTENT_TYPE_UNSUPPORTED");
    const feedLink = [...text.matchAll(/<link\b[^>]*>/giu)]
      .map(([tag]) => ({
        tag,
        href: tag.match(/href=["']([^"']+)["']/iu)?.[1],
      }))
      .find(
        ({ tag, href }) =>
          href &&
          /rel=["'][^"']*alternate/iu.test(tag) &&
          /type=["']application\/(rss\+xml|atom\+xml)/iu.test(tag),
      );
    if (feedLink?.href) {
      const feedUrl = parseSafeSourceUrl(new URL(feedLink.href, response.url).toString());
      if (!robots || robotsAllows(robots.body.toString("utf8"), feedUrl.pathname)) {
        const feedResponse = await this.#request(feedUrl);
        const items = parseSourceFeed(
          feedResponse.body.toString("utf8"),
          new URL(feedResponse.url),
        );
        if (items.length > 0) return items;
      }
    }
    const sanitized = sanitizeSourceHtml(text);
    if (!sanitized.safeText) return [];
    return [
      {
        canonicalUrl: response.url,
        title: sanitized.title,
        publishedAt: null,
        safeText: sanitized.safeText.slice(0, 20_000),
        contentHash: createHash("sha256")
          .update(`${response.url}\n${sanitized.safeText.slice(0, 20_000)}`)
          .digest("hex"),
      },
    ];
  }
}

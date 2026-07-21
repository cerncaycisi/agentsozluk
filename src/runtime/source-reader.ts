import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { createHash } from "node:crypto";
import {
  isPrivateSourceAddress,
  parseSafeSourceUrl,
} from "@/modules/agents/domain/source-security";

const maximumResponseBytes = 2 * 1024 * 1024;
export const MAX_SOURCE_READ_TIMEOUT_MS = 10_000;
const SOURCE_READER_USER_AGENT = "AgentSozlukSourceReader/1.0 (+https://agentsozluk.com)";
const SOURCE_READER_ROBOTS_TOKEN = "agentsozlukSourcereader".toLowerCase();

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
    signal?: AbortSignal,
  ) => Promise<SourceResponse>;
  minimumDomainIntervalMs?: number;
  timeoutMs?: number;
}

export interface SourceReadOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export function assertPublicSourceAddresses(
  addresses: Array<{ address: string; family: number }>,
): void {
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateSourceAddress(address)))
    throw new Error("SOURCE_SSRF_BLOCKED");
}

export function classifySourceReadError(error: unknown): string {
  if (error instanceof Error && /^SOURCE_[A-Z0-9_]+$/u.test(error.message)) return error.message;
  const code =
    error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code.toUpperCase()
      : "";
  if (["ENOTFOUND", "EAI_AGAIN", "EAI_FAIL", "EAI_NODATA"].includes(code))
    return "SOURCE_DNS_FAILED";
  if (
    [
      "ECONNREFUSED",
      "ECONNRESET",
      "EHOSTUNREACH",
      "ENETUNREACH",
      "ENETDOWN",
      "EPIPE",
      "ERR_INVALID_IP_ADDRESS",
    ].includes(code)
  )
    return "SOURCE_CONNECT_FAILED";
  if (
    code.startsWith("CERT_") ||
    code.startsWith("ERR_TLS_") ||
    [
      "DEPTH_ZERO_SELF_SIGNED_CERT",
      "SELF_SIGNED_CERT_IN_CHAIN",
      "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
      "UNABLE_TO_GET_ISSUER_CERT",
    ].includes(code)
  )
    return "SOURCE_TLS_FAILED";
  if (["ETIMEDOUT", "ESOCKETTIMEDOUT"].includes(code)) return "SOURCE_TIMEOUT";
  return "SOURCE_FETCH_FAILED";
}

export function pinnedSourceLookup(address: string, family: number): LookupFunction {
  return (_hostname, options, callback) => {
    const resolved = { address, family: family === 6 ? 6 : 4 } as const;
    if (options.all) callback(null, [resolved]);
    else callback(null, resolved.address, resolved.family);
  };
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
  signal?: AbortSignal,
): Promise<SourceResponse> {
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
      method: "GET",
      headers: {
        accept:
          "application/atom+xml, application/rss+xml, application/xml, text/xml, text/html;q=0.8",
        "user-agent": SOURCE_READER_USER_AGENT,
      },
      lookup: pinnedSourceLookup(address, family),
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
    const onAbort = () => request.destroy(new Error("SOURCE_CANCELLED"));
    signal?.addEventListener("abort", onAbort, { once: true });
    request.on("close", () => signal?.removeEventListener("abort", onAbort));
    if (signal?.aborted) onAbort();
    else request.end();
  });
}

function boundedOperation<T>(
  operation: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(new Error("SOURCE_CANCELLED"));
  if (timeoutMs <= 0) return Promise.reject(new Error("SOURCE_TIMEOUT"));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(new Error("SOURCE_CANCELLED")));
    const timer = setTimeout(() => finish(() => reject(new Error("SOURCE_TIMEOUT"))), timeoutMs);
    timer.unref();
    signal?.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
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

export function parseSourceSitemap(xml: string, baseUrl: URL): SourceReadItem[] {
  const blocks = [...xml.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/giu)].slice(0, 50);
  return blocks.flatMap(([, block]) => {
    if (!block) return [];
    const rawUrl = xmlText(block.match(/<loc\b[^>]*>([\s\S]*?)<\/loc>/iu)?.[1] ?? "");
    const title = xmlText(
      block.match(/<news:title\b[^>]*>([\s\S]*?)<\/news:title>/iu)?.[1] ?? "",
    ).slice(0, 500);
    if (!rawUrl || !title) return [];
    let canonicalUrl: string;
    try {
      const parsed = parseSafeSourceUrl(new URL(rawUrl, baseUrl).toString());
      if (parsed.origin !== baseUrl.origin) return [];
      canonicalUrl = parsed.toString();
    } catch {
      return [];
    }
    const dateValue = xmlText(
      block.match(/<news:publication_date\b[^>]*>([\s\S]*?)<\/news:publication_date>/iu)?.[1] ?? "",
    );
    const parsedDate = Date.parse(dateValue);
    return [
      {
        canonicalUrl,
        title,
        publishedAt: Number.isNaN(parsedDate) ? null : new Date(parsedDate).toISOString(),
        safeText: title,
        contentHash: createHash("sha256").update(`${canonicalUrl}\n${title}`).digest("hex"),
      },
    ];
  });
}

interface RobotsGroup {
  agents: string[];
  contentSignals: string[];
  rules: Array<{ allowed: boolean; path: string }>;
}

function robotsGroups(robotsText: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup = { agents: [], contentSignals: [], rules: [] };
  let hasDirectives = false;
  const flush = () => {
    if (current.agents.length > 0) groups.push(current);
    current = { agents: [], contentSignals: [], rules: [] };
    hasDirectives = false;
  };
  for (const rawLine of robotsText.split(/\r?\n/u)) {
    const line = rawLine.replace(/#.*$/u, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      if (hasDirectives) flush();
      current.agents.push(value.toLowerCase());
      continue;
    }
    if (current.agents.length === 0) continue;
    hasDirectives = true;
    if (key === "content-signal") current.contentSignals.push(value);
    if (["allow", "disallow"].includes(key) && value)
      current.rules.push({ allowed: key === "allow", path: value });
  }
  flush();
  return groups;
}

export function robotsAllowsModelInput(robotsText: string): boolean {
  const groups = robotsGroups(robotsText);
  const exact = groups.filter(({ agents }) => agents.includes(SOURCE_READER_ROBOTS_TOKEN));
  const applicable = exact.length > 0 ? exact : groups.filter(({ agents }) => agents.includes("*"));
  return !applicable.some(({ contentSignals }) =>
    contentSignals.some((signal) =>
      signal
        .split(",")
        .map((part) => part.split("=", 2).map((value) => value.trim().toLowerCase()))
        .some(([key, value]) => key === "ai-input" && value === "no"),
    ),
  );
}

export function robotsAllows(robotsText: string, pathname: string): boolean {
  const groups = robotsGroups(robotsText);
  const exact = groups.filter(({ agents }) => agents.includes(SOURCE_READER_ROBOTS_TOKEN));
  const applicable = exact.length > 0 ? exact : groups.filter(({ agents }) => agents.includes("*"));
  let decision: { length: number; allowed: boolean } | null = null;
  for (const { rules } of applicable)
    for (const rule of rules) {
      if (!pathname.startsWith(rule.path)) continue;
      if (!decision || rule.path.length > decision.length)
        decision = { length: rule.path.length, allowed: rule.allowed };
    }
  return decision?.allowed ?? true;
}

export class SafeSourceReader {
  readonly #options: SourceReaderOptions;
  readonly #lastDomainRequest = new Map<string, number>();

  constructor(options: SourceReaderOptions = {}) {
    this.#options = options;
  }

  #remainingMs(deadlineAtMs: number): number {
    const remainingMs = Math.ceil(deadlineAtMs - Date.now());
    if (remainingMs <= 0) throw new Error("SOURCE_TIMEOUT");
    return remainingMs;
  }

  async #paced(hostname: string, deadlineAtMs: number, signal?: AbortSignal): Promise<void> {
    const interval = this.#options.minimumDomainIntervalMs ?? 1000;
    const wait = (this.#lastDomainRequest.get(hostname) ?? 0) + interval - Date.now();
    if (wait > 0) await boundedOperation(delay(wait), this.#remainingMs(deadlineAtMs), signal);
    this.#lastDomainRequest.set(hostname, Date.now());
  }

  async #request(
    url: URL,
    deadlineAtMs: number,
    signal?: AbortSignal,
    redirects = 0,
  ): Promise<SourceResponse> {
    if (signal?.aborted) throw new Error("SOURCE_CANCELLED");
    if (redirects > 5) throw new Error("SOURCE_REDIRECT_LIMIT");
    parseSafeSourceUrl(url.toString());
    await this.#paced(url.hostname, deadlineAtMs, signal);
    let addresses: Array<{ address: string; family: number }>;
    try {
      addresses = await boundedOperation(
        (this.#options.resolver ?? ((hostname) => lookup(hostname, { all: true })))(url.hostname),
        this.#remainingMs(deadlineAtMs),
        signal,
      );
    } catch (error) {
      throw new Error(classifySourceReadError(error));
    }
    assertPublicSourceAddresses(addresses);
    if (signal?.aborted) throw new Error("SOURCE_CANCELLED");
    let response: SourceResponse | null = null;
    let lastTransportError: unknown;
    for (const [index, selected] of addresses.entries()) {
      const remainingMs = this.#remainingMs(deadlineAtMs);
      const remainingAddresses = addresses.length - index;
      const requestTimeoutMs = Math.min(
        this.#options.timeoutMs ?? MAX_SOURCE_READ_TIMEOUT_MS,
        MAX_SOURCE_READ_TIMEOUT_MS,
        Math.max(1, Math.floor(remainingMs / remainingAddresses)),
      );
      try {
        response = await boundedOperation(
          (this.#options.requester ?? defaultRequester)(
            url,
            selected.address,
            selected.family,
            requestTimeoutMs,
            signal,
          ),
          requestTimeoutMs,
          signal,
        );
        break;
      } catch (error) {
        if (signal?.aborted || classifySourceReadError(error) === "SOURCE_CANCELLED")
          throw new Error("SOURCE_CANCELLED");
        lastTransportError = error;
      }
    }
    if (!response) throw new Error(classifySourceReadError(lastTransportError));
    const declaredLength = Number(response.headers["content-length"] ?? 0);
    if (declaredLength > maximumResponseBytes || response.body.byteLength > maximumResponseBytes)
      throw new Error("SOURCE_TOO_LARGE");
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.location;
      if (!location) throw new Error("SOURCE_REDIRECT_WITHOUT_LOCATION");
      return this.#request(new URL(location, url), deadlineAtMs, signal, redirects + 1);
    }
    if ([401, 403, 407].includes(response.status)) throw new Error("SOURCE_AUTH_REQUIRED");
    if (response.status < 200 || response.status >= 300)
      throw new Error(`SOURCE_HTTP_${response.status}`);
    return response;
  }

  async read(value: string, options: SourceReadOptions = {}): Promise<SourceReadItem[]> {
    const totalTimeoutMs = Math.min(
      options.timeoutMs ?? MAX_SOURCE_READ_TIMEOUT_MS,
      MAX_SOURCE_READ_TIMEOUT_MS,
    );
    if (!Number.isFinite(totalTimeoutMs) || totalTimeoutMs <= 0) throw new Error("SOURCE_TIMEOUT");
    const deadlineAtMs = Date.now() + totalTimeoutMs;
    const url = parseSafeSourceUrl(value);
    const robotsUrl = new URL("/robots.txt", url.origin);
    let robots: SourceResponse | null = null;
    try {
      robots = await this.#request(robotsUrl, deadlineAtMs, options.signal);
    } catch (error) {
      if (!(error instanceof Error && error.message === "SOURCE_HTTP_404")) throw error;
    }
    if (robots && !robotsAllows(robots.body.toString("utf8"), url.pathname))
      throw new Error("SOURCE_ROBOTS_DISALLOWED");
    if (robots && !robotsAllowsModelInput(robots.body.toString("utf8")))
      throw new Error("SOURCE_CONTENT_SIGNAL_DISALLOWED");
    const response = await this.#request(url, deadlineAtMs, options.signal);
    const contentType = response.headers["content-type"]?.toLowerCase() ?? "";
    const text = response.body.toString("utf8");
    if (contentType.includes("xml") || /<(rss|feed|urlset)\b/iu.test(text.slice(0, 1000)))
      return /<urlset\b/iu.test(text.slice(0, 2000))
        ? parseSourceSitemap(text, new URL(response.url))
        : parseSourceFeed(text, new URL(response.url));
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
        const feedResponse = await this.#request(feedUrl, deadlineAtMs, options.signal);
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

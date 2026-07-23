import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_SITEMAP_FILES = 100;
const DEFAULT_SAMPLE_SIZE = 24;
const DEFAULT_TIMEOUT_MS = 10_000;
const PRIVATE_PREFIXES = [
  "/ayarlar",
  "/moderasyon",
  "/api",
  "/giris",
  "/kayit",
  "/favoriler",
  "/takip",
  "/oylarim",
  "/baslik/ac",
] as const;
const RETRIEVAL_AGENTS = [
  "Googlebot",
  "Bingbot",
  "OAI-SearchBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
] as const;
const TRAINING_AGENTS = ["GPTBot", "ClaudeBot", "CCBot"] as const;

export interface PublicDiscoveryOptions {
  baseUrl: URL;
  sampleSize: number;
  timeoutMs: number;
}

export interface PublicDiscoveryIssue {
  code: string;
  target: string;
}

interface FetchedDocument {
  requestedUrl: string;
  finalUrl: string;
  redirected: boolean;
  status: number;
  contentType: string;
  body: string;
}

interface RobotsGroup {
  agents: string[];
  allow: string[];
  disallow: string[];
}

export interface PublicDiscoveryReport {
  checkedAt: string;
  baseUrl: string;
  verdict: "PASS" | "FAIL";
  endpoints: {
    robots: boolean;
    sitemapIndex: boolean;
    sitemapFiles: number;
    rss: boolean;
    atom: boolean;
    llms: boolean;
  };
  sitemap: {
    urlCount: number;
    fingerprint: string;
  };
  feeds: {
    rssItems: number;
    atomEntries: number;
    itemFingerprint: string;
  };
  canonicalSample: {
    requested: number;
    passed: number;
    fingerprint: string;
  };
  llmsLinks: number;
  issues: PublicDiscoveryIssue[];
}

export function help(): string {
  return `Usage: pnpm seo:baseline -- --base-url <origin> [--sample-size <1-100>]

Read-only public discovery report. It fetches robots.txt, sitemap partitions, RSS, Atom, llms.txt
and a deterministic canonical sample. It prints counts, public URL-set fingerprints and safe issue
codes only; it never prints page, entry, prompt, secret, token or environment bodies.
`;
}

function positiveInteger(value: string | undefined, name: string, maximum: number): number {
  if (!value || !/^[1-9]\d*$/u.test(value)) throw new Error(`${name}_INVALID`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) throw new Error(`${name}_INVALID`);
  return parsed;
}

export function parseArguments(argv: readonly string[]): PublicDiscoveryOptions {
  let baseUrlValue: string | undefined;
  let sampleSize = DEFAULT_SAMPLE_SIZE;
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") {
      continue;
    } else if (argument === "--base-url") {
      baseUrlValue = argv[index + 1];
      index += 1;
    } else if (argument === "--sample-size") {
      sampleSize = positiveInteger(argv[index + 1], "SAMPLE_SIZE", 100);
      index += 1;
    } else if (argument === "--timeout-ms") {
      timeoutMs = positiveInteger(argv[index + 1], "TIMEOUT_MS", 60_000);
      index += 1;
    } else {
      throw new Error("ARGUMENT_UNKNOWN");
    }
  }
  if (!baseUrlValue) throw new Error("BASE_URL_REQUIRED");
  const baseUrl = new URL(baseUrlValue);
  if (
    !["http:", "https:"].includes(baseUrl.protocol) ||
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.pathname !== "/" ||
    baseUrl.search ||
    baseUrl.hash
  ) {
    throw new Error("BASE_URL_INVALID");
  }
  return { baseUrl, sampleSize, timeoutMs };
}

function fingerprint(values: readonly string[]): string {
  return createHash("sha256")
    .update([...new Set(values)].sort().join("\n"))
    .digest("hex");
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

export function extractXmlValues(body: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "giu");
  return [...body.matchAll(pattern)].flatMap((match) =>
    match[1] ? [decodeXml(match[1].trim())] : [],
  );
}

function attribute(tag: string, name: string): string | null {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "iu");
  const match = pattern.exec(tag);
  return match?.[1] ?? match?.[2] ?? null;
}

export function extractCanonical(body: string, documentUrl: string): string | null {
  const links = body.match(/<link\b[^>]*>/giu) ?? [];
  for (const link of links) {
    const rel = attribute(link, "rel");
    const href = attribute(link, "href");
    if (rel?.toLowerCase().split(/\s+/u).includes("canonical") && href)
      return new URL(decodeXml(href), documentUrl).toString();
  }
  return null;
}

export function extractAlternate(
  body: string,
  mediaType: "application/rss+xml" | "application/atom+xml",
  documentUrl: string,
): string | null {
  const links = body.match(/<link\b[^>]*>/giu) ?? [];
  for (const link of links) {
    const rel = attribute(link, "rel");
    const type = attribute(link, "type");
    const href = attribute(link, "href");
    if (
      rel?.toLowerCase().split(/\s+/u).includes("alternate") &&
      type?.toLowerCase() === mediaType &&
      href
    ) {
      return new URL(decodeXml(href), documentUrl).toString();
    }
  }
  return null;
}

function hasNoindex(body: string): boolean {
  const metas = body.match(/<meta\b[^>]*>/giu) ?? [];
  return metas.some((meta) => {
    const name = attribute(meta, "name");
    const content = attribute(meta, "content");
    return (
      name?.toLowerCase() === "robots" &&
      Boolean(
        content
          ?.toLowerCase()
          .split(/[\s,]+/u)
          .includes("noindex"),
      )
    );
  });
}

function parseRobots(body: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let group: RobotsGroup = { agents: [], allow: [], disallow: [] };
  const flush = () => {
    if (group.agents.length > 0) groups.push(group);
    group = { agents: [], allow: [], disallow: [] };
  };
  for (const rawLine of body.split(/\r?\n/u)) {
    const line = rawLine.replace(/#.*$/u, "").trim();
    if (!line) {
      flush();
      continue;
    }
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      if (group.allow.length > 0 || group.disallow.length > 0) flush();
      group.agents.push(value);
    } else if (key === "allow") {
      group.allow.push(value);
    } else if (key === "disallow") {
      group.disallow.push(value);
    }
  }
  flush();
  return groups;
}

function deterministicSample(values: readonly string[], size: number): string[] {
  return [...new Set(values)]
    .map((value) => ({ value, key: createHash("sha256").update(value).digest("hex") }))
    .sort((left, right) => left.key.localeCompare(right.key))
    .slice(0, size)
    .map(({ value }) => value);
}

function sameOrigin(value: string, baseUrl: URL): boolean {
  try {
    return new URL(value).origin === baseUrl.origin;
  } catch {
    return false;
  }
}

function targetPath(value: string): string {
  try {
    return new URL(value).pathname;
  } catch {
    return "(invalid-url)";
  }
}

function isPrivatePath(value: string): boolean {
  try {
    const pathName = new URL(value).pathname;
    return PRIVATE_PREFIXES.some(
      (prefix) => pathName === prefix || pathName.startsWith(`${prefix}/`),
    );
  } catch {
    return true;
  }
}

async function fetchDocument(
  url: string,
  timeoutMs: number,
  fetchImplementation: typeof fetch,
): Promise<FetchedDocument> {
  const response = await fetchImplementation(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "User-Agent": "AgentSozluk-PublicDiscoveryReport/1.0" },
  });
  const advertisedLength = Number(response.headers.get("content-length") ?? "0");
  if (advertisedLength > MAX_RESPONSE_BYTES) throw new Error("RESPONSE_TOO_LARGE");
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) throw new Error("RESPONSE_TOO_LARGE");
  return {
    requestedUrl: url,
    finalUrl: response.url || url,
    redirected: response.redirected,
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    body,
  };
}

function endpointValid(
  document: FetchedDocument,
  expectedContentType: string,
  baseUrl: URL,
): boolean {
  return (
    document.status === 200 &&
    document.contentType.toLowerCase().startsWith(expectedContentType) &&
    sameOrigin(document.finalUrl, baseUrl)
  );
}

async function optionalFetch(
  pathName: string,
  expectedContentType: string,
  options: PublicDiscoveryOptions,
  issues: PublicDiscoveryIssue[],
  fetchImplementation: typeof fetch,
): Promise<FetchedDocument | null> {
  const url = new URL(pathName, options.baseUrl).toString();
  try {
    const document = await fetchDocument(url, options.timeoutMs, fetchImplementation);
    if (!endpointValid(document, expectedContentType, options.baseUrl)) {
      issues.push({ code: "ENDPOINT_CONTRACT_FAILED", target: pathName });
      return null;
    }
    return document;
  } catch (error) {
    issues.push({
      code: error instanceof Error ? error.message : "FETCH_FAILED",
      target: pathName,
    });
    return null;
  }
}

function validateRobots(body: string, issues: PublicDiscoveryIssue[]): void {
  const groups = parseRobots(body);
  for (const agent of RETRIEVAL_AGENTS) {
    const group = groups.find(({ agents }) => agents.includes(agent));
    if (
      !group ||
      !group.allow.includes("/") ||
      !["/moderasyon", "/api", "/ayarlar"].every((pathName) => group.disallow.includes(pathName))
    ) {
      issues.push({ code: "RETRIEVAL_CRAWLER_POLICY_MISSING", target: agent });
    }
  }
  for (const agent of TRAINING_AGENTS) {
    const group = groups.find(({ agents }) => agents.includes(agent));
    if (!group?.disallow.includes("/"))
      issues.push({ code: "TRAINING_CRAWLER_POLICY_MISSING", target: agent });
  }
}

function feedEntryUrls(body: string, format: "rss" | "atom"): string[] {
  if (format === "rss") return extractXmlValues(body, "guid");
  return [...body.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/giu)].flatMap((match) =>
    match[1] ? extractXmlValues(match[1], "id") : [],
  );
}

function llmsLinks(body: string): string[] {
  return [...body.matchAll(/\]\((https?:\/\/[^)\s]+)\)/giu)].flatMap((match) =>
    match[1] ? [match[1]] : [],
  );
}

export async function runPublicDiscoveryBaseline(
  options: PublicDiscoveryOptions,
  fetchImplementation: typeof fetch = fetch,
): Promise<PublicDiscoveryReport> {
  const issues: PublicDiscoveryIssue[] = [];
  const [robots, sitemapIndex, rss, atom, llms] = await Promise.all([
    optionalFetch("/robots.txt", "text/plain", options, issues, fetchImplementation),
    optionalFetch("/sitemap.xml", "application/xml", options, issues, fetchImplementation),
    optionalFetch("/feed.xml", "application/rss+xml", options, issues, fetchImplementation),
    optionalFetch("/atom.xml", "application/atom+xml", options, issues, fetchImplementation),
    optionalFetch("/llms.txt", "text/plain", options, issues, fetchImplementation),
  ]);

  if (robots) validateRobots(robots.body, issues);

  const sitemapLocations = sitemapIndex ? extractXmlValues(sitemapIndex.body, "loc") : [];
  if (!sitemapLocations.some((url) => new URL(url).pathname === "/sitemaps/static.xml"))
    issues.push({ code: "STATIC_SITEMAP_MISSING", target: "/sitemap.xml" });
  if (sitemapLocations.length > MAX_SITEMAP_FILES)
    issues.push({ code: "SITEMAP_FILE_LIMIT_EXCEEDED", target: "/sitemap.xml" });

  const sitemapFiles: FetchedDocument[] = [];
  for (const location of sitemapLocations.slice(0, MAX_SITEMAP_FILES)) {
    if (!sameOrigin(location, options.baseUrl)) {
      issues.push({ code: "SITEMAP_OFF_ORIGIN", target: targetPath(location) });
      continue;
    }
    const pathName = new URL(location).pathname;
    const document = await optionalFetch(
      pathName,
      "application/xml",
      options,
      issues,
      fetchImplementation,
    );
    if (document) sitemapFiles.push(document);
  }

  const sitemapUrls = sitemapFiles.flatMap(({ body }) => extractXmlValues(body, "loc"));
  const uniqueSitemapUrls = [...new Set(sitemapUrls)];
  if (uniqueSitemapUrls.length !== sitemapUrls.length)
    issues.push({ code: "SITEMAP_DUPLICATE_URL", target: "/sitemap.xml" });
  for (const url of uniqueSitemapUrls) {
    if (!sameOrigin(url, options.baseUrl))
      issues.push({ code: "SITEMAP_URL_OFF_ORIGIN", target: targetPath(url) });
    else if (isPrivatePath(url))
      issues.push({ code: "PRIVATE_URL_IN_SITEMAP", target: new URL(url).pathname });
  }

  const sample = deterministicSample(uniqueSitemapUrls, options.sampleSize);
  let canonicalPassed = 0;
  const canonicalValues: string[] = [];
  await Promise.all(
    sample.map(async (url) => {
      try {
        const document = await fetchDocument(url, options.timeoutMs, fetchImplementation);
        const canonical = extractCanonical(document.body, document.finalUrl);
        const isTopic = /^\/baslik\/[^/]+--[1-9]\d*$/u.test(new URL(url).pathname);
        const expectedRss = isTopic
          ? `${url}/feed.xml`
          : new URL("/feed.xml", options.baseUrl).toString();
        const expectedAtom = isTopic
          ? `${url}/atom.xml`
          : new URL("/atom.xml", options.baseUrl).toString();
        if (
          document.status !== 200 ||
          document.redirected ||
          document.finalUrl !== url ||
          canonical !== url ||
          extractAlternate(document.body, "application/rss+xml", document.finalUrl) !==
            expectedRss ||
          extractAlternate(document.body, "application/atom+xml", document.finalUrl) !==
            expectedAtom ||
          hasNoindex(document.body)
        ) {
          issues.push({ code: "CANONICAL_SAMPLE_FAILED", target: new URL(url).pathname });
          return;
        }
        canonicalPassed += 1;
        canonicalValues.push(canonical);
      } catch (error) {
        issues.push({
          code: error instanceof Error ? error.message : "CANONICAL_FETCH_FAILED",
          target: new URL(url).pathname,
        });
      }
    }),
  );

  const rssItems = rss ? feedEntryUrls(rss.body, "rss") : [];
  const atomEntries = atom ? feedEntryUrls(atom.body, "atom") : [];
  for (const [format, urls] of [
    ["rss", rssItems],
    ["atom", atomEntries],
  ] as const) {
    for (const url of urls) {
      if (
        !sameOrigin(url, options.baseUrl) ||
        !/^\/entry\/[1-9]\d*$/u.test(new URL(url).pathname)
      ) {
        issues.push({ code: "FEED_ITEM_URL_INVALID", target: format });
      }
    }
  }
  if (fingerprint(rssItems) !== fingerprint(atomEntries))
    issues.push({ code: "FEED_ITEM_SET_MISMATCH", target: "/feed.xml|/atom.xml" });
  const sitemapEntryUrls = new Set(
    uniqueSitemapUrls.filter((url) => /^\/entry\/[1-9]\d*$/u.test(new URL(url).pathname)),
  );
  if ([...new Set([...rssItems, ...atomEntries])].some((url) => !sitemapEntryUrls.has(url)))
    issues.push({ code: "FEED_ITEM_NOT_IN_SITEMAP", target: "/feed.xml|/atom.xml" });

  const publicLlmsLinks = llms ? llmsLinks(llms.body) : [];
  const requiredLlmsPaths = [
    "/hakkinda",
    "/kurallar",
    "/gizlilik",
    "/sitemap.xml",
    "/feed.xml",
    "/atom.xml",
  ];
  for (const pathName of requiredLlmsPaths) {
    if (!publicLlmsLinks.some((url) => new URL(url).pathname === pathName))
      issues.push({ code: "LLMS_REQUIRED_LINK_MISSING", target: pathName });
  }
  for (const url of publicLlmsLinks) {
    if (!sameOrigin(url, options.baseUrl) || isPrivatePath(url))
      issues.push({ code: "LLMS_LINK_INVALID", target: targetPath(url) });
  }

  return {
    checkedAt: new Date().toISOString(),
    baseUrl: options.baseUrl.origin,
    verdict: issues.length === 0 ? "PASS" : "FAIL",
    endpoints: {
      robots: Boolean(robots),
      sitemapIndex: Boolean(sitemapIndex),
      sitemapFiles: sitemapFiles.length,
      rss: Boolean(rss),
      atom: Boolean(atom),
      llms: Boolean(llms),
    },
    sitemap: {
      urlCount: uniqueSitemapUrls.length,
      fingerprint: fingerprint(uniqueSitemapUrls),
    },
    feeds: {
      rssItems: rssItems.length,
      atomEntries: atomEntries.length,
      itemFingerprint: fingerprint([...rssItems, ...atomEntries]),
    },
    canonicalSample: {
      requested: sample.length,
      passed: canonicalPassed,
      fingerprint: fingerprint(canonicalValues),
    },
    llmsLinks: publicLlmsLinks.length,
    issues,
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(help());
    return;
  }
  try {
    const report = await runPublicDiscoveryBaseline(parseArguments(argv));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.verdict !== "PASS") process.exitCode = 1;
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "PUBLIC_DISCOVERY_REPORT_FAILED"}\n`,
    );
    process.exitCode = 1;
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(path.resolve(entrypoint)).href) void main();

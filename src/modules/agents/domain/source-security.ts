import { isIP } from "node:net";
import { AppError } from "@/lib/http/errors";
import { sourceUrlHasSensitiveQuery } from "@/modules/agents/domain/source-query-security";

export { sourceUrlHasSensitiveQuery } from "@/modules/agents/domain/source-query-security";

export interface SourceNetworkPolicy {
  allowedNonDefaultPorts?: Readonly<Record<string, readonly number[]>>;
}

function privateIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && (octets[1] ?? 0) >= 16 && (octets[1] ?? 0) <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 100 && (octets[1] ?? 0) >= 64 && (octets[1] ?? 0) <= 127) ||
    (octets[0] === 192 && octets[1] === 0 && octets[2] === 0) ||
    (octets[0] === 192 && octets[1] === 0 && octets[2] === 2) ||
    (octets[0] === 192 && octets[1] === 88 && octets[2] === 99) ||
    (octets[0] === 198 && [18, 19].includes(octets[1] ?? -1)) ||
    (octets[0] === 198 && octets[1] === 51 && octets[2] === 100) ||
    (octets[0] === 203 && octets[1] === 0 && octets[2] === 113) ||
    (octets[0] ?? 0) >= 224 ||
    octets[0] === 0
  );
}

function ipv4MappedIpv6(address: string): string | null {
  if (isIP(address) !== 6) return null;

  let normalized = address.toLowerCase();
  const dottedTail = normalized.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/u);
  if (dottedTail) {
    const octets = dottedTail[2]!.split(".").map(Number);
    normalized = `${dottedTail[1]}${((octets[0] ?? 0) * 256 + (octets[1] ?? 0)).toString(16)}:${((octets[2] ?? 0) * 256 + (octets[3] ?? 0)).toString(16)}`;
  }

  const compressedAt = normalized.indexOf("::");
  const left = (compressedAt === -1 ? normalized : normalized.slice(0, compressedAt))
    .split(":")
    .filter(Boolean);
  const right = (compressedAt === -1 ? "" : normalized.slice(compressedAt + 2))
    .split(":")
    .filter(Boolean);
  const zeroCount = compressedAt === -1 ? 0 : 8 - left.length - right.length;
  const hextets = [...left, ...Array<string>(zeroCount).fill("0"), ...right].map((part) =>
    Number.parseInt(part, 16),
  );

  if (
    hextets.length !== 8 ||
    hextets.slice(0, 5).some((part) => part !== 0) ||
    hextets[5] !== 0xffff
  )
    return null;

  return [hextets[6]! >> 8, hextets[6]! & 0xff, hextets[7]! >> 8, hextets[7]! & 0xff].join(".");
}

function privateIpv6(address: string): boolean {
  const mappedIpv4 = ipv4MappedIpv6(address);
  if (mappedIpv4) return privateIpv4(mappedIpv4);

  const normalized = address.toLowerCase();
  const [firstPart = "", secondPart = ""] = normalized.split(":");
  const first = Number.parseInt(firstPart, 16);
  const second = Number.parseInt(secondPart, 16);
  if (!Number.isFinite(first) || first < 0x2000 || first > 0x3fff) return true;
  return first === 0x2001 && [0x2, 0xdb8].includes(second);
}

export function isPrivateSourceAddress(address: string): boolean {
  const version = isIP(address);
  return version === 4 ? privateIpv4(address) : version === 6 ? privateIpv6(address) : true;
}

function sourcePortAllowed(url: URL, policy: SourceNetworkPolicy): boolean {
  const defaultPort = url.protocol === "https:" ? 443 : 80;
  const port = url.port ? Number(url.port) : defaultPort;
  if (port === defaultPort) return true;
  const hostname = url.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
  return policy.allowedNonDefaultPorts?.[hostname]?.includes(port) ?? false;
}

export function parseSafeSourceUrl(value: string, policy: SourceNetworkPolicy = {}): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError("VALIDATION_ERROR", 422, "Source URL geçersizdir.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new AppError(
      "VALIDATION_ERROR",
      422,
      "Source yalnız kimlik bilgisiz HTTP/HTTPS olabilir.",
    );
  if (sourceUrlHasSensitiveQuery(url))
    throw new AppError(
      "VALIDATION_ERROR",
      422,
      "Credential veya imza taşıyan source query parametrelerine izin verilmez.",
    );
  if (!sourcePortAllowed(url, policy))
    throw new AppError(
      "VALIDATION_ERROR",
      422,
      "Source yalnız varsayılan HTTP/HTTPS portlarını veya açıkça izinli domain-port eşini kullanabilir.",
    );
  const hostname = url.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "metadata.google.internal" ||
    (isIP(hostname) > 0 && isPrivateSourceAddress(hostname))
  )
    throw new AppError(
      "VALIDATION_ERROR",
      422,
      "Private veya local source adresine izin verilmez.",
    );
  return url;
}

export function sourceFailureBackoffMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return 0;
  return Math.min(24 * 60 * 60 * 1000, 60_000 * 2 ** Math.min(10, consecutiveFailures - 1));
}

import { isIP } from "node:net";
import { AppError } from "@/lib/http/errors";

function privateIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && (octets[1] ?? 0) >= 16 && (octets[1] ?? 0) <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 100 && (octets[1] ?? 0) >= 64 && (octets[1] ?? 0) <= 127) ||
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
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/u.test(normalized) ||
    normalized.startsWith("2001:db8")
  );
}

export function isPrivateSourceAddress(address: string): boolean {
  const version = isIP(address);
  return version === 4 ? privateIpv4(address) : version === 6 ? privateIpv6(address) : true;
}

export function parseSafeSourceUrl(value: string): URL {
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

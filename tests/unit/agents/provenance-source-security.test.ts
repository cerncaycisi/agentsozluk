import { describe, expect, it } from "vitest";
import {
  isPrivateSourceAddress,
  parseSafeSourceUrl,
  sourceFailureBackoffMs,
  userEntryContainsHighRiskReproduction,
  userEntryClaimIsSafelyFramed,
} from "@/modules/agents";

describe("agent provenance and source boundaries", () => {
  it("detects explicit uncertainty framing without making it mandatory for ordinary opinion", () => {
    expect(userEntryClaimIsSafelyFramed("Bu başlıkta böyle bir iddia öne sürülüyor.")).toBe(true);
    expect(userEntryClaimIsSafelyFramed("Bu olay kesinlikle gerçekleşti.")).toBe(false);
  });

  it("hard-blocks attributed reproduction and severe allegations without blocking ordinary discussion", () => {
    expect(userEntryContainsHighRiskReproduction("Entry “bisiklet yolu var” diyor.")).toBe(true);
    expect(userEntryContainsHighRiskReproduction("Bu görüş 2026 yılında yaygınlaştı.")).toBe(false);
    expect(
      userEntryContainsHighRiskReproduction(
        "Bu tasarım seçim yükünü azaltmıyor; kararı yalnızca daha az görünür hale getiriyor.",
      ),
    ).toBe(false);
    expect(
      userEntryContainsHighRiskReproduction(
        "Kurum yöneticisinin dolandırıcılık yaptığı kesinleşti.",
      ),
    ).toBe(true);
    expect(
      userEntryContainsHighRiskReproduction(
        "Kamusal alanın paylaşımına ilişkin bir iddiayı tek gözlemden genellemek aceleci olur.",
      ),
    ).toBe(false);
  });

  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.1.2",
    "::1",
    "fd00::1",
    "::ffff:127.0.0.1",
    "::ffff:a9fe:a9fe",
  ])("rejects private source address %s", (address) =>
    expect(isPrivateSourceAddress(address)).toBe(true),
  );

  it("normalizes IPv4-mapped IPv6 literals before applying IPv4 source policy", () => {
    expect(isPrivateSourceAddress("0:0:0:0:0:ffff:169.254.169.254")).toBe(true);
    expect(isPrivateSourceAddress("::ffff:93.184.216.34")).toBe(false);
    expect(() => parseSafeSourceUrl("http://[::ffff:127.0.0.1]/admin")).toThrow();
  });

  it("allows only credential-free public HTTP(S) source URLs", () => {
    expect(parseSafeSourceUrl("https://example.com/feed").hostname).toBe("example.com");
    expect(() => parseSafeSourceUrl("file:///etc/passwd")).toThrow();
    expect(() => parseSafeSourceUrl("http://localhost/admin")).toThrow();
    expect(() => parseSafeSourceUrl("https://user:pass@example.com/private")).toThrow();
    for (const query of [
      "token=secret-value",
      "api_key=secret-value",
      "sig=secret-value",
      "X-Amz-Signature=secret-value",
      "X-Goog-Credential=secret-value",
    ])
      expect(() => parseSafeSourceUrl(`https://example.com/feed?${query}`)).toThrow(
        /query parametrelerine/iu,
      );
    expect(parseSafeSourceUrl("https://example.com/feed?format=rss").hostname).toBe("example.com");
  });

  it("uses bounded exponential source failure backoff", () => {
    expect(sourceFailureBackoffMs(0)).toBe(0);
    expect(sourceFailureBackoffMs(1)).toBe(60_000);
    expect(sourceFailureBackoffMs(4)).toBe(480_000);
    expect(sourceFailureBackoffMs(100)).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });
});

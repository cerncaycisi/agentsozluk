import { describe, expect, it } from "vitest";
import {
  isPrivateSourceAddress,
  parseSafeSourceUrl,
  sourceFailureBackoffMs,
  userEntryContainsHighRiskReproduction,
} from "@/modules/agents";

describe("agent provenance and source boundaries", () => {
  it("reads uncertainty framing through the live gate instead of a second unused list", () => {
    // Eskiden aynı sözlüğün ikinci bir kopyası provenance.ts'te duruyordu ve yalnız bu test
    // referans veriyordu. Çerçeveleme artık canlı yolun kendisiyle ölçülür.
    expect(
      userEntryContainsHighRiskReproduction("Bu başlıkta suçlu olduğu iddiası öne sürülüyor."),
    ).toBe(false);
    expect(userEntryContainsHighRiskReproduction("Bu kişinin suçlu olduğu kesinleşti.")).toBe(true);
    // `kaynağa göre` prompt'un önerdiği yedinci çerçevedir; canlı kapı onu tanımaz.
    expect(userEntryContainsHighRiskReproduction("Kaynağa göre bu kişi suçlu.")).toBe(true);
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
    "192.0.2.10",
    "198.18.0.1",
    "198.51.100.10",
    "203.0.113.10",
    "224.0.0.1",
    "::1",
    "fd00::1",
    "ff02::1",
    "2001:2::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
    "::ffff:a9fe:a9fe",
  ])("rejects private source address %s", (address) =>
    expect(isPrivateSourceAddress(address)).toBe(true),
  );

  it("normalizes IPv4-mapped IPv6 literals before applying IPv4 source policy", () => {
    expect(isPrivateSourceAddress("0:0:0:0:0:ffff:169.254.169.254")).toBe(true);
    expect(isPrivateSourceAddress("::ffff:93.184.216.34")).toBe(false);
    expect(() => parseSafeSourceUrl("http://[::ffff:127.0.0.1]/admin")).toThrow();
    expect(isPrivateSourceAddress("2606:4700:4700::1111")).toBe(false);
  });

  it("allows only credential-free public HTTP(S) source URLs", () => {
    expect(parseSafeSourceUrl("https://example.com/feed").hostname).toBe("example.com");
    expect(parseSafeSourceUrl("http://example.com/feed").port).toBe("");
    expect(() => parseSafeSourceUrl("https://example.com:8443/feed")).toThrow(
      /varsayılan HTTP\/HTTPS portlarını/iu,
    );
    expect(
      parseSafeSourceUrl("https://example.com:8443/feed", {
        allowedNonDefaultPorts: { "example.com": [8443] },
      }).port,
    ).toBe("8443");
    expect(() =>
      parseSafeSourceUrl("https://other.example:8443/feed", {
        allowedNonDefaultPorts: { "example.com": [8443] },
      }),
    ).toThrow(/varsayılan HTTP\/HTTPS portlarını/iu);
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

import { describe, expect, it } from "vitest";
import {
  isPrivateSourceAddress,
  parseSafeSourceUrl,
  userEntryClaimIsSafelyFramed,
} from "@/modules/agents";

describe("agent provenance and source boundaries", () => {
  it("requires uncertainty framing when USER_ENTRY is the only factual evidence", () => {
    expect(userEntryClaimIsSafelyFramed("Bu başlıkta böyle bir iddia öne sürülüyor.")).toBe(true);
    expect(userEntryClaimIsSafelyFramed("Bu olay kesinlikle gerçekleşti.")).toBe(false);
  });

  it.each(["127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.1.2", "::1", "fd00::1"])(
    "rejects private source address %s",
    (address) => expect(isPrivateSourceAddress(address)).toBe(true),
  );

  it("allows only credential-free public HTTP(S) source URLs", () => {
    expect(parseSafeSourceUrl("https://example.com/feed").hostname).toBe("example.com");
    expect(() => parseSafeSourceUrl("file:///etc/passwd")).toThrow();
    expect(() => parseSafeSourceUrl("http://localhost/admin")).toThrow();
    expect(() => parseSafeSourceUrl("https://user:pass@example.com/private")).toThrow();
  });
});

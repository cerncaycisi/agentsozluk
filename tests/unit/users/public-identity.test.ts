import { describe, expect, it } from "vitest";
import writerNaturalizationW1 from "@/modules/agents/personas/writer-naturalization-w1.json";
import {
  isReservedPublicProfileSlug,
  publicProfileSlug,
  resolvePublicProfileUsername,
} from "@/modules/users/domain/public-identity";

describe("public writer identity", () => {
  it("uses the approved dictionary nickname slug while retaining the internal username alias", () => {
    expect(publicProfileSlug("akisnobeti")).toBe("salidan-kalma");
    expect(resolvePublicProfileUsername("salidan-kalma")).toBe("akisnobeti");
    expect(resolvePublicProfileUsername("akisnobeti")).toBe("akisnobeti");
  });

  it("leaves ordinary non-mapped usernames unchanged", () => {
    expect(publicProfileSlug("ornek_yazar")).toBe("ornek_yazar");
    expect(resolvePublicProfileUsername("ornek_yazar")).toBe("ornek_yazar");
  });

  it("reserves every alias that resolves to another writer (F04)", () => {
    const profiles = writerNaturalizationW1.profiles as Array<{
      username: string;
      publicSlug: string;
    }>;
    const aliases = profiles.filter(({ username, publicSlug }) => username !== publicSlug);
    expect(aliases.length).toBeGreaterThan(0);
    for (const { publicSlug } of aliases)
      expect(isReservedPublicProfileSlug(publicSlug)).toBe(true);
    expect(isReservedPublicProfileSlug("Centik")).toBe(true);
    expect(isReservedPublicProfileSlug("centik")).toBe(true);
  });

  it("does not reserve real usernames or ordinary names", () => {
    expect(isReservedPublicProfileSlug("apartmanfilozofu")).toBe(false);
    expect(isReservedPublicProfileSlug("ornek_yazar")).toBe(false);
  });
});

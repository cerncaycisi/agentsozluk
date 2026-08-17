import { describe, expect, it } from "vitest";
import {
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
});

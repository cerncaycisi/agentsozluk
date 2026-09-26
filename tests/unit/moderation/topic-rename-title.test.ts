import { describe, expect, it } from "vitest";
import { topicRenameSchema } from "@/modules/moderation/validation/schemas";
import { topicTitleAddressIsAmbiguous } from "@/modules/topics/domain/normalization";

const reason = "Başlık yazımı düzeltiliyor, moderasyon gerekçesi.";

describe("topic rename title address rule", () => {
  it("rejects a rename whose unopened address would read as another topic id", () => {
    expect(topicRenameSchema.safeParse({ reason, title: "gitar--7" }).success).toBe(false);
    expect(
      topicRenameSchema.safeParse({ reason, title: "3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b x" })
        .success,
    ).toBe(false);
    expect(topicRenameSchema.safeParse({ reason, title: "gitar akorları" }).success).toBe(true);
  });

  it("treats unencodable text as ambiguous instead of throwing", () => {
    expect(topicTitleAddressIsAmbiguous("baş\ud800lık")).toBe(true);
    expect(topicTitleAddressIsAmbiguous("gitar -- 7")).toBe(false);
  });

  it("rejects titles whose address Next itself would rewrite", () => {
    expect(topicTitleAddressIsAmbiguous("_NEXTSEP_gitar")).toBe(true);
    expect(topicTitleAddressIsAmbiguous("_NEXTSEP_3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b")).toBe(
      true,
    );
    expect(topicTitleAddressIsAmbiguous("gitar--7.rsc")).toBe(true);
    expect(topicTitleAddressIsAmbiguous("notlar.rsc")).toBe(true);
    expect(topicTitleAddressIsAmbiguous("rsc dosyaları")).toBe(false);
    expect(topicTitleAddressIsAmbiguous("x _NEXTSEP_ y")).toBe(false);
    // Slug'ı UUID'ye benzeyen başlık kanonik adresi iki kimliğe okunur kılar (Astra, 5. tur).
    expect(topicTitleAddressIsAmbiguous("deadbeef 0000 4000 8000 000000000001")).toBe(true);
  });
});

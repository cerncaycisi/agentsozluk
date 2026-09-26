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
});

import { expect, it } from "vitest";
import { ukteTarget } from "@/modules/uktes/domain/target";
import { createTopicSlug } from "@/modules/topics/domain/normalization";

it("uses canonical aliases while separating an absent slug from a real baslik slug", () => {
  expect(ukteTarget("KİL hakkında")).toEqual({
    normalizedTitle: "kil hakkında",
    targetKeys: ["kil hakkında", "kil"],
    slug: "kil-hakkinda",
  });
  expect(ukteTarget("東京").slug).toBe("");
  expect(ukteTarget("başlık").slug).toBe("baslik");
  expect(createTopicSlug("東京")).toBe("baslik");
});

import { describe, expect, it } from "vitest";
import {
  entryPublicUrl,
  parseEntryRouteReference,
  parseTopicRouteReference,
  topicEntryAnchorUrl,
  parseUnopenedTopicSegment,
  topicPublicUrl,
  unopenedTopicUrl,
} from "@/lib/routing/public-urls";

describe("public content URLs", () => {
  it("builds canonical topic, entry and topic-entry URLs from immutable public ids", () => {
    const topic = { publicId: 42, slug: "agent-toplumu" };
    const entry = { publicId: 314 };
    expect(topicPublicUrl(topic)).toBe("/baslik/agent-toplumu--42");
    expect(entryPublicUrl(entry)).toBe("/entry/314");
    expect(topicEntryAnchorUrl({ topic, entry })).toBe("/baslik/agent-toplumu--42#entry-314");
  });

  it("parses canonical and legacy topic references without accepting ambiguous values", () => {
    expect(parseTopicRouteReference("agent-toplumu--42")).toEqual({
      kind: "public",
      publicId: 42,
      slug: "agent-toplumu",
    });
    expect(
      parseTopicRouteReference("00000000-0000-4000-8000-000000000101-eski-agent-toplumu"),
    ).toEqual({ kind: "legacy", id: "00000000-0000-4000-8000-000000000101" });
    expect(parseTopicRouteReference("agent-toplumu--0")).toBeNull();
    expect(parseTopicRouteReference("agent-toplumu--9007199254740992")).toBeNull();
  });

  it("gives an unopened topic an address built from the title itself", () => {
    expect(unopenedTopicUrl("açık kaynak")).toBe("/baslik/a%C3%A7%C4%B1k%20kaynak");
    // Adres başlığın kendisi olduğu için `--id` şemasıyla çakışmamalı.
    expect(parseTopicRouteReference("açık kaynak")).toBeNull();
  });

  it("reads an unopened topic title exactly the way the title would be stored", () => {
    expect(parseUnopenedTopicSegment("  açık   kaynak  ")).toBe("açık kaynak");
    // Segment ham gelir: yüzde kodlaması burada çözülür.
    expect(parseUnopenedTopicSegment("a%C3%A7%C4%B1k%20kaynak")).toBe("açık kaynak");
    expect(parseUnopenedTopicSegment("100%25 pamuk")).toBe("100% pamuk");
    // Bozuk yüzde dizisi başlık değil, geçersiz adrestir.
    expect(parseUnopenedTopicSegment("100% pamuk")).toBeNull();
    expect(parseUnopenedTopicSegment("Büyük Harfli Başlık")).toBe("Büyük Harfli Başlık");
  });

  it("refuses segments that cannot be a title", () => {
    expect(parseUnopenedTopicSegment("")).toBeNull();
    expect(parseUnopenedTopicSegment("   ")).toBeNull();
    expect(parseUnopenedTopicSegment("satır\natlamalı")).toBeNull();
  });

  it("caps the raw segment before decoding it, leaving title length to the schema", () => {
    // Başlığın uzunluk kuralı `topicTitleSchema`'nın; burada elenen yalnızca
    // çözülmesi bile bedava olmayan ham segment. 121 karakterlik bir başlık bu
    // katmandan geçer, API sözleşmesinde reddedilir.
    expect(parseUnopenedTopicSegment("a".repeat(121))).toBe("a".repeat(121));
    expect(parseUnopenedTopicSegment("a".repeat(2048))).toBe("a".repeat(2048));
    expect(parseUnopenedTopicSegment("a".repeat(2049))).toBeNull();
    // Ölçüm kodlanmış biçim üzerinde: sınırı aşan segment `decodeURIComponent`e
    // hiç girmiyor.
    expect(parseUnopenedTopicSegment("%20".repeat(683))).toBeNull();
  });

  it("settles on an address that re-reads to itself so the route cannot loop", () => {
    // Rota `segment !== encodeURIComponent(başlık)` olduğunda yönlendiriyor;
    // yönlendirdiği adres aynı testi geçmezse istek kendi üstüne döner.
    for (const raw of ["çift   boşluklu  başlık", "100% pamuk", "açık kaynak", " kenar boşluğu "]) {
      const target = unopenedTopicUrl(raw.trim().replaceAll(/\s+/gu, " "));
      const segment = target.slice("/baslik/".length);
      const title = parseUnopenedTopicSegment(segment);
      expect(title).not.toBeNull();
      expect(encodeURIComponent(title as string)).toBe(segment);
    }
  });

  it("parses canonical and legacy entry references", () => {
    expect(parseEntryRouteReference("314")).toEqual({ kind: "public", publicId: 314 });
    expect(parseEntryRouteReference("00000000-0000-4000-8000-000000000201")).toEqual({
      kind: "legacy",
      id: "00000000-0000-4000-8000-000000000201",
    });
    expect(parseEntryRouteReference("0")).toBeNull();
    expect(parseEntryRouteReference("entry-314")).toBeNull();
  });
});

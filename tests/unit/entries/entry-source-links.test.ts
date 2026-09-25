import { describe, expect, it } from "vitest";
import {
  MAX_ENTRY_SOURCE_LINKS,
  entrySourceLinksFrom,
  safeSourceLink,
  type EntrySourceItem,
} from "@/modules/entries/domain/source-links";
import { findEntrySourceEvidence } from "@/modules/entries/repository/entry-sources";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const trusted = (n: number, url: string): EntrySourceItem => ({
  id: id(n),
  canonicalUrl: url,
  sourceStatus: "TRUSTED",
  sourceAdminBlocked: false,
});

describe("entry kaynak bağlantıları (plan 6.3-1)", () => {
  it("yalnız http(s), kimlik bilgisi taşımayan adresi kabul eder; www'yi alan adından atar", () => {
    expect(safeSourceLink("https://www.ornek.com/haber?a=1")).toStrictEqual({
      url: "https://www.ornek.com/haber?a=1",
      domain: "ornek.com",
    });
    expect(safeSourceLink("http://ornek.org/x")?.domain).toBe("ornek.org");
    for (const bad of ["javascript:alert(1)", "ftp://ornek.com/a", "https://u:p@ornek.com/", "yok"])
      expect(safeSourceLink(bad)).toBeNull();
  });

  it("yalnız doğrulanmış kanıt türünde ve bugün TRUSTED, engelsiz kaynakta bağlantı verir", () => {
    const items: EntrySourceItem[] = [
      trusted(1, "https://a.com/1"),
      { ...trusted(2, "https://b.com/2"), sourceStatus: "PROBATION" },
      { ...trusted(3, "https://c.com/3"), sourceAdminBlocked: true },
      { ...trusted(4, "https://d.com/4"), sourceStatus: "BLOCKED" },
    ];
    const links = entrySourceLinksFrom(
      [
        {
          entryId: "e1",
          evidenceType: "TRUSTED_SOURCE",
          evidenceIds: [id(1), id(2), id(3), id(4)],
        },
        { entryId: "e2", evidenceType: "MODEL_KNOWLEDGE", evidenceIds: [id(1)] },
        { entryId: "e3", evidenceType: "PROBATION_SOURCE", evidenceIds: [id(1)] },
        { entryId: "e4", evidenceType: "MULTIPLE_SOURCES", evidenceIds: [id(1)] },
        { entryId: "e5", evidenceType: null, evidenceIds: [id(1)] },
        { entryId: "e6", evidenceType: "TRUSTED_SOURCE", evidenceIds: [id(2), id(9)] },
      ],
      items,
    );
    expect([...links.keys()]).toStrictEqual(["e1", "e4"]);
    expect(links.get("e1")).toStrictEqual([{ url: "https://a.com/1", domain: "a.com" }]);
  });

  it("aynı adresi tekrar etmez ve entry başına en fazla üç bağlantı verir", () => {
    const items = [1, 2, 3, 4, 5].map((n) => trusted(n, `https://s${n}.com/x`));
    items.push(trusted(6, "https://s1.com/x"));
    const links = entrySourceLinksFrom(
      [{ entryId: "e", evidenceType: "MULTIPLE_SOURCES", evidenceIds: [6, 1, 2, 3, 4].map(id) }],
      items,
    );
    expect(links.get("e")?.map((link) => link.domain)).toStrictEqual([
      "s1.com",
      "s2.com",
      "s3.com",
    ]);
    expect(links.get("e")).toHaveLength(MAX_ENTRY_SOURCE_LINKS);
  });

  it("depo katmanı provenance'ı güvenle ayrıştırır, geçersiz kimlikleri sorguya koymaz", async () => {
    const itemQueries: unknown[] = [];
    const transaction = {
      agentContentRecord: {
        findMany: async () => [
          {
            entryId: "e1",
            action: {
              provenance: { evidenceType: "TRUSTED_SOURCE", evidenceIds: [id(1), "bozuk", 7] },
            },
          },
          { entryId: "e2", action: { provenance: null } },
          { entryId: "e3", action: { provenance: ["dizi"] } },
        ],
      },
      agentSourceItem: {
        findMany: async (query: unknown) => {
          itemQueries.push(query);
          return [
            {
              id: id(1),
              canonicalUrl: "https://a.com/1",
              source: { status: "TRUSTED", adminBlocked: false },
            },
          ];
        },
      },
    };
    const result = await findEntrySourceEvidence(transaction as never, ["e1", "e2", "e3"]);
    expect(result.evidence).toStrictEqual([
      { entryId: "e1", evidenceType: "TRUSTED_SOURCE", evidenceIds: [id(1)] },
      { entryId: "e2", evidenceType: null, evidenceIds: [] },
      { entryId: "e3", evidenceType: null, evidenceIds: [] },
    ]);
    expect(itemQueries).toStrictEqual([
      {
        where: { id: { in: [id(1)] } },
        select: {
          id: true,
          canonicalUrl: true,
          source: { select: { status: true, adminBlocked: true } },
        },
      },
    ]);
    expect(result.items).toStrictEqual([
      {
        id: id(1),
        canonicalUrl: "https://a.com/1",
        sourceStatus: "TRUSTED",
        sourceAdminBlocked: false,
      },
    ]);
    expect(await findEntrySourceEvidence(transaction as never, [])).toStrictEqual({
      evidence: [],
      items: [],
    });
  });
});

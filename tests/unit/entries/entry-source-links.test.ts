import { describe, expect, it } from "vitest";
import {
  MAX_ENTRY_SOURCE_LINKS,
  entrySourceLinksFrom,
  safeSourceLink,
  type EntrySourceEvidence,
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
const evidence = (
  entryId: string,
  evidenceType: string | null,
  evidenceIds: string[],
  extra: Partial<EntrySourceEvidence> = {},
): EntrySourceEvidence => ({
  entryId,
  evidenceType,
  evidenceIds,
  entryActive: true,
  entryEdited: false,
  ...extra,
});

describe("entry kaynak bağlantıları (plan 6.3-1)", () => {
  it("yalnız http(s), kimlik bilgisi taşımayan adresi kabul eder; www'yi alan adından atar", () => {
    expect(safeSourceLink("https://www.ornek.com/haber?id=1")).toStrictEqual({
      url: "https://www.ornek.com/haber?id=1",
      domain: "ornek.com",
    });
    expect(safeSourceLink("http://ornek.org/x")?.domain).toBe("ornek.org");
    for (const bad of ["javascript:alert(1)", "ftp://ornek.com/a", "https://u:p@ornek.com/", "yok"])
      expect(safeSourceLink(bad)).toBeNull();
  });

  it("gizli değer taşıyabilen sorguyu ve uzun adresi yayımlamaz, parçayı atar (Astra P1)", () => {
    for (const bad of [
      "https://ornek.com/a?id_token=SYNTHETIC",
      "https://ornek.com/a?client_secret=SYNTHETIC",
      "https://ornek.com/a?token=SYNTHETIC",
      "https://ornek.com/a?API_KEY=SYNTHETIC",
      "https://ornek.com/a?sig=SYNTHETIC",
      `https://ornek.com/${"a".repeat(2100)}`,
    ])
      expect(safeSourceLink(bad), bad).toBeNull();
    expect(safeSourceLink("https://ornek.com/a#access_token=SYNTHETIC")).toStrictEqual({
      url: "https://ornek.com/a",
      domain: "ornek.com",
    });
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
        evidence("e1", "TRUSTED_SOURCE", [id(1), id(2), id(3), id(4)]),
        evidence("e2", "MODEL_KNOWLEDGE", [id(1)]),
        evidence("e3", "PROBATION_SOURCE", [id(1)]),
        evidence("e4", "MULTIPLE_SOURCES", [id(1)]),
        evidence("e5", null, [id(1)]),
        evidence("e6", "TRUSTED_SOURCE", [id(2), id(9)]),
      ],
      items,
    );
    expect([...links.keys()]).toStrictEqual(["e1", "e4"]);
    expect(links.get("e1")).toStrictEqual([{ url: "https://a.com/1", domain: "a.com" }]);
  });

  it("silinmiş/gizli ya da düzenlenmiş entry'de kaynak göstermez (Astra P1, P2)", () => {
    const links = entrySourceLinksFrom(
      [
        evidence("silinmis", "TRUSTED_SOURCE", [id(1)], { entryActive: false }),
        evidence("duzenlenmis", "TRUSTED_SOURCE", [id(1)], { entryEdited: true }),
        evidence("normal", "TRUSTED_SOURCE", [id(1)]),
      ],
      [trusted(1, "https://a.com/1")],
    );
    expect([...links.keys()]).toStrictEqual(["normal"]);
  });

  it("aynı adresi tekrar etmez ve entry başına en fazla üç bağlantı verir", () => {
    const items = [1, 2, 3, 4, 5].map((n) => trusted(n, `https://s${n}.com/x`));
    items.push(trusted(6, "https://s1.com/x#farkli-parca"));
    const links = entrySourceLinksFrom(
      [evidence("e", "MULTIPLE_SOURCES", [6, 1, 2, 3, 4].map(id))],
      items,
    );
    expect(links.get("e")?.map((link) => link.domain)).toStrictEqual([
      "s1.com",
      "s2.com",
      "s3.com",
    ]);
    expect(links.get("e")).toHaveLength(MAX_ENTRY_SOURCE_LINKS);
  });

  it("depo katmanı provenance'ı güvenle ayrıştırır; gösterilmeyecek entry'lerin kaynağını okumaz", async () => {
    const recordQueries: unknown[] = [];
    const itemQueries: unknown[] = [];
    const entry = (status: string, revisions: number) => ({ status, _count: { revisions } });
    const transaction = {
      agentContentRecord: {
        findMany: async (query: unknown) => {
          recordQueries.push(query);
          return [
            {
              entryId: "e1",
              action: {
                provenance: { evidenceType: "TRUSTED_SOURCE", evidenceIds: [id(1), "bozuk", 7] },
              },
              entry: entry("ACTIVE", 0),
            },
            { entryId: "e2", action: { provenance: null }, entry: entry("ACTIVE", 0) },
            {
              entryId: "e3",
              action: { provenance: { evidenceType: "TRUSTED_SOURCE", evidenceIds: [id(3)] } },
              entry: entry("DELETED", 0),
            },
            {
              entryId: "e4",
              action: { provenance: { evidenceType: "TRUSTED_SOURCE", evidenceIds: [id(4)] } },
              entry: entry("ACTIVE", 2),
            },
          ];
        },
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
    const result = await findEntrySourceEvidence(transaction as never, ["e1", "e2", "e3", "e4"]);
    expect(recordQueries).toStrictEqual([
      {
        where: { entryId: { in: ["e1", "e2", "e3", "e4"] } },
        select: {
          entryId: true,
          action: { select: { provenance: true } },
          entry: { select: { status: true, _count: { select: { revisions: true } } } },
        },
      },
    ]);
    expect(
      result.evidence.map(({ entryId, entryActive, entryEdited, evidenceIds }) => ({
        entryId,
        entryActive,
        entryEdited,
        evidenceIds,
      })),
    ).toStrictEqual([
      { entryId: "e1", entryActive: true, entryEdited: false, evidenceIds: [id(1)] },
      { entryId: "e2", entryActive: true, entryEdited: false, evidenceIds: [] },
      { entryId: "e3", entryActive: false, entryEdited: false, evidenceIds: [id(3)] },
      { entryId: "e4", entryActive: true, entryEdited: true, evidenceIds: [id(4)] },
    ]);
    // Silinmiş (e3) ve düzenlenmiş (e4) entry'lerin kaynak öğeleri sorguya girmez.
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
    expect(await findEntrySourceEvidence(transaction as never, [])).toStrictEqual({
      evidence: [],
      items: [],
    });
  });
});

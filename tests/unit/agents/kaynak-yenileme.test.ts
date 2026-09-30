import { describe, expect, it } from "vitest";
import { sourceDormancyVerdict } from "@/modules/agents/domain/source-dormancy";
import { summarizeSourceDiversity } from "@/modules/agents/domain/source-diversity";
import { runtimeUncountedSourceStatuses } from "@/modules/agents/domain/source-status";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import { seedPersonaPackSchema } from "@/modules/agents/personas/schema";
import { pickReplacementSource } from "@/modules/agents/personas/source-assignment";
import { verifiedSourcePool } from "@/modules/agents/personas/verified-source-pool";

/*
  Ölü kaynak değişimi ve çeşitlilik ölçümü (30 Eylül 2026): ajanlar kaynağı yalnız
  birbirinden öğrendiği için havuz kendiliğinden yenilenmiyor.
*/
const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-09-30T12:00:00Z");
const base = {
  status: "PROBATION",
  adminPinned: false,
  adminBlocked: false,
  consecutiveFailures: 6,
  lastUsefulAt: new Date(now.getTime() - 8 * DAY),
  createdAt: new Date(now.getTime() - 60 * DAY),
  fetchFailed: true,
  itemCount: 0,
  now,
};

describe("ölü kaynak kararı", () => {
  it("art arda hata ve bir haftalık sessizlik birlikte gerekir", () => {
    expect(sourceDormancyVerdict(base)).toBe("FETCH_FAILING");
    expect(sourceDormancyVerdict({ ...base, consecutiveFailures: 5 })).toBeNull();
    expect(
      sourceDormancyVerdict({ ...base, lastUsefulAt: new Date(now.getTime() - 2 * DAY) }),
    ).toBeNull();
  });

  it("hiç işe yaramamış kaynakta sessizlik eklenişten sayılır", () => {
    expect(sourceDormancyVerdict({ ...base, lastUsefulAt: null })).toBe("FETCH_FAILING");
    expect(
      sourceDormancyVerdict({
        ...base,
        lastUsefulAt: null,
        createdAt: new Date(now.getTime() - 3 * DAY),
      }),
    ).toBeNull();
  });

  it("21 gündür boş dönen besleme uykuya alınır, öğe dönen alınmaz", () => {
    const empty = { ...base, fetchFailed: false, consecutiveFailures: 0 };
    expect(
      sourceDormancyVerdict({ ...empty, lastUsefulAt: new Date(now.getTime() - 22 * DAY) }),
    ).toBe("EMPTY_FEED");
    expect(
      sourceDormancyVerdict({ ...empty, lastUsefulAt: new Date(now.getTime() - 20 * DAY) }),
    ).toBeNull();
    expect(
      sourceDormancyVerdict({
        ...empty,
        itemCount: 3,
        lastUsefulAt: new Date(now.getTime() - 40 * DAY),
      }),
    ).toBeNull();
  });

  it("sabitlenmiş, engellenmiş ya da zaten sunulmayan kaynağa dokunmaz", () => {
    expect(sourceDormancyVerdict({ ...base, adminPinned: true })).toBeNull();
    expect(sourceDormancyVerdict({ ...base, adminBlocked: true })).toBeNull();
    for (const status of ["DORMANT", "REJECTED", "BLOCKED"])
      expect(sourceDormancyVerdict({ ...base, status })).toBeNull();
  });

  it("uykudaki kaynak canlı sayılmaz", () => {
    expect(runtimeUncountedSourceStatuses).toContain("DORMANT");
  });
});

describe("yedek kaynak seçimi", () => {
  const persona = seedPersonaPackSchema.parse(originalPersonaPack).personas[0]!;
  const pool = verifiedSourcePool();
  const pick = (overrides: Partial<Parameters<typeof pickReplacementSource>[0]> = {}) =>
    pickReplacementSource({
      username: persona.username,
      persona,
      pool,
      heldUrls: new Set(persona.sources.map(({ url }) => url)),
      unhealthyUrls: new Set(),
      holders: new Map(),
      holderLimit: 5,
      ...overrides,
    });

  it("tutulan, sağlıksız ve sınırdaki kaynağı seçmez", () => {
    const first = pick()!;
    expect(persona.sources.some(({ url }) => url === first.url)).toBe(false);
    expect(pick({ unhealthyUrls: new Set([first.url]) })?.url).not.toBe(first.url);
    expect(pick({ holders: new Map([[first.url, 5]]) })?.url).not.toBe(first.url);
  });

  it("uygun kaynak kalmazsa sınırı delmek yerine null döner", () => {
    expect(pick({ holders: new Map(pool.map(({ url }) => [url, 5])) })).toBeNull();
  });
});

describe("çeşitlilik özeti", () => {
  const rows = (sets: string[][]) =>
    sets.flatMap((urls, index) => urls.map((url) => ({ agentProfileId: `a${index}`, url })));

  it("ortak kaynak oranını, sınır aşımını ve kanonik izni hesaplar", () => {
    const summary = summarizeSourceDiversity(
      rows([
        ["u1", "u2"],
        ["u1", "u3"],
      ]),
      { holderLimit: 1, allowedHolders: (url) => (url === "u1" ? 2 : 0) },
    );
    expect(summary.meanPairOverlap).toBeCloseTo(1 / 3);
    expect(summary.distinctUrls).toBe(3);
    expect(summary.overLimitUrls).toEqual([]);
    expect(summary.warnings).toEqual(
      expect.arrayContaining(["PAIR_OVERLAP_HIGH", "DISTINCT_URLS_LOW", "AGENT_BELOW_MINIMUM"]),
    );
    expect(
      summarizeSourceDiversity(rows([["u1"], ["u1"]]), {
        holderLimit: 1,
        allowedHolders: () => 0,
      }).overLimitUrls,
    ).toEqual([{ url: "u1", holders: 2, allowed: 1 }]);
  });

  it("dağınık kaynaklarda uyarı vermez", () => {
    const sets = Array.from({ length: 12 }, (_, agent) =>
      Array.from({ length: 12 }, (_, index) => `u${agent * 12 + index}`),
    );
    expect(
      summarizeSourceDiversity(rows(sets), { holderLimit: 5, allowedHolders: () => 0 }).warnings,
    ).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import { expandedVerifiedSources } from "@/modules/agents/personas/expanded-sources";
import { seedPersonaPackSchema, type SeedPersona } from "@/modules/agents/personas/schema";
import {
  planDiverseSourceAssignment,
  sourceInterestAffinity,
  uniqueVerifiedSourcePool,
} from "@/modules/agents/personas/source-assignment";
import { reviewedSourceLocaleFocus } from "@/modules/agents/personas/source-locale-metadata";

/*
  Çeşitlendirilmiş kaynak planı (29 Eylül 2026): bir kaynak en fazla beş ajana gider, yakınlık
  yalnız ilgi alanlarından gelir, kanonik paket kaynakları sabit kalıp sınıra sayılır.
*/
const pack = seedPersonaPackSchema.parse(originalPersonaPack);
const pool = [...uniqueVerifiedSourcePool(pack.personas)];
for (const source of expandedVerifiedSources)
  if (!pool.some(({ url }) => url === source.url)) pool.push(source);
const base = pack.personas[0]!;
const persona = (username: string, interests: [string, number][]): SeedPersona => ({
  ...base,
  username,
  interests: interests.map(([key, weight]) => ({ key, weight, pinned: false })),
});
const imported = Array.from({ length: 30 }, (_, index) =>
  persona(`yazar_${String(index).padStart(2, "0")}`, [
    ["şehir hayatı", 0.3],
    ["müzik", 0.2],
    ["gündelik ekonomi", 0.1],
  ]),
);

describe("çeşitlendirilmiş kaynak planı", () => {
  it("aynı ilgili 30 ajanda bile bir kaynağı en fazla beş ajana verir", () => {
    const plan = planDiverseSourceAssignment(
      imported.map((p) => ({ username: p.username, persona: p })),
      pool,
    );
    const holders = new Map<string, number>();
    for (const sources of plan.values()) {
      expect(sources.length).toBeGreaterThanOrEqual(10);
      expect(new Set(sources.map(({ url }) => url)).size).toBe(sources.length);
      for (const { url } of sources) holders.set(url, (holders.get(url) ?? 0) + 1);
    }
    expect(Math.max(...holders.values())).toBeLessThanOrEqual(5);
  });

  it("kanonik kaynakları değiştirmez ama sınıra sayar", () => {
    const fixed = pack.personas.map((p) => ({
      username: p.username,
      persona: p,
      fixedSources: p.sources,
    }));
    const plan = planDiverseSourceAssignment(
      [...fixed, ...imported.map((p) => ({ username: p.username, persona: p }))],
      pool,
    );
    for (const p of pack.personas) expect(plan.get(p.username)).toEqual(p.sources);
    const fixedHolders = new Map<string, number>();
    for (const p of pack.personas)
      for (const { url } of p.sources) fixedHolders.set(url, (fixedHolders.get(url) ?? 0) + 1);
    for (const p of imported)
      for (const { url } of plan.get(p.username)!)
        expect(fixedHolders.get(url) ?? 0).toBeLessThan(5);
  });

  it("sıralamadan bağımsız ve deterministik", () => {
    const targets = imported.map((p) => ({ username: p.username, persona: p }));
    const first = planDiverseSourceAssignment(targets, pool);
    const second = planDiverseSourceAssignment([...targets].reverse(), [...pool].reverse());
    for (const p of imported)
      expect(
        second
          .get(p.username)!
          .map(({ url }) => url)
          .sort(),
      ).toEqual(
        first
          .get(p.username)!
          .map(({ url }) => url)
          .sort(),
      );
  });

  it("kapasite sınır içinde yetmezse sınırı delmek yerine hata verir", () => {
    const small = pool.slice(0, 12);
    expect(() =>
      planDiverseSourceAssignment(
        imported.slice(0, 8).map((p) => ({ username: p.username, persona: p })),
        small,
      ),
    ).toThrow(/SOURCE_ASSIGNMENT_CAPACITY_EXCEEDED/u);
  });

  it("ajanın engelli kaynağını o ajan için seçmez", () => {
    const target = imported[0]!;
    const first = planDiverseSourceAssignment(
      [{ username: target.username, persona: target }],
      pool,
    );
    const blocked = new Set(
      first
        .get(target.username)!
        .slice(0, 3)
        .map(({ url }) => url),
    );
    const second = planDiverseSourceAssignment(
      [{ username: target.username, persona: target, excludedUrls: blocked }],
      pool,
    );
    for (const { url } of second.get(target.username)!) expect(blocked.has(url)).toBe(false);
    expect(second.get(target.username)!.length).toBeGreaterThanOrEqual(10);
  });

  it("yakınlık yalnız ilgi alanlarından gelir: oyun meraklısına oyun kaynağı düşer", () => {
    const gamer = persona("oyuncu", [
      ["video oyunları", 0.4],
      ["masa oyunları", 0.3],
    ]);
    const plan = planDiverseSourceAssignment([{ username: "oyuncu", persona: gamer }], pool);
    const top = plan.get("oyuncu")!.slice(0, 4);
    for (const source of top) expect(sourceInterestAffinity(gamer, source)).toBeGreaterThan(0);
    expect(top.some(({ topics }) => topics.includes("oyun"))).toBe(true);
  });

  it("genişletilmiş havuzun Türkçe kaynakları dil odağı kaydında", () => {
    expect(reviewedSourceLocaleFocus("https://www.webtekno.com/rss.xml")).toBe("TURKISH_LANGUAGE");
    expect(reviewedSourceLocaleFocus("https://www.theverge.com/rss/index.xml")).toBe("GLOBAL");
  });
});

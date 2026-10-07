import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { deriveRuntimePerceptionEvidence } from "@/modules/agents/domain/runtime-evidence";
import {
  runtimeEvidenceCatalogFrom,
  runtimeReadTopicIds,
  runtimeReadTopicSnapshot,
} from "@/modules/agents/domain/runtime-evidence-catalog";

describe("runtime typed evidence catalog", () => {
  it("does not let an ID buried in a memory legitimize a source citation", () => {
    /*
      §4.3'ün asıl inceliği: snapshot'taki BÜTÜN UUID'leri toplamak action
      provenance'ı için fazla geniş. Aşağıda ajana gösterilen tek şey bir
      memory kaydı; o kaydın içinde bir source item kimliği geçiyor ama
      kaynağın metni ajana hiç sunulmadı. Geniş türetme bu kimliği kanıt
      sayardı, tipli katalog saymaz.
    */
    const runId = randomUUID();
    const hiddenSourceItemId = randomUUID();
    const perception = {
      memories: [
        {
          id: randomUUID(),
          evidence: { sourceItemId: hiddenSourceItemId },
        },
      ],
    };

    expect(deriveRuntimePerceptionEvidence(perception, [runId]).ids).toContain(hiddenSourceItemId);

    const catalog = runtimeEvidenceCatalogFrom(perception, runId);
    expect(catalog.TRUSTED_SOURCE).not.toContain(hiddenSourceItemId);
    expect(catalog.PROBATION_SOURCE).not.toContain(hiddenSourceItemId);
    expect(catalog.MULTIPLE_SOURCES).not.toContain(hiddenSourceItemId);
    expect(catalog.USER_ENTRY).not.toContain(hiddenSourceItemId);
    expect(catalog.PLATFORM_EVENT).not.toContain(hiddenSourceItemId);
  });

  it("admits a source item only under the evidence type its status maps to", () => {
    const runId = randomUUID();
    const trustedItemId = randomUUID();
    const probationItemId = randomUUID();
    const catalog = runtimeEvidenceCatalogFrom(
      {
        sourceItems: [
          { sourceId: randomUUID(), itemId: trustedItemId, sourceStatus: "TRUSTED" },
          { sourceId: randomUUID(), itemId: probationItemId, sourceStatus: "PROBATION" },
        ],
      },
      runId,
    );

    expect(catalog.TRUSTED_SOURCE).toEqual([trustedItemId]);
    expect(catalog.PROBATION_SOURCE).toEqual([probationItemId]);
    expect(catalog.MULTIPLE_SOURCES).toEqual([trustedItemId, probationItemId]);
  });

  it("admits entries the browse phase brought in, so reading them is citable", () => {
    // Gezinme fazının getirdiği entry katalogda olmazsa ajana tam metin
    // gösterilip kaynak göstermesi yasaklanır ve koşu provenance ile düşer.
    const runId = randomUUID();
    const readEntryId = randomUUID();
    const readTopicId = randomUUID();
    const catalog = runtimeEvidenceCatalogFrom(
      { readTopics: [{ id: readTopicId, entries: [{ id: readEntryId }] }] },
      runId,
    );

    expect(catalog.USER_ENTRY).toContain(readEntryId);
    expect(catalog.PLATFORM_EVENT).toContain(readTopicId);
  });

  it("always admits the run itself and nothing else without a snapshot", () => {
    const runId = randomUUID();
    const catalog = runtimeEvidenceCatalogFrom(null, runId);

    expect(catalog.MODEL_KNOWLEDGE).toEqual([runId]);
    expect(catalog.PLATFORM_EVENT).toEqual([runId]);
    expect(catalog.USER_ENTRY).toEqual([]);
    expect(catalog.TRUSTED_SOURCE).toEqual([]);
    expect(catalog.AGENT_MEMORY).toEqual([]);
  });
});

describe("runtime read topic snapshot", () => {
  const entry = (index: number) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    createdAt: new Date(Date.UTC(2026, 9, 7, 10, index)).toISOString(),
  });
  it("treats a short snapshot as the whole topic and a long one as its newest window", () => {
    const topicId = "10000000-0000-4000-8000-000000000001";
    expect(runtimeReadTopicSnapshot({ readTopics: [] }, topicId, 15)).toBeNull();
    expect(
      runtimeReadTopicSnapshot({ readTopics: [{ id: topicId, entries: [] }] }, topicId, 15),
    ).toEqual({ seenEntryIds: [], newerThan: null });
    // Tanım entry'si (0) + en yeni on beş (6..20): pencere 6. entry'nin zamanında başlar.
    const long = [entry(0), ...Array.from({ length: 15 }, (_, index) => entry(20 - index))];
    expect(
      runtimeReadTopicSnapshot({ readTopics: [{ id: topicId, entries: long }] }, topicId, 15),
    ).toEqual({
      seenEntryIds: long.map(({ id }) => id),
      newerThan: new Date(entry(6).createdAt),
    });
    expect(runtimeReadTopicIds({ readTopics: [{ id: topicId }, { title: "kimliksiz" }] })).toEqual(
      new Set([topicId]),
    );
  });
});

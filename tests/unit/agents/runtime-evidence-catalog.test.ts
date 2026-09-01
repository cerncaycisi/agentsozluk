import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { deriveRuntimePerceptionEvidence } from "@/modules/agents/domain/runtime-evidence";
import { runtimeEvidenceCatalogFrom } from "@/modules/agents/domain/runtime-evidence-catalog";

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

import { runtimeSourceEvidenceTypeForStatus } from "@/modules/agents/domain/source-status";

/**
 * Bir koşunun dondurulmuş perception'ından türetilen TİPLİ kanıt kataloğu:
 * her kanıt türü için ajana gerçekten gösterilmiş kimlikler.
 *
 * Tek kaynak burasıdır. Worker bunu modele karşı kapı olarak kullanıyor
 * (`runtimeDecisionUsesCatalog`); sunucu da action provenance doğrulamasında
 * aynısını kullanmalı. İki taraf ayrışırsa ya modele gösterilen ile sunucunun
 * kabul ettiği küme çelişir (meşru koşular düşer) ya da sunucu tarafı kapı
 * modelden daha geniş kalır.
 *
 * Neden `deriveRuntimePerceptionEvidence` yeterli değil: o fonksiyon snapshot
 * içindeki BÜTÜN UUID'leri topluyor — `sourceId`, `personaVersionId`, memory
 * kayıtlarının iç kimlikleri dahil. Reflection delta doğrulaması için doğru,
 * ama action provenance için fazla geniş: örneğin gösterilen bir memory'nin
 * içindeki `sourceItemId`, o kaynağın metni ajana hiç gösterilmemişken kaynak
 * kanıtını meşrulaştırırdı (Sol hakem turu, §4.3).
 */

export const runtimeEvidenceTypes = [
  "PLATFORM_EVENT",
  "USER_ENTRY",
  "MODEL_KNOWLEDGE",
  "TRUSTED_SOURCE",
  "PROBATION_SOURCE",
  "MULTIPLE_SOURCES",
  "AGENT_MEMORY",
] as const;

export type RuntimeEvidenceType = (typeof runtimeEvidenceTypes)[number];
export type RuntimeEvidenceCatalog = Record<RuntimeEvidenceType, string[]>;

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function stringField(value: Record<string, unknown>, key: string): string | null {
  return typeof value[key] === "string" ? value[key] : null;
}

function nestedStringField(value: Record<string, unknown>, parent: string, key: string) {
  const nested = value[parent];
  return nested && typeof nested === "object" && !Array.isArray(nested)
    ? stringField(nested as Record<string, unknown>, key)
    : null;
}

export function runtimeEvidenceCatalogFrom(
  perceptionSummary: unknown,
  runId: string,
): RuntimeEvidenceCatalog {
  const perception =
    perceptionSummary && typeof perceptionSummary === "object" && !Array.isArray(perceptionSummary)
      ? (perceptionSummary as Record<string, unknown>)
      : {};
  const writerOpenedTopics = recordArray(perception.writerOpenedTopics);
  const linkedTopics = recordArray(perception.linkedTopics);
  const linkedTopicEntries = linkedTopics.flatMap((linkedTopic) =>
    recordArray(linkedTopic.recentEntries),
  );
  /*
    Gezinme fazının getirdiği başlıklar. Katalogda olmazlarsa ajana tam metin
    gösterilir, ajan onu kaynak gösterir ve koşu provenance hatasıyla düşer;
    fazın tüm amacı bu entry'lere yanıt yazdırmak.
  */
  const readTopics = recordArray(perception.readTopics);
  const readTopicEntries = readTopics.flatMap((topic) => recordArray(topic.entries));
  const recentEntries = [
    ...recordArray(perception.recentEntries),
    ...recordArray(perception.ownRecentEntries),
    ...linkedTopicEntries,
    ...readTopicEntries,
  ];
  const offeredTopics = [
    ...recordArray(perception.trendingTopics),
    ...recordArray(perception.newTopics),
    ...recordArray(perception.followedTopics),
    ...readTopics,
  ];
  const followedWriterEntries = recordArray(perception.followedWriterEntries);
  const sourceItems = recordArray(perception.sourceItems);
  const sourceIdsForType = (evidenceType: "TRUSTED_SOURCE" | "PROBATION_SOURCE") =>
    sourceItems.flatMap((item) =>
      runtimeSourceEvidenceTypeForStatus(stringField(item, "sourceStatus") ?? "") ===
        evidenceType && stringField(item, "itemId")
        ? [stringField(item, "itemId")!]
        : [],
    );
  const trustedSourceIds = sourceIdsForType("TRUSTED_SOURCE");
  const probationSourceIds = sourceIdsForType("PROBATION_SOURCE");
  const unique = (values: Array<string | null>) => [...new Set(values.filter(Boolean) as string[])];
  return {
    PLATFORM_EVENT: unique([
      runId,
      ...writerOpenedTopics.map((topic) => stringField(topic, "id")),
      ...offeredTopics.map((topic) => stringField(topic, "id")),
      ...followedWriterEntries.map((entry) => stringField(entry, "topicId")),
      ...recentEntries.map((entry) => nestedStringField(entry, "topic", "id")),
      ...linkedTopics.map((linkedTopic) => nestedStringField(linkedTopic, "topic", "id")),
    ]),
    USER_ENTRY: unique(recentEntries.map((entry) => stringField(entry, "id"))),
    MODEL_KNOWLEDGE: unique([runId]),
    TRUSTED_SOURCE: unique(trustedSourceIds),
    PROBATION_SOURCE: unique(probationSourceIds),
    MULTIPLE_SOURCES: unique([...trustedSourceIds, ...probationSourceIds]),
    AGENT_MEMORY: unique(
      recordArray(perception.memories).map((memory) => stringField(memory, "id")),
    ),
  };
}

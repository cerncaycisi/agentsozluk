import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseClient, DatabaseExecutor, TransactionClient } from "@/lib/db/types";
import { topicPublicUrl } from "@/lib/routing/public-urls";
import { collectEntryReferenceCandidates } from "@/modules/entries/domain/renderer";
import {
  planRelatedTopicLinks,
  RELATED_TOPIC_LIMIT,
  RELATED_TOPIC_SIGNAL_TOP,
  summarizeRelatedTopicPlan,
  type PlannedRelatedTopicLink,
  type RelatedTopicBkzTarget,
  type RelatedTopicPlanSummary,
} from "@/modules/topics/domain/related-topics";
import {
  currentTransactionTime,
  findContentSignalTop,
  findReferencedTopics,
  findRelatedTopicLinks,
  findTitleSignalTop,
  limitRelatedTopicStatements,
  listReferenceEntryBodies,
  listRelatedTopicWorkspaceTopics,
  prepareRelatedTopicWorkspace,
  replaceRelatedTopicLinks,
  tryLockRelatedTopicComputation,
} from "@/modules/topics/repository/related-topics";

/*
  İlgili başlıklar: gece hesabı ve sayfa okuması. Karar ve ölçüm `domain/related-topics.ts`
  başında; sinyal SQL'i `repository/related-topics.ts` başında.

  Hesap tek transaction'dır. `apply` açıksa aynı transaction tabloyu siler ve yeniden yazar;
  herhangi bir adım düşerse önceki küme olduğu gibi kalır. `apply` kapalıysa hiçbir kalıcı yazım
  yapılmaz (yalnız `ON COMMIT DROP` geçici tablolar).
*/

/** Tek ifade 300 sn; tüm hesap systemd'nin 15 dakikasının içinde kalır. */
export const RELATED_TOPIC_TRANSACTION_TIMEOUT_MS = 13 * 60_000;
/** Kaynak partisi: A ve C sorguları parti başına çalışır, bellek ve ifade süresi sınırlı kalır. */
export const RELATED_TOPIC_BATCH_SIZE = 250;

export interface RelatedTopicComputation {
  summary: RelatedTopicPlanSummary;
  applied: boolean;
  written: number;
  computedAt: Date;
  /** Uygun başlıkların adı; yalnız operatör örneği için (başlıklar zaten herkese açık). */
  titles: ReadonlyMap<string, string>;
  plans: ReadonlyMap<string, readonly PlannedRelatedTopicLink[]>;
}

function groupIds(rows: ReadonlyArray<{ topicId: string; relatedTopicId: string }>) {
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const list = grouped.get(row.topicId);
    if (list) list.push(row.relatedTopicId);
    else grouped.set(row.topicId, [row.relatedTopicId]);
  }
  return grouped;
}

async function resolveBkzTargets(
  transaction: TransactionClient,
  sourceIds: readonly string[],
): Promise<Map<string, RelatedTopicBkzTarget[]>> {
  // Başlık başına normalize başlık adları ve ilk geçtikleri entry, yazılış sırasıyla.
  const titlesByTopic = new Map<string, Map<string, string>>();
  const allTitles = new Set<string>();
  for (const row of await listReferenceEntryBodies(transaction, sourceIds)) {
    let titles = titlesByTopic.get(row.topicId);
    for (const title of collectEntryReferenceCandidates([row.body]).topics) {
      if (!titles) titlesByTopic.set(row.topicId, (titles = new Map()));
      if (!titles.has(title)) titles.set(title, row.id);
      allTitles.add(title);
    }
  }
  if (allTitles.size === 0) return new Map();
  // `getEntryReferenceIndex` ile aynı eşleme: kendi adı ya da takma adı.
  const topicByTitle = new Map<string, string>();
  for (const topic of await findReferencedTopics(transaction, [...allTitles])) {
    if (allTitles.has(topic.normalizedTitle)) topicByTitle.set(topic.normalizedTitle, topic.id);
    for (const alias of topic.aliases) topicByTitle.set(alias.normalizedTitle, topic.id);
  }
  const targets = new Map<string, RelatedTopicBkzTarget[]>();
  for (const [topicId, titles] of titlesByTopic) {
    const resolved = [...titles].flatMap(([title, entryId]) => {
      const id = topicByTitle.get(title);
      return id ? [{ topicId: id, entryId }] : [];
    });
    if (resolved.length > 0) targets.set(topicId, resolved);
  }
  return targets;
}

/** Başka bir hesap kilidi tutuyorsa hiçbir şey okunmaz ve yazılmaz. */
export type RelatedTopicComputationResult =
  ({ status: "OK" } & RelatedTopicComputation) | { status: "ALREADY_RUNNING" };

export async function computeRelatedTopicLinks(
  client: DatabaseClient,
  input: { apply: boolean; batchSize?: number },
): Promise<RelatedTopicComputationResult> {
  const batchSize = input.batchSize ?? RELATED_TOPIC_BATCH_SIZE;
  return client.$transaction(
    async (transaction): Promise<RelatedTopicComputationResult> => {
      // Liste modu da kilidi alır: pahalı hazırlık iki kez koşmasın.
      if (!(await tryLockRelatedTopicComputation(transaction)))
        return { status: "ALREADY_RUNNING" };
      await limitRelatedTopicStatements(transaction);
      /*
        computedAt veritabanının transaction başlangıç saatidir; okuma bunu entry'lerin
        silinme/gizlenme/bastırılma zamanlarıyla karşılaştırır. Hesabın hiçbir ifadesi bu
        andan önceki bir görüntüyü okumaz; sonradan gelen değişiklik bağı düşürür.
      */
      const computedAt = await currentTransactionTime(transaction);
      const topicCount = await prepareRelatedTopicWorkspace(transaction);
      const topics = await listRelatedTopicWorkspaceTopics(transaction);
      const titles = new Map(topics.map((topic) => [topic.id, topic.title] as const));
      const isEligible = (topicId: string) => titles.has(topicId);
      const plans = new Map<string, PlannedRelatedTopicLink[]>();
      for (let index = 0; index < topics.length; index += batchSize) {
        const sourceIds = topics.slice(index, index + batchSize).map((topic) => topic.id);
        const titleTop = groupIds(
          await findTitleSignalTop(transaction, sourceIds, RELATED_TOPIC_SIGNAL_TOP),
        );
        const contentTop = groupIds(
          await findContentSignalTop(transaction, sourceIds, {
            topicCount,
            top: RELATED_TOPIC_SIGNAL_TOP,
          }),
        );
        const bkzTargets = await resolveBkzTargets(transaction, sourceIds);
        for (const topicId of sourceIds) {
          const links = planRelatedTopicLinks(
            {
              topicId,
              bkzTargets: bkzTargets.get(topicId) ?? [],
              titleSignalIds: titleTop.get(topicId) ?? [],
              contentSignalIds: contentTop.get(topicId) ?? [],
            },
            isEligible,
          );
          if (links.length > 0) plans.set(topicId, links);
        }
      }
      const written = input.apply
        ? await replaceRelatedTopicLinks(transaction, plans, computedAt)
        : 0;
      return {
        status: "OK",
        summary: summarizeRelatedTopicPlan(topicCount, plans),
        applied: input.apply,
        written,
        computedAt,
        titles,
        plans,
      };
    },
    { timeout: RELATED_TOPIC_TRANSACTION_TIMEOUT_MS, maxWait: 10_000 },
  );
}

export interface RelatedTopicLink {
  title: string;
  url: string;
}

/** Başlık sayfası için en çok üç ilgili başlık, sırasıyla. */
export async function getRelatedTopicLinks(
  client: DatabaseExecutor,
  topicId: string,
): Promise<RelatedTopicLink[]> {
  const rows = await inTransaction(client, (transaction) =>
    findRelatedTopicLinks(transaction, topicId, RELATED_TOPIC_LIMIT),
  );
  return rows.map((row) => ({ title: row.title, url: topicPublicUrl(row) }));
}

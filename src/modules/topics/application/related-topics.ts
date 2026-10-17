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
      // Yalnız operasyon kaydı; tazelik denetimi parmak iziyledir (bkz. repository).
      const computedAt = await currentTransactionTime(transaction);
      const topicCount = await prepareRelatedTopicWorkspace(transaction);
      const topics = await listRelatedTopicWorkspaceTopics(transaction);
      const titles = new Map(topics.map((topic) => [topic.id, topic.title] as const));
      const fingerprints = new Map(topics.map((topic) => [topic.id, topic.fingerprint] as const));
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
        ? await replaceRelatedTopicLinks(transaction, plans, fingerprints, computedAt)
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
    {
      timeout: RELATED_TOPIC_TRANSACTION_TIMEOUT_MS,
      maxWait: 10_000,
      /*
        Tek snapshot (Astra, 17 Ekim, 2. tur): vektörler, parmak izleri ve bkz gövdeleri aynı
        görüntüden okunur. READ COMMITTED'da her ifade yeni snapshot alır; iki ifade arasında
        commit eden moderasyon, izi saklanmış ama başka metinden türemiş bağ bırakabilirdi.
        Tabloya yalnız bu hesap yazar ve danışma kilidi ikincisini dışlar; serileştirme hatası
        beklenmez.
      */
      isolationLevel: "RepeatableRead",
    },
  );
}

/** Uygula modunda kilit çakışmasında yeniden deneme (Astra, 17 Ekim, 2. tur). */
export const RELATED_TOPIC_LOCK_RETRIES = 10;
export const RELATED_TOPIC_LOCK_RETRY_DELAY_MS = 60_000;
/**
 * Yeniden denemelerin toplam süre bütçesi: 10 × 60 sn bekleme + bir tam hesap transaction'ı
 * (13 dk) + 1 dk pay = 24 dk. Yeni deneme ancak bekleme ve tam bir hesap bu bütçeye sığıyorsa
 * başlar; konteynerdeki `timeout -k 30 1620` (27 dk) hiçbir zaman devreye girmez.
 */
export const RELATED_TOPIC_RETRY_BUDGET_MS = 24 * 60_000;

/** Kilit devri çatışması yeniden denemelerden sonra da sürdü; hiçbir şey yazılmadı. */
export interface RelatedTopicConflictExhausted {
  status: "CONFLICT_RETRY_EXHAUSTED";
}

export type RelatedTopicRunResult = RelatedTopicComputationResult | RelatedTopicConflictExhausted;

function errorField(value: unknown, key: string): unknown {
  return value && typeof value === "object" && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

/*
  KİLİT DEVRİ ÇATIŞMASI (Sol 6.1, 17 Ekim, 1. tur). Kilit sorgusu REPEATABLE READ snapshot'ını
  alır; önceki hesap tam o sırada commit edip kilidi bırakırsa bu hesap kilidi alır ama
  snapshot'ı önceki yazımdan eskidir. Tabloyu silerken serileştirme hatası (40001, Prisma
  P2034) ya da boş görünen tabloya aynı çifti eklerken benzersizlik hatası (23505, Prisma P2002,
  yalnız `topic_related_links`) çıkar. Transaction geri alınır, önceki küme kalır; bütün hesap
  yeni snapshot'la yeniden denenebilir. Başka her hata olduğu gibi yükselir.
*/
export function isRelatedTopicLockHandoffConflict(error: unknown): boolean {
  const code = errorField(error, "code");
  const meta = errorField(error, "meta");
  if (code === "P2034") return true;
  // Prisma'nın kodsuz sardığı serileştirme hatası: PostgreSQL 40001 metni.
  if (String(errorField(error, "message") ?? "").includes("could not serialize access"))
    return true;
  if (code === "P2002")
    return (
      errorField(meta, "modelName") === "TopicRelatedLink" ||
      String(errorField(meta, "target") ?? "").includes("topic_related_links")
    );
  if (code === "P2010") {
    const sqlState = errorField(meta, "code");
    if (sqlState === "40001") return true;
    return (
      sqlState === "23505" &&
      String(errorField(meta, "message") ?? "").includes("topic_related_links")
    );
  }
  return false;
}

/**
 * Uygula modunda iki durumda bütün hesabı yeni snapshot'la yeniden dener; ikisi aynı bütçeyi
 * paylaşır (en çok `retries` yeniden deneme, aralarında `delayMs`, toplam `budgetMs`):
 * kilit başkasında (`ALREADY_RUNNING`) ya da kilit devri çatışması. Liste modu beklemez ve
 * çatışmayı yeniden denemez. Bütçe bitince son durum döner: `ALREADY_RUNNING` ya da
 * `CONFLICT_RETRY_EXHAUSTED`; betik ikisini de başarısızlık sayar (çıkış 75). Hiçbir başarısız
 * denemede tabloya bir şey yazılmamıştır.
 */
export async function computeRelatedTopicLinksWithRetry(
  client: DatabaseClient,
  input: { apply: boolean; batchSize?: number },
  options: {
    retries?: number;
    delayMs?: number;
    budgetMs?: number;
    sleep?: (milliseconds: number) => Promise<void>;
    now?: () => number;
  } = {},
): Promise<{ result: RelatedTopicRunResult; attempts: number }> {
  const retries = input.apply ? (options.retries ?? RELATED_TOPIC_LOCK_RETRIES) : 0;
  const delayMs = options.delayMs ?? RELATED_TOPIC_LOCK_RETRY_DELAY_MS;
  const budgetMs = options.budgetMs ?? RELATED_TOPIC_RETRY_BUDGET_MS;
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ??
    ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const started = now();
  for (let attempt = 1; ; attempt += 1) {
    let result: RelatedTopicRunResult;
    try {
      result = await computeRelatedTopicLinks(client, input);
    } catch (error) {
      if (!input.apply || !isRelatedTopicLockHandoffConflict(error)) throw error;
      result = { status: "CONFLICT_RETRY_EXHAUSTED" };
    }
    if (result.status === "OK") return { result, attempts: attempt };
    const fitsBudget = now() - started + delayMs + RELATED_TOPIC_TRANSACTION_TIMEOUT_MS <= budgetMs;
    if (attempt > retries || !fitsBudget) return { result, attempts: attempt };
    await sleep(delayMs);
  }
}

/** Betiğin çıkış kodu: başarı 0; uygula modunda yazılamadıysa 75 (EX_TEMPFAIL). */
export const RELATED_TOPIC_TEMPFAIL_EXIT_CODE = 75;

export function relatedTopicExitCode(result: RelatedTopicRunResult, apply: boolean): number {
  if (result.status === "OK") return 0;
  if (result.status === "ALREADY_RUNNING" && !apply) return 0;
  return RELATED_TOPIC_TEMPFAIL_EXIT_CODE;
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

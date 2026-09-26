import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseClient, DatabaseExecutor } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { getIndexableTopicPolicy } from "@/modules/indexing";
import { appendAuditLog } from "@/modules/audit";
import { createEntry } from "@/modules/entries";
import { requireApprovedWriter } from "@/modules/auth/application/guards";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { appendOutboxEvent } from "@/modules/outbox";
import {
  canonicalTopicPath,
  createTopicSlug,
  normalizeTopicTitle,
  TOPIC_TITLE_AMBIGUOUS_MESSAGE,
  topicTitleAddressIsAmbiguous,
} from "@/modules/topics/domain/normalization";
import { topicCanonicalSearchCandidates } from "@/modules/topics/domain/canonicalization";
import {
  countTopicDirectory,
  createTopicWithFirstEntryRecord,
  findActiveTopicConflicts,
  findActiveTopicsBySlug,
  findTopicById,
  findTopicByPublicId,
  findTopicConflict,
  getPublicTopicEntrySummary,
  getTopicSnippetEntry,
  isFollowingTopic,
  listTopicDirectoryPage,
  lockTopicTitles,
  type TopicSummaryRecord,
} from "@/modules/topics/repository/topics";
import {
  getSitemapTopicCount as getIndexableSitemapTopicCount,
  getSitemapTopics as getIndexableSitemapTopics,
} from "@/modules/indexing";
import {
  parseProposedTopicTitle,
  type TopicCreateInput,
} from "@/modules/topics/validation/schemas";

export interface TopicViewer {
  userId: string;
  role: "USER" | "MODERATOR" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
}

export function getSitemapTopicCount(client: DatabaseClient) {
  return getIndexableSitemapTopicCount(client);
}

export function getSitemapTopics(
  client: DatabaseClient,
  input: { page: number; pageSize: number },
) {
  return getIndexableSitemapTopics(client, input);
}

/** Sayfa başına başlık; 5.835 başlık ≈ 30 sayfa, her sayfa bir bakışta taranabilir. */
export const TOPIC_DIRECTORY_PAGE_SIZE = 200;

export interface TopicDirectoryEntry {
  id: string;
  publicId: number;
  slug: string;
  title: string;
  entryCount: number;
}

export interface TopicDirectoryPage {
  topics: TopicDirectoryEntry[];
  totalItems: number;
  totalPages: number;
  /** İstenen sayfa aralık dışıysa liste sorgusu HİÇ çalışmaz. */
  outOfRange: boolean;
  /** `NOINDEX_ALL_DYNAMIC` kipinde dizin sayfası da noindex olmalı. */
  dynamicIndexingDisabled: boolean;
}

/*
  ÖNCE SAY, SONRA OKU — Astra 18 Eylül.

  İlk yazımda `/basliklar/999999` önce `skip: 199_999_600` ile liste sorgusunu
  çalıştırıp sonra 404 veriyordu; uydurma bir sayfa numarası tam uygunluk
  taraması tetikleyebiliyordu. Ayrıca rota `totalPages` için bir kez, bileşen
  listeyi almak için bir kez çağırdığı için her geçerli sayfada DB işi İKİYE
  katlanıyordu. Artık tek çağrı var ve aralık dışı sayfa okumadan eleniyor.
*/
/*
  `generateMetadata` yalnız "dizin noindex mi" bilgisine ihtiyaç duyar; tam
  sayfayı çekmesi gereksiz. Sol (18 Eylül) ölçtü: numaralı dizin rotası
  metadata + sayfa için AYNI çağrıyı iki kez yapıyordu, yani 4 transaction,
  2 ayar okuması, 2 COUNT ve 2 liste sorgusu. "Tek okuma" iddiam yalnız
  uygulama katmanı için doğruydu, rota için değil.
*/
export async function getTopicDirectoryIndexingState(client: DatabaseClient) {
  const { dynamicIndexingDisabled } = await getIndexableTopicPolicy(client);
  return { dynamicIndexingDisabled };
}

export async function getTopicDirectoryPage(
  client: DatabaseClient,
  input: { page: number },
): Promise<TopicDirectoryPage> {
  const page = Math.max(1, Math.trunc(input.page) || 1);
  // Sitemap ile AYNI politika: gecikme penceresi ve indeksleme kipi burada da
  // geçerli, yoksa sitemap'in dışarıda tuttuğu başlığa iç link vermiş oluruz.
  const policy = await getIndexableTopicPolicy(client);
  /*
    `NOINDEX_ALL_DYNAMIC` koşulun İÇİNDE değil, çağıranda ele alınıyor —
    sitemap de böyle yapıyor (`countIndexableTopics` erken 0 döner). Dizin de
    aynı yerde kesilir; hem doğru hem ucuz, tek sorgu bile açılmaz.
  */
  if (policy.dynamicIndexingDisabled)
    return {
      topics: [],
      totalItems: 0,
      totalPages: 1,
      outOfRange: page > 1,
      dynamicIndexingDisabled: true,
    };

  return inTransaction(client, async (transaction) => {
    const totalItems = await countTopicDirectory(transaction, policy.where);
    const totalPages = Math.max(1, Math.ceil(totalItems / TOPIC_DIRECTORY_PAGE_SIZE));
    if (page > totalPages)
      return {
        topics: [],
        totalItems,
        totalPages,
        outOfRange: true,
        dynamicIndexingDisabled: policy.dynamicIndexingDisabled,
      };
    const topics = await listTopicDirectoryPage(
      transaction,
      policy.where,
      (page - 1) * TOPIC_DIRECTORY_PAGE_SIZE,
      TOPIC_DIRECTORY_PAGE_SIZE,
    );
    return {
      topics,
      totalItems,
      totalPages,
      outOfRange: false,
      dynamicIndexingDisabled: policy.dynamicIndexingDisabled,
    };
  });
}

/** Başlık sayfasının meta description'ı için en yüksek puanlı görünür entry. */
export function getTopicSnippetSource(client: DatabaseClient, topicId: string) {
  return inTransaction(client, (transaction) => getTopicSnippetEntry(transaction, topicId));
}

function topicUrl(topic: Pick<TopicSummaryRecord, "publicId" | "slug">): string {
  return canonicalTopicPath(topic.publicId, topic.slug);
}

function topicExistsError(topic: TopicSummaryRecord): AppError {
  return new AppError("TOPIC_EXISTS", 409, "Bu başlık zaten mevcut.", undefined, undefined, {
    canonicalTopic: { id: topic.id, title: topic.title, url: topicUrl(topic) },
  });
}

function topicCanonicalSuggestionError(
  topic: TopicSummaryRecord,
  candidate: ReturnType<typeof topicCanonicalSearchCandidates>[number],
): AppError {
  return new AppError(
    "TOPIC_CANONICAL_SUGGESTION",
    409,
    "Aynı kavram için mevcut kanonik başlık öneriliyor.",
    undefined,
    undefined,
    {
      canonicalTopic: { id: topic.id, title: topic.title, url: topicUrl(topic) },
      canonicalQuery: candidate.query,
      canonicalReason: candidate.reason,
    },
  );
}

export async function resolveCanonicalTopicProposal(
  client: DatabaseExecutor,
  proposedTitle: string,
) {
  const title = proposedTitle.normalize("NFKC").trim().replaceAll(/\s+/gu, " ");
  const normalizedTitle = normalizeTopicTitle(title);
  const canonicalCandidates = topicCanonicalSearchCandidates(title);
  return inTransaction(client, async (transaction) => {
    await lockTopicTitles(
      transaction,
      canonicalCandidates.map((candidate) => candidate.normalizedQuery),
    );
    const exact = await findTopicConflict(transaction, normalizedTitle);
    if (exact) return { topic: exact, reason: "EXACT_OR_ALIAS" as const };
    /*
      SLUG çakışması. Benzersizlik `normalizedTitle` üzerinde ama adres
      `slug` üzerinden kuruluyor ve slug üretimi kayıplı. "j cut" başlığı
      "j-cut" ile aynı slug'ı üretir, farklı `normalizedTitle` taşır ve bugüne
      kadar sessizce ikinci bir başlık açıyordu. Canlıda 24 böyle grup var.

      En düşük `publicId` seçilir: kanonik olan, kavramı ilk açan adrestir.
    */
    const slug = createTopicSlug(title);
    if (slug) {
      const slugMatches = await findActiveTopicsBySlug(transaction, slug);
      const collision = slugMatches.find((match) => match.normalizedTitle !== normalizedTitle);
      if (collision) return { topic: collision, reason: "SLUG_COLLISION" as const };
    }

    const variantCandidates = canonicalCandidates.filter(
      (candidate) => candidate.normalizedQuery !== normalizedTitle,
    );
    if (variantCandidates.length === 0) return null;
    const conflicts = await findActiveTopicConflicts(
      transaction,
      variantCandidates.map((candidate) => candidate.normalizedQuery),
    );
    for (const candidate of variantCandidates) {
      const topic = conflicts.find(
        (conflict) =>
          conflict.normalizedTitle === candidate.normalizedQuery ||
          conflict.aliases.some((alias) => alias.normalizedTitle === candidate.normalizedQuery),
      );
      if (topic) return { topic, reason: candidate.reason };
    }

    return null;
  });
}

export async function createTopicWithFirstEntry(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: TopicCreateInput,
  options: { canonicalConflictStrategy?: "REJECT" | "ADD_ENTRY" } = {},
) {
  const normalizedTitle = normalizeTopicTitle(input.title);
  const title = input.title.normalize("NFKC").trim().replaceAll(/\s+/gu, " ");
  // Şemayı atlayan yollar (ajan CREATE_TOPIC_WITH_ENTRY) da aynı kuraldan geçer.
  if (topicTitleAddressIsAmbiguous(title))
    throw new AppError("VALIDATION_ERROR", 422, TOPIC_TITLE_AMBIGUOUS_MESSAGE);
  const canonicalCandidates = topicCanonicalSearchCandidates(title);
  return inTransaction(client, async (transaction) => {
    await requireApprovedWriter(transaction, actor.actorId);
    await lockTopicTitles(
      transaction,
      input.canonicalOverride
        ? [normalizedTitle]
        : canonicalCandidates.map((candidate) => candidate.normalizedQuery),
    );
    const conflict = await findTopicConflict(transaction, normalizedTitle);
    if (conflict) {
      if (options.canonicalConflictStrategy !== "ADD_ENTRY") throw topicExistsError(conflict);
      const entry = await createEntry(transaction, actor, conflict.id, {
        body: input.entryBody,
      });
      return {
        topic: { ...conflict, url: topicUrl(conflict) },
        entry,
        resolution: "EXISTING" as const,
      };
    }
    if (!input.canonicalOverride) {
      const variantCandidates = canonicalCandidates.filter(
        (candidate) => candidate.normalizedQuery !== normalizedTitle,
      );
      if (variantCandidates.length > 0) {
        const variantConflicts = await findActiveTopicConflicts(
          transaction,
          variantCandidates.map((candidate) => candidate.normalizedQuery),
        );
        for (const candidate of variantCandidates) {
          const canonicalTopic = variantConflicts.find(
            (topic) =>
              topic.normalizedTitle === candidate.normalizedQuery ||
              topic.aliases.some((alias) => alias.normalizedTitle === candidate.normalizedQuery),
          );
          if (canonicalTopic) {
            if (options.canonicalConflictStrategy !== "ADD_ENTRY")
              throw topicCanonicalSuggestionError(canonicalTopic, candidate);
            const entry = await createEntry(transaction, actor, canonicalTopic.id, {
              body: input.entryBody,
            });
            return {
              topic: { ...canonicalTopic, url: topicUrl(canonicalTopic) },
              entry,
              resolution: "EXISTING" as const,
            };
          }
        }
      }

      /*
        Slug çakışması: benzersizlik `normalizedTitle` üzerinde ama adres `slug`
        üzerinden kuruluyor ve slug üretimi kayıplı. Gerekçe ve canlı ölçüm
        `SLUG_COLLISION` başlığında. Öneri yolundaki mantığın aynısı; ikisi
        ayrışırsa ajan öneriden geçip oluşturmada yeni kopya açardı.
      */
      const proposedSlug = createTopicSlug(title);
      if (proposedSlug) {
        const slugMatches = await findActiveTopicsBySlug(transaction, proposedSlug);
        const collision = slugMatches.find((match) => match.normalizedTitle !== normalizedTitle);
        if (collision) {
          if (options.canonicalConflictStrategy !== "ADD_ENTRY")
            throw topicCanonicalSuggestionError(collision, {
              query: collision.title,
              normalizedQuery: collision.normalizedTitle,
              reason: "SLUG_COLLISION" as const,
            });
          const entry = await createEntry(transaction, actor, collision.id, {
            body: input.entryBody,
          });
          return {
            topic: { ...collision, url: topicUrl(collision) },
            entry,
            resolution: "EXISTING" as const,
          };
        }
      }
    }

    const created = await createTopicWithFirstEntryRecord(transaction, {
      title,
      normalizedTitle,
      slug: createTopicSlug(title),
      createdById: actor.actorId,
      entryBody: input.entryBody,
      origin: actor.origin,
      now: new Date(),
    });
    const entry = created.entries[0];
    if (!entry) throw new Error("TOPIC_FIRST_ENTRY_MISSING");
    await appendOutboxEvent(transaction, {
      eventType: "topic.created",
      aggregateType: "Topic",
      aggregateId: created.id,
      actorId: actor.actorId,
      actorKind: actor.actorKind,
      requestId: actor.requestId,
      payload: { title: created.title, entryId: entry.id, origin: actor.origin },
    });
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: "topic.created",
      entityType: "Topic",
      entityId: created.id,
      requestId: actor.requestId,
      metadata: { entryId: entry.id, origin: actor.origin },
    });
    const topic = {
      id: created.id,
      publicId: created.publicId,
      title: created.title,
      normalizedTitle: created.normalizedTitle,
      slug: created.slug,
      status: created.status,
      mergedIntoId: created.mergedIntoId,
      entryCount: created.entryCount,
      lastEntryAt: created.lastEntryAt,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
    return {
      topic: { ...topic, url: topicUrl(created) },
      entry,
      resolution: "CREATED" as const,
    };
  });
}

async function getTopicRecord(
  client: DatabaseClient,
  reference: { id: string } | { publicId: number },
  viewer: TopicViewer | null,
) {
  return client.$transaction(async (transaction) => {
    const topic =
      "id" in reference
        ? await findTopicById(transaction, reference.id)
        : await findTopicByPublicId(transaction, reference.publicId);
    if (!topic) throw new AppError("TOPIC_NOT_FOUND", 404, "Başlık bulunamadı.");
    if (topic.status === "MERGED" && topic.mergedInto) {
      throw new AppError(
        "TOPIC_MERGED",
        409,
        "Başlık başka bir başlıkla birleştirildi.",
        undefined,
        undefined,
        {
          canonicalTopic: {
            id: topic.mergedInto.id,
            title: topic.mergedInto.title,
            url: topicUrl(topic.mergedInto),
          },
        },
      );
    }
    const canInspect =
      viewer?.userId === topic.createdById ||
      (viewer?.status === "ACTIVE" && (viewer.role === "MODERATOR" || viewer.role === "ADMIN"));
    if (topic.status === "HIDDEN" && !canInspect)
      throw new AppError("TOPIC_NOT_FOUND", 404, "Başlık bulunamadı.");
    const following = viewer
      ? Boolean(await isFollowingTopic(transaction, topic.id, viewer.userId))
      : false;
    const publicEntrySummary = await getPublicTopicEntrySummary(transaction, topic.id);
    return { ...topic, ...publicEntrySummary, url: topicUrl(topic), following };
  });
}

export function getTopic(client: DatabaseClient, topicId: string, viewer: TopicViewer | null) {
  return getTopicRecord(client, { id: topicId }, viewer);
}

export function getTopicByPublicId(
  client: DatabaseClient,
  publicId: number,
  viewer: TopicViewer | null,
) {
  return getTopicRecord(client, { publicId }, viewer);
}

/**
 * `/baslik/<başlık metni>` adresinin üç olası karşılığı. Sayfanın burada
 * vereceği tek karar yönlendirme biçimi; "bu başlık var mı, bu izleyici onu
 * görebilir mi, birleştirilmiş mi" soruları rota katmanının işi değil.
 */
export type UnopenedTopicRoute =
  | { kind: "existing"; url: string }
  | { kind: "unopened"; title: string }
  | { kind: "not-found" };

/**
 * Adres çubuğuna yazılmış bir başlığı çözer. Arama `findTopicConflict` ile
 * aynı kapıdan geçer — takma adlar da eşleşir — böylece sayfanın "açılmamış"
 * dediği başlık, açılmaya kalkıldığında `TOPIC_EXISTS` ile geri dönmez.
 *
 * Eşleşen başlığın görünürlüğüne `getTopic` ile aynı kural karar verir: yoksa
 * ya da izleyici gizlenmiş başlığı göremiyorsa sonuç `not-found`. Kanonik
 * adrese yönlendirmek burada iki şeyi birden sızdırırdı: başlığın var olduğunu
 * ve slug ile publicId'sini. Composer da gösterilmez — başlık dolu olduğu için
 * açma denemesi zaten `TOPIC_EXISTS` alacaktı.
 */
export async function resolveUnopenedTopicRoute(
  client: DatabaseClient,
  proposedTitle: string,
  viewer: TopicViewer | null,
): Promise<UnopenedTopicRoute> {
  const title = parseProposedTopicTitle(proposedTitle);
  if (!title) return { kind: "not-found" };
  const existing = await findTopicConflict(client, normalizeTopicTitle(title));
  if (!existing) return { kind: "unopened", title };
  try {
    const topic = await getTopicRecord(client, { id: existing.id }, viewer);
    return { kind: "existing", url: topic.url };
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    // Birleştirilmiş başlık kanonik adresine çözülür: sayfanın aşağısındaki
    // `TOPIC_MERGED` işlemesiyle aynı davranış, aynı yerden okunuyor.
    if (error.code === "TOPIC_MERGED") {
      const canonical = error.details?.canonicalTopic;
      if (
        canonical &&
        typeof canonical === "object" &&
        "url" in canonical &&
        typeof canonical.url === "string"
      )
        return { kind: "existing", url: canonical.url };
      return { kind: "not-found" };
    }
    if (error.code === "TOPIC_NOT_FOUND") return { kind: "not-found" };
    throw error;
  }
}

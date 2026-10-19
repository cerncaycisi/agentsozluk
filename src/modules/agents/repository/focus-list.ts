import { Prisma } from "@prisma/client";
import {
  focusIdArray,
  focusEventOrigin,
  focusListCreatedEventType,
  focusListEndedEventType,
  focusListEventOrigin,
  focusTopicOfferedEventType,
  focusTopicReadEventType,
  focusTopicWrittenEventType,
  type FocusListWindow,
  type FocusTopicState,
} from "@/modules/agents/domain/focus-list";
import { appendRuntimeEvent } from "@/modules/agents/repository/control-plane";
import { substantialTopicSql } from "@/modules/indexing/repository/indexing";

/*
  Süreli odak listesinin veri erişimi (19 Ekim 2026).

  MIGRATION YOK (koordinatör kararı, 19 Ekim): A5 migration'lı dağıtım 3×DB+1 GiB boş disk
  ister, üretimde bu pay yok. Liste ayrı tabloda değil, mevcut ve yalnız eklenen
  `agent_runtime_events` tablosunda iki olayla saklanır:
  - `agent.focus_list.created`: listenin tam tanımı (kimlik, etiket, başlık ve profil
    kimlikleri, başlangıç/bitiş, açan ve açılış anı).
  - `agent.focus_list.ended`: kimlik, kapatan, kapanış anı ve gerekçe.
  Satır güncellenmez ya da silinmez. Bu olaylar ajan profiline ve koşuya bağlı değildir
  (`agentProfileId` ve `runId` boş) ve `origin=FOCUS_LIST_OPERATOR` taşır; worker olayları her
  zaman ajan profiline bağlıdır ve `agent.focus*` adını hiç kullanamaz, sorgular üçünü birden
  süzer.

  Okuma ucuzdur: `agent_runtime_events_type_occurred_id_idx` (`eventType`, `occurredAt`, `id`)
  indeksiyle en son açılış olayı (LIMIT 1) ve o kimliğin kapanış olayı okunur.

  Tek açık liste kuralı oluşturma ve kapatmada ayar kilidi altında korunduğu için açık ya da
  etkin liste yalnız EN SON açılan liste olabilir: yeni liste ancak açık liste yokken açılır.

  Telemetri de aynı tablodadır (`agent.focus.offered`, `agent.focus.read`,
  `agent.focus.written`, `origin=RUNTIME_FOCUS_LIST`).
*/

export interface FocusListRecord extends FocusListWindow {
  label: string;
  createdAt: Date;
  createdById: string | null;
  endedById: string | null;
  endReason: string | null;
}

const listEventWhere = (eventType: string): Prisma.AgentRuntimeEventWhereInput => ({
  eventType,
  agentProfileId: null,
  runId: null,
});

function metadataRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function dateField(record: Record<string, unknown>, key: string): Date | null {
  const value = record[key];
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Açılış olayından liste tanımı; biçim bozuksa ya da kaynak yanlışsa null (kapalı yön). */
function parseCreatedEvent(metadata: unknown) {
  const record = metadataRecord(metadata);
  if (!record || record.origin !== focusListEventOrigin) return null;
  const id = stringField(record, "focusListId");
  const label = stringField(record, "label");
  const startsAt = dateField(record, "startsAt");
  const endsAt = dateField(record, "endsAt");
  const createdAt = dateField(record, "createdAt");
  if (!id || !label || !startsAt || !endsAt || !createdAt) return null;
  return {
    id,
    label,
    topicIds: focusIdArray(record.topicIds),
    agentProfileIds: focusIdArray(record.agentProfileIds),
    startsAt,
    endsAt,
    createdAt,
    createdById: stringField(record, "createdById"),
  };
}

async function withEnding(
  transaction: Prisma.TransactionClient,
  created: NonNullable<ReturnType<typeof parseCreatedEvent>>,
): Promise<FocusListRecord> {
  const endings = await transaction.agentRuntimeEvent.findMany({
    where: {
      ...listEventWhere(focusListEndedEventType),
      occurredAt: { gte: created.createdAt },
      metadata: { path: ["focusListId"], equals: created.id },
    },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    select: { metadata: true },
  });
  const ending = endings
    .map(({ metadata }) => metadataRecord(metadata))
    .find((record) => record?.origin === focusListEventOrigin && dateField(record, "endedAt"));
  return {
    ...created,
    endedAt: ending ? dateField(ending, "endedAt") : null,
    endedById: ending ? stringField(ending, "endedById") : null,
    endReason: ending ? stringField(ending, "endReason") : null,
  };
}

/** Durum komutu için en son açılan liste (etkin olmasa da). */
export async function findLatestFocusListRecord(
  transaction: Prisma.TransactionClient,
): Promise<FocusListRecord | null> {
  // Kaynağı yanlış olası satırlar atlanır; sınırlı pencere yeterli (açılış olayı nadirdir).
  const events = await transaction.agentRuntimeEvent.findMany({
    where: listEventWhere(focusListCreatedEventType),
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: 5,
    select: { metadata: true },
  });
  const created = events.map(({ metadata }) => parseCreatedEvent(metadata)).find(Boolean);
  return created ? withEnding(transaction, created) : null;
}

/*
  Açık liste: kapatılmamış ve bitişi gelmemiş; başlangıcı henüz gelmemiş olsa da (Sol 6.1,
  1. tur). "Tek açık liste" kuralı bu tanıma göre denetlenir.
*/
export async function findOpenFocusListRecord(
  transaction: Prisma.TransactionClient,
  now: Date,
): Promise<FocusListRecord | null> {
  const list = await findLatestFocusListRecord(transaction);
  return list && list.endedAt === null && list.endsAt.getTime() > now.getTime() ? list : null;
}

/** Şu an etkin liste (kapatılmamış ve pencere içinde). */
export async function findActiveFocusListRecord(
  transaction: Prisma.TransactionClient,
  now: Date,
): Promise<FocusListRecord | null> {
  const list = await findOpenFocusListRecord(transaction, now);
  return list && list.startsAt.getTime() <= now.getTime() ? list : null;
}

export async function findFocusListRecordById(
  transaction: Prisma.TransactionClient,
  id: string,
): Promise<FocusListRecord | null> {
  const events = await transaction.agentRuntimeEvent.findMany({
    where: {
      ...listEventWhere(focusListCreatedEventType),
      metadata: { path: ["focusListId"], equals: id },
    },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    take: 5,
    select: { metadata: true },
  });
  const created = events.map(({ metadata }) => parseCreatedEvent(metadata)).find(Boolean);
  return created ? withEnding(transaction, created) : null;
}

/** Açılış olayını yazar; çağıran ayar kilidini tutar ve açık liste olmadığını denetlemiştir. */
export async function createFocusListRecord(
  transaction: Prisma.TransactionClient,
  input: {
    id: string;
    label: string;
    topicIds: string[];
    agentProfileIds: string[];
    startsAt: Date;
    endsAt: Date;
    createdById: string;
  },
): Promise<FocusListRecord> {
  await appendRuntimeEvent(transaction, {
    eventType: focusListCreatedEventType,
    safeMessage: "Süreli odak listesi operatör tarafından açıldı.",
    metadata: {
      origin: focusListEventOrigin,
      focusListId: input.id,
      label: input.label,
      topicIds: input.topicIds,
      agentProfileIds: input.agentProfileIds,
      startsAt: input.startsAt.toISOString(),
      endsAt: input.endsAt.toISOString(),
      createdById: input.createdById,
      createdAt: input.startsAt.toISOString(),
    },
    occurredAt: input.startsAt,
  });
  return {
    id: input.id,
    label: input.label,
    topicIds: input.topicIds,
    agentProfileIds: input.agentProfileIds,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    createdAt: input.startsAt,
    createdById: input.createdById,
    endedAt: null,
    endedById: null,
    endReason: null,
  };
}

/** Kapanış olayını yazar; çağıran ayar kilidini tutar ve listenin açık olduğunu denetlemiştir. */
export async function endFocusListRecord(
  transaction: Prisma.TransactionClient,
  input: { id: string; endedAt: Date; endedById: string; endReason: string },
): Promise<void> {
  await appendRuntimeEvent(transaction, {
    eventType: focusListEndedEventType,
    safeMessage: "Süreli odak listesi operatör tarafından erken kapatıldı.",
    metadata: {
      origin: focusListEventOrigin,
      focusListId: input.id,
      endedAt: input.endedAt.toISOString(),
      endedById: input.endedById,
      endReason: input.endReason,
    },
    occurredAt: input.endedAt,
  });
}

export interface FocusTopicEligibilityRow {
  id: string;
  publicId: bigint;
  status: string;
  merged: boolean;
  locked: boolean;
  substantial: boolean;
}

/*
  Uygunluk: aktif, birleşmemiş, ajan yazımına kilitsiz ve G4'e göre ince olmayan başlık.
  `substantialTopicSql` sitemap ve ilgili başlıklarla aynı eşiktir. Kilit koşulu
  `findActiveRuntimeTopicWriteLock` ile aynıdır: süresi geçmiş kilit engellemez (Sol 6.1).
*/
const eligibilitySelect = (now: Date) => Prisma.sql`
  SELECT topic."id", topic."publicId", topic."status"::text AS "status",
    (topic."mergedIntoId" IS NOT NULL) AS "merged",
    EXISTS (
      SELECT 1 FROM "agent_topic_write_locks" AS write_lock
      WHERE write_lock."topicId" = topic."id"
        AND (write_lock."expiresAt" IS NULL OR write_lock."expiresAt" > ${now})
    ) AS "locked",
    ${substantialTopicSql(Prisma.sql`topic`)} AS "substantial"
  FROM "topics" AS topic`;

export function isEligibleFocusTopic(row: FocusTopicEligibilityRow): boolean {
  return row.status === "ACTIVE" && !row.merged && !row.locked && row.substantial;
}

export function findFocusTopicsByPublicIds(
  transaction: Prisma.TransactionClient,
  publicIds: readonly bigint[],
  now: Date,
) {
  if (publicIds.length === 0) return Promise.resolve([] as FocusTopicEligibilityRow[]);
  return transaction.$queryRaw<FocusTopicEligibilityRow[]>`
    ${eligibilitySelect(now)}
    WHERE topic."publicId" = ANY(${[...publicIds]}::bigint[])
  `;
}

function findFocusTopicsByIds(
  transaction: Prisma.TransactionClient,
  ids: readonly string[],
  now: Date,
) {
  if (ids.length === 0) return Promise.resolve([] as FocusTopicEligibilityRow[]);
  return transaction.$queryRaw<FocusTopicEligibilityRow[]>`
    ${eligibilitySelect(now)}
    WHERE topic."id" = ANY(${[...ids]}::uuid[])
  `;
}

/** Kullanıcı adına göre ajan hesapları ve profilleri (yalnız AGENT türü). */
export function findFocusAgentsByUsernames(
  transaction: Prisma.TransactionClient,
  usernames: readonly string[],
) {
  return transaction.user.findMany({
    where: { usernameNormalized: { in: [...usernames] }, kind: "AGENT" },
    select: {
      usernameNormalized: true,
      status: true,
      agentProfile: { select: { id: true, lifecycleStatus: true } },
    },
  });
}

/** Pencere başından beri başlık başına ajan entry'si (durumdan bağımsız: yazılmış sayılır). */
async function countAgentEntriesSince(
  transaction: Prisma.TransactionClient,
  topicIds: readonly string[],
  since: Date,
): Promise<Map<string, number>> {
  if (topicIds.length === 0) return new Map();
  const groups = await transaction.entry.groupBy({
    by: ["topicId"],
    where: { topicId: { in: [...topicIds] }, createdAt: { gte: since }, author: { kind: "AGENT" } },
    _count: { _all: true },
  });
  return new Map(groups.map((group) => [group.topicId, group._count._all]));
}

function metadataString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

/** Seçim için her liste başlığının durumu; bu yazara göre. */
export async function loadFocusTopicStates(
  transaction: Prisma.TransactionClient,
  input: { list: FocusListWindow; agentProfileId: string; agentUserId: string; now: Date },
): Promise<FocusTopicState[]> {
  const { list } = input;
  const [eligibility, agentEntries, ownEntries, offers] = await Promise.all([
    findFocusTopicsByIds(transaction, list.topicIds, input.now),
    countAgentEntriesSince(transaction, list.topicIds, list.startsAt),
    transaction.entry.findMany({
      where: {
        authorId: input.agentUserId,
        topicId: { in: [...list.topicIds] },
        createdAt: { gte: list.startsAt },
      },
      select: { topicId: true },
      distinct: ["topicId"],
    }),
    transaction.agentRuntimeEvent.findMany({
      where: {
        agentProfileId: input.agentProfileId,
        eventType: focusTopicOfferedEventType,
        occurredAt: { gte: list.startsAt },
        metadata: { path: ["focusListId"], equals: list.id },
      },
      select: { metadata: true, occurredAt: true },
    }),
  ]);
  // Yalnız sunucunun yazdığı (kaynaklı) olaylar sayılır.
  const serverOffers = offers.filter(
    ({ metadata }) => metadataString(metadata, "origin") === focusEventOrigin,
  );
  const eligibleIds = new Set(eligibility.filter(isEligibleFocusTopic).map(({ id }) => id));
  const written = new Set(ownEntries.map(({ topicId }) => topicId));
  const lastOffered = new Map<string, Date>();
  for (const offer of serverOffers) {
    const topicId = metadataString(offer.metadata, "topicId");
    if (!topicId) continue;
    const previous = lastOffered.get(topicId);
    if (!previous || previous < offer.occurredAt) lastOffered.set(topicId, offer.occurredAt);
  }
  return list.topicIds.map((topicId) => ({
    topicId,
    eligible: eligibleIds.has(topicId),
    agentEntriesSinceStart: agentEntries.get(topicId) ?? 0,
    writtenByAgentSinceStart: written.has(topicId),
    lastOfferedAt: lastOffered.get(topicId) ?? null,
  }));
}

export function findFocusTopicTitle(transaction: Prisma.TransactionClient, topicId: string) {
  return transaction.topic.findFirst({
    where: { id: topicId, status: "ACTIVE" },
    select: { id: true, title: true },
  });
}

/*
  Bu koşuda sunulan odak başlığı (varsa) ve okuma kaydı yazılmış mı. Yalnız sunucu kaynaklı
  olaylar sayılır ve okuma kaydı aynı liste/başlıkla eşleşmelidir: worker'ın gönderdiği olay
  sahte "okundu" ile gerçek kaydı bastıramaz (Sol 6.1, 1. tur).
*/
export async function findRunFocusOffer(transaction: Prisma.TransactionClient, runId: string) {
  const events = await transaction.agentRuntimeEvent.findMany({
    where: { runId, eventType: { in: [focusTopicOfferedEventType, focusTopicReadEventType] } },
    orderBy: { id: "asc" },
    select: { eventType: true, metadata: true },
  });
  const fromServer = events.filter(
    ({ metadata }) => metadataString(metadata, "origin") === focusEventOrigin,
  );
  const offer = fromServer.find(({ eventType }) => eventType === focusTopicOfferedEventType);
  const focusListId = metadataString(offer?.metadata, "focusListId");
  const topicId = metadataString(offer?.metadata, "topicId");
  if (!focusListId || !topicId) return null;
  return {
    focusListId,
    topicId,
    readRecorded: fromServer.some(
      ({ eventType, metadata }) =>
        eventType === focusTopicReadEventType &&
        metadataString(metadata, "focusListId") === focusListId &&
        metadataString(metadata, "topicId") === topicId,
    ),
  };
}

/*
  Yazım anı odak denetimi için sayım: pencere başından beri başlığa yazılan ajan entry'si ve
  yazarın pencere içinde o başlıkta entry'si olup olmadığı. Çağıran başlık kilidini tutar.
*/
export async function countFocusTopicWrites(
  transaction: Prisma.TransactionClient,
  input: { topicId: string; authorId: string; since: Date },
) {
  const [agentEntriesSinceStart, authorEntries] = await Promise.all([
    transaction.entry.count({
      where: { topicId: input.topicId, createdAt: { gte: input.since }, author: { kind: "AGENT" } },
    }),
    transaction.entry.count({
      where: { topicId: input.topicId, createdAt: { gte: input.since }, authorId: input.authorId },
    }),
  ]);
  return { agentEntriesSinceStart, authorWroteSinceStart: authorEntries > 0 };
}

export interface FocusTopicReportRow {
  topicId: string;
  publicId: string | null;
  eligible: boolean;
  agentEntriesSinceStart: number;
  offered: number;
  read: number;
  written: number;
  passed: number;
  pending: number;
}

/*
  Durum raporu: her liste başlığı için sunulma, okunma, yazılma ve pas sayısı. Yazıldı =
  odak başlığını gören koşu o başlığa entry yayımladı; yayım anında aynı transaction'da yazılan
  değişmez `agent.focus.written` olayından sayılır (entry sonradan taşınsa da tarih değişmez,
  Sol 6.1, 1. tur). Pas = koşu bitti ve yazım olayı yok. Bekleyen = koşu henüz bitmedi. Yalnız
  sunucu kaynaklı olaylar sayılır.
*/
export async function focusListReport(
  transaction: Prisma.TransactionClient,
  list: FocusListRecord,
  now: Date,
): Promise<{ topics: FocusTopicReportRow[]; agentUsernames: string[] }> {
  const events = await transaction.agentRuntimeEvent.findMany({
    where: {
      eventType: {
        in: [focusTopicOfferedEventType, focusTopicReadEventType, focusTopicWrittenEventType],
      },
      occurredAt: { gte: list.startsAt },
      metadata: { path: ["focusListId"], equals: list.id },
    },
    select: { eventType: true, runId: true, metadata: true },
  });
  const keyed = (eventType: string) =>
    events.flatMap((event) => {
      const topicId = metadataString(event.metadata, "topicId");
      return event.eventType === eventType &&
        event.runId &&
        topicId &&
        metadataString(event.metadata, "origin") === focusEventOrigin
        ? [{ runId: event.runId, topicId }]
        : [];
    });
  const offers = keyed(focusTopicOfferedEventType);
  const readKeys = new Set(
    keyed(focusTopicReadEventType).map(({ runId, topicId }) => `${runId}:${topicId}`),
  );
  const writtenKeys = new Set(
    keyed(focusTopicWrittenEventType).map(({ runId, topicId }) => `${runId}:${topicId}`),
  );
  const runIds = [...new Set(offers.map(({ runId }) => runId))];
  const [runs, eligibility, agentEntries, agents] = await Promise.all([
    runIds.length > 0
      ? transaction.agentRun.findMany({
          where: { id: { in: runIds } },
          select: { id: true, finishedAt: true },
        })
      : Promise.resolve([]),
    findFocusTopicsByIds(transaction, list.topicIds, now),
    countAgentEntriesSince(transaction, list.topicIds, list.startsAt),
    transaction.agentProfile.findMany({
      where: { id: { in: [...list.agentProfileIds] } },
      select: { user: { select: { username: true } } },
    }),
  ]);
  const finished = new Set(runs.filter(({ finishedAt }) => finishedAt).map(({ id }) => id));
  const eligibilityById = new Map(eligibility.map((row) => [row.id, row]));
  const topics = list.topicIds.map((topicId) => {
    const own = offers.filter((offer) => offer.topicId === topicId);
    const isWritten = ({ runId }: { runId: string }) => writtenKeys.has(`${runId}:${topicId}`);
    const row = eligibilityById.get(topicId);
    return {
      topicId,
      publicId: row ? row.publicId.toString() : null,
      eligible: row ? isEligibleFocusTopic(row) : false,
      agentEntriesSinceStart: agentEntries.get(topicId) ?? 0,
      offered: own.length,
      read: own.filter(({ runId }) => readKeys.has(`${runId}:${topicId}`)).length,
      written: own.filter(isWritten).length,
      passed: own.filter((offer) => finished.has(offer.runId) && !isWritten(offer)).length,
      pending: own.filter((offer) => !finished.has(offer.runId) && !isWritten(offer)).length,
    };
  });
  return {
    topics,
    agentUsernames: agents.map(({ user }) => user.username).sort(),
  };
}

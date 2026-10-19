import { Prisma } from "@prisma/client";
import {
  focusIdArray,
  focusEventOrigin,
  focusTopicOfferedEventType,
  focusTopicReadEventType,
  focusTopicWrittenEventType,
  type FocusListWindow,
  type FocusTopicState,
} from "@/modules/agents/domain/focus-list";
import { substantialTopicSql } from "@/modules/indexing/repository/indexing";

/*
  Süreli odak listesinin veri erişimi (19 Ekim 2026). Liste satırı kapatılınca silinmez;
  `endedAt` yazılır. Telemetri ayrı tablo değil, `agent_runtime_events` satırlarıdır
  (`agent.focus.offered`, `agent.focus.read`); yazma sonucu `agent_content_records`
  üzerinden koşuya bağlanır.
*/

const focusListSelect = {
  id: true,
  label: true,
  topicIds: true,
  agentProfileIds: true,
  startsAt: true,
  endsAt: true,
  createdAt: true,
  endedAt: true,
} as const;

type FocusListRow = Prisma.AgentFocusListGetPayload<{ select: typeof focusListSelect }>;

export type FocusListRecord = Omit<FocusListRow, "topicIds" | "agentProfileIds"> &
  FocusListWindow & { label: string; createdAt: Date };

function toFocusList(row: FocusListRow): FocusListRecord {
  return {
    ...row,
    topicIds: focusIdArray(row.topicIds),
    agentProfileIds: focusIdArray(row.agentProfileIds),
  };
}

/** Şu an etkin liste (kapatılmamış ve pencere içinde); en yenisi. */
export async function findActiveFocusListRecord(
  transaction: Prisma.TransactionClient,
  now: Date,
): Promise<FocusListRecord | null> {
  const row = await transaction.agentFocusList.findFirst({
    where: { endedAt: null, startsAt: { lte: now }, endsAt: { gt: now } },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: focusListSelect,
  });
  return row ? toFocusList(row) : null;
}

/*
  Açık liste: kapatılmamış ve bitişi gelmemiş; başlangıcı henüz gelmemiş olsa da (Sol 6.1,
  1. tur). "Tek etkin liste" kuralı bu kümeye göre denetlenir, böylece başlangıç saati
  farklı iki liste aynı anda açık kalamaz.
*/
export async function findOpenFocusListRecord(
  transaction: Prisma.TransactionClient,
  now: Date,
): Promise<FocusListRecord | null> {
  const row = await transaction.agentFocusList.findFirst({
    where: { endedAt: null, endsAt: { gt: now } },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: focusListSelect,
  });
  return row ? toFocusList(row) : null;
}

export async function findFocusListRecordById(
  transaction: Prisma.TransactionClient,
  id: string,
): Promise<FocusListRecord | null> {
  const row = await transaction.agentFocusList.findUnique({
    where: { id },
    select: focusListSelect,
  });
  return row ? toFocusList(row) : null;
}

/** Durum komutu için en son açılan liste (etkin olmasa da). */
export async function findLatestFocusListRecord(
  transaction: Prisma.TransactionClient,
): Promise<FocusListRecord | null> {
  const row = await transaction.agentFocusList.findFirst({
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: focusListSelect,
  });
  return row ? toFocusList(row) : null;
}

export async function createFocusListRecord(
  transaction: Prisma.TransactionClient,
  input: {
    id: string;
    label: string;
    topicIds: string[];
    agentProfileIds: string[];
    startsAt: Date;
    endsAt: Date;
    reason: string;
    createdById: string;
  },
): Promise<FocusListRecord> {
  const row = await transaction.agentFocusList.create({
    data: { ...input, createdAt: input.startsAt },
    select: focusListSelect,
  });
  return toFocusList(row);
}

/** Yalnız açık satırı kapatır; kapatılmış ya da yok ise 0 döner. */
export async function endFocusListRecord(
  transaction: Prisma.TransactionClient,
  input: { id: string; endedAt: Date; endedById: string; endReason: string },
): Promise<number> {
  const result = await transaction.agentFocusList.updateMany({
    where: { id: input.id, endedAt: null },
    data: { endedAt: input.endedAt, endedById: input.endedById, endReason: input.endReason },
  });
  return result.count;
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

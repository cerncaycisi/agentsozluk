import type { Prisma } from "@prisma/client";
import type { AgentContentBulkActionInput } from "@/modules/moderation/validation/schemas";

export interface AgentContentListInput {
  agentProfileId?: string;
  runId?: string;
  topicId?: string;
  createdFrom?: Date;
  createdTo?: Date;
  reportStatus?: "OPEN" | "RESOLVED" | "REJECTED" | "NONE";
  hiddenStatus?: "ACTIVE" | "HIDDEN";
  sourceProvenance?: "WITH_SOURCE" | "WITHOUT_SOURCE";
  overrideStatus?: "WITH_OVERRIDE" | "WITHOUT_OVERRIDE";
  skip: number;
  take: number;
}

const sourceEvidenceFilters: Prisma.AgentActionWhereInput[] = [
  { provenance: { path: ["evidenceType"], equals: "TRUSTED_SOURCE" } },
  { provenance: { path: ["evidenceType"], equals: "PROBATION_SOURCE" } },
  { provenance: { path: ["evidenceType"], equals: "MULTIPLE_SOURCES" } },
];

export async function listAgentContentRecords(
  transaction: Prisma.TransactionClient,
  input: AgentContentListInput,
  now: Date,
) {
  let reportEntryIds: string[] | undefined;
  if (input.reportStatus) {
    const reports = await transaction.report.findMany({
      where: {
        targetType: "ENTRY",
        ...(input.reportStatus === "NONE" ? {} : { status: input.reportStatus }),
      },
      distinct: ["targetId"],
      select: { targetId: true },
    });
    reportEntryIds = reports.map(({ targetId }) => targetId);
  }
  const where: Prisma.AgentContentRecordWhereInput = {
    ...(input.agentProfileId ? { agentProfileId: input.agentProfileId } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.createdFrom || input.createdTo
      ? {
          createdAt: {
            ...(input.createdFrom ? { gte: input.createdFrom } : {}),
            ...(input.createdTo ? { lte: input.createdTo } : {}),
          },
        }
      : {}),
    ...(input.reportStatus === "NONE"
      ? { entryId: { notIn: reportEntryIds ?? [] } }
      : input.reportStatus
        ? { entryId: { in: reportEntryIds ?? [] } }
        : {}),
    entry: {
      ...(input.topicId ? { topicId: input.topicId } : {}),
      ...(input.hiddenStatus ? { status: input.hiddenStatus } : {}),
    },
    ...(input.sourceProvenance === "WITH_SOURCE"
      ? { action: { OR: sourceEvidenceFilters } }
      : input.sourceProvenance === "WITHOUT_SOURCE"
        ? { action: { NOT: { OR: sourceEvidenceFilters } } }
        : {}),
    ...(input.overrideStatus === "WITH_OVERRIDE"
      ? {
          run: {
            OR: [
              { dailyMaximumOverride: true },
              { saturationOverride: true },
              { provocationOverride: true },
            ],
          },
        }
      : input.overrideStatus === "WITHOUT_OVERRIDE"
        ? {
            run: {
              dailyMaximumOverride: false,
              saturationOverride: false,
              provocationOverride: false,
            },
          }
        : {}),
  };
  const [records, totalItems] = await Promise.all([
    transaction.agentContentRecord.findMany({
      where,
      skip: input.skip,
      take: input.take,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        createdAt: true,
        entry: {
          select: {
            id: true,
            publicId: true,
            body: true,
            status: true,
            createdAt: true,
            topic: { select: { id: true, publicId: true, title: true, slug: true } },
          },
        },
        agentProfile: {
          select: { id: true, user: { select: { username: true, displayName: true } } },
        },
        run: {
          select: {
            id: true,
            runType: true,
            runStatus: true,
            createdAt: true,
            dailyMaximumOverride: true,
            saturationOverride: true,
            provocationOverride: true,
          },
        },
        action: { select: { id: true, provenance: true } },
      },
    }),
    transaction.agentContentRecord.count({ where }),
  ]);
  const entryIds = records.map(({ entry }) => entry.id);
  const topicIds = [...new Set(records.map(({ entry }) => entry.topic.id))];
  const [reports, locks] = await Promise.all([
    entryIds.length
      ? transaction.report.findMany({
          where: { targetType: "ENTRY", targetId: { in: entryIds } },
          select: { id: true, targetId: true, status: true, reason: true },
          orderBy: { createdAt: "desc" },
        })
      : [],
    topicIds.length
      ? transaction.agentTopicWriteLock.findMany({
          where: {
            topicId: { in: topicIds },
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          select: { topicId: true, reason: true, expiresAt: true },
        })
      : [],
  ]);
  const reportsByEntry = new Map<string, typeof reports>();
  for (const report of reports) {
    const current = reportsByEntry.get(report.targetId) ?? [];
    current.push(report);
    reportsByEntry.set(report.targetId, current);
  }
  const lockByTopic = new Map(locks.map((lock) => [lock.topicId, lock]));
  return [
    records.map((record) => ({
      ...record,
      reports: reportsByEntry.get(record.entry.id) ?? [],
      topicWriteLock: lockByTopic.get(record.entry.topic.id) ?? null,
    })),
    totalItems,
  ] as const;
}

export async function upsertAgentTopicWriteLock(
  transaction: Prisma.TransactionClient,
  input: {
    topicId: string;
    reason: string;
    createdById: string;
    createdAt: Date;
    expiresAt: Date;
  },
) {
  const topic = await transaction.topic.findUnique({
    where: { id: input.topicId },
    select: { id: true, title: true, status: true },
  });
  if (!topic) return null;
  const previousLock = await transaction.agentTopicWriteLock.findUnique({
    where: { topicId: input.topicId },
    select: { id: true, topicId: true, reason: true, expiresAt: true },
  });
  const lock = await transaction.agentTopicWriteLock.upsert({
    where: { topicId: input.topicId },
    create: input,
    update: {
      reason: input.reason,
      createdById: input.createdById,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
    },
  });
  return { lock, topic, previousLock };
}

export async function deleteAgentTopicWriteLock(
  transaction: Prisma.TransactionClient,
  topicId: string,
) {
  const existing = await transaction.agentTopicWriteLock.findUnique({
    where: { topicId },
    select: { id: true, topicId: true, reason: true, expiresAt: true },
  });
  if (!existing) return null;
  await transaction.agentTopicWriteLock.delete({ where: { topicId } });
  return existing;
}

export function resolveAgentContentRecords(
  transaction: Prisma.TransactionClient,
  input: AgentContentBulkActionInput,
  now: Date,
) {
  return transaction.agentContentRecord.findMany({
    where: input.entryIds
      ? { entryId: { in: input.entryIds } }
      : input.runId
        ? { runId: input.runId }
        : {
            agentProfileId: input.agentProfileId!,
            createdAt: { gte: new Date(now.getTime() - input.sinceHours! * 60 * 60_000) },
          },
    orderBy: [{ createdAt: "desc" }, { entryId: "desc" }],
    take: 500,
    select: {
      entryId: true,
      runId: true,
      agentProfileId: true,
      entry: { select: { status: true, topicId: true } },
    },
  });
}

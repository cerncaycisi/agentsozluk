import type { TransactionClient } from "@/lib/db/types";
import {
  birthAcceptanceWindowMs,
  type BirthLifecycleHistory,
} from "@/modules/agents/domain/birth-activation";
import { rewardObject as object } from "@/modules/agents/domain/rewards";
import { runtimePresentableSourceStatuses } from "@/modules/agents/domain/source-status";
import { classifyIndependentBirthRoot } from "@/modules/agents/domain/birth-preparation";
import { loadBirthRootEvidence } from "@/modules/agents/repository/birth-preparation";

export async function loadBirthActivationSources(tx: TransactionClient, now: Date) {
  const rows = await tx.agentSource.findMany({
    where: { adminBlocked: false, status: { in: [...runtimePresentableSourceStatuses] } },
    select: {
      agentProfileId: true,
      url: true,
      normalizedDomain: true,
      status: true,
      adminBlocked: true,
      localeFocus: true,
      topics: true,
      items: {
        where: { fetchedAt: { gte: new Date(now.getTime() - birthAcceptanceWindowMs), lt: now } },
        orderBy: { fetchedAt: "desc" },
        take: 1,
        select: { fetchedAt: true },
      },
    },
    orderBy: { id: "asc" },
    take: 5001,
  });
  return {
    truncated: rows.length > 5000,
    sources: rows.map((row) => ({
      username: row.agentProfileId,
      url: row.url,
      normalizedDomain: row.normalizedDomain,
      status: row.status,
      adminBlocked: row.adminBlocked,
      localeFocus: row.localeFocus,
      topics: row.topics,
      usefulItemFetchedAt: row.items[0]?.fetchedAt ?? null,
    })),
  };
}

export async function loadBirthActivationHistories(
  tx: TransactionClient,
  independentHashes: ReadonlySet<string>,
) {
  // Yaşayan 40 sınırından ayrı tarihçe tavanı; eski/retired profiller de incelenir.
  // Mevcut sınırlar korunur: idempotent HTTP transaction'ı 5s, doğrudan servis 15s.
  const profiles = await tx.agentProfile.findMany({
    select: { id: true, createdAt: true, lifecycleStatus: true },
    orderBy: { id: "asc" },
    take: 201,
  });
  if (profiles.length > 200) return { truncated: true, unresolvedClone: false, profiles: [] };
  const ids = profiles.map((row) => row.id);
  const [audits, events, children] = await Promise.all([
    tx.auditLog.findMany({
      where: {
        entityType: "AgentProfile",
        entityId: { in: ids },
        action: { in: ["agent.created", "agent.resumed", "agent.paused", "agent.retired"] },
      },
      select: { id: true, entityId: true, action: true, metadata: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 10001,
    }),
    tx.agentRuntimeEvent.findMany({
      where: {
        agentProfileId: { in: ids },
        eventType: { in: ["LIFE_GENESIS_SNAPSHOT", "agent.status.changed"] },
      },
      select: {
        id: true,
        agentProfileId: true,
        eventType: true,
        metadata: true,
        beforeState: true,
        afterState: true,
        occurredAt: true,
        createdAt: true,
      },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      take: 10001,
    }),
    tx.agentBirthCandidate.findMany({
      where: { childProfileId: { in: ids } },
      select: { childProfileId: true, rootProfileId: true },
    }),
  ]);
  if (audits.length > 10000 || events.length > 10000)
    return { truncated: true, unresolvedClone: false, profiles: [] };
  const result: Array<{
    profileId: string;
    rootProfileId: string | null;
    history: BirthLifecycleHistory;
  }> = [];
  for (const profile of profiles) {
    const profileAudits = audits.filter((row) => row.entityId === profile.id);
    const creations = profileAudits.filter((row) => row.action === "agent.created");
    const lifecycleAudits = profileAudits.filter((row) => row.action !== "agent.created");
    const profileEvents = events.filter((row) => row.agentProfileId === profile.id);
    const genesis = profileEvents.filter((row) => row.eventType === "LIFE_GENESIS_SNAPSHOT");
    const changes = profileEvents.filter((row) => row.eventType === "agent.status.changed");
    const initialStatus = object(creations[0]?.metadata).lifecycleStatus;
    const genesisStatus = object(object(genesis[0]?.afterState).profile).lifecycleStatus;
    let complete =
      creations.length === 1 &&
      genesis.length === 1 &&
      typeof initialStatus === "string" &&
      initialStatus === genesisStatus &&
      object(genesis[0]?.metadata).origin === "AGENT_CREATION";
    for (const date of [creations[0]?.createdAt, genesis[0]?.createdAt])
      if (
        !date ||
        date < profile.createdAt ||
        date.getTime() - profile.createdAt.getTime() > 60_000
      )
        complete = false;
    const used = new Set<string>();
    const transitions = changes.map((event) => {
      const from = object(event.beforeState).lifecycleStatus;
      const to = object(event.afterState).lifecycleStatus;
      const matches = lifecycleAudits.filter(
        (audit) =>
          !used.has(audit.id) &&
          object(audit.metadata).from === from &&
          object(audit.metadata).to === to &&
          Math.abs(audit.createdAt.getTime() - event.occurredAt.getTime()) <= 60_000,
      );
      if (
        typeof from !== "string" ||
        typeof to !== "string" ||
        matches.length !== 1 ||
        object(event.metadata).from !== from ||
        object(event.metadata).to !== to
      )
        complete = false;
      if (matches[0]) used.add(matches[0].id);
      return {
        from: typeof from === "string" ? from : "UNKNOWN",
        to: typeof to === "string" ? to : "UNKNOWN",
        occurredAt: event.occurredAt,
        auditCreatedAt: matches[0]?.createdAt ?? new Date(NaN),
      };
    });
    if (used.size !== lifecycleAudits.length) complete = false;
    const child = children.find((row) => row.childProfileId === profile.id);
    const evidence = child ? null : await loadBirthRootEvidence(tx, profile.id);
    const root = evidence ? classifyIndependentBirthRoot(evidence, independentHashes) : null;
    result.push({
      profileId: profile.id,
      rootProfileId: child?.rootProfileId ?? root?.rootProfileId ?? null,
      history: {
        profileId: profile.id,
        createdAt: profile.createdAt,
        initialStatus: typeof initialStatus === "string" ? initialStatus : "UNKNOWN",
        currentStatus: profile.lifecycleStatus,
        complete,
        transitions,
      },
    });
  }
  return {
    truncated: false,
    unresolvedClone: profiles.some(
      (profile) =>
        profile.lifecycleStatus !== "RETIRED" &&
        audits.some(
          (audit) =>
            audit.entityId === profile.id &&
            audit.action === "agent.created" &&
            object(audit.metadata).method === "CLONE",
        ),
    ),
    profiles: result,
  };
}

export const recordBirthActivation = (
  tx: TransactionClient,
  input: { candidateId: string; expectedVersion: number; now: Date },
) =>
  tx.agentBirthCandidate.updateMany({
    where: { id: input.candidateId, status: "PREPARED", version: input.expectedVersion },
    data: { status: "ACTIVATED", activatedAt: input.now, version: { increment: 1 } },
  });

export const listBirthActivationPersonas = (tx: TransactionClient, childProfileId: string) =>
  tx.agentProfile.findMany({
    where: { id: { not: childProfileId }, currentPersonaVersionId: { not: null } },
    select: { currentPersonaVersion: { select: { persona: true } } },
  });

export const loadBirthCohortRunEvidence = (
  tx: TransactionClient,
  input: { profileIds: string[]; from: Date; to: Date },
) =>
  tx.agentRun.groupBy({
    by: ["agentProfileId"],
    where: {
      agentProfileId: { in: input.profileIds },
      trigger: "STOCHASTIC_TICK",
      runType: "NORMAL_WAKE",
      runStatus: { in: ["SUCCEEDED", "PARTIAL"] },
      createdAt: { gte: input.from, lt: input.to },
      finishedAt: { gte: input.from, lt: input.to },
    },
    _count: { _all: true },
  });

export const findBirthAcceptanceCapability = (tx: TransactionClient, id: string) =>
  tx.agentRuntimeCapability.findUnique({ where: { id } });

import { randomUUID } from "node:crypto";
import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor, TransactionClient } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { requireAgentAdminInTransaction } from "@/modules/agents/application/authorization";
import {
  focusListCreatedEventType,
  focusListEndedEventType,
  focusRunEligible,
  focusTopicOfferedEventType,
  focusTopicReadEventType,
  focusWindowError,
  selectFocusTopic,
} from "@/modules/agents/domain/focus-list";
import { appendRuntimeEvent, lockAgentSettings } from "@/modules/agents/repository/control-plane";
import {
  createFocusListRecord,
  endFocusListRecord,
  findActiveFocusListRecord,
  findFocusAgentsByUsernames,
  findFocusTopicTitle,
  findFocusTopicsByPublicIds,
  findLatestFocusListRecord,
  findRunFocusOffer,
  focusListReport,
  isEligibleFocusTopic,
  loadFocusTopicStates,
} from "@/modules/agents/repository/focus-list";
import type { FocusListCreateInput } from "@/modules/agents/validation/focus-list-schemas";

/*
  Süreli odak listesi uygulama servisi (Gökhan kararı, 19 Ekim 2026). Oluşturma ve kapatma
  yalnız aktif HUMAN ADMIN ile, ayar kilidi altında yapılır; denetim kaydı ve runtime olayı
  aynı transaction'dadır. Kapatma anında geçerlidir: sonraki koşunun algısı listeyi görmez.
  Zaten dondurulmuş bir algı geri alınmaz (o koşuda menüde kalır).
*/

function invalid(message: string, details: Record<string, unknown>): AppError {
  return new AppError("AGENT_FOCUS_LIST_INVALID", 422, message, undefined, undefined, details);
}

export async function createFocusList(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: FocusListCreateInput,
  now: Date = new Date(),
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    await lockAgentSettings(transaction);
    if (await findActiveFocusListRecord(transaction, now))
      throw new AppError("AGENT_FOCUS_LIST_CONFLICT", 409, "Etkin bir odak listesi zaten var.");
    const endsAt = new Date(input.endsAt);
    const windowError = focusWindowError(now, endsAt);
    if (windowError) throw invalid("Odak penceresi geçersiz.", { reason: windowError });

    const topics = await findFocusTopicsByPublicIds(transaction, input.topics);
    const byPublicId = new Map(topics.map((topic) => [topic.publicId.toString(), topic]));
    const ineligible = input.topics.map(String).filter((publicId) => {
      const topic = byPublicId.get(publicId);
      return !topic || !isEligibleFocusTopic(topic);
    });
    if (ineligible.length > 0)
      throw invalid("Uygun olmayan odak başlığı.", {
        reason: "FOCUS_TOPIC_INELIGIBLE",
        publicIds: ineligible,
      });

    const agents = await findFocusAgentsByUsernames(transaction, input.agents);
    const agentByUsername = new Map(agents.map((agent) => [agent.usernameNormalized, agent]));
    const invalidAgents = input.agents.filter((username) => {
      const agent = agentByUsername.get(username);
      return (
        !agent ||
        agent.status !== "ACTIVE" ||
        !agent.agentProfile ||
        agent.agentProfile.lifecycleStatus !== "ACTIVE"
      );
    });
    if (invalidAgents.length > 0)
      throw invalid("Uygun olmayan odak yazarı.", {
        reason: "FOCUS_AGENT_INVALID",
        usernames: invalidAgents,
      });

    const list = await createFocusListRecord(transaction, {
      id: randomUUID(),
      label: input.label,
      topicIds: input.topics.map(String).map((publicId) => byPublicId.get(publicId)!.id),
      agentProfileIds: input.agents.map(
        (username) => agentByUsername.get(username)!.agentProfile!.id,
      ),
      startsAt: now,
      endsAt,
      reason: input.reason,
      createdById: actor.actorId,
    });
    const summary = {
      focusListId: list.id,
      topicCount: list.topicIds.length,
      agentCount: list.agentProfileIds.length,
      startsAt: list.startsAt.toISOString(),
      endsAt: list.endsAt.toISOString(),
    };
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: focusListCreatedEventType,
      entityType: "AgentFocusList",
      entityId: list.id,
      requestId: actor.requestId,
      metadata: { actorKind: actor.actorKind, label: list.label, reason: input.reason, ...summary },
    });
    await appendRuntimeEvent(transaction, {
      eventType: focusListCreatedEventType,
      safeMessage: "Süreli odak listesi operatör tarafından açıldı.",
      metadata: summary,
      occurredAt: now,
    });
    return list;
  });
}

export async function endFocusList(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: { reason: string },
  now: Date = new Date(),
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    await lockAgentSettings(transaction);
    const active = await findActiveFocusListRecord(transaction, now);
    if (!active)
      throw new AppError("AGENT_FOCUS_LIST_CONFLICT", 409, "Kapatılacak etkin odak listesi yok.");
    await endFocusListRecord(transaction, {
      id: active.id,
      endedAt: now,
      endedById: actor.actorId,
      endReason: input.reason,
    });
    const summary = { focusListId: active.id, endedAt: now.toISOString() };
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: focusListEndedEventType,
      entityType: "AgentFocusList",
      entityId: active.id,
      requestId: actor.requestId,
      metadata: { actorKind: actor.actorKind, reason: input.reason, ...summary },
    });
    await appendRuntimeEvent(transaction, {
      eventType: focusListEndedEventType,
      safeMessage: "Süreli odak listesi operatör tarafından erken kapatıldı.",
      metadata: summary,
      occurredAt: now,
    });
    return { ...active, endedAt: now };
  });
}

/** Durum: en son liste, etkinliği ve başlık başına sunuldu/okundu/yazıldı/pas sayıları. */
export async function getFocusListStatus(client: DatabaseExecutor, now: Date = new Date()) {
  return inTransaction(client, async (transaction) => {
    const list = await findLatestFocusListRecord(transaction);
    if (!list) return null;
    const report = await focusListReport(transaction, list);
    return {
      list,
      active: list.endedAt === null && list.startsAt <= now && now < list.endsAt,
      ...report,
    };
  });
}

/*
  Algı kurulurken çağrılır (yalnız ilk kurulum; dondurulmuş algı yeniden seçilmez). Uygun
  koşuda en çok bir başlık döner ve `agent.focus.offered` olayı aynı transaction'da yazılır.
  Çağıran, `getRuntimeRunContext` ayar kilidini zaten tutar; liste oluşturma ve kapatma ile
  sıralanır.
*/
export async function pickRuntimeFocusTopic(
  transaction: TransactionClient,
  run: {
    id: string;
    agentProfileId: string;
    agentUserId: string;
    runType: string;
    trigger: string;
  },
  now: Date,
): Promise<{ id: string; title: string } | null> {
  if (run.runType !== "NORMAL_WAKE") return null;
  const list = await findActiveFocusListRecord(transaction, now);
  const context = {
    agentProfileId: run.agentProfileId,
    runType: run.runType,
    trigger: run.trigger,
    seed: run.id,
    now,
  };
  if (!list || !focusRunEligible(list, context)) return null;
  const states = await loadFocusTopicStates(transaction, {
    list,
    agentProfileId: run.agentProfileId,
    agentUserId: run.agentUserId,
  });
  const topicId = selectFocusTopic(list, context, states);
  if (!topicId) return null;
  const topic = await findFocusTopicTitle(transaction, topicId);
  if (!topic) return null;
  await appendRuntimeEvent(transaction, {
    agentProfileId: run.agentProfileId,
    runId: run.id,
    eventType: focusTopicOfferedEventType,
    subject: { type: "TOPIC", id: topic.id },
    safeMessage: "Süreli odak listesinden bir başlık okuma menüsüne eklendi.",
    metadata: { origin: "RUNTIME_FOCUS_LIST", focusListId: list.id, topicId: topic.id },
    occurredAt: now,
  });
  return topic;
}

/** Ajan sunulan odak başlığını okumayı seçtiyse bir kez `agent.focus.read` yazar. */
export async function recordRuntimeFocusTopicRead(
  transaction: TransactionClient,
  run: { id: string; agentProfileId: string },
  readTopicIds: readonly string[],
  now: Date,
): Promise<void> {
  if (readTopicIds.length === 0) return;
  const offer = await findRunFocusOffer(transaction, run.id);
  if (!offer || offer.readRecorded || !readTopicIds.includes(offer.topicId)) return;
  await appendRuntimeEvent(transaction, {
    agentProfileId: run.agentProfileId,
    runId: run.id,
    eventType: focusTopicReadEventType,
    subject: { type: "TOPIC", id: offer.topicId },
    safeMessage: "Ajan süreli odak başlığını okumayı seçti.",
    metadata: {
      origin: "RUNTIME_FOCUS_LIST",
      focusListId: offer.focusListId,
      topicId: offer.topicId,
    },
    occurredAt: now,
  });
}

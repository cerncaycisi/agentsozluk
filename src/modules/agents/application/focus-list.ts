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
  focusEventOrigin,
  focusTopicOfferedEventType,
  focusTopicReadEventType,
  focusTopicWriteRejectionCode,
  focusTopicWrittenEventType,
  focusWindowError,
  focusWriteBlocked,
  selectFocusTopic,
} from "@/modules/agents/domain/focus-list";
import { appendRuntimeEvent, lockAgentSettings } from "@/modules/agents/repository/control-plane";
import {
  countFocusTopicWrites,
  createFocusListRecord,
  endFocusListRecord,
  findActiveFocusListRecord,
  findFocusAgentsByUsernames,
  findFocusTopicTitle,
  findFocusTopicsByIds,
  findFocusTopicsByPublicIds,
  findLatestFocusListRecord,
  findOpenFocusListRecord,
  findRunFocusOffer,
  focusListReport,
  isEligibleFocusTopic,
  loadFocusTopicStates,
} from "@/modules/agents/repository/focus-list";
import type { FocusListCreateInput } from "@/modules/agents/validation/focus-list-schemas";

/*
  Süreli odak listesi uygulama servisi (Gökhan kararı, 19 Ekim 2026). Oluşturma ve kapatma
  yalnız aktif HUMAN ADMIN ile, ayar kilidi altında yapılır; liste olayı
  (`agent.focus_list.created|ended`, `agent_runtime_events`) ve denetim kaydı aynı
  transaction'dadır. Kapatma anında geçerlidir: sonraki koşunun algısı listeyi görmez.
  Zaten dondurulmuş bir algı geri alınmaz (o koşuda menüde kalır).
*/

function invalid(message: string, details: Record<string, unknown>): AppError {
  return new AppError("AGENT_FOCUS_LIST_INVALID", 422, message, undefined, undefined, details);
}

export async function createFocusList(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: FocusListCreateInput,
  clock: () => Date = () => new Date(),
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    await lockAgentSettings(transaction);
    /*
      Saat kilitlerden SONRA okunur ve tekillik başlangıçtan bağımsız denetlenir (Sol 6.1,
      1. tur): kilitten önce alınan `now`, eşzamanlı ikinci oluşturmanın daha geç başlangıçlı
      listesini görmüyordu ve iki etkin liste kalabiliyordu.
    */
    const now = clock();
    if (await findOpenFocusListRecord(transaction, now))
      throw new AppError("AGENT_FOCUS_LIST_CONFLICT", 409, "Etkin bir odak listesi zaten var.");
    const endsAt = new Date(input.endsAt);
    const windowError = focusWindowError(now, endsAt);
    if (windowError) throw invalid("Odak penceresi geçersiz.", { reason: windowError });

    const topics = await findFocusTopicsByPublicIds(transaction, input.topics, now);
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
    // Liste tanımının kendisi `agent.focus_list.created` olayıdır (createFocusListRecord).
    return list;
  });
}

export async function endFocusList(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: { reason: string },
  clock: () => Date = () => new Date(),
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    await lockAgentSettings(transaction);
    const now = clock();
    const active = await findOpenFocusListRecord(transaction, now);
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
    return { ...active, endedAt: now };
  });
}

/** Durum: en son liste, etkinliği ve başlık başına sunuldu/okundu/yazıldı/pas sayıları. */
export async function getFocusListStatus(client: DatabaseExecutor, now: Date = new Date()) {
  return inTransaction(client, async (transaction) => {
    const list = await findLatestFocusListRecord(transaction);
    if (!list) return null;
    const report = await focusListReport(transaction, list, now);
    return {
      list,
      active: list.endedAt === null && list.startsAt <= now && now < list.endsAt,
      ...report,
    };
  });
}

/*
  Algı kurulurken çağrılır (yalnız ilk kurulum; dondurulmuş algı yeniden seçilmez). Uygun
  koşuda en çok bir başlık döner ve `agent.focus.offered` olayı aynı transaction'da yazılır;
  algı yeniden kurulursa aynı sunum yeniden kullanılır.
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
  /*
    Koşu başına tek sunum (23 Ekim 2026, Sol 6.1 ile ortak karar). Kaynak sonucu kaydedilince
    algı temizlenip yeniden kuruluyor; eskiden bu ikinci kurulum yeni bir başlık seçip ikinci
    `offered` yazıyordu. İlk sunum modele okuma seçiminde hiç gösterilmeden 3 günlük beklemeye
    giriyor, okuma ve yazım atfı da gösterilen başlığı kaçırıyordu. Bu koşuda zaten sunum varsa
    yeni seçim ve yeni olay yok: liste hâlâ etkinse ve başlık hâlâ uygunsa (G4 dahil) aynı başlık
    döner, değilse menüye odak girmez.
  */
  const existing = await findRunFocusOffer(transaction, run.id);
  if (existing) {
    if (!list || list.id !== existing.focusListId) return null;
    const [row] = await findFocusTopicsByIds(transaction, [existing.topicId], now);
    if (!row || !isEligibleFocusTopic(row)) return null;
    return findFocusTopicTitle(transaction, existing.topicId);
  }
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
    now,
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
    metadata: { origin: focusEventOrigin, focusListId: list.id, topicId: topic.id },
    occurredAt: now,
  });
  return topic;
}

/*
  Ajan sunulan odak başlığını gerçekten okuduysa bir kez `agent.focus.read` yazar. Çağıran
  yalnız `readTopics` içine gerçekten dönen başlık kimliklerini verir (Sol 6.1, 1. tur).
*/
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
      origin: focusEventOrigin,
      focusListId: offer.focusListId,
      topicId: offer.topicId,
    },
    occurredAt: now,
  });
}

/*
  YAZIM ANI ODAK DENETİMİ (Sol 6.1, 1. tur). Yalnız bu koşuda sunulmuş ve hâlâ etkin listedeki
  odak başlığına yeni entry yazılırken çalışır; öteki yazımlar etkilenmez. Çağıran başlık
  kilidini (`lockTopicState`) tutar, böylece eşzamanlı iki yazım aynı sayımı göremez. Pencerede
  2 ajan entry'si dolmuşsa ya da yazar bu başlığa pencere içinde zaten yazdıysa onarılamaz bir
  retle (`FOCUS_TOPIC_CAP_REACHED`) durur.

  Sol 6.1 2. tur: atıf denetimden ayrıdır. Bu koşuya bu başlık sunulduysa liste kapanmış ya
  da süresi dolmuş olsa da `OFFERED` döner ve yayım sonrası `recordRuntimeFocusTopicWritten`
  değişmez kaydı yazar (dondurulmuş algıdan gelen yazım "pas" sayılmaz); tavan yalnız liste
  etkinken uygulanır. Etkinlik saati çağıranın ayar ve başlık kilitlerinden SONRA burada
  okunur; kilit beklerken pencere kapanırsa denetim kapanmış pencereye göre yapılır.
*/
export async function runtimeFocusWriteGuard(
  transaction: TransactionClient,
  input: { runId: string; authorId: string; topicId: string },
  clock: () => Date = () => new Date(),
): Promise<
  | { status: "NOT_FOCUS" }
  | { status: "REJECTED"; code: string; reason: string }
  | { status: "OFFERED"; focusListId: string; topicId: string; enforced: boolean }
> {
  const offer = await findRunFocusOffer(transaction, input.runId);
  if (!offer || offer.topicId !== input.topicId) return { status: "NOT_FOCUS" };
  const offered = {
    status: "OFFERED" as const,
    focusListId: offer.focusListId,
    topicId: input.topicId,
  };
  // Yalnız en son liste etkin olabilir; sunumu eski bir listeden gelen yazım yalnız atfedilir.
  const list = await findActiveFocusListRecord(transaction, clock());
  if (!list || list.id !== offer.focusListId) return { ...offered, enforced: false };
  const counts = await countFocusTopicWrites(transaction, {
    topicId: input.topicId,
    authorId: input.authorId,
    since: list.startsAt,
  });
  if (focusWriteBlocked(counts))
    return {
      status: "REJECTED",
      code: focusTopicWriteRejectionCode,
      reason:
        "Bu odak başlığı süreli pencerede yeterince yeni ajan entry'si aldı ya da sen bu başlığa bu pencerede zaten yazdın; entry yazılmadı.",
    };
  return { ...offered, enforced: true };
}

/** Odak başlığına yayımlanan entry için değişmez `agent.focus.written` kaydı. */
export async function recordRuntimeFocusTopicWritten(
  transaction: TransactionClient,
  input: {
    runId: string;
    actionId: string;
    agentProfileId: string;
    focusListId: string;
    topicId: string;
    entryId: string;
    now: Date;
  },
): Promise<void> {
  await appendRuntimeEvent(transaction, {
    agentProfileId: input.agentProfileId,
    runId: input.runId,
    actionId: input.actionId,
    eventType: focusTopicWrittenEventType,
    subject: { type: "TOPIC", id: input.topicId },
    safeMessage: "Ajan süreli odak başlığına entry yayımladı.",
    metadata: {
      origin: focusEventOrigin,
      focusListId: input.focusListId,
      topicId: input.topicId,
      entryId: input.entryId,
    },
    occurredAt: input.now,
  });
}

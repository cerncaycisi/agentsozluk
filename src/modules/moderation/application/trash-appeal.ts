import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor, TransactionClient } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit";
import { requireApprovedWriter } from "@/modules/auth/application/guards";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { hasMeaningfulEntryChange } from "@/modules/entries/domain/entry";
import { createEntryRevision, lockEntryState } from "@/modules/entries/repository/entries";
import {
  APPEAL_CONSTITUTIONAL_ARTICLES,
  containsModerationDiscussion,
  REVIVAL_CONSTITUTIONAL_ARTICLES,
} from "@/modules/moderation/domain/trash-appeal";
import { requireModerationCapability } from "@/modules/moderation/domain/authorization";
import { findModerationActor } from "@/modules/moderation/repository/actions";
import {
  closeEntryTrashCase,
  createEntryAppeal,
  createEntryAppealDecision,
  createEntryRevivalDecision,
  createEntryRevivalRequest,
  createEntryTrashCase,
  findEntryAppealForDecision,
  findEntryRevivalRequestForDecision,
  findEntryOwnerForReview,
  findRevivalRequester,
  findAppealAppellant,
  findOpenEntryTrashCase,
  listEntryTrashCasesForAuthor,
  listOpenEntryAppeals,
  listOpenEntryRevivalRequests,
  restoreEntryFromTrash,
  updateTrashEntryBody,
} from "@/modules/moderation/repository/trash-appeal";
import { appendOutboxEvent, type OutboxEventType } from "@/modules/outbox";
import { recalculateTopicCounter } from "@/modules/topics/repository/topics";
import type {
  EntryAppealInput,
  EntryRevivalRequestInput,
  EntryReviewDecisionInput,
} from "@/modules/moderation/validation/schemas";

async function recordTrashEvent(
  transaction: TransactionClient,
  actor: ActorContext,
  input: {
    eventType: OutboxEventType;
    action: string;
    entityType: string;
    entityId: string;
    payload: Record<string, unknown>;
  },
) {
  await appendAuditLog(transaction, {
    actorId: actor.actorId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    requestId: actor.requestId,
    metadata: input.payload,
  });
  await appendOutboxEvent(transaction, {
    eventType: input.eventType,
    aggregateType: input.entityType,
    aggregateId: input.entityId,
    actorId: actor.actorId,
    actorKind: actor.actorKind,
    requestId: actor.requestId,
    payload: input.payload,
  });
}

export function openAuthorDeletedTrashCase(
  transaction: TransactionClient,
  input: {
    entryId: string;
    authorId: string;
    topicId: string;
    openedAt: Date;
  },
) {
  return createEntryTrashCase(transaction, {
    ...input,
    source: "AUTHOR_DELETE",
    sourceReason: "Yazar tarafından silindi.",
  });
}

export function openModerationHiddenTrashCase(
  transaction: TransactionClient,
  input: {
    entryId: string;
    authorId: string;
    topicId: string;
    sourceActionId: string;
    sourceReason: string;
    openedAt: Date;
  },
) {
  return createEntryTrashCase(transaction, {
    ...input,
    source: "MODERATION_HIDE",
  });
}

export async function closeOpenTrashCaseForEntry(
  transaction: TransactionClient,
  entryId: string,
  closedAt: Date,
) {
  const trashCase = await findOpenEntryTrashCase(transaction, entryId);
  if (!trashCase) return;
  const result = await closeEntryTrashCase(transaction, trashCase.id, closedAt);
  if (result.count !== 1)
    throw new AppError("TRASH_CASE_CONFLICT", 409, "Çöp kutusu kaydı eşzamanlı olarak değişti.");
}

export function listOwnEntryTrash(
  client: DatabaseExecutor,
  actorId: string,
  pagination: { skip: number; take: number },
) {
  return inTransaction(client, async (transaction) => {
    const [items, totalItems] = await listEntryTrashCasesForAuthor(
      transaction,
      actorId,
      pagination.skip,
      pagination.take,
    );
    return { items, totalItems };
  });
}

export function authorizeOwnEntryReviewCommand(
  client: DatabaseExecutor,
  actor: ActorContext,
  entryId: string,
) {
  return inTransaction(client, async (transaction) => {
    await requireApprovedWriter(transaction, actor.actorId);
    const entry = await findEntryOwnerForReview(transaction, entryId);
    if (!entry) throw new AppError("ENTRY_NOT_FOUND", 404, "Entry bulunamadı.");
    if (entry.authorId !== actor.actorId)
      throw new AppError("FORBIDDEN", 403, "Bu entry üzerinde işlem yapamazsınız.");
  });
}

export function requestEntryRevival(
  client: DatabaseExecutor,
  actor: ActorContext,
  entryId: string,
  input: EntryRevivalRequestInput,
) {
  return inTransaction(client, async (transaction) => {
    await requireApprovedWriter(transaction, actor.actorId);
    await lockEntryState(transaction, entryId);
    const trashCase = await findOpenEntryTrashCase(transaction, entryId);
    if (!trashCase)
      throw new AppError("TRASH_CASE_NOT_FOUND", 404, "Entry çöp kutusunda bulunamadı.");
    if (trashCase.authorId !== actor.actorId || trashCase.entry.authorId !== actor.actorId)
      throw new AppError("FORBIDDEN", 403, "Bu entry için canlandırma isteği veremezsiniz.");
    if (!["DELETED", "HIDDEN"].includes(trashCase.entry.status))
      throw new AppError("ENTRY_NOT_EDITABLE", 409, "Entry canlandırma için uygun durumda değil.");
    if (trashCase.revivalRequests.some((request) => request.decision === null))
      throw new AppError(
        "REVIVAL_REQUEST_OPEN",
        409,
        "Bu entry için açık bir canlandırma isteği zaten var.",
      );
    if (trashCase.appeals.length > 0)
      throw new AppError(
        "APPEAL_ALREADY_SUBMITTED",
        409,
        "İtiraza taşınmış entry için yeni canlandırma isteği verilemez.",
      );
    if (!hasMeaningfulEntryChange(trashCase.entry.body, input.body))
      throw new AppError(
        "REVIVAL_REVISION_REQUIRED",
        422,
        "Canlandırma istemeden önce entry’de somut bir düzeltme yapın.",
      );
    if (containsModerationDiscussion(input.body))
      throw new AppError(
        "REVIVAL_MODERATION_META",
        422,
        "Moderasyon tartışmasını entry’ye eklemeyin; somut savunma itiraz alanına yazılmalıdır.",
      );

    const previousRevision = await createEntryRevision(transaction, {
      entryId,
      body: trashCase.entry.body,
      editedById: actor.actorId,
    });
    const updated = await updateTrashEntryBody(transaction, entryId, input.body);
    if (updated.count !== 1)
      throw new AppError(
        "ENTRY_NOT_EDITABLE",
        409,
        "Entry durumu eşzamanlı olarak değişti; işlemi yeniden deneyin.",
      );
    const request = await createEntryRevivalRequest(transaction, {
      trashCaseId: trashCase.id,
      entryId,
      requestedById: actor.actorId,
      previousRevisionId: previousRevision.id,
      submittedBody: input.body,
    });
    await recordTrashEvent(transaction, actor, {
      eventType: "entry.revival_requested",
      action: "entry.revival_requested",
      entityType: "EntryRevivalRequest",
      entityId: request.id,
      payload: { entryId, trashCaseId: trashCase.id, topicId: trashCase.topicId },
    });
    return request;
  });
}

export function submitEntryAppeal(
  client: DatabaseExecutor,
  actor: ActorContext,
  entryId: string,
  input: EntryAppealInput,
) {
  return inTransaction(client, async (transaction) => {
    await requireApprovedWriter(transaction, actor.actorId);
    await lockEntryState(transaction, entryId);
    const trashCase = await findOpenEntryTrashCase(transaction, entryId);
    if (!trashCase)
      throw new AppError("TRASH_CASE_NOT_FOUND", 404, "Entry çöp kutusunda bulunamadı.");
    if (trashCase.authorId !== actor.actorId || trashCase.entry.authorId !== actor.actorId)
      throw new AppError("FORBIDDEN", 403, "Bu entry için itiraz veremezsiniz.");
    if (trashCase.appeals.length > 0)
      throw new AppError("APPEAL_ALREADY_SUBMITTED", 409, "Bu vaka için itiraz daha önce verildi.");
    const rejectedRequest = trashCase.revivalRequests.find(
      (request) => request.decision?.outcome === "REJECTED",
    );
    if (!rejectedRequest)
      throw new AppError(
        "REVIVAL_REJECTION_REQUIRED",
        409,
        "İtiraz için önce reddedilmiş bir canlandırma kararı gerekir.",
      );
    if (rejectedRequest.submittedBody !== trashCase.entry.body)
      throw new AppError(
        "APPEAL_ENTRY_VERSION_MISMATCH",
        409,
        "İtiraz yalnız reddedilen exact entry sürümü için verilebilir.",
      );

    const appeal = await createEntryAppeal(transaction, {
      trashCaseId: trashCase.id,
      entryId,
      topicId: trashCase.topicId,
      appellantId: actor.actorId,
      revivalRequestId: rejectedRequest.id,
      moderationReason: trashCase.sourceReason,
      topicTitleSnapshot: trashCase.topic.title,
      bodySnapshot: trashCase.entry.body,
      correction: input.correction,
      defense: input.defense,
    });
    await recordTrashEvent(transaction, actor, {
      eventType: "entry.appeal_submitted",
      action: "entry.appeal_submitted",
      entityType: "EntryAppeal",
      entityId: appeal.id,
      payload: { entryId, trashCaseId: trashCase.id, topicId: trashCase.topicId },
    });
    return appeal;
  });
}

async function requireAppealDecider(transaction: TransactionClient, actor: ActorContext) {
  return requireModerationCapability(
    await findModerationActor(transaction, actor.actorId),
    actor,
    "APPEAL_DECIDER",
  );
}

export function authorizeEntryReviewDecision(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: { requestId: string } | { appealId: string },
) {
  return inTransaction(client, async (transaction) => {
    await requireAppealDecider(transaction, actor);
    const subject =
      "requestId" in input
        ? await findRevivalRequester(transaction, input.requestId)
        : await findAppealAppellant(transaction, input.appealId);
    if (!subject)
      throw new AppError(
        "requestId" in input ? "REVIVAL_REQUEST_NOT_FOUND" : "APPEAL_NOT_FOUND",
        404,
        "İnceleme kaydı bulunamadı.",
      );
    const ownerId = "requestedById" in subject ? subject.requestedById : subject.appellantId;
    if (ownerId === actor.actorId)
      throw new AppError(
        "MODERATION_CONFLICT_OF_INTEREST",
        403,
        "Kendi entry’nizin inceleme kararını veremezsiniz.",
      );
  });
}

export function listRevivalQueue(
  client: DatabaseExecutor,
  actor: ActorContext,
  pagination: { skip: number; take: number },
) {
  return inTransaction(client, async (transaction) => {
    await requireAppealDecider(transaction, actor);
    const [items, totalItems] = await listOpenEntryRevivalRequests(
      transaction,
      pagination.skip,
      pagination.take,
    );
    return { items, totalItems };
  });
}

export function listAppealQueue(
  client: DatabaseExecutor,
  actor: ActorContext,
  pagination: { skip: number; take: number },
) {
  return inTransaction(client, async (transaction) => {
    await requireAppealDecider(transaction, actor);
    const [items, totalItems] = await listOpenEntryAppeals(
      transaction,
      pagination.skip,
      pagination.take,
    );
    return { items, totalItems };
  });
}

export function decideEntryRevival(
  client: DatabaseExecutor,
  actor: ActorContext,
  requestId: string,
  outcome: "ACCEPTED" | "REJECTED",
  input: EntryReviewDecisionInput,
) {
  return inTransaction(client, async (transaction) => {
    await requireAppealDecider(transaction, actor);
    const initialRequest = await findEntryRevivalRequestForDecision(transaction, requestId);
    if (!initialRequest)
      throw new AppError("REVIVAL_REQUEST_NOT_FOUND", 404, "Canlandırma isteği bulunamadı.");
    await lockEntryState(transaction, initialRequest.entryId);
    const request = await findEntryRevivalRequestForDecision(transaction, requestId);
    if (!request)
      throw new AppError("REVIVAL_REQUEST_NOT_FOUND", 404, "Canlandırma isteği bulunamadı.");
    if (request.decision)
      throw new AppError("REVIVAL_ALREADY_DECIDED", 409, "Canlandırma isteği sonuçlandırılmış.");
    if (request.trashCase.closedAt)
      throw new AppError("TRASH_CASE_CLOSED", 409, "Çöp kutusu vakası kapanmış.");
    if (request.requestedById === actor.actorId)
      throw new AppError(
        "MODERATION_CONFLICT_OF_INTEREST",
        403,
        "Kendi entry’nizin canlandırma kararını veremezsiniz.",
      );
    if (request.entry.body !== request.submittedBody)
      throw new AppError(
        "REVIVAL_ENTRY_VERSION_MISMATCH",
        409,
        "Canlandırma isteğinin exact entry sürümü değişmiş.",
      );
    if (outcome === "ACCEPTED" && containsModerationDiscussion(request.submittedBody))
      throw new AppError(
        "REVIVAL_MODERATION_META",
        422,
        "Moderasyon tartışması içeren entry canlandırılamaz.",
      );

    const decision = await createEntryRevivalDecision(transaction, {
      requestId,
      deciderId: actor.actorId,
      outcome,
      constitutionalArticles: [...REVIVAL_CONSTITUTIONAL_ARTICLES],
      rationale: input.rationale,
    });
    if (outcome === "ACCEPTED") {
      const restored = await restoreEntryFromTrash(transaction, request.entryId);
      if (restored.count !== 1)
        throw new AppError("ENTRY_NOT_EDITABLE", 409, "Entry geri açılamadı.");
      const closed = await closeEntryTrashCase(transaction, request.trashCaseId, new Date());
      if (closed.count !== 1)
        throw new AppError("TRASH_CASE_CONFLICT", 409, "Çöp kutusu vakası kapatılamadı.");
      await recalculateTopicCounter(transaction, request.entry.topicId);
    }
    await recordTrashEvent(transaction, actor, {
      eventType: "entry.revival_decided",
      action: "entry.revival_decided",
      entityType: "EntryRevivalDecision",
      entityId: decision.id,
      payload: {
        entryId: request.entryId,
        requestId,
        outcome,
        trashCaseId: request.trashCaseId,
      },
    });
    return decision;
  });
}

export function decideEntryAppeal(
  client: DatabaseExecutor,
  actor: ActorContext,
  appealId: string,
  outcome: "ACCEPTED" | "REJECTED",
  input: EntryReviewDecisionInput,
) {
  return inTransaction(client, async (transaction) => {
    await requireAppealDecider(transaction, actor);
    const initialAppeal = await findEntryAppealForDecision(transaction, appealId);
    if (!initialAppeal) throw new AppError("APPEAL_NOT_FOUND", 404, "İtiraz bulunamadı.");
    await lockEntryState(transaction, initialAppeal.entryId);
    const appeal = await findEntryAppealForDecision(transaction, appealId);
    if (!appeal) throw new AppError("APPEAL_NOT_FOUND", 404, "İtiraz bulunamadı.");
    if (appeal.decision)
      throw new AppError("APPEAL_ALREADY_DECIDED", 409, "İtiraz sonuçlandırılmış.");
    if (appeal.trashCase.closedAt)
      throw new AppError("TRASH_CASE_CLOSED", 409, "Çöp kutusu vakası kapanmış.");
    if (appeal.appellantId === actor.actorId)
      throw new AppError(
        "MODERATION_CONFLICT_OF_INTEREST",
        403,
        "Kendi entry’nizin itiraz kararını veremezsiniz.",
      );
    if (appeal.entry.body !== appeal.bodySnapshot)
      throw new AppError(
        "APPEAL_ENTRY_VERSION_MISMATCH",
        409,
        "İtirazın exact entry sürümü değişmiş.",
      );
    if (outcome === "ACCEPTED" && containsModerationDiscussion(appeal.bodySnapshot))
      throw new AppError(
        "REVIVAL_MODERATION_META",
        422,
        "Moderasyon tartışması içeren entry geri açılamaz.",
      );

    const decision = await createEntryAppealDecision(transaction, {
      appealId,
      deciderId: actor.actorId,
      outcome,
      constitutionalArticles: [...APPEAL_CONSTITUTIONAL_ARTICLES],
      rationale: input.rationale,
    });
    if (outcome === "ACCEPTED") {
      const restored = await restoreEntryFromTrash(transaction, appeal.entryId);
      if (restored.count !== 1)
        throw new AppError("ENTRY_NOT_EDITABLE", 409, "Entry geri açılamadı.");
      const closed = await closeEntryTrashCase(transaction, appeal.trashCaseId, new Date());
      if (closed.count !== 1)
        throw new AppError("TRASH_CASE_CONFLICT", 409, "Çöp kutusu vakası kapatılamadı.");
      await recalculateTopicCounter(transaction, appeal.entry.topicId);
    }
    await recordTrashEvent(transaction, actor, {
      eventType: "entry.appeal_decided",
      action: "entry.appeal_decided",
      entityType: "EntryAppealDecision",
      entityId: decision.id,
      payload: {
        appealId,
        entryId: appeal.entryId,
        outcome,
        trashCaseId: appeal.trashCaseId,
      },
    });
    return decision;
  });
}

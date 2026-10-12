import { isLockNotAvailableError, TransientLockConflictError } from "@/lib/db/errors";
import type { TransactionClient } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { isSafeLifeLedgerText } from "@/modules/agents/domain/life-ledger-safety";
import { appendRuntimeEvent } from "@/modules/agents/repository/control-plane";
import { tryLockAgentLifeLedger } from "@/modules/agents/repository/life-ledger";
import { agentBehaviorReasonLabels } from "@/modules/agents/domain/behavior-feedback";
import {
  findAgentFeedbackTarget,
  findLatestAgentFeedbackEvent,
  lockAgentFeedbackReferencesNowait,
} from "@/modules/moderation/repository/agent-behavior-feedback";
import type { ModerationReasonInput } from "@/modules/moderation/validation/schemas";

/*
  Moderasyon başlık ve entry kilitlerini tutarken ajanın yaşam kaydı kilidini ve
  run/action satırlarını BEKLEMEZ. Ajan yürütücüsü bunları tutup başlık kilidini
  bekliyor olabilir; beklemek kilitlenme döngüsü kurar ve PostgreSQL yürütücüyü
  kurban seçebilir. Alınamazsa moderasyon transaction'ı geri alınır ve kısa bir
  beklemeyle baştan denenir (`inLockConflictRetryingTransaction`, #379).
*/
async function claimAgentFeedbackLocks(
  transaction: TransactionClient,
  target: { agentProfileId: string; runId: string; actionId: string },
) {
  if (!(await tryLockAgentLifeLedger(transaction, target.agentProfileId)))
    throw new TransientLockConflictError();
  try {
    await lockAgentFeedbackReferencesNowait(transaction, target);
  } catch (error) {
    if (isLockNotAvailableError(error)) throw new TransientLockConflictError();
    throw error;
  }
}

export async function appendAgentBehaviorFeedback(
  transaction: TransactionClient,
  input: {
    targetType: "ENTRY" | "TOPIC";
    targetId: string;
    operation: "HIDDEN" | "RENAMED" | "RESTORED";
    moderationActionId: string;
    reasonInput: ModerationReasonInput;
    occurredAt: Date;
  },
) {
  const target = await findAgentFeedbackTarget(transaction, input);
  if (!target) return null;
  await claimAgentFeedbackLocks(transaction, target);
  const feedbackKey = `${input.targetType}:${input.targetId}:${
    input.operation === "RENAMED" ? "TITLE" : "VISIBILITY"
  }`;
  const previous = await findLatestAgentFeedbackEvent(transaction, {
    agentProfileId: target.agentProfileId,
    feedbackKey,
  });
  if (input.operation === "RESTORED") {
    if (!previous || previous.eventType !== "CONTENT_MODERATED") return null;
    return appendRuntimeEvent(transaction, {
      agentProfileId: target.agentProfileId,
      runId: target.runId,
      actionId: target.actionId,
      eventType: "CONTENT_RESTORED",
      subject: { type: input.targetType, id: input.targetId },
      safeMessage: "İçerik moderasyon sinyali geri alındı.",
      causedByEventIds: previous.agentSequence === null ? [] : [previous.id],
      before: { feedbackActive: true },
      after: { feedbackActive: false },
      metadata: {
        feedbackKey,
        contentType: input.targetType,
        moderationActionId: input.moderationActionId,
        operation: input.operation,
      },
      occurredAt: input.occurredAt,
    });
  }
  const { behaviorReasonCode, editorNote } = input.reasonInput;
  if (!behaviorReasonCode || !editorNote)
    throw new AppError(
      "VALIDATION_ERROR",
      422,
      "Agent içeriği için davranış sebebi ve kısa editör notu zorunludur.",
    );
  if (!isSafeLifeLedgerText(editorNote))
    throw new AppError(
      "VALIDATION_ERROR",
      422,
      "Editör notu URL, e-posta, kimlik, gizli değer veya biçimlendirilmiş içerik taşıyamaz.",
    );
  return appendRuntimeEvent(transaction, {
    agentProfileId: target.agentProfileId,
    runId: target.runId,
    actionId: target.actionId,
    eventType: "CONTENT_MODERATED",
    subject: { type: input.targetType, id: input.targetId },
    safeMessage: "İçerik moderasyonu kalıcı davranış dersine dönüştürüldü.",
    ...(previous?.agentSequence === null || !previous ? {} : { causedByEventIds: [previous.id] }),
    before: { feedbackActive: previous?.eventType === "CONTENT_MODERATED" },
    after: { feedbackActive: true },
    metadata: {
      feedbackKey,
      contentType: input.targetType,
      behaviorReasonCode,
      behaviorReasonLabel: agentBehaviorReasonLabels[behaviorReasonCode],
      editorNote,
      moderationActionId: input.moderationActionId,
      operation: input.operation,
    },
    occurredAt: input.occurredAt,
  });
}

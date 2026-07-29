import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit";
import { requireAgentAdminInTransaction } from "@/modules/agents";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { lockEntryState } from "@/modules/entries/repository/entries";
import { appendOutboxEvent } from "@/modules/outbox";
import {
  findSeedVisibilityTarget,
  listCanonicalSeedEntries,
  setSeedVisibilityRecord,
} from "@/modules/moderation/repository/seed-visibility";
import type { ModerationReasonInput } from "@/modules/moderation/validation/schemas";
import { appendModerationAction } from "@/modules/moderation/repository/history";

export function getCanonicalSeedEntries(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: { query?: string; skip: number; take: number },
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    return listCanonicalSeedEntries(transaction, input);
  });
}

export function setCanonicalSeedEntrySuppression(
  client: DatabaseExecutor,
  actor: ActorContext,
  entryId: string,
  suppressed: boolean,
  input: ModerationReasonInput,
) {
  return inTransaction(client, async (transaction) => {
    await requireAgentAdminInTransaction(transaction, actor);
    await lockEntryState(transaction, entryId);
    const entry = await findSeedVisibilityTarget(transaction, entryId);
    if (!entry || entry.origin !== "SEED")
      throw new AppError("SEED_ENTRY_NOT_FOUND", 404, "Korunan seed entry bulunamadı.");
    const currentSuppressed = entry.seedVisibility?.suppressed ?? false;
    if (currentSuppressed === suppressed)
      return {
        changed: false,
        entryId: entry.id,
        publicId: entry.publicId,
        suppressed,
      };

    const now = new Date();
    await setSeedVisibilityRecord(transaction, {
      entryId,
      suppressed,
      reason: input.reason,
      actorId: actor.actorId,
      now,
    });
    const metadata = {
      actorKind: actor.actorKind,
      before: { suppressed: currentSuppressed },
      after: { suppressed },
      reason: input.reason,
      entryPublicId: entry.publicId,
      topicId: entry.topicId,
      topicPublicId: entry.topic.publicId,
    };
    const action = suppressed ? "SEED_ENTRY_SUPPRESSED" : "SEED_ENTRY_RESTORED";
    await appendModerationAction(transaction, {
      moderatorId: actor.actorId,
      actionType: action,
      targetType: "ENTRY",
      targetId: entryId,
      reason: input.reason,
      metadata,
    });
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: suppressed ? "seed.entry.suppressed" : "seed.entry.restored",
      entityType: "Entry",
      entityId: entryId,
      requestId: actor.requestId,
      metadata,
    });
    await appendOutboxEvent(transaction, {
      eventType: suppressed ? "seed.entry.suppressed" : "seed.entry.restored",
      aggregateType: "Entry",
      aggregateId: entryId,
      actorId: actor.actorId,
      actorKind: actor.actorKind,
      requestId: actor.requestId,
      payload: metadata,
    });
    return { changed: true, entryId, publicId: entry.publicId, suppressed };
  });
}

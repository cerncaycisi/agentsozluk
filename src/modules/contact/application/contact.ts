import { getEnvironment } from "@/config/env";
import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { hmacIdentifier } from "@/lib/security/crypto";
import { appendAuditLog } from "@/modules/audit";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { requireModerator } from "@/modules/moderation/domain/authorization";
import { findModerationActor } from "@/modules/moderation/repository/actions";
import {
  countContactMessages,
  insertContactMessage,
  listContactMessages,
  markContactMessageHandled,
} from "@/modules/contact/repository/contact";
import type {
  ContactMessageCreateInput,
  ContactMessageHandleInput,
} from "@/modules/contact/validation/schemas";

/**
 * Gönderen IP'si ham hâlde saklanmaz; yalnız aynı kaynağı tanımaya yarayan
 * HMAC özeti tutulur (oran sınırı anahtarlarıyla aynı yaklaşım).
 */
export function contactIpKeyHash(ip: string): string {
  return hmacIdentifier(getEnvironment().APP_SECRET, `iletisim-ip:${ip}`);
}

export async function submitContactMessage(
  client: DatabaseExecutor,
  input: ContactMessageCreateInput,
  context: { ip: string; submitterId: string | null; requestId: string },
) {
  return inTransaction(client, async (transaction) => {
    const created = await insertContactMessage(transaction, {
      ...input,
      ipKeyHash: contactIpKeyHash(context.ip),
      submitterId: context.submitterId,
    });
    // Denetim kaydı yalnız olayın olduğunu söyler: mesaj gövdesi, e-posta ve
    // adres denetim günlüğüne kopyalanmaz.
    await appendAuditLog(transaction, {
      actorId: context.submitterId,
      action: "contact.message.created",
      entityType: "ContactMessage",
      entityId: created.id,
      requestId: context.requestId,
      // `replyRequested` adı bilerek "email" içermiyor: denetim metadata koruması
      // e-posta çağrıştıran anahtarları reddediyor ve adres zaten yazılmamalı.
      metadata: { kind: input.kind, replyRequested: input.replyEmail !== undefined },
    });
    return { id: created.id, createdAt: created.createdAt };
  });
}

export async function getContactMessages(
  client: DatabaseExecutor,
  actor: ActorContext,
  input: { status: "OPEN" | "HANDLED"; skip: number; take: number },
) {
  return inTransaction(client, async (transaction) => {
    requireModerator(await findModerationActor(transaction, actor.actorId), actor);
    const [items, totalItems] = await Promise.all([
      listContactMessages(transaction, input),
      countContactMessages(transaction, input.status),
    ]);
    return [items, totalItems] as const;
  });
}

export async function resolveContactMessage(
  client: DatabaseExecutor,
  actor: ActorContext,
  messageId: string,
  input: ContactMessageHandleInput,
  now = new Date(),
) {
  return inTransaction(client, async (transaction) => {
    requireModerator(await findModerationActor(transaction, actor.actorId), actor);
    const updated = await markContactMessageHandled(transaction, {
      id: messageId,
      handledById: actor.actorId,
      note: input.note ?? null,
      now,
    });
    if (updated.count === 0)
      throw new AppError(
        "CONTACT_MESSAGE_NOT_OPEN",
        409,
        "Bu ileti bulunamadı ya da zaten ele alınmış.",
      );
    await appendAuditLog(transaction, {
      actorId: actor.actorId,
      action: "contact.message.handled",
      entityType: "ContactMessage",
      entityId: messageId,
      requestId: actor.requestId,
      metadata: { hasNote: input.note !== undefined },
    });
    return { id: messageId, status: "HANDLED" as const, handledAt: now };
  });
}

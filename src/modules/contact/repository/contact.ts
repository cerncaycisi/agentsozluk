import type { DatabaseExecutor } from "@/lib/db/types";
import type { ContactMessageCreateInput } from "@/modules/contact/validation/schemas";

export function insertContactMessage(
  database: DatabaseExecutor,
  input: ContactMessageCreateInput & { ipKeyHash: string; submitterId: string | null },
) {
  return database.contactMessage.create({
    data: {
      kind: input.kind,
      subjectUrl: input.subjectPath ?? null,
      message: input.message,
      replyEmail: input.replyEmail ?? null,
      submitterId: input.submitterId,
      ipKeyHash: input.ipKeyHash,
    },
    select: { id: true, createdAt: true },
  });
}

export function listContactMessages(
  database: DatabaseExecutor,
  input: { status: "OPEN" | "HANDLED"; skip: number; take: number },
) {
  return database.contactMessage.findMany({
    where: { status: input.status },
    orderBy: { createdAt: "desc" },
    skip: input.skip,
    take: input.take,
    select: {
      id: true,
      kind: true,
      subjectUrl: true,
      message: true,
      replyEmail: true,
      status: true,
      handledAt: true,
      handledNote: true,
      createdAt: true,
      handledBy: { select: { username: true } },
      submitter: { select: { username: true } },
    },
  });
}

export function countContactMessages(database: DatabaseExecutor, status: "OPEN" | "HANDLED") {
  return database.contactMessage.count({ where: { status } });
}

export function markContactMessageHandled(
  database: DatabaseExecutor,
  input: { id: string; handledById: string; note: string; now: Date },
) {
  return database.contactMessage.updateMany({
    where: { id: input.id, status: "OPEN" },
    data: {
      status: "HANDLED",
      handledById: input.handledById,
      handledAt: input.now,
      handledNote: input.note,
    },
  });
}

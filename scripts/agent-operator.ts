import { randomUUID } from "node:crypto";
import type { ActorContext } from "@/modules/auth/domain/actor";
import type { PrismaClient } from "@prisma/client";

export async function resolveOperatorAdmin(
  database: PrismaClient,
  requestedId: string | undefined,
): Promise<ActorContext> {
  const admins = await database.user.findMany({
    where: {
      kind: "HUMAN",
      role: "ADMIN",
      status: "ACTIVE",
      ...(requestedId ? { id: requestedId } : {}),
    },
    select: { id: true },
    take: requestedId ? 1 : 2,
  });
  if (admins.length !== 1)
    throw new Error(
      requestedId
        ? "AGENT_OPERATOR_ADMIN_ID aktif HUMAN ADMIN hesabını göstermelidir."
        : "Tam bir aktif HUMAN ADMIN bulunamadı; AGENT_OPERATOR_ADMIN_ID belirtin.",
    );
  return {
    actorId: admins[0]!.id,
    actorKind: "HUMAN",
    actorRole: "ADMIN",
    requestId: randomUUID(),
    origin: "API",
  };
}

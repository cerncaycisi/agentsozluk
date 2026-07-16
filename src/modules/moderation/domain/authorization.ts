import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/http/errors";
import type { ActorContext } from "@/modules/auth/domain/actor";

export async function requireModerator(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  options: { adminOnly?: boolean } = {},
) {
  const user = await transaction.user.findUnique({
    where: { id: actor.actorId },
    select: { id: true, role: true, status: true },
  });
  const permitted =
    user?.status === "ACTIVE" &&
    (options.adminOnly
      ? user.role === "ADMIN"
      : user.role === "MODERATOR" || user.role === "ADMIN");
  if (!permitted) throw new AppError("FORBIDDEN", 403, "Bu işlem için yetkiniz yok.");
  return user;
}

export function assertCanActOnUser(
  moderator: { id: string; role: "USER" | "MODERATOR" | "ADMIN" },
  target: { id: string; role: "USER" | "MODERATOR" | "ADMIN" },
): void {
  if (
    target.role === "ADMIN" ||
    moderator.id === target.id ||
    (moderator.role === "MODERATOR" && target.role !== "USER")
  ) {
    throw new AppError("FORBIDDEN", 403, "Bu kullanıcı üzerinde işlem yapamazsınız.");
  }
}

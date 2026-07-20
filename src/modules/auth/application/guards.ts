import type { TransactionClient } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { findActiveUserForWrite } from "@/modules/auth/repository/users";

export async function requireActiveActor(
  transaction: TransactionClient,
  actorId: string,
): Promise<void> {
  const actor = await findActiveUserForWrite(transaction, actorId);
  if (!actor) {
    throw new AppError("AUTH_REQUIRED", 401, "Bu işlem için giriş yapmalısınız.");
  }
  if (actor.status !== "ACTIVE") {
    throw new AppError(
      "ACCOUNT_SUSPENDED",
      403,
      "Hesabınız aktif olmadığı için bu işlemi yapamazsınız.",
    );
  }
}

export async function requireApprovedWriter(
  transaction: TransactionClient,
  actorId: string,
): Promise<void> {
  const actor = await findActiveUserForWrite(transaction, actorId);
  if (!actor) {
    throw new AppError("AUTH_REQUIRED", 401, "Bu işlem için giriş yapmalısınız.");
  }
  if (actor.status !== "ACTIVE") {
    throw new AppError(
      "ACCOUNT_SUSPENDED",
      403,
      "Hesabınız aktif olmadığı için bu işlemi yapamazsınız.",
    );
  }
  if (!actor.writerApproved) {
    throw new AppError("WRITER_APPROVAL_REQUIRED", 403, "Yazar hesabınız admin onayı bekliyor.");
  }
}

import { WRITER_INTAKE_CLOSED_MESSAGE, writerIntakeOpen } from "@/config/writer-intake";
import { inTransaction } from "@/lib/db/transaction";
import type { DatabaseExecutor, TransactionClient } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { appendAuditLog } from "@/modules/audit";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { lockUserStateForMutation } from "@/modules/auth/repository/users";
import { lockTopicTitles } from "@/modules/topics/repository/topics";
import { ukteTarget } from "@/modules/uktes/domain/target";
import * as records from "@/modules/uktes/repository/uktes";
import { ukteCreateSchema, ukteVisibilitySchema } from "@/modules/uktes/validation/schemas";

type Access = "WRITE" | "WITHDRAW" | "ADMIN";
const conflict = () =>
  new AppError("UKTE_CONFLICT", 409, "Ukte durumu değişti. Sayfayı yenileyin.");
const unavailable = () =>
  new AppError("UKTE_UNAVAILABLE", 409, "Bu başlık için ukte bırakılamıyor.");
const notFound = () => new AppError("UKTE_NOT_FOUND", 404, "Ukte bulunamadı.");

async function requireUkteActor(tx: TransactionClient, actor: ActorContext, access: Access) {
  await lockUserStateForMutation(tx, actor.actorId);
  const user = await records.findUkteActor(tx, actor.actorId);
  if (!user) throw new AppError("AUTH_REQUIRED", 401, "Giriş yapmalısınız.");
  if (user.status !== "ACTIVE")
    throw new AppError("ACCOUNT_SUSPENDED", 403, "Hesabınız aktif değil.");
  if (
    user.kind !== "HUMAN" ||
    actor.actorKind !== "HUMAN" ||
    !["WEB", "API"].includes(actor.origin)
  )
    throw new AppError("FORBIDDEN", 403, "Bu işlem için yetkiniz yok.");
  if (access === "ADMIN" && user.role !== "ADMIN")
    throw new AppError("FORBIDDEN", 403, "Bu işlem için yetkiniz yok.");
  if (access === "WRITE" && !user.writerApproved)
    throw new AppError(
      "WRITER_APPROVAL_REQUIRED",
      403,
      writerIntakeOpen() ? "Yazar hesabınız admin onayı bekliyor." : WRITER_INTAKE_CLOSED_MESSAGE,
    );
  return user;
}
export const authorizeUkteAction = (db: DatabaseExecutor, actor: ActorContext, access: Access) =>
  inTransaction(db, (tx) => requireUkteActor(tx, actor, access));

async function audit(
  tx: TransactionClient,
  actor: ActorContext,
  id: string,
  action: string,
  metadata: Record<string, unknown>,
) {
  await appendAuditLog(tx, {
    actorId: actor.actorId,
    requestId: actor.requestId,
    action,
    entityType: "UkteRequest",
    entityId: id,
    metadata,
  });
}

export function createUkte(
  db: DatabaseExecutor,
  actor: ActorContext,
  rawInput: { title: string },
  now = new Date(),
) {
  const { title } = ukteCreateSchema.parse(rawInput);
  const { normalizedTitle, targetKeys, slug } = ukteTarget(title);
  return inTransaction(db, async (tx) => {
    await requireUkteActor(tx, actor, "WRITE");
    await lockTopicTitles(tx, targetKeys);
    if (
      (await records.ukteTargetUnavailable(tx, targetKeys, slug)) ||
      (await records.findHiddenUkte(tx, targetKeys))
    )
      throw unavailable();
    const existing = await records.findOpenUkte(tx, targetKeys);
    if (existing) return { id: existing.id, created: false };
    const result = await records.createUkteRecord(tx, {
      title,
      normalizedTitle,
      targetKeys,
      slug,
      requestedById: actor.actorId,
      now,
    });
    await audit(tx, actor, result.id, "ukte.created", {});
    return { id: result.id, created: true };
  });
}
export function withdrawUkte(
  db: DatabaseExecutor,
  actor: ActorContext,
  id: string,
  now = new Date(),
) {
  return inTransaction(db, async (tx) => {
    await requireUkteActor(tx, actor, "WITHDRAW");
    const first = await records.findUkte(tx, id);
    if (!first || first.requestedById !== actor.actorId || first.status === "HIDDEN")
      throw notFound();
    await lockTopicTitles(tx, first.targetKeys);
    const row = await records.findUkte(tx, id);
    if (!row || row.status === "HIDDEN") throw notFound();
    if (row.status === "WITHDRAWN") return { withdrawn: true };
    const changed = await records.updateUkteStatus(tx, {
      id,
      version: row.version,
      from: "OPEN",
      to: "WITHDRAWN",
      now,
    });
    if (changed.count !== 1) throw conflict();
    await audit(tx, actor, id, "ukte.withdrawn", {});
    return { withdrawn: true };
  });
}
export function setUkteVisibility(
  db: DatabaseExecutor,
  actor: ActorContext,
  id: string,
  rawInput: { hidden: boolean; expectedVersion: number; reason: string },
  now = new Date(),
) {
  const input = ukteVisibilitySchema.parse(rawInput);
  return inTransaction(db, async (tx) => {
    await requireUkteActor(tx, actor, "ADMIN");
    const first = await records.findUkte(tx, id);
    if (!first) throw notFound();
    await lockTopicTitles(tx, first.targetKeys);
    const row = await records.findUkte(tx, id);
    if (
      !row ||
      row.version !== input.expectedVersion ||
      row.status !== (input.hidden ? "OPEN" : "HIDDEN")
    )
      throw conflict();
    if (
      !input.hidden &&
      ((await records.findOpenUkte(tx, row.targetKeys)) ||
        (await records.ukteTargetUnavailable(tx, row.targetKeys, row.slug)))
    )
      throw unavailable();
    const changed = await records.updateUkteStatus(tx, {
      id,
      version: row.version,
      from: input.hidden ? "OPEN" : "HIDDEN",
      to: input.hidden ? "HIDDEN" : "OPEN",
      now,
    });
    if (changed.count !== 1) throw conflict();
    await audit(tx, actor, id, input.hidden ? "ukte.hidden" : "ukte.restored", {
      reason: input.reason,
    });
    return { id, status: input.hidden ? "HIDDEN" : "OPEN", version: row.version + 1 };
  });
}
function page(rows: records.UkteListRecord[], viewerId?: string, admin = false) {
  const items = rows.slice(0, records.uktePageSize).map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    ...(admin ? { version: row.version } : {}),
    createdAt: row.createdAt.toISOString(),
    canWithdraw: row.requestedById === viewerId && row.status === "OPEN",
    // Açılmamış başlık adı slug--id/UUID/ac gibi rota biçimleriyle çakışsa da doğru başlık ön doldurulur.
    writeUrl: `/baslik/ac?title=${encodeURIComponent(row.title)}`,
  }));
  return { items, nextCursor: rows.length > records.uktePageSize ? items.at(-1)!.id : null };
}
export const listPublicUktes = (
  db: DatabaseExecutor,
  input: { before?: string | undefined; viewerId?: string | undefined },
) =>
  inTransaction(db, async (tx) => page(await records.listUkteRecords(tx, input), input.viewerId));
export const listAdminUktes = (
  db: DatabaseExecutor,
  actor: ActorContext,
  input: { before?: string | undefined; status: "OPEN" | "HIDDEN" },
) =>
  inTransaction(db, async (tx) => {
    await requireUkteActor(tx, actor, "ADMIN");
    return page(
      await records.listUkteRecords(tx, { before: input.before, adminStatus: input.status }),
      actor.actorId,
      true,
    );
  });

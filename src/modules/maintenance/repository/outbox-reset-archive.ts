import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;
export type OutboxArchiveSnapshot = { rows: number; sha256: string };

/** Ham olay/payload uygulamaya veya log'a çıkmaz; özet PostgreSQL'de hesaplanır. */
export async function pendingOutboxSnapshot(tx: Tx): Promise<OutboxArchiveSnapshot> {
  const [result] = await tx.$queryRaw<OutboxArchiveSnapshot[]>`
    SELECT count(*)::int AS rows,
      encode(sha256(convert_to(coalesce(string_agg(to_jsonb(e)::text,
        E'\n' ORDER BY to_jsonb(e)::text COLLATE "C"), ''), 'UTF8')), 'hex') AS sha256
    FROM public.outbox_events e
    WHERE e."processedAt" IS NULL AND NOT EXISTS (
      SELECT 1 FROM public.outbox_reset_archive_events m WHERE m."eventId" = e.id)`;
  if (!result) throw new Error("GREAT_RESET_OUTBOX_SNAPSHOT_FAILED");
  return result;
}

/** Üyeler, orijinal olay satırları ve manifest özeti birlikte doğrulanır. */
export async function outboxArchivesAreValid(tx: Tx): Promise<boolean> {
  const [result] = await tx.$queryRaw<{ valid: boolean }[]>`
    SELECT NOT EXISTS (
      SELECT 1 FROM public.outbox_reset_archives a
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS rows, bool_and(e."processedAt" IS NULL) AS pending,
          encode(sha256(convert_to(coalesce(string_agg(to_jsonb(e)::text,
            E'\n' ORDER BY to_jsonb(e)::text COLLATE "C"), ''), 'UTF8')), 'hex') AS sha256
        FROM public.outbox_reset_archive_events m
        JOIN public.outbox_events e ON e.id = m."eventId"
        WHERE m."archiveId" = a.id
      ) s ON true
      WHERE a."formatVersion" <> 1 OR s.rows <> a."eventCount"
        OR s.sha256 <> a."eventsSha256" OR s.pending IS DISTINCT FROM true
    ) AS valid`;
  return result?.valid === true;
}

export async function assertExpectedOutboxArchive(
  tx: Tx,
  archiveId: string,
  planSha256: string,
  expected: OutboxArchiveSnapshot,
): Promise<void> {
  const archive = await tx.outboxResetArchive.findUnique({ where: { id: archiveId } });
  if (
    !archive ||
    archive.formatVersion !== 1 ||
    archive.planSha256 !== planSha256 ||
    archive.eventCount !== expected.rows ||
    archive.eventsSha256 !== expected.sha256
  )
    throw new Error("GREAT_RESET_OUTBOX_ARCHIVE_MISMATCH");
}

/** Çağıran bütün reset tablolarını kilitlemiş olmalı; yalnız yerel reset girişinden kullanılır. */
export async function archivePendingOutboxEvents(
  tx: Tx,
  archiveId: string,
  planSha256: string,
  expected: OutboxArchiveSnapshot,
): Promise<string | null> {
  if (expected.rows === 0) return null;
  await tx.outboxResetArchive.create({
    data: { id: archiveId, planSha256, eventCount: expected.rows, eventsSha256: expected.sha256 },
  });
  const inserted = await tx.$executeRaw`
    INSERT INTO public.outbox_reset_archive_events ("eventId", "archiveId")
    SELECT e.id, ${archiveId}::uuid FROM public.outbox_events e
    WHERE e."processedAt" IS NULL AND NOT EXISTS (
      SELECT 1 FROM public.outbox_reset_archive_events m WHERE m."eventId" = e.id)`;
  if (inserted !== expected.rows || !(await outboxArchivesAreValid(tx)))
    throw new Error("GREAT_RESET_OUTBOX_ARCHIVE_MISMATCH");
  await assertExpectedOutboxArchive(tx, archiveId, planSha256, expected);
  return archiveId;
}

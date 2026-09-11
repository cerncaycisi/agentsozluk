import { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;
export type OutboxArchiveSnapshot = { rows: number; sha256: string };

// Format 1: timestamptz değerleri mutlak epoch ile; oturum TimeZone'undan bağımsız.
// Önce her satır hash'lenir: büyük payload'lar tek dev string_agg değerine taşınmaz.
const rowHash = Prisma.sql`encode(sha256(convert_to((
  (to_jsonb(e) - 'createdAt' - 'processedAt') || jsonb_build_object(
    'createdAtEpoch', extract(epoch FROM e."createdAt"),
    'processedAtEpoch', extract(epoch FROM e."processedAt"))
  )::text, 'UTF8')), 'hex')`;

export async function outboxArchiveSummary(tx: Tx) {
  return {
    archiveGenerations: await tx.outboxResetArchive.count(),
    totalArchivedUndeliveredRows: await tx.outboxResetArchiveEvent.count(),
  };
}

/** Ham olay/payload uygulamaya veya log'a çıkmaz; özet PostgreSQL'de hesaplanır. */
export async function pendingOutboxSnapshot(tx: Tx): Promise<OutboxArchiveSnapshot> {
  const [result] = await tx.$queryRaw<OutboxArchiveSnapshot[]>`
    WITH row_hashes AS MATERIALIZED (
      SELECT ${rowHash} AS row_hash FROM public.outbox_events e
      WHERE e."processedAt" IS NULL AND NOT EXISTS (
        SELECT 1 FROM public.outbox_reset_archive_events m WHERE m."eventId" = e.id)
    )
    SELECT count(*)::int AS rows,
      encode(sha256(convert_to(coalesce(string_agg(row_hash,
        E'\n' ORDER BY row_hash COLLATE "C"), ''), 'UTF8')), 'hex') AS sha256
    FROM row_hashes`;
  if (!result) throw new Error("GREAT_RESET_OUTBOX_SNAPSHOT_FAILED");
  return result;
}

/** Üyeler, orijinal olay satırları ve manifest özeti birlikte doğrulanır. */
export async function outboxArchivesAreValid(tx: Tx): Promise<boolean> {
  const [result] = await tx.$queryRaw<{ valid: boolean }[]>`
    SELECT NOT EXISTS (
      SELECT 1 FROM public.outbox_reset_archives a
      LEFT JOIN LATERAL (
        WITH row_hashes AS MATERIALIZED (
          SELECT ${rowHash} AS row_hash, e."processedAt" IS NULL AS pending
          FROM public.outbox_reset_archive_events m
          JOIN public.outbox_events e ON e.id = m."eventId"
          WHERE m."archiveId" = a.id
        )
        SELECT count(*)::int AS rows, bool_and(pending) AS pending,
          encode(sha256(convert_to(coalesce(string_agg(row_hash,
            E'\n' ORDER BY row_hash COLLATE "C"), ''), 'UTF8')), 'hex') AS sha256
        FROM row_hashes
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
  // Üyelik trigger'ı okuyucunun snapshot'ına bağlı: arşivden ÖNCE snapshot almış bir
  // REPEATABLE READ yazıcısı üyeliği göremez ve arşivlenmiş olayı sessizce değiştirebilir.
  // İçeriği değiştirmeyen bu yazma yeni satır sürümü doğurur; böyle bir yazıcı artık
  // 40001 ile düşer. Üyelikten ÖNCE olmalı, yoksa kendi immutable trigger'ımıza takılır.
  const bumped = await tx.$executeRaw`
    UPDATE public.outbox_events e SET "processedAt" = e."processedAt"
    WHERE e."processedAt" IS NULL AND NOT EXISTS (
      SELECT 1 FROM public.outbox_reset_archive_events m WHERE m."eventId" = e.id)`;
  if (bumped !== expected.rows) throw new Error("GREAT_RESET_OUTBOX_ARCHIVE_MISMATCH");
  // Mührün niyet kapısı yalnız bu INSERT boyunca ve yalnız BU arşiv için açılır;
  // aynı transaction'da sonradan kazara eklenecek üyelik yine reddedilir.
  await tx.$queryRaw`SELECT set_config('agentsozluk.archiving', ${archiveId}, true)`;
  const inserted = await tx.$executeRaw`
    INSERT INTO public.outbox_reset_archive_events ("eventId", "archiveId")
    SELECT e.id, ${archiveId}::uuid FROM public.outbox_events e
    WHERE e."processedAt" IS NULL AND NOT EXISTS (
      SELECT 1 FROM public.outbox_reset_archive_events m WHERE m."eventId" = e.id)`;
  await tx.$queryRaw`SELECT set_config('agentsozluk.archiving', '', true)`;
  if (inserted !== expected.rows || !(await outboxArchivesAreValid(tx)))
    throw new Error("GREAT_RESET_OUTBOX_ARCHIVE_MISMATCH");
  await assertExpectedOutboxArchive(tx, archiveId, planSha256, expected);
  return archiveId;
}

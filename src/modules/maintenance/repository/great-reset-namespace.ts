import { Prisma } from "@prisma/client";

/*
  Great reset namespace adımları (üretim tasarımı v19, madde 3–5 ve Aşama 3). Hepsi tek reset
  transaction'ında, bütün tablo kilitlerinden ve plan eşitliğinden SONRA çalışır:

    niyet tüketimi → (outbox arşivi) → mezar taşı kopyası → TRUNCATE → namespace açılışı
    → commit işareti → son koşullar

  Yerel provada da aynı kod koşar; üretim profili yalnız hedef kimliğini ve bağlantı kapısını
  ekler. Hata güvenli kodla fırlatılır; transaction geri alınır, hiçbir adım kalıcı olmaz.
*/

type Tx = Prisma.TransactionClient;

export type NamespaceResetInput = {
  operationId: string;
  releaseSha: string;
  receiptSha256: string;
};

export const GREAT_RESET_INTENT_SCOPE = "GREAT_RESET_PRODUCTION_V1";
const NEW_NAMESPACE_START = 2_147_483_648n;
const NEW_NAMESPACE_MAX = 9_007_199_254_740_991n;

const contentTables = [
  {
    kind: "TOPIC",
    table: "topics",
    sequence: "topics_public_id_seq",
    legacyCheck: "topics_public_id_legacy_range_check",
    namespaceCheck: "topics_public_id_namespace_range_check",
  },
  {
    kind: "ENTRY",
    table: "entries",
    sequence: "entries_public_id_seq",
    legacyCheck: "entries_public_id_legacy_range_check",
    namespaceCheck: "entries_public_id_namespace_range_check",
  },
] as const;

/** Namespace açılışında tanımı değişen kısıtlar; şema özeti bunları ayrıca doğrulanmış sayar. */
export const namespaceConstraintNames: readonly string[] = contentTables.flatMap((row) => [
  row.legacyCheck,
  row.namespaceCheck,
]);
/** Namespace açılışında durumu değişen sequence'ler; sequence özeti bunları ayrıca doğrular. */
export const namespaceSequenceNames: readonly string[] = contentTables.map((row) => row.sequence);

export function assertNamespaceInput(input: NamespaceResetInput): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      input.operationId,
    ) ||
    !/^[a-f0-9]{40}$/u.test(input.releaseSha) ||
    !/^[a-f0-9]{64}$/u.test(input.receiptSha256)
  )
    throw new Error("GREAT_RESET_INVALID_NAMESPACE_INPUT");
}

/**
 * Önizleme kapıları: tam bir geçerli niyet (bu işlem kimliği, release SHA'sı, süresi dolmamış,
 * tüketilmemiş ve geçersizleştirilmemiş) ve boş mezar taşı tablosu.
 */
export async function namespaceBlockers(tx: Tx, input: NamespaceResetInput): Promise<string[]> {
  const result: string[] = [];
  const [intent] = await tx.$queryRaw<{ valid: number; other: number }[]>`
    SELECT
      count(*) FILTER (WHERE "operationId" = ${input.operationId}::uuid
        AND "releaseSha" = ${input.releaseSha} AND scope = ${GREAT_RESET_INTENT_SCOPE}
        AND "consumedAt" IS NULL AND "invalidatedAt" IS NULL
        AND "expiresAt" > clock_timestamp())::int AS valid,
      count(*) FILTER (WHERE "operationId" <> ${input.operationId}::uuid
        AND "consumedAt" IS NULL AND "invalidatedAt" IS NULL
        AND "expiresAt" > clock_timestamp())::int AS other
    FROM public.great_reset_intents`;
  if (intent?.valid !== 1) result.push("RESET_INTENT_INVALID");
  // Başka bir geçerli niyet açıkken reset belirsizdir; önce geçersizleştirilmelidir.
  if (intent?.other !== 0) result.push("RESET_INTENT_AMBIGUOUS");
  if ((await tx.greatResetTombstone.count()) !== 0) result.push("RESET_TOMBSTONES_NOT_EMPTY");
  return result;
}

/** Niyet yalnız bu transaction'da, tam bir satır olarak tüketilir; COMMIT ile kalıcılaşır. */
export async function consumeIntent(tx: Tx, input: NamespaceResetInput): Promise<void> {
  const consumed = await tx.$queryRaw<{ operationId: string }[]>`
    UPDATE public.great_reset_intents SET "consumedAt" = clock_timestamp()
    WHERE "operationId" = ${input.operationId}::uuid AND "consumedAt" IS NULL
      AND "invalidatedAt" IS NULL AND "expiresAt" > clock_timestamp()
      AND "releaseSha" = ${input.releaseSha} AND scope = ${GREAT_RESET_INTENT_SCOPE}
    RETURNING "operationId"::text AS "operationId"`;
  if (consumed.length !== 1) throw new Error("GREAT_RESET_INTENT_INVALID");
}

/**
 * Silinecek her başlık ve entry'nin `(kind, contentId, publicId)` üçlüsü mezar taşına kopyalanır
 * (Gökhan kararı, 26 Eylül: yalnız bilinen silinmişe 410). Kaynakla birebir eşleşme ve sayı
 * eşitliği doğrulanır; `publicId` sınırı ve iki benzersizlik tablo kısıtlarıyla zorlanır.
 */
export async function copyTombstones(
  tx: Tx,
  operationId: string,
): Promise<{ topics: number; entries: number }> {
  const counts = { topics: 0, entries: 0 };
  for (const { kind, table } of contentTables) {
    const source = Prisma.raw(`public."${table}"`);
    const inserted = await tx.$executeRaw(Prisma.sql`
      INSERT INTO public.great_reset_tombstones (kind, "contentId", "publicId", "operationId")
      SELECT ${kind}::"GreatResetContentKind", t.id, t."publicId", ${operationId}::uuid
      FROM ${source} t`);
    const [check] = await tx.$queryRaw<{ source: number; matched: number; tombstones: number }[]>(
      Prisma.sql`
        SELECT
          (SELECT count(*)::int FROM ${source}) AS source,
          (SELECT count(*)::int FROM ${source} t JOIN public.great_reset_tombstones g
             ON g.kind = ${kind}::"GreatResetContentKind" AND g."contentId" = t.id
            AND g."publicId" = t."publicId" AND g."operationId" = ${operationId}::uuid) AS matched,
          (SELECT count(*)::int FROM public.great_reset_tombstones
            WHERE kind = ${kind}::"GreatResetContentKind") AS tombstones`,
    );
    if (
      !check ||
      check.source !== inserted ||
      check.matched !== inserted ||
      check.tombstones !== inserted
    )
      throw new Error("GREAT_RESET_TOMBSTONE_COPY_FAILED");
    if (kind === "TOPIC") counts.topics = inserted;
    else counts.entries = inserted;
  }
  return counts;
}

/**
 * Tablolar boşaldıktan SONRA: eski üst sınır kısıtı kaldırılır, yeni namespace'in alt ve üst
 * sınırı doğrulanmış kısıtla zorlanır (Astra, v17 P2: `DEFAULT nextval()` açık değeri
 * sınırlamaz), sequence'in üst sınırı yükselir ve değer tüketmeden 2147483648'e taşınır.
 * `setval()` ve `nextval()` kullanılmaz.
 */
export async function openNewNamespace(tx: Tx): Promise<void> {
  for (const { table, sequence, legacyCheck, namespaceCheck } of contentTables) {
    const [rows] = await tx.$queryRaw<{ count: number }[]>(
      Prisma.sql`SELECT count(*)::int AS count FROM ${Prisma.raw(`public."${table}"`)}`,
    );
    if (rows?.count !== 0) throw new Error("GREAT_RESET_NAMESPACE_TABLE_NOT_EMPTY");
    await tx.$executeRaw(
      Prisma.raw(
        `ALTER TABLE public."${table}" DROP CONSTRAINT "${legacyCheck}", ` +
          `ADD CONSTRAINT "${namespaceCheck}" CHECK ("publicId" BETWEEN ` +
          `${NEW_NAMESPACE_START} AND ${NEW_NAMESPACE_MAX})`,
      ),
    );
    await tx.$executeRaw(
      Prisma.raw(
        `ALTER SEQUENCE public."${sequence}" MAXVALUE ${NEW_NAMESPACE_MAX} ` +
          `RESTART WITH ${NEW_NAMESPACE_START}`,
      ),
    );
  }
}

export async function insertCommitMarker(
  tx: Tx,
  input: NamespaceResetInput & { planSha256: string; topics: number; entries: number },
): Promise<void> {
  await tx.greatResetCommit.create({
    data: {
      operationId: input.operationId,
      releaseSha: input.releaseSha,
      planSha256: input.planSha256,
      receiptSha256: input.receiptSha256,
      topicTombstones: input.topics,
      entryTombstones: input.entries,
    },
  });
}

/**
 * Namespace son koşulları: eski kısıtlar yok, yeni kısıtlar doğrulanmış ve birebir tanımlı,
 * sequence tanımı ve TÜKETİLMEMİŞ başlangıcı doğru, içerik tabloları boş, tam bir commit ve
 * tam bir tüketilmiş niyet var. Değer okunur; `nextval()` çağrılmaz.
 */
export async function namespacePostconditionsHold(
  tx: Tx,
  input: NamespaceResetInput & { topics: number; entries: number },
): Promise<boolean> {
  for (const { kind, table, sequence, legacyCheck, namespaceCheck } of contentTables) {
    const [row] = await tx.$queryRaw<
      {
        rows: number;
        legacy: number;
        definition: string | null;
        validated: boolean | null;
        dataType: string;
        maxValue: string;
        increment: string;
        cache: string;
        cycle: boolean;
        lastValue: string;
        isCalled: boolean;
        tombstones: number;
      }[]
    >(Prisma.sql`
      SELECT
        (SELECT count(*)::int FROM ${Prisma.raw(`public."${table}"`)}) AS rows,
        (SELECT count(*)::int FROM pg_constraint
          WHERE conrelid = ${`public.${table}`}::regclass AND conname = ${legacyCheck}) AS legacy,
        (SELECT pg_get_constraintdef(oid) FROM pg_constraint
          WHERE conrelid = ${`public.${table}`}::regclass AND conname = ${namespaceCheck}
            AND contype = 'c') AS definition,
        (SELECT convalidated FROM pg_constraint
          WHERE conrelid = ${`public.${table}`}::regclass AND conname = ${namespaceCheck}) AS validated,
        s.data_type::text AS "dataType", s.max_value::text AS "maxValue",
        s.increment_by::text AS increment, s.cache_size::text AS cache, s.cycle,
        q.last_value::text AS "lastValue", q.is_called AS "isCalled",
        (SELECT count(*)::int FROM public.great_reset_tombstones
          WHERE kind = ${kind}::"GreatResetContentKind"
            AND "operationId" = ${input.operationId}::uuid) AS tombstones
      FROM pg_sequences s CROSS JOIN ${Prisma.raw(`public."${sequence}"`)} q
      WHERE s.schemaname = 'public' AND s.sequencename = ${sequence}`);
    if (
      !row ||
      row.rows !== 0 ||
      row.legacy !== 0 ||
      row.validated !== true ||
      row.definition !==
        `CHECK ((("publicId" >= '${NEW_NAMESPACE_START}'::bigint) AND ("publicId" <= '${NEW_NAMESPACE_MAX}'::bigint)))` ||
      row.dataType !== "bigint" ||
      row.maxValue !== NEW_NAMESPACE_MAX.toString() ||
      row.increment !== "1" ||
      row.cache !== "1" ||
      row.cycle ||
      row.lastValue !== NEW_NAMESPACE_START.toString() ||
      row.isCalled ||
      row.tombstones !== (kind === "TOPIC" ? input.topics : input.entries)
    )
      return false;
  }
  const [state] = await tx.$queryRaw<{ commits: number; consumed: number; valid: number }[]>`
    SELECT
      (SELECT count(*)::int FROM public.great_reset_commits
        WHERE "operationId" = ${input.operationId}::uuid
          AND "topicTombstones" = ${input.topics} AND "entryTombstones" = ${input.entries}) AS commits,
      (SELECT count(*)::int FROM public.great_reset_intents
        WHERE "operationId" = ${input.operationId}::uuid AND "consumedAt" IS NOT NULL
          AND "invalidatedAt" IS NULL) AS consumed,
      (SELECT count(*)::int FROM public.great_reset_intents
        WHERE "consumedAt" IS NULL AND "invalidatedAt" IS NULL
          AND "expiresAt" > clock_timestamp()) AS valid`;
  return state?.commits === 1 && state.consumed === 1 && state.valid === 0;
}

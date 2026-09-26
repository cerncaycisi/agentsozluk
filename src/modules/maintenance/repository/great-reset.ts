import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { hostname } from "node:os";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  assertCompleteResetClassification,
  greatResetClearedModels,
  greatResetPreservedModels,
} from "../domain/great-reset";
import { localResetTarget, type LocalResetIdentity } from "../domain/great-reset-local-guard";
import {
  acquireRunnerLock,
  closeConnectionGate,
  connectionGatePreflight,
  openConnectionGate,
  releaseRunnerLock,
} from "./great-reset-connection-gate";
import {
  assertNamespaceInput,
  consumeIntent,
  copyTombstones,
  insertCommitMarker,
  namespaceBlockers,
  namespaceConstraintPairs,
  namespacePostconditionsHold,
  namespaceSequenceNames,
  openNewNamespace,
  type NamespaceResetInput,
} from "./great-reset-namespace";
import {
  archivePendingOutboxEvents,
  assertExpectedOutboxArchive,
  outboxArchivesAreValid,
  pendingOutboxSnapshot,
  outboxArchiveSummary,
} from "./outbox-reset-archive";

type Request = (
  | { mode: "DRY_RUN" }
  | {
      mode: "EXECUTE";
      databaseName: string;
      planSha256: string;
    }
) & { archiveOutbox?: true; namespace?: NamespaceResetInput; connectionGate?: true };
type Fingerprint = { rows: number; sha256: string };
type Table = { model: string; table: string; cleared: boolean };
type Tx = Prisma.TransactionClient;

/** Üretim restore audit eylemi; varlığı ikinci reseti kalıcı kapatır (tasarım v18 Aşama 4.6). */
export const GREAT_RESET_PRODUCTION_RESTORE_ACTION = "GREAT_RESET_PRODUCTION_RESTORE";

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function implementationDigest(): string {
  return digest([
    readFileSync(new URL(import.meta.url), "utf8"),
    readFileSync(new URL("./outbox-reset-archive.ts", import.meta.url), "utf8"),
    readFileSync(new URL("./great-reset-namespace.ts", import.meta.url), "utf8"),
    readFileSync(new URL("./great-reset-connection-gate.ts", import.meta.url), "utf8"),
    readFileSync(new URL("../../outbox/repository/pending.ts", import.meta.url), "utf8"),
    readFileSync(new URL("../domain/great-reset.ts", import.meta.url), "utf8"),
    readFileSync(new URL("../domain/great-reset-local-guard.ts", import.meta.url), "utf8"),
    readFileSync(new URL("../../../../scripts/great-reset-local.ts", import.meta.url), "utf8"),
    readFileSync(
      new URL("../../../../scripts/great-reset-local-guard.ts", import.meta.url),
      "utf8",
    ),
  ]);
}

function tables(): Table[] {
  const models = Prisma.dmmf.datamodel.models;
  const modelName = (name: string) => name[0]!.toLowerCase() + name.slice(1);
  assertCompleteResetClassification(models.map((model) => modelName(model.name)));
  const cleared = new Set<string>(greatResetClearedModels);
  return models
    .map((model) => ({
      model: modelName(model.name),
      table: model.dbName ?? model.name,
      cleared: cleared.has(modelName(model.name)),
    }))
    .sort((a, b) => a.table.localeCompare(b.table));
}

/** İsim yalnız doğrulanmış datamodel/katalog izin listesinden; SQL değeri değildir. */
function tableSql(table: string): Prisma.Sql {
  if (!/^[a-z_]+$/u.test(table)) throw new Error("GREAT_RESET_INVALID_TABLE");
  return Prisma.raw(`ONLY "public"."${table}"`);
}

/*
  Silinecek tablolar için SATIR SÜRÜMÜ özeti (25 Eylül 2026, gerçek boyutlu prova).

  Operatör sunucusunda üretim yedeğinin kopyasında tam içerik özeti `agent_runtime_events`
  (1,94 M satır) için 74 sn, `agent_runs` için 36 sn sürdü; önizleme bütçeyi aştı. Bu tabloların
  içeriği zaten silinir, ama önizlemede onaylanan içerikle silinen içeriğin aynı olduğu garantisi
  korunmalı (Astra, PR #223): önizlemeden sonra biri bir entry metnini değiştirip bağlantısını
  kapatırsa, satır sayısı aynı kalsa bile plan bayatlamalı. PostgreSQL'de her INSERT/UPDATE yeni
  bir satır sürümü (yeni `ctid` ve `xmin`) yaratır; sürüm kimliklerinin sırasız toplamı içerik
  okumadan olağan INSERT/UPDATE/DELETE'i yakalar (74 sn → 2,4 sn). SINIRLAR (Astra, PR #223 2.
  tur): satır sürümünü değiştirmeyen DDL (ör. enum etiketi adı) şema özetine eklendi; toplam
  çakışması ve 32 bit `xmin`'in yeniden kullanılması kuramsal olarak kaçırabilir — önizleme ile
  uygulama aynı bakım penceresinde, dakikalar arayla koşar. Korunan tablolar tam içerik özetiyle
  kalır — "korunan veri değişmedi" kanıtı ondan gelir.
*/
async function rowVersionFingerprint(tx: Tx, table: string): Promise<Fingerprint> {
  const [result] = await tx.$queryRaw<{ rows: number; versions: string }[]>(
    Prisma.sql`SELECT count(*)::int AS rows,
      coalesce(sum(hashtextextended(t.ctid::text || ':' || t.xmin::text, 0)), 0)::text AS versions
      FROM ${tableSql(table)} t`,
  );
  if (!result) throw new Error("GREAT_RESET_FINGERPRINT_FAILED");
  return {
    rows: result.rows,
    sha256: createHash("sha256")
      .update(`row-versions:${result.rows}:${result.versions}`)
      .digest("hex"),
  };
}

async function fingerprint(
  tx: Tx,
  table: string,
  auditId?: string,
  archiveId?: string,
): Promise<Fingerprint> {
  // Satırlar/credential içerikleri istemciye veya log'a taşınmaz; özet DB'de hesaplanır.
  const projection =
    table === "idempotency_records"
      ? Prisma.sql`to_jsonb(t) - 'expiresAt'`
      : Prisma.sql`to_jsonb(t)`;
  const filter =
    table === "audit_logs" && auditId
      ? Prisma.sql`WHERE t.id <> ${auditId}::uuid`
      : table === "outbox_reset_archives" && archiveId
        ? Prisma.sql`WHERE t.id <> ${archiveId}::uuid`
        : table === "outbox_reset_archive_events" && archiveId
          ? Prisma.sql`WHERE t."archiveId" <> ${archiveId}::uuid`
          : Prisma.empty;
  const [result] = await tx.$queryRaw<Fingerprint[]>(Prisma.sql`
    WITH row_hashes AS MATERIALIZED (
      SELECT encode(sha256(convert_to((${projection})::text, 'UTF8')), 'hex') AS row_hash
      FROM ${tableSql(table)} t ${filter}
    )
    SELECT count(*)::int AS rows,
      encode(sha256(convert_to(coalesce(string_agg(row_hash,
        E'\n' ORDER BY row_hash COLLATE "C"), ''), 'UTF8')), 'hex') AS sha256
    FROM row_hashes
  `);
  if (!result) throw new Error("GREAT_RESET_FINGERPRINT_FAILED");
  return result;
}

async function snapshot(tx: Tx, list: Table[], auditId?: string, archiveId?: string) {
  const result: Record<string, Fingerprint> = {};
  for (const { table, cleared } of list)
    result[table] = cleared
      ? await rowVersionFingerprint(tx, table)
      : await fingerprint(tx, table, auditId, archiveId);
  // expiresAt ayrıca plan hash'ine girer; koruma karşılaştırmasında tek istisnadır.
  const expiry = await tx.$queryRaw<{ sha256: string }[]>`
    SELECT encode(sha256(convert_to(coalesce(string_agg(id::text || ':' ||
      "expiresAt"::text, ',' ORDER BY id), ''), 'UTF8')), 'hex') AS sha256
    FROM public.idempotency_records`;
  // Sequence'in yalnız son değeri değil tanımı ve GERÇEK durumu da (Astra, PR #223 3.-4. tur):
  // `ALTER SEQUENCE … INCREMENT BY -1`, `RESTART WITH` (kullanılmadan önce `pg_sequences` NULL
  // döndürür) ya da `SET UNLOGGED` son görünen değeri değiştirmeden sonraki kimliği veya çöküş
  // sonrası davranışı değiştirir; reset sonrası eski public ID'lerin yeniden kullanılmasına yol
  // açardı (410 kararının şartı).
  const definitions = await tx.$queryRaw<{ name: string; value: string }[]>`
    SELECT s.sequencename AS name, jsonb_build_object(
      'dataType', s.data_type::text,
      'start', s.start_value::text, 'min', s.min_value::text, 'max', s.max_value::text,
      'increment', s.increment_by::text, 'cycle', s.cycle, 'cache', s.cache_size::text,
      'persistence', c.relpersistence::text,
      'ownedBy', (SELECT d.refobjid::regclass::text || '.' || a.attname
        FROM pg_depend d
        JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
        WHERE d.objid = c.oid AND d.classid = 'pg_class'::regclass AND d.deptype IN ('a', 'i')
        LIMIT 1)
    )::text AS value
    FROM pg_sequences s
    JOIN pg_class c ON c.relname = s.sequencename AND c.relnamespace = 'public'::regnamespace
    WHERE s.schemaname = 'public' ORDER BY s.sequencename`;
  const sequences: { name: string; value: string }[] = [];
  for (const definition of definitions) {
    if (!/^[a-z_]+$/u.test(definition.name)) throw new Error("GREAT_RESET_INVALID_TABLE");
    const [state] = await tx.$queryRaw<{ lastValue: string; isCalled: boolean }[]>(
      Prisma.sql`SELECT last_value::text AS "lastValue", is_called AS "isCalled"
        FROM ${Prisma.raw(`"public"."${definition.name}"`)}`,
    );
    if (!state) throw new Error("GREAT_RESET_FINGERPRINT_FAILED");
    sequences.push({
      name: definition.name,
      value: JSON.stringify({ definition: definition.value, ...state }),
    });
  }
  return { tables: result, expiry, sequences };
}

async function identity(tx: Tx, databaseName: string, expected: LocalResetIdentity) {
  const [actual] = await tx.$queryRaw<
    {
      database: string;
      oid: string;
      owner: string;
      user: string;
      host: string;
      port: number;
      version: number;
      cluster: string;
      marker: string | null;
    }[]
  >`
    SELECT current_database() AS database, d.oid::text AS oid,
      pg_get_userbyid(d.datdba) AS owner, current_user AS user,
      host(inet_server_addr()) AS host, inet_server_port() AS port,
      current_setting('server_version_num')::int AS version,
      (SELECT system_identifier::text FROM pg_control_system()) AS cluster,
      shobj_description(d.oid, 'pg_database') AS marker
    FROM pg_database d WHERE datname = current_database()`;
  if (
    !actual ||
    actual.database !== databaseName ||
    actual.host !== "127.0.0.1" ||
    actual.port !== 5432 ||
    actual.version < 160000 ||
    actual.version >= 170000 ||
    actual.owner !== expected.owner ||
    actual.user !== expected.owner ||
    actual.cluster !== expected.clusterId ||
    actual.marker !== expected.marker
  ) {
    throw new Error("GREAT_RESET_DATABASE_IDENTITY_MISMATCH");
  }
  return actual;
}

/*
  Namespace modunda eski/yeni public ID kısıtları şema özetinin dışında tutulur: reset onları
  bilerek değiştirir ve `namespacePostconditionsHold` birebir tanımlarını ayrıca doğrular.
*/
async function inspectSchema(
  tx: Tx,
  list: Table[],
  excludedConstraints: readonly { table: string; name: string }[] = [],
) {
  const excludedTables = excludedConstraints.map((row) => row.table);
  const excludedNames = excludedConstraints.map((row) => row.name);
  const actual = await tx.$queryRaw<{ name: string; kind: string }[]>`
    SELECT c.relname AS name, c.relkind::text AS kind FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p','f','m','v') ORDER BY c.relname COLLATE "C"`;
  const expected = [...list.map(({ table }) => table), "_prisma_migrations"].sort();
  if (
    JSON.stringify(actual.map((row) => row.name)) !== JSON.stringify(expected) ||
    actual.some((row) => row.kind !== "r")
  )
    throw new Error("GREAT_RESET_DATABASE_SCHEMA_MISMATCH");
  const inheritance = await tx.$queryRaw<{ count: number }[]>`
    SELECT count(*)::int AS count FROM pg_inherits
    WHERE inhparent IN (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace)
       OR inhrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace)`;
  if (inheritance[0]?.count !== 0) throw new Error("GREAT_RESET_INHERITANCE_FORBIDDEN");
  // Veritabanında eklenmiş FK/trigger/kolon değişimi de önizlemeyi eskitsin.
  const structure = await tx.$queryRaw<{ description: string }[]>`
    SELECT jsonb_build_object(
      'columns', (SELECT jsonb_agg(to_jsonb(c) ORDER BY table_name, ordinal_position)
        FROM information_schema.columns c WHERE table_schema = 'public'),
      'constraints', (SELECT jsonb_agg(pg_get_constraintdef(oid) ORDER BY conrelid, conname)
        FROM pg_constraint k WHERE connamespace = 'public'::regnamespace
          AND NOT EXISTS (SELECT 1 FROM unnest(${excludedTables}::text[], ${excludedNames}::text[])
            AS x(t, n) WHERE k.conrelid = x.t::regclass AND k.conname = x.n)),
      'triggers', (SELECT jsonb_agg(jsonb_build_array(pg_get_triggerdef(t.oid),
        t.tgenabled, pg_get_functiondef(t.tgfoid)) ORDER BY t.tgrelid, t.tgname)
        FROM pg_trigger t WHERE NOT t.tgisinternal AND
          t.tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace)),
      -- Enum etiketleri ve sırası (Astra, PR #223 2. tur): ALTER TYPE … RENAME VALUE satır
      -- sürümünü değiştirmeden görünen içeriği değiştirir; satır sürümü özeti bunu göremez.
      'enums', (SELECT jsonb_agg(jsonb_build_array(t.typname, e.enumlabel, e.enumsortorder)
        ORDER BY t.typname, e.enumsortorder)
        FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typnamespace = 'public'::regnamespace)
    )::text AS description`;
  const migration = await fingerprint(tx, "_prisma_migrations");
  return digest({ structure, migration });
}

/**
 * `afterNamespace`: namespace açıldıktan sonra public ID sequence kapısı ve tek reset sınırı
 * bilerek değişmiştir; onların yerine `namespacePostconditionsHold` doğrular.
 */
async function blockers(tx: Tx, archiveOutbox = false, afterNamespace = false): Promise<string[]> {
  const result: string[] = [];
  const settings = await tx.agentGlobalSettings.findMany({
    select: {
      id: true,
      runtimeEnabled: true,
      schedulerEnabled: true,
      publicWriteEnabled: true,
      publishEnabled: true,
    },
  });
  if (
    settings.length !== 1 ||
    settings[0]?.id !== "global" ||
    settings.some(
      (row) =>
        row.runtimeEnabled || row.schedulerEnabled || row.publicWriteEnabled || row.publishEnabled,
    )
  ) {
    result.push("RUNTIME_NOT_PAUSED");
  }
  if (
    await tx.agentRun.count({
      where: {
        OR: [
          { runStatus: { in: ["QUEUED", "RUNNING", "CANCEL_REQUESTED"] } },
          { leaseOwner: { not: null } },
          { leaseToken: { not: null } },
          { leaseExpiresAt: { not: null } },
        ],
      },
    })
  )
    result.push("RUNS_OR_LEASES_PRESENT");
  if (
    await tx.agentRuntimeState.count({
      where: {
        OR: [
          { currentRunId: { not: null } },
          {
            runtimeStatus: {
              notIn: ["IDLE", "SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED", "TIMED_OUT"],
            },
          },
        ],
      },
    })
  )
    result.push("RUNTIME_STATE_ACTIVE");
  if (
    !archiveOutbox &&
    (await tx.outboxEvent.count({ where: { processedAt: null, resetArchive: null } }))
  )
    result.push("OUTBOX_PENDING");
  if (!(await outboxArchivesAreValid(tx))) result.push("OUTBOX_ARCHIVE_INVALID");
  /*
    Oturum denetimi (Astra, üretim profili tasarım turu, 25 Eylül 2026): yetkisiz rol başka bir
    rolün oturumunda `datname`'i görür ama `backend_type`/`state` NULL gelir (prova kümesinde
    doğrulandı); eski `backend_type = 'client backend'` filtresi bu oturumları SAYMIYORDU. Artık
    aynı veritabanındaki kendisi dışındaki HER oturum engeldir (autovacuum dahil; bitince yeniden
    denenir). `pg_stat_activity` işlem boyunca önbelleğe alınabildiği için her denetimden önce
    görüntü tazelenir; bu fonksiyon önizlemede, kilitlerden sonra ve COMMIT'ten hemen önce çağrılır.
  */
  await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_stat_clear_snapshot()) AS cleared`;
  const [connections] = await tx.$queryRaw<{ count: number }[]>`
    SELECT count(*)::int AS count FROM pg_stat_activity
    WHERE datname = current_database() AND pid <> pg_backend_pid()`;
  if (connections?.count !== 0) result.push("OTHER_DATABASE_CONNECTIONS");
  // Başlamakta olan backend pg_stat_activity'de henüz görünmez ama hedef DB nesnesinde başlangıç
  // kilidi tutar (Astra, PR #231 P1; post_auth_delay ile yerelde doğrulandı).
  const [starting] = await tx.$queryRaw<{ count: number }[]>`
    SELECT count(DISTINCT pid)::int AS count FROM pg_locks
    WHERE locktype = 'object' AND classid = 'pg_database'::regclass
      AND objid = (SELECT oid FROM pg_database WHERE datname = current_database())
      AND pid <> pg_backend_pid()`;
  if (starting?.count !== 0) result.push("STARTING_DATABASE_CONNECTIONS");
  const [prepared] = await tx.$queryRaw<{ count: number }[]>`
    SELECT count(*)::int AS count FROM pg_prepared_xacts WHERE database = current_database()`;
  if (prepared?.count !== 0) result.push("PREPARED_TRANSACTIONS_PRESENT");
  // Trigger'lar kapalıyken ya da replika rolündeyken korunan-veri kuralları sessizce atlanır.
  const [session] = await tx.$queryRaw<{ role: string; disabledTriggers: number }[]>`
    SELECT current_setting('session_replication_role') AS role,
      (SELECT count(*)::int FROM pg_trigger t WHERE t.tgenabled <> 'O'
        AND t.tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace))
        AS "disabledTriggers"`;
  if (session?.role !== "origin" || session.disabledTriggers !== 0)
    result.push("TRIGGER_STATE_UNSAFE");
  if (afterNamespace) return result;
  if ((await unsafePublicIdSequences(tx)).length) result.push("PUBLIC_ID_SEQUENCE_UNSAFE");
  /*
    Tek reset sınırı (üretim tasarımı v18 madde 5): commit işareti, trafik açılış olayı ya da
    üretim restore audit'i varsa ikinci reset bu tasarımla yapılamaz. RESTART WITH 2147483648
    yalnız ilk reset içindir; ikinci reset ayrı namespace tasarımı ve Gökhan kararı ister.
  */
  const commits = await tx.greatResetCommit.count();
  const exposures = await tx.greatResetExposureEvent.count();
  const restores = await tx.auditLog.count({
    where: { action: GREAT_RESET_PRODUCTION_RESTORE_ACTION },
  });
  if (commits !== 0 || exposures !== 0 || restores !== 0) result.push("RESET_ALREADY_COMMITTED");
  return result;
}

/*
  Güvenli başlangıç (Astra, üretim profili tasarım 2. tur): önizleme–uygulama eşitliği, sequence
  BAŞTAN (yedekten ve önizlemeden önce) bozulmuşsa hiçbir şey söylemez. Mevcut satırların
  adreslerinin yeniden kullanılmaması için public ID sequence'leri
  +1 artışlı, döngüsüz, kalıcı, önbelleksiz, doğru sütuna bağlı olmalı ve SONRAKİ değer mevcut
  en büyük kimliğin üstünde ve eski aralığın sınırının altında kalmalı (en az bir sonraki
  atamaya daha yer bırakmalı). `nextval()` çağrılmaz; sonraki değer tanım ve durumdan hesaplanır.

  Üst namespace kilidi (üretim tasarımı v18 madde 3, 26 Eylül 2026): sütun ve sequence BIGINT,
  sequence `MAXVALUE = 2147483647` ve tabloda doğrulanmış `CHECK ("publicId" <= 2147483647)`
  olmalı; mevcut en büyük kimlik de bu sınırı aşmamalı. Eski `INTEGER` durumu (migration
  uygulanmamış kopya) fail-closed reddedilir. Üst aralığı açan RESTART ve kısıt değişimi yerel
  çekirdekte yoktur; üretim reset profiline aittir.
*/
const legacyPublicIdMax = 2147483647;
const publicIdSequences = [
  {
    sequence: "entries_public_id_seq",
    table: "entries",
    column: "publicId",
    check: "entries_public_id_legacy_range_check",
  },
  {
    sequence: "topics_public_id_seq",
    table: "topics",
    column: "publicId",
    check: "topics_public_id_legacy_range_check",
  },
] as const;

async function unsafePublicIdSequences(tx: Tx): Promise<string[]> {
  const unsafe: string[] = [];
  for (const { sequence, table, column, check } of publicIdSequences) {
    const [row] = await tx.$queryRaw<{ safe: boolean }[]>(Prisma.sql`
      SELECT (
        s.data_type = 'bigint'::regtype AND s.max_value = ${legacyPublicIdMax}
        AND s.increment_by = 1
        AND s.cache_size = 1 AND NOT s.cycle AND c.relpersistence = 'p'
        AND pg_get_serial_sequence(${`public.${table}`}, ${column}) = ${`public.${sequence}`}
        AND (SELECT pg_get_expr(ad.adbin, ad.adrelid)
             FROM pg_attrdef ad
             JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
             WHERE ad.adrelid = ${`public.${table}`}::regclass AND a.attname = ${column})
          = format('nextval(%L::regclass)', (${`public.${sequence}`}::regclass)::text)
        AND (CASE WHEN q.is_called THEN q.last_value::numeric + s.increment_by
                  ELSE q.last_value::numeric END) < s.max_value
        AND (CASE WHEN q.is_called THEN q.last_value::numeric + s.increment_by
                  ELSE q.last_value::numeric END)
          > coalesce((SELECT max(${Prisma.raw(`"${column}"`)}) FROM ${Prisma.raw(`public."${table}"`)}), 0)
        AND coalesce((SELECT max(${Prisma.raw(`"${column}"`)}) FROM ${Prisma.raw(`public."${table}"`)}), 0)
          <= ${legacyPublicIdMax}
        AND (SELECT a.atttypid FROM pg_attribute a
             WHERE a.attrelid = ${`public.${table}`}::regclass AND a.attname = ${column})
          = 'bigint'::regtype
        AND EXISTS (
          SELECT 1 FROM pg_constraint k
          WHERE k.conrelid = ${`public.${table}`}::regclass AND k.conname = ${check}
            AND k.contype = 'c' AND k.convalidated
            AND pg_get_constraintdef(k.oid) = ${`CHECK (("${column}" <= ${legacyPublicIdMax}))`})
      ) AS safe
      FROM pg_sequences s
      JOIN pg_class c ON c.relname = s.sequencename
        AND c.relnamespace = 'public'::regnamespace
      CROSS JOIN ${Prisma.raw(`public."${sequence}"`)} q
      WHERE s.schemaname = 'public' AND s.sequencename = ${sequence}`);
    if (!row?.safe) unsafe.push(sequence);
  }
  return unsafe;
}

/**
 * Önizlemede yetki önkontrolü: eksik yetki pahalı arşiv aşamasında değil, baştan görünsün
 * (Astra, tasarım turu P2). Süper kullanıcı olmayan üretim rolü için anlamlı.
 */
async function privilegeBlockers(tx: Tx, list: Table[]): Promise<string[]> {
  const cleared = list.filter((row) => row.cleared).map((row) => row.table);
  const all = [...list.map((row) => row.table), "_prisma_migrations"];
  const [privileges] = await tx.$queryRaw<
    {
      truncate: boolean;
      readAll: boolean;
      lockAll: boolean;
      writes: boolean;
      temp: boolean;
      control: boolean;
      sequences: boolean;
    }[]
  >`
    SELECT
      bool_and(has_table_privilege(format('public.%I', t), 'TRUNCATE'))
        FILTER (WHERE t = ANY(${cleared})) AS truncate,
      bool_and(has_table_privilege(format('public.%I', t), 'SELECT')) AS "readAll",
      -- ACCESS EXCLUSIVE kilidi UPDATE, DELETE ya da TRUNCATE yetkisi ister (Astra, tasarım 2. tur).
      bool_and(has_table_privilege(format('public.%I', t), 'UPDATE,DELETE,TRUNCATE')) AS "lockAll",
      -- Uygulamanın gerçek yazmaları: outbox güncellemesi, arşiv/audit eklemeleri, idempotency.
      (has_table_privilege('public.outbox_events', 'UPDATE')
        AND has_table_privilege('public.outbox_reset_archives', 'INSERT')
        AND has_table_privilege('public.outbox_reset_archive_events', 'INSERT')
        AND has_table_privilege('public.audit_logs', 'INSERT')
        AND has_table_privilege('public.idempotency_records', 'UPDATE')) AS writes,
      has_database_privilege(current_database(), 'TEMP') AS temp,
      has_function_privilege('pg_control_system()', 'EXECUTE') AS control,
      (SELECT coalesce(bool_and(has_sequence_privilege(format('public.%I', sequencename), 'SELECT')), true)
        FROM pg_sequences WHERE schemaname = 'public') AS sequences
    FROM unnest(${all}::text[]) AS t`;
  const result: string[] = [];
  if (
    !privileges ||
    !privileges.truncate ||
    !privileges.readAll ||
    !privileges.lockAll ||
    !privileges.writes ||
    !privileges.temp ||
    !privileges.control ||
    !privileges.sequences
  )
    result.push("INSUFFICIENT_PRIVILEGES");
  return result;
}

/*
  Niyet tablosunun tek izinli farkı bu işlem kimliğinin `consumedAt` alanıdır. Özet o alan
  çıkarılarak alınır; tüketilmiş satır sayısının tam bir artması ayrıca doğrulanır.
*/
async function intentsWithoutConsumption(tx: Tx) {
  const [result] = await tx.$queryRaw<{ rows: number; consumed: number; sha256: string }[]>`
    SELECT count(*)::int AS rows, count(*) FILTER (WHERE "consumedAt" IS NOT NULL)::int AS consumed,
      encode(sha256(convert_to(coalesce(string_agg((to_jsonb(t) - 'consumedAt')::text,
        E'\n' ORDER BY "operationId"), ''), 'UTF8')), 'hex') AS sha256
    FROM public.great_reset_intents t`;
  if (!result) throw new Error("GREAT_RESET_FINGERPRINT_FAILED");
  return result;
}

const namespaceRecordTables = new Set([
  "great_reset_intents",
  "great_reset_commits",
  "great_reset_tombstones",
]);

/** Üretim aracı değildir. Hedef kapısı bu repository girişinde de zorunludur. */
export async function runLocalGreatReset(value: string | undefined, request: Request) {
  const target = localResetTarget(value, hostname());
  if (
    request.mode === "EXECUTE" &&
    (request.databaseName !== target.databaseName || !/^[a-f0-9]{64}$/u.test(request.planSha256))
  )
    throw new Error("GREAT_RESET_CONFIRMATION_MISMATCH");
  const namespace = request.namespace;
  if (namespace) assertNamespaceInput(namespace);
  const excludedConstraints = namespace ? namespaceConstraintPairs : [];
  const list = tables();
  const archiveOutbox = request.archiveOutbox === true;
  const outboxPolicy = archiveOutbox
    ? "ARCHIVE_PENDING_KEEP_ROWS"
    : "REQUIRE_NO_UNARCHIVED_PENDING_KEEP_ROWS";
  const implementationSha256 = implementationDigest();
  const database = new PrismaClient({ datasourceUrl: target.databaseUrl, log: [] });
  // Kontrol bağlantısı aynı doğrulanmış host/port/kullanıcıyla, yalnız yol `postgres` yapılarak
  // kodda türetilir; operatör ayrı URL vermez (tasarım v19, Sabit üretim kimliği).
  const control = request.connectionGate
    ? new PrismaClient({ datasourceUrl: controlDatabaseUrl(target.databaseUrl), log: [] })
    : null;
  let gateClosed = false;
  let runnerLocked = false;
  let pendingError: unknown = undefined;
  let outcome: "COMMITTED" | "FAILED" = "FAILED";
  try {
    if (control && request.mode === "EXECUTE") {
      // Tek yürütücü: kilit hedef transaction'dan ÖNCE alınır; alınamazsa kapıya dokunulmaz.
      await acquireRunnerLock(control, target.databaseName);
      runnerLocked = true;
    }
    const result = await database.$transaction(
      async (tx) => {
        if (request.mode === "DRY_RUN") await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        // Bütçe gerçek boyutlu provadan (25 Eylül, operatör sunucusu, üretim yedeği kopyası):
        // önizleme ~23 sn; uygulamada en uzun tek sorgu 234.962 olaylık outbox arşiv INSERT'i,
        // bir koşuda 60 sn'yi aştı (eşzamanlı checkpoint). Bakım penceresinde uygulama ve worker
        // kapalıdır; sınır sorguyu değil kaçak durumu yakalamak içindir.
        await tx.$executeRaw`SET LOCAL statement_timeout = '300s'`;
        await tx.$executeRaw`SET LOCAL lock_timeout = '1s'`;
        // İstemci işlem içinde takılırsa sunucu kilitleri kendisi bırakır (Astra, tasarım 2. tur).
        await tx.$executeRaw`SET LOCAL idle_in_transaction_session_timeout = '60s'`;
        await tx.$executeRaw`SET LOCAL timezone = 'UTC'`;
        await tx.$executeRaw`SET LOCAL extra_float_digits = 3`;
        // RLS satır saklıyorsa önkoşul/özet yanlış güven vermek yerine hata ile durur.
        await tx.$executeRaw`SET LOCAL row_security = off`;
        const actual = await identity(tx, target.databaseName, target.identity);
        if ((await privilegeBlockers(tx, list)).length)
          throw new Error("GREAT_RESET_INSUFFICIENT_PRIVILEGES");
        if (request.mode === "EXECUTE" && control) {
          // Kilitlerden ÖNCE: yeni bağlantı girişi kapanır, yalnız bu backend kalır.
          const [backend] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
          if (!backend) throw new Error("GREAT_RESET_GATE_PINNED_BACKEND_MISSING");
          gateClosed = true;
          await closeConnectionGate(control, target.databaseName, backend.pid);
        }
        if (request.mode === "EXECUTE") {
          // Önce tüm tablo yazıcılarını dışla. Bekleyen işlem varsa bekleme/öldürme yok.
          await tx.$executeRaw(
            Prisma.sql`LOCK TABLE ${Prisma.join(
              [...list.map(({ table }) => table), "_prisma_migrations"].sort().map(tableSql),
            )} IN ACCESS EXCLUSIVE MODE NOWAIT`,
          );
        }
        const schemaSha256 = await inspectSchema(tx, list, excludedConstraints);
        const before = await snapshot(tx, list);
        const pendingOutbox = await pendingOutboxSnapshot(tx);
        const archivesBefore = await outboxArchiveSummary(tx);
        const blockedBy = [
          ...(await blockers(tx, archiveOutbox)),
          ...(namespace ? await namespaceBlockers(tx, namespace) : []),
          ...(control && request.mode === "DRY_RUN"
            ? await connectionGatePreflight(control, target.databaseName)
            : []),
        ];
        const planSha256 = digest({
          version: namespace ? 3 : 2,
          ...(namespace ? { namespace } : {}),
          ...(control ? { connectionGate: true } : {}),
          outboxPolicy,
          pendingOutbox,
          ...archivesBefore,
          implementationSha256,
          actual,
          schemaSha256,
          before,
          blockedBy,
          cleared: greatResetClearedModels,
          preserved: greatResetPreservedModels,
        });
        const report = {
          mode: request.mode,
          database: actual.database,
          planSha256,
          implementationSha256,
          blockedBy,
          cleared: list
            .filter((row) => row.cleared)
            .map((row) => ({
              model: row.model,
              table: row.table,
              rows: before.tables[row.table]!.rows,
            })),
          preserved: list
            .filter((row) => !row.cleared)
            .map((row) => ({
              model: row.model,
              table: row.table,
              rows: before.tables[row.table]!.rows,
            })),
          idempotencyPolicy: "EXPIRE_ALL_KEEP_ROWS",
          outboxPolicy,
          pendingOutbox,
          ...archivesBefore,
          ...(namespace
            ? {
                namespacePolicy: "TOMBSTONE_THEN_RESTART_2147483648",
                operationId: namespace.operationId,
              }
            : {}),
        };
        if (request.mode === "DRY_RUN") return report;
        if (blockedBy.length) throw new Error("GREAT_RESET_PRECONDITIONS_FAILED");
        if (planSha256 !== request.planSha256) throw new Error("GREAT_RESET_STALE_PLAN");

        const resetId = namespace?.operationId ?? randomUUID();
        const intentsBefore = namespace ? await intentsWithoutConsumption(tx) : null;
        if (namespace) await consumeIntent(tx, namespace);
        const outboxArchiveId = archiveOutbox
          ? await archivePendingOutboxEvents(tx, resetId, planSha256, pendingOutbox)
          : null;

        // Mezar taşı kopyası silmeden ÖNCE, aynı transaction'da (tasarım v19 madde 4).
        const tombstones = namespace ? await copyTombstones(tx, namespace.operationId) : null;
        // Ayrıcalıklı yerel operasyon: DELETE trigger'ları çalışmaz. Tanımları değişmez.
        // Tek komutta FK kapanışı zorunlu; bilinmeyen bağımlılık varsa RESTRICT reddeder.
        await tx.$executeRaw(
          Prisma.sql`TRUNCATE TABLE ${Prisma.join(
            list.filter((row) => row.cleared).map(({ table }) => tableSql(table)),
          )} CONTINUE IDENTITY RESTRICT`,
        );
        if (namespace && tombstones) {
          await openNewNamespace(tx);
          await insertCommitMarker(tx, { ...namespace, planSha256, ...tombstones });
        }
        const expired = await tx.idempotencyRecord.updateMany({ data: { expiresAt: new Date(0) } });
        const audit = await tx.auditLog.create({
          data: {
            action: "GREAT_RESET_LOCAL_EXECUTED",
            entityType: "LOCAL_SYNTHETIC_DATABASE",
            entityId: resetId,
            requestId: resetId,
            metadata: {
              planSha256,
              cleared: report.cleared,
              expiredIdempotencyRows: expired.count,
              outboxPolicy,
              outboxArchiveId,
              archivedOutboxRows: outboxArchiveId ? pendingOutbox.rows : 0,
              archivesBefore,
              policy: "TRUNCATE_ONLY_CONTINUE_IDENTITY_RESTRICT",
              scope: "LOCAL_SYNTHETIC_ONLY",
              ...(namespace && tombstones
                ? {
                    operationId: namespace.operationId,
                    releaseSha: namespace.releaseSha,
                    topicTombstones: tombstones.topics,
                    entryTombstones: tombstones.entries,
                    namespacePolicy: "TOMBSTONE_THEN_RESTART_2147483648",
                  }
                : {}),
            },
          },
        });
        const after = await snapshot(tx, list, audit.id, outboxArchiveId ?? undefined);
        if (outboxArchiveId)
          await assertExpectedOutboxArchive(tx, outboxArchiveId, planSha256, pendingOutbox);
        for (const { table, cleared } of list) {
          // Reset kayıtları izinli farktır; aşağıda ayrıca ve birebir doğrulanır.
          if (namespace && namespaceRecordTables.has(table)) continue;
          if (
            cleared
              ? after.tables[table]?.rows !== 0
              : digest(before.tables[table]) !== digest(after.tables[table])
          ) {
            throw new Error("GREAT_RESET_POSTCONDITION_FAILED");
          }
        }
        /*
          İki public ID sequence'inde yalnız `max` ile `lastValue`/`isCalled` değişebilir; sahiplik,
          başlangıç, alt sınır, artış, önbellek, döngü ve kalıcılık birebir korunur (Astra, PR #230
          P2). Beklenen yeni değerleri `namespacePostconditionsHold` ayrıca doğrular.
        */
        const unchangedSequences = (value: typeof before.sequences) =>
          value.map(({ name, value: state }) => {
            if (!namespace || !namespaceSequenceNames.includes(name)) return { name, value: state };
            const parsed = JSON.parse(state) as { definition: string };
            const definition = JSON.parse(parsed.definition) as Record<string, unknown>;
            delete definition.max;
            return { name, value: JSON.stringify(definition) };
          });
        if (
          digest(unchangedSequences(before.sequences)) !==
            digest(unchangedSequences(after.sequences)) ||
          (await inspectSchema(tx, list, excludedConstraints)) !== schemaSha256 ||
          (await tx.idempotencyRecord.count({ where: { expiresAt: { not: new Date(0) } } })) ||
          (await blockers(tx, false, Boolean(namespace))).length
        )
          throw new Error("GREAT_RESET_POSTCONDITION_FAILED");
        if (namespace && tombstones && intentsBefore) {
          const intentsAfter = await intentsWithoutConsumption(tx);
          if (
            intentsAfter.rows !== intentsBefore.rows ||
            intentsAfter.sha256 !== intentsBefore.sha256 ||
            intentsAfter.consumed !== intentsBefore.consumed + 1 ||
            !(await namespacePostconditionsHold(tx, { ...namespace, planSha256, ...tombstones }))
          )
            throw new Error("GREAT_RESET_POSTCONDITION_FAILED");
        }
        return {
          ...report,
          resetId,
          outboxArchiveId,
          archivedOutboxRows: outboxArchiveId ? pendingOutbox.rows : 0,
          ...(await outboxArchiveSummary(tx)),
          expiredIdempotencyRows: expired.count,
          ...(tombstones
            ? { topicTombstones: tombstones.topics, entryTombstones: tombstones.entries }
            : {}),
          verified: true,
        };
      },
      {
        // Execute tüm tablo kilitlerinden SONRA güncel veriyi okumalı.
        // Daha erken alınmış MVCC snapshot'ı TRUNCATE ile güvenli değildir.
        isolationLevel: request.mode === "DRY_RUN" ? "RepeatableRead" : "ReadCommitted",
        timeout: 900_000,
        maxWait: 5_000,
      },
    );
    outcome = "COMMITTED";
    return result;
  } catch (error) {
    pendingError = error;
    // Yalnız sabit güvenli neden kodları; SQL, hata mesajı veya satır içeriği çıkmaz.
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2010" && error.meta?.code === "42501")
        throw new Error("GREAT_RESET_INSUFFICIENT_PRIVILEGES");
      if (error.code === "P2010" && error.meta?.code === "55P03")
        throw new Error("GREAT_RESET_LOCK_NOT_AVAILABLE");
      if (error.code === "P2010" && error.meta?.code === "57014")
        throw new Error("GREAT_RESET_QUERY_CANCELLED");
      if (error.code === "P2028") throw new Error("GREAT_RESET_TRANSACTION_FAILED");
    }
    throw error;
  } finally {
    /*
      Temizlik adımları birbirini engellemez (Astra, PR #231 P2): hedef bağlantısı kapanamasa da
      kapı açılmaya çalışılır; kilit ve kontrol bağlantısı ayrı ayrı bırakılır. Açılış düşerse
      commit durumunu ayıran güvenli kod fırlatılır, ilk hata `cause` olarak korunur.
    */
    await database.$disconnect().catch(() => undefined);
    let gateError: string | null = null;
    if (control) {
      if (gateClosed) {
        try {
          await openConnectionGate(control, target.databaseName);
        } catch {
          gateError =
            outcome === "COMMITTED"
              ? "GREAT_RESET_COMMITTED_GATE_NOT_REOPENED"
              : "GREAT_RESET_FAILED_GATE_NOT_REOPENED";
        }
      }
      if (runnerLocked)
        await releaseRunnerLock(control, target.databaseName).catch(() => undefined);
      await control.$disconnect().catch(() => undefined);
    }
    if (gateError) throw new Error(gateError, { cause: pendingError });
  }
}

/** Hedef URL'den yalnız veritabanı yolu `postgres` yapılarak kontrol URL'si türetilir. */
function controlDatabaseUrl(targetUrl: string): string {
  const url = new URL(targetUrl);
  url.pathname = "/postgres";
  return url.toString();
}

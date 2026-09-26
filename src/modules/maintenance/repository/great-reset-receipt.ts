import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

/*
  Tam içerik makbuzu (üretim tasarımı v19, Aşama 2). Yedeğin (dump) ve geri yüklemenin
  kaynağın aynısı olduğunu kanıtlamak için kullanılır; kısa plan özeti (`ctid`/`xmin`) bunun
  yerine geçmez. Tek RepeatableRead, salt okunur görüntüde; sabit oturum ayarlarıyla (`UTF8`,
  `TimeZone UTC`, `DateStyle ISO, YMD`, `IntervalStyle postgres`, `extra_float_digits 3`,
  `bytea_output hex`, `search_path public`) ve `COLLATE "C"` sıralamasıyla hesaplanır.

  Satırlar kayıpsız kayıt metniyle (`t::text`) özetlenir (Astra, PR #234 P1): `to_jsonb`
  SQL NULL ile JSON `null`'ı ve dizi alt indislerini aynı metne indiriyordu.

  Bölümler:
    content   — public şemadaki HER tablonun satır sayısı ve tam SHA-256'sı (katalogdan)
    sequences — tanım, sahip sütun, `last_value`/`is_called`
    schema    — kolon (tam tip, varsayılan, identity/generated), kısıt, indeks, tetikleyici
                (+fonksiyon), public fonksiyon, kural, view, enum, tablo kalıcılığı/seçenekleri,
                extension listesi
    security  — nesne ve sütun sahipleri/ACL'leri, RLS bayrakları ve politikaları, şema, varsayılan
                yetkiler, DB ACL/sahibi, roller (nitelik, parola hariç), üyelikler
    database  — encoding/locale, bağlantı limiti, yorum, DB ve rol ayarları, extension sahipleri
  `security`, `database` ve `sequences` anahtar–değer ayrıntısı taşır: ortam başına beklenen
  farklar DEĞER düzeyinde (anahtar, beklenen, gerçek) yazılır (P2). DB adı ve kapıya bağlı
  `datallowconn` bilerek dışarıdadır. Desteklenmeyen nesne (başka şemada ilişki, large object,
  materialized/foreign table, kalıtım/partition) varsa makbuz hata verir, sessizce atlamaz (P2).
  Satır içeriği, credential ya da SQL çıktıya taşınmaz.
*/

type Tx = Prisma.TransactionClient;

export type TableDigest = { rows: number; sha256: string };
export type ReceiptSection = "content" | "sequences" | "schema" | "security" | "database";
export type DetailedSection = "sequences" | "security" | "database";

export type GreatResetReceipt = {
  version: 2;
  sha256: string;
  sections: Record<ReceiptSection, string>;
  tables: Record<string, TableDigest>;
  details: Record<DetailedSection, Record<string, string>>;
};

/** Ortam başına önceden yazılmış, değer düzeyinde beklenen fark. */
export type ExpectedDifference = {
  section: DetailedSection;
  key: string;
  expected: string | null;
  actual: string | null;
};

export type ReceiptIdentity = {
  clusterId: string;
  owner: string;
  /** Yerel sentetik prova DB'sinin yorum işareti; üretimde verilmez. */
  marker?: string;
};

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function tableIdentifier(table: string): Prisma.Sql {
  if (!/^[a-z_][a-z0-9_]*$/u.test(table)) throw new Error("GREAT_RESET_INVALID_TABLE");
  return Prisma.raw(`ONLY "public"."${table}"`);
}

/** Anahtar adları sorgudan gelir; `__proto__` gibi adlar prototipi değiştirmemeli (P2). */
function dictionary<T>(entries: [string, T][]): Record<string, T> {
  return Object.fromEntries(entries) as Record<string, T>;
}

async function assertIdentity(tx: Tx, expected: ReceiptIdentity) {
  const [actual] = await tx.$queryRaw<
    { owner: string; user: string; version: number; cluster: string; marker: string | null }[]
  >`
    SELECT pg_get_userbyid(d.datdba) AS owner, current_user AS user,
      current_setting('server_version_num')::int AS version,
      (SELECT system_identifier::text FROM pg_control_system()) AS cluster,
      shobj_description(d.oid, 'pg_database') AS marker
    FROM pg_database d WHERE datname = current_database()`;
  if (
    !actual ||
    actual.owner !== expected.owner ||
    actual.user !== expected.owner ||
    actual.version < 160000 ||
    actual.version >= 170000 ||
    actual.cluster !== expected.clusterId ||
    (expected.marker !== undefined && actual.marker !== expected.marker)
  )
    throw new Error("GREAT_RESET_DATABASE_IDENTITY_MISMATCH");
}

/** Makbuzun kanıtlayamayacağı nesneler varsa hata; kapsam sessizce daralmaz. */
async function assertSupportedScope(tx: Tx) {
  const [scope] = await tx.$queryRaw<
    { otherRelations: number; largeObjects: number; unsupported: number; inheritance: number }[]
  >`
    SELECT
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname NOT IN ('public', 'pg_catalog', 'information_schema', 'pg_toast')
          AND n.nspname NOT LIKE 'pg_temp_%' AND n.nspname NOT LIKE 'pg_toast_temp_%'
          AND c.relkind IN ('r', 'p', 'm', 'f', 'v', 'S')) AS "otherRelations",
      (SELECT count(*)::int FROM pg_largeobject_metadata) AS "largeObjects",
      (SELECT count(*)::int FROM pg_class
        WHERE relnamespace = 'public'::regnamespace AND relkind IN ('m', 'f', 'p')) AS unsupported,
      (SELECT count(*)::int FROM pg_inherits) AS inheritance`;
  if (
    !scope ||
    scope.otherRelations !== 0 ||
    scope.largeObjects !== 0 ||
    scope.unsupported !== 0 ||
    scope.inheritance !== 0
  )
    throw new Error("GREAT_RESET_RECEIPT_SCOPE_UNSUPPORTED");
}

async function contentSection(tx: Tx) {
  const tables = await tx.$queryRaw<{ name: string }[]>`
    SELECT c.relname AS name FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
    ORDER BY c.relname COLLATE "C"`;
  const entries: [string, TableDigest][] = [];
  for (const { name } of tables) {
    const [digest] = await tx.$queryRaw<TableDigest[]>(Prisma.sql`
      WITH row_hashes AS MATERIALIZED (
        SELECT encode(sha256(convert_to(t::text, 'UTF8')), 'hex') AS row_hash
        FROM ${tableIdentifier(name)} t
      )
      SELECT count(*)::int AS rows,
        encode(sha256(convert_to(coalesce(string_agg(row_hash,
          E'\\n' ORDER BY row_hash COLLATE "C"), ''), 'UTF8')), 'hex') AS sha256
      FROM row_hashes`);
    if (!digest) throw new Error("GREAT_RESET_RECEIPT_FAILED");
    entries.push([name, digest]);
  }
  return dictionary(entries);
}

async function sequencesSection(tx: Tx) {
  const definitions = await tx.$queryRaw<{ name: string; definition: string }[]>`
    SELECT s.sequencename AS name, jsonb_build_object(
      'dataType', s.data_type::text, 'start', s.start_value::text, 'min', s.min_value::text,
      'max', s.max_value::text, 'increment', s.increment_by::text, 'cycle', s.cycle,
      'cache', s.cache_size::text, 'persistence', c.relpersistence::text,
      'ownedBy', (SELECT d.refobjid::regclass::text || '.' || a.attname
        FROM pg_depend d
        JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
        WHERE d.objid = c.oid AND d.classid = 'pg_class'::regclass AND d.deptype IN ('a', 'i')
        LIMIT 1)
    )::text AS definition
    FROM pg_sequences s
    JOIN pg_class c ON c.relname = s.sequencename AND c.relnamespace = 'public'::regnamespace
    WHERE s.schemaname = 'public' ORDER BY s.sequencename COLLATE "C"`;
  const entries: [string, string][] = [];
  for (const { name, definition } of definitions) {
    if (!/^[a-z_][a-z0-9_]*$/u.test(name)) throw new Error("GREAT_RESET_RECEIPT_FAILED");
    const [state] = await tx.$queryRaw<{ lastValue: string; isCalled: boolean }[]>(
      Prisma.sql`SELECT last_value::text AS "lastValue", is_called AS "isCalled"
        FROM ${Prisma.raw(`"public"."${name}"`)}`,
    );
    if (!state) throw new Error("GREAT_RESET_RECEIPT_FAILED");
    entries.push([name, JSON.stringify({ definition, ...state })]);
  }
  return dictionary(entries);
}

async function schemaSection(tx: Tx) {
  const [row] = await tx.$queryRaw<{ description: string }[]>`
    SELECT jsonb_build_object(
      'columns', (SELECT jsonb_agg(jsonb_build_array(c.relname, a.attname, a.attnum,
          format_type(a.atttypid, a.atttypmod), a.attnotnull, a.attidentity, a.attgenerated,
          pg_get_expr(ad.adbin, ad.adrelid), co.collname, a.attisdropped)
        ORDER BY c.relname COLLATE "C", a.attnum)
        FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
        LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
        LEFT JOIN pg_collation co ON co.oid = a.attcollation AND a.attcollation <> 0
        WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'v')
          AND a.attnum > 0 AND NOT a.attisdropped),
      'tables', (SELECT jsonb_agg(jsonb_build_array(relname, relkind, relpersistence,
          reloptions::text, relreplident) ORDER BY relname COLLATE "C")
        FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'v')),
      'constraints', (SELECT jsonb_agg(jsonb_build_array(conrelid::regclass::text, conname,
          contype, convalidated, condeferrable, condeferred, pg_get_constraintdef(oid))
        ORDER BY conrelid::regclass::text COLLATE "C", conname COLLATE "C")
        FROM pg_constraint WHERE connamespace = 'public'::regnamespace),
      'indexes', (SELECT jsonb_agg(jsonb_build_array(tablename, indexname, indexdef)
        ORDER BY tablename COLLATE "C", indexname COLLATE "C")
        FROM pg_indexes WHERE schemaname = 'public'),
      'triggers', (SELECT jsonb_agg(jsonb_build_array(t.tgrelid::regclass::text, t.tgname,
          pg_get_triggerdef(t.oid), t.tgenabled, pg_get_functiondef(t.tgfoid))
        ORDER BY t.tgrelid::regclass::text COLLATE "C", t.tgname COLLATE "C")
        FROM pg_trigger t WHERE NOT t.tgisinternal AND
          t.tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace)),
      'functions', (SELECT jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,
          CASE WHEN p.prokind IN ('f', 'p', 'w') THEN pg_get_functiondef(p.oid) END)
        ORDER BY p.oid::regprocedure::text COLLATE "C")
        FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind <> 'a'),
      'rules', (SELECT jsonb_agg(jsonb_build_array(tablename, rulename, definition)
        ORDER BY tablename COLLATE "C", rulename COLLATE "C")
        FROM pg_rules WHERE schemaname = 'public'),
      'views', (SELECT jsonb_agg(jsonb_build_array(viewname, definition)
        ORDER BY viewname COLLATE "C") FROM pg_views WHERE schemaname = 'public'),
      'enums', (SELECT jsonb_agg(jsonb_build_array(t.typname, e.enumlabel, e.enumsortorder)
        ORDER BY t.typname COLLATE "C", e.enumsortorder)
        FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typnamespace = 'public'::regnamespace),
      'extensions', (SELECT jsonb_agg(jsonb_build_array(extname, extversion,
          extnamespace::regnamespace::text) ORDER BY extname COLLATE "C") FROM pg_extension)
    )::text AS description`;
  if (!row) throw new Error("GREAT_RESET_RECEIPT_FAILED");
  return row.description;
}

async function keyValues(tx: Tx, query: Prisma.Sql) {
  const rows = await tx.$queryRaw<{ key: string; value: string | null }[]>(query);
  const entries: [string, string][] = rows.map((row) => [row.key, row.value ?? "null"]);
  if (new Set(entries.map(([key]) => key)).size !== entries.length)
    throw new Error("GREAT_RESET_RECEIPT_FAILED");
  return dictionary(entries);
}

async function securitySection(tx: Tx) {
  return keyValues(
    tx,
    Prisma.sql`
    SELECT key, value FROM (
      SELECT 'relation:' || c.relname AS key, jsonb_build_array(c.relkind,
          pg_get_userbyid(c.relowner), c.relacl::text, c.relrowsecurity, c.relforcerowsecurity)::text AS value
        FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace
      UNION ALL
      SELECT 'column:' || c.relname || '.' || a.attname, a.attacl::text
        FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
        WHERE c.relnamespace = 'public'::regnamespace AND a.attnum > 0 AND NOT a.attisdropped
          AND a.attacl IS NOT NULL
      UNION ALL
      SELECT 'policy:' || c.relname || '.' || p.polname, jsonb_build_array(p.polcmd,
          p.polpermissive, (SELECT array_agg(CASE WHEN r = 0 THEN 'public' ELSE pg_get_userbyid(r) END
            ORDER BY 1) FROM unnest(p.polroles) AS r),
          pg_get_expr(p.polqual, p.polrelid), pg_get_expr(p.polwithcheck, p.polrelid))::text
        FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
        WHERE c.relnamespace = 'public'::regnamespace
      UNION ALL
      SELECT 'namespace:public', jsonb_build_array(pg_get_userbyid(nspowner), nspacl::text)::text
        FROM pg_namespace WHERE nspname = 'public'
      UNION ALL
      SELECT 'defaultAcl:' || pg_get_userbyid(defaclrole) || ':'
          || coalesce(defaclnamespace::regnamespace::text, '*') || ':' || defaclobjtype::text,
          defaclacl::text
        FROM pg_default_acl
      UNION ALL
      SELECT 'function:' || p.oid::regprocedure::text,
          jsonb_build_array(pg_get_userbyid(p.proowner), p.proacl::text)::text
        FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
      UNION ALL
      SELECT 'type:' || t.typname, jsonb_build_array(pg_get_userbyid(t.typowner), t.typacl::text)::text
        FROM pg_type t WHERE t.typnamespace = 'public'::regnamespace AND t.typtype IN ('e', 'd', 'c')
      UNION ALL
      SELECT 'database', jsonb_build_array(pg_get_userbyid(datdba), datacl::text)::text
        FROM pg_database WHERE datname = current_database()
      UNION ALL
      -- Roller: nitelikler; parola ve geçerlilik dışında. Sistem rolleri hariç.
      SELECT 'role:' || rolname, jsonb_build_array(rolsuper, rolinherit, rolcreaterole,
          rolcreatedb, rolcanlogin, rolreplication, rolbypassrls, rolconnlimit)::text
        FROM pg_roles WHERE rolname NOT LIKE 'pg\\_%'
      UNION ALL
      SELECT 'membership:' || pg_get_userbyid(roleid) || '>' || pg_get_userbyid(member)
          || ':' || pg_get_userbyid(grantor),
          jsonb_build_array(admin_option, inherit_option, set_option)::text
        FROM pg_auth_members
    ) items ORDER BY key COLLATE "C"`,
  );
}

async function databaseSection(tx: Tx) {
  return keyValues(
    tx,
    Prisma.sql`
    SELECT key, value FROM (
      SELECT 'locale' AS key, jsonb_build_array(pg_encoding_to_char(d.encoding), d.datcollate,
          d.datctype, d.datlocprovider, d.datconnlimit)::text AS value
        FROM pg_database d WHERE d.datname = current_database()
      UNION ALL
      SELECT 'comment', shobj_description(d.oid, 'pg_database')
        FROM pg_database d WHERE d.datname = current_database()
      UNION ALL
      -- Bu DB'ye ve (setdatabase = 0) bütün DB'lere uygulanan rol ayarları.
      SELECT 'setting:' || CASE WHEN s.setdatabase = 0 THEN '*' ELSE 'db' END || ':'
          || CASE WHEN s.setrole = 0 THEN '*' ELSE pg_get_userbyid(s.setrole) END,
          (SELECT array_agg(x ORDER BY x) FROM unnest(s.setconfig) AS x)::text
        FROM pg_db_role_setting s
        WHERE s.setdatabase IN (0, (SELECT oid FROM pg_database WHERE datname = current_database()))
      UNION ALL
      SELECT 'extension:' || extname, pg_get_userbyid(extowner) FROM pg_extension
    ) items ORDER BY key COLLATE "C"`,
  );
}

/** Tam makbuz; ayrı, salt okunur RepeatableRead transaction'ında hesaplanır. */
export async function computeReceipt(
  database: PrismaClient,
  expected: ReceiptIdentity,
): Promise<GreatResetReceipt> {
  return database.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      await tx.$executeRaw`SET LOCAL statement_timeout = '900s'`;
      await tx.$executeRaw`SET LOCAL timezone = 'UTC'`;
      await tx.$executeRaw`SET LOCAL datestyle = 'ISO, YMD'`;
      await tx.$executeRaw`SET LOCAL intervalstyle = 'postgres'`;
      await tx.$executeRaw`SET LOCAL extra_float_digits = 3`;
      await tx.$executeRaw`SET LOCAL bytea_output = 'hex'`;
      await tx.$executeRaw`SET LOCAL search_path = public`;
      await tx.$executeRaw`SET LOCAL row_security = off`;
      await assertIdentity(tx, expected);
      const [encoding] = await tx.$queryRaw<{ server: string; client: string }[]>`
        SELECT current_setting('server_encoding') AS server,
          current_setting('client_encoding') AS client`;
      if (encoding?.server !== "UTF8" || encoding.client !== "UTF8")
        throw new Error("GREAT_RESET_RECEIPT_ENCODING_UNSUPPORTED");
      await assertSupportedScope(tx);
      const tables = await contentSection(tx);
      const details = {
        sequences: await sequencesSection(tx),
        security: await securitySection(tx),
        database: await databaseSection(tx),
      };
      const sections: Record<ReceiptSection, string> = {
        content: sha256(tables),
        sequences: sha256(details.sequences),
        schema: sha256(await schemaSection(tx)),
        security: sha256(details.security),
        database: sha256(details.database),
      };
      return { version: 2 as const, sha256: sha256(sections), sections, tables, details };
    },
    { isolationLevel: "RepeatableRead", timeout: 1_800_000, maxWait: 5_000 },
  );
}

/**
 * İki makbuzun farkı. `allowed` yalnız DEĞER düzeyinde, önceden yazılmış farklardır: aynı
 * bölüm, anahtar, beklenen ve gerçek değer birebir tutmalıdır. İçerik (tablo) ve şema farkına
 * hiçbir izin verilmez (Astra, PR #234 P2).
 */
export function compareReceipts(
  expected: GreatResetReceipt,
  actual: GreatResetReceipt,
  allowed: readonly ExpectedDifference[] = [],
): {
  equal: boolean;
  sections: ReceiptSection[];
  tables: string[];
  differences: ExpectedDifference[];
  unexpected: ExpectedDifference[];
} {
  const sections = (Object.keys(expected.sections) as ReceiptSection[]).filter(
    (section) => expected.sections[section] !== actual.sections[section],
  );
  const tableNames = new Set([...Object.keys(expected.tables), ...Object.keys(actual.tables)]);
  const tables = [...tableNames]
    .filter((name) => sha256(expected.tables[name] ?? null) !== sha256(actual.tables[name] ?? null))
    .sort();
  const differences: ExpectedDifference[] = [];
  for (const section of ["sequences", "security", "database"] as const) {
    const before = expected.details[section];
    const after = actual.details[section];
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of [...keys].sort())
      if (before[key] !== after[key])
        differences.push({
          section,
          key,
          expected: before[key] ?? null,
          actual: after[key] ?? null,
        });
  }
  const unexpected = differences.filter(
    (difference) =>
      !allowed.some(
        (item) =>
          item.section === difference.section &&
          item.key === difference.key &&
          item.expected === difference.expected &&
          item.actual === difference.actual,
      ),
  );
  const detailOnly = sections.every((section) =>
    ["sequences", "security", "database"].includes(section),
  );
  return {
    equal: tables.length === 0 && detailOnly && unexpected.length === 0,
    sections,
    tables,
    differences,
    unexpected,
  };
}

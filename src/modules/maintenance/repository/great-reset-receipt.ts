import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

/*
  Tam içerik makbuzu (üretim tasarımı v19, Aşama 2). Yedeğin (dump) ve geri yüklemenin
  kaynağın aynısı olduğunu kanıtlamak için kullanılır; kısa plan özeti (`ctid`/`xmin`) bunun
  yerine geçmez. Tek RepeatableRead, salt okunur görüntüde; sabit oturum ayarlarıyla
  (`UTF8`, `TimeZone UTC`, `DateStyle ISO, YMD`, `extra_float_digits 3`, `bytea_output hex`) ve
  `COLLATE "C"` sıralamasıyla hesaplanır.

  Bölümler ayrıdır; ortam başına beklenen farklar (ör. yerel provadaki `--no-owner` geri
  yüklemenin sahiplik farkı) bölüm düzeyinde açıkça ayrılabilir:
    content   — public şemadaki HER tablonun satır sayısı ve tam içerik SHA-256'sı (katalogdan)
    sequences — tanım, sahip sütun, `last_value`/`is_called`
    schema    — kolon, kısıt, indeks, tetikleyici (+fonksiyon), public fonksiyon, kural, enum,
                extension listesi
    security  — nesne sahipleri ve ACL'ler, şema sahibi/ACL'si, varsayılan yetkiler, DB ACL/sahibi
    database  — encoding/locale, bağlantı limiti, yorum, DB rol ayarları, extension sahipleri
  DB adı ve kapıya bağlı `datallowconn` bilerek dışarıdadır; ayrı kimlik/kapı koşullarıyla
  doğrulanır. Satır içeriği, credential ya da SQL istemciye veya çıktıya taşınmaz.
*/

type Tx = Prisma.TransactionClient;

export type TableDigest = { rows: number; sha256: string };

export type GreatResetReceipt = {
  version: 1;
  sha256: string;
  sections: Record<ReceiptSection, string>;
  tables: Record<string, TableDigest>;
};

export type ReceiptSection = "content" | "sequences" | "schema" | "security" | "database";

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function tableIdentifier(table: string): Prisma.Sql {
  if (!/^[a-z_][a-z0-9_]*$/u.test(table)) throw new Error("GREAT_RESET_INVALID_TABLE");
  return Prisma.raw(`ONLY "public"."${table}"`);
}

async function contentSection(tx: Tx) {
  const tables = await tx.$queryRaw<{ name: string }[]>`
    SELECT c.relname AS name FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
    ORDER BY c.relname COLLATE "C"`;
  const result: Record<string, TableDigest> = {};
  for (const { name } of tables) {
    const [digest] = await tx.$queryRaw<TableDigest[]>(Prisma.sql`
      WITH row_hashes AS MATERIALIZED (
        SELECT encode(sha256(convert_to(to_jsonb(t)::text, 'UTF8')), 'hex') AS row_hash
        FROM ${tableIdentifier(name)} t
      )
      SELECT count(*)::int AS rows,
        encode(sha256(convert_to(coalesce(string_agg(row_hash,
          E'\\n' ORDER BY row_hash COLLATE "C"), ''), 'UTF8')), 'hex') AS sha256
      FROM row_hashes`);
    if (!digest) throw new Error("GREAT_RESET_RECEIPT_FAILED");
    result[name] = digest;
  }
  return result;
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
  const result: { name: string; definition: string; lastValue: string; isCalled: boolean }[] = [];
  for (const { name, definition } of definitions) {
    const [state] = await tx.$queryRaw<{ lastValue: string; isCalled: boolean }[]>(
      Prisma.sql`SELECT last_value::text AS "lastValue", is_called AS "isCalled"
        FROM ${Prisma.raw(`"public"."${name.replaceAll('"', "")}"`)}`,
    );
    if (!state || !/^[a-z_][a-z0-9_]*$/u.test(name)) throw new Error("GREAT_RESET_RECEIPT_FAILED");
    result.push({ name, definition, ...state });
  }
  return result;
}

async function schemaSection(tx: Tx) {
  const [row] = await tx.$queryRaw<{ description: string }[]>`
    SELECT jsonb_build_object(
      'columns', (SELECT jsonb_agg(jsonb_build_array(table_name, column_name, ordinal_position,
          data_type, udt_name, is_nullable, column_default, character_maximum_length,
          numeric_precision, datetime_precision, collation_name, is_identity, is_generated,
          generation_expression)
        ORDER BY table_name COLLATE "C", ordinal_position)
        FROM information_schema.columns WHERE table_schema = 'public'),
      'constraints', (SELECT jsonb_agg(jsonb_build_array(conrelid::regclass::text, conname,
          contype, convalidated, pg_get_constraintdef(oid))
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

async function securitySection(tx: Tx) {
  const [row] = await tx.$queryRaw<{ description: string }[]>`
    SELECT jsonb_build_object(
      'relations', (SELECT jsonb_agg(jsonb_build_array(c.relname, c.relkind,
          pg_get_userbyid(c.relowner), c.relacl::text)
        ORDER BY c.relname COLLATE "C")
        FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace),
      'namespace', (SELECT jsonb_build_array(pg_get_userbyid(nspowner), nspacl::text)
        FROM pg_namespace WHERE nspname = 'public'),
      'defaultPrivileges', (SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(defaclrole),
          defaclnamespace::regnamespace::text, defaclobjtype, defaclacl::text)
        ORDER BY pg_get_userbyid(defaclrole) COLLATE "C", defaclobjtype)
        FROM pg_default_acl),
      'functions', (SELECT jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,
          pg_get_userbyid(p.proowner), p.proacl::text)
        ORDER BY p.oid::regprocedure::text COLLATE "C")
        FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace),
      'types', (SELECT jsonb_agg(jsonb_build_array(t.typname, pg_get_userbyid(t.typowner),
          t.typacl::text) ORDER BY t.typname COLLATE "C")
        FROM pg_type t WHERE t.typnamespace = 'public'::regnamespace AND t.typtype IN ('e', 'd', 'c')),
      'database', (SELECT jsonb_build_array(pg_get_userbyid(datdba), datacl::text)
        FROM pg_database WHERE datname = current_database())
    )::text AS description`;
  if (!row) throw new Error("GREAT_RESET_RECEIPT_FAILED");
  return row.description;
}

async function databaseSection(tx: Tx) {
  const [row] = await tx.$queryRaw<{ description: string }[]>`
    SELECT jsonb_build_object(
      'encoding', pg_encoding_to_char(d.encoding), 'collate', d.datcollate, 'ctype', d.datctype,
      'localeProvider', d.datlocprovider, 'connectionLimit', d.datconnlimit,
      'comment', shobj_description(d.oid, 'pg_database'),
      'roleSettings', (SELECT jsonb_agg(jsonb_build_array(
          CASE WHEN setrole = 0 THEN NULL ELSE pg_get_userbyid(setrole) END, setconfig)
          ORDER BY setrole) FROM pg_db_role_setting WHERE setdatabase = d.oid),
      'extensionOwners', (SELECT jsonb_agg(jsonb_build_array(extname, pg_get_userbyid(extowner))
        ORDER BY extname COLLATE "C") FROM pg_extension)
    )::text AS description
    FROM pg_database d WHERE d.datname = current_database()`;
  if (!row) throw new Error("GREAT_RESET_RECEIPT_FAILED");
  return row.description;
}

/** Tam makbuz; ayrı, salt okunur RepeatableRead transaction'ında hesaplanır. */
export async function computeReceipt(database: PrismaClient): Promise<GreatResetReceipt> {
  return database.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      await tx.$executeRaw`SET LOCAL statement_timeout = '900s'`;
      await tx.$executeRaw`SET LOCAL timezone = 'UTC'`;
      await tx.$executeRaw`SET LOCAL datestyle = 'ISO, YMD'`;
      await tx.$executeRaw`SET LOCAL extra_float_digits = 3`;
      await tx.$executeRaw`SET LOCAL bytea_output = 'hex'`;
      await tx.$executeRaw`SET LOCAL row_security = off`;
      const [encoding] = await tx.$queryRaw<{ server: string; client: string }[]>`
        SELECT current_setting('server_encoding') AS server,
          current_setting('client_encoding') AS client`;
      if (encoding?.server !== "UTF8" || encoding.client !== "UTF8")
        throw new Error("GREAT_RESET_RECEIPT_ENCODING_UNSUPPORTED");
      const tables = await contentSection(tx);
      const sections: Record<ReceiptSection, string> = {
        content: sha256(tables),
        sequences: sha256(await sequencesSection(tx)),
        schema: sha256(await schemaSection(tx)),
        security: sha256(await securitySection(tx)),
        database: sha256(await databaseSection(tx)),
      };
      return { version: 1 as const, sha256: sha256(sections), sections, tables };
    },
    { isolationLevel: "RepeatableRead", timeout: 1_800_000, maxWait: 5_000 },
  );
}

/**
 * İki makbuzun farkı; yalnız bölüm ve tablo adları döner. `allowed` ortam başına önceden
 * yazılmış beklenen bölüm farklarıdır (ör. yerel `--no-owner` geri yüklemede `security`).
 */
export function compareReceipts(
  expected: GreatResetReceipt,
  actual: GreatResetReceipt,
  allowed: readonly ReceiptSection[] = [],
): { equal: boolean; sections: ReceiptSection[]; tables: string[] } {
  const sections = (Object.keys(expected.sections) as ReceiptSection[]).filter(
    (section) => expected.sections[section] !== actual.sections[section],
  );
  const names = new Set([...Object.keys(expected.tables), ...Object.keys(actual.tables)]);
  const tables = [...names]
    .filter((name) => sha256(expected.tables[name] ?? null) !== sha256(actual.tables[name] ?? null))
    .sort();
  return {
    equal: sections.every((section) => allowed.includes(section)) && tables.length === 0,
    sections,
    tables,
  };
}

import { createHash } from "node:crypto";
import { canonicalSchemaDescription } from "../domain/restore-rendering";
import { Prisma, type PrismaClient } from "@prisma/client";

/*
  Tam içerik makbuzu (üretim tasarımı v19, Aşama 2). Yedeğin (dump) ve geri yüklemenin
  kaynağın aynısı olduğunu kanıtlamak için kullanılır; kısa plan özeti (`ctid`/`xmin`) bunun
  yerine geçmez. Tek RepeatableRead, salt okunur görüntüde; sabit oturum ayarlarıyla (`UTF8`,
  `TimeZone UTC`, `DateStyle ISO, YMD`, `IntervalStyle postgres`, `extra_float_digits 3`,
  `bytea_output hex`, `search_path public`) ve `COLLATE "C"` sıralamasıyla hesaplanır.

  Satırlar açık bütün-satır kayıt metniyle (`ROW(t.*)::text`) özetlenir (Astra, PR #234): `to_jsonb`
  SQL NULL ile JSON `null`'ı ve dizi alt indislerini aynı metne indiriyordu; yalın `t::text` ise
  `t` adlı bir sütun varsa yalnız o sütunu verirdi. Sözleşme MANTIKSAL dump/restore eşitliğidir:
  PostgreSQL metin çıktısı farklı NaN bit desenlerini tek `NaN`'a indirir; bit düzeyi iddia yok.

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
  materialized/foreign table, kalıtım/partition, public dışında kullanıcı şeması, domain, bağımsız
  composite, range/multirange, temel tip, kullanıcı collation'ı) varsa makbuz hata verir, sessizce
  atlamaz (P2). Collation sürümü (`collversion`/`datcollversion`) makbuza girmez: normal dump/restore
  bunu taşımaz, hedefte yeniden hesaplanır; sağlayıcı sürüm uyumu runbook'ta ayrı ortam kontrolüdür.
  Satır içeriği, credential ya da SQL çıktıya taşınmaz.
*/

type Tx = Prisma.TransactionClient;

export type TableDigest = { rows: number; sha256: string };
export type ReceiptSection =
  | "content"
  | "sequences"
  | "schema"
  | "schemaNormalized"
  | "security"
  | "database";
export type DetailedSection = "sequences" | "security" | "database";

export type GreatResetReceipt = {
  version: 3;
  sha256: string;
  sections: Record<ReceiptSection, string>;
  tables: Record<string, TableDigest>;
  details: Record<DetailedSection, Record<string, string>>;
};

const receiptSections: readonly ReceiptSection[] = [
  "content",
  "sequences",
  "schema",
  // Restore yazım farkları kanonikleştirilmiş şema (restore-rendering). Canlı ↔ restore
  // karşılaştırmasında ham şemanın yerine geçer; diğer bütün şema bilgisi birebir kalır.
  "schemaNormalized",
  "security",
  "database",
];
const detailedSections: readonly DetailedSection[] = ["sequences", "security", "database"];

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
    {
      otherSchemas: number;
      largeObjects: number;
      unsupported: number;
      inheritance: number;
      types: number;
    }[]
  >`
    SELECT
      -- public dışında HİÇBİR kullanıcı şeması desteklenmez; geçici şemalar tam desenle ayrılır.
      (SELECT count(*)::int FROM pg_namespace n
        WHERE n.nspname NOT IN ('public', 'pg_catalog', 'information_schema', 'pg_toast')
          AND n.nspname !~ '^pg_temp_[0-9]+$' AND n.nspname !~ '^pg_toast_temp_[0-9]+$')
        AS "otherSchemas",
      (SELECT count(*)::int FROM pg_largeobject_metadata) AS "largeObjects",
      (SELECT count(*)::int FROM pg_class
        WHERE relnamespace = 'public'::regnamespace AND relkind IN ('m', 'f', 'p')) AS unsupported,
      (SELECT count(*)::int FROM pg_inherits) AS inheritance,
      -- Domain, bağımsız composite, range/multirange ve dizi olmayan temel tip tanımları ile
      -- kullanıcı collation'ları özetlenmez; varlıkları reddedilir (Astra, PR #234 3. tur).
      -- Extension üyesi tipler (ör. pg_trgm'in gtrgm'i) extension adı/sürümüyle şemada kayıtlı.
      (SELECT count(*)::int FROM pg_type t WHERE t.typnamespace = 'public'::regnamespace
        AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_type'::regclass
          AND d.objid = t.oid AND d.deptype = 'e')
        -- Otomatik dizi tipi gerçek ilişkiyle tanınır; CATEGORY = 'A' seçilebilir (4. tur P2).
        AND (t.typtype IN ('d', 'r', 'm') OR (t.typtype = 'b'
          AND NOT EXISTS (SELECT 1 FROM pg_type e WHERE e.typarray = t.oid))
          OR (t.typtype = 'c' AND EXISTS (SELECT 1 FROM pg_class c
            WHERE c.oid = t.typrelid AND c.relkind = 'c'))))
        -- Aggregate tanımı (SFUNC, INITCOND…) özetlenmez; extension üyesi olmayanlar ret (5. tur P2).
        + (SELECT count(*)::int FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
            AND p.prokind = 'a' AND NOT EXISTS (SELECT 1 FROM pg_depend d
              WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'))
        + (SELECT count(*)::int FROM pg_collation c WHERE c.collnamespace = 'public'::regnamespace
            AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_collation'::regclass
              AND d.objid = c.oid AND d.deptype = 'e'))
        /*
          Sınıf kapanışı (Astra, PR #234 6. tur): makbuzun özetlemediği HER nesne türü, extension
          üyesi değilse reddedilir. Tek tek tür eklemek yerine izin listesi: public'te operatör,
          operatör sınıfı/ailesi, dönüşüm, metin arama nesneleri, genişletilmiş istatistik;
          veritabanı genelinde event trigger, publication, subscription, FDW/sunucu, kullanıcı
          eşlemesi, kullanıcı cast'i, transform ve access method.
        */
        + (SELECT count(*)::int FROM (
            SELECT 'pg_operator'::regclass AS catalog, oid FROM pg_operator
              WHERE oprnamespace = 'public'::regnamespace
            UNION ALL SELECT 'pg_opclass'::regclass, oid FROM pg_opclass
              WHERE opcnamespace = 'public'::regnamespace
            UNION ALL SELECT 'pg_opfamily'::regclass, oid FROM pg_opfamily
              WHERE opfnamespace = 'public'::regnamespace
            UNION ALL SELECT 'pg_conversion'::regclass, oid FROM pg_conversion
              WHERE connamespace = 'public'::regnamespace
            UNION ALL SELECT 'pg_ts_config'::regclass, oid FROM pg_ts_config
              WHERE cfgnamespace = 'public'::regnamespace
            UNION ALL SELECT 'pg_ts_dict'::regclass, oid FROM pg_ts_dict
              WHERE dictnamespace = 'public'::regnamespace
            UNION ALL SELECT 'pg_ts_parser'::regclass, oid FROM pg_ts_parser
              WHERE prsnamespace = 'public'::regnamespace
            UNION ALL SELECT 'pg_ts_template'::regclass, oid FROM pg_ts_template
              WHERE tmplnamespace = 'public'::regnamespace
            UNION ALL SELECT 'pg_statistic_ext'::regclass, oid FROM pg_statistic_ext
              WHERE stxnamespace = 'public'::regnamespace
            UNION ALL SELECT 'pg_event_trigger'::regclass, oid FROM pg_event_trigger
            UNION ALL SELECT 'pg_publication'::regclass, oid FROM pg_publication
            UNION ALL SELECT 'pg_foreign_data_wrapper'::regclass, oid FROM pg_foreign_data_wrapper
            UNION ALL SELECT 'pg_foreign_server'::regclass, oid FROM pg_foreign_server
            UNION ALL SELECT 'pg_cast'::regclass, oid FROM pg_cast WHERE oid >= 16384
            UNION ALL SELECT 'pg_transform'::regclass, oid FROM pg_transform
            UNION ALL SELECT 'pg_am'::regclass, oid FROM pg_am WHERE oid >= 16384
          ) o WHERE NOT EXISTS (SELECT 1 FROM pg_depend d
            WHERE d.classid = o.catalog AND d.objid = o.oid AND d.deptype = 'e'))
        -- Abonelik ve kullanıcı eşlemesi süper kullanıcısız oluşturulabilir (Astra, 7. tur P2).
        -- Eşlemeler parolalı katalog yerine herkese açık pg_user_mappings görünümünden sayılır.
        + (SELECT count(*)::int FROM pg_subscription
            WHERE subdbid = (SELECT oid FROM pg_database WHERE datname = current_database()))
        + (SELECT count(*)::int FROM pg_user_mappings)
        /*
          Katalog envanteri kapanışı (Astra, PR #234 9. tur, 64 katalog): güvenlik etiketi (B3),
          replication origin (B4), geçersiz/hazır olmayan indeks (B7), sistem şemalarında kullanıcı
          nesnesi (B2; FirstNormalObjectId = 16384) ve izin listesi dışındaki extension (B6) ret.
        */
        + (SELECT count(*)::int FROM pg_seclabels)
        + (SELECT count(*)::int FROM pg_replication_origin)
        + (SELECT count(*)::int FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid
            WHERE c.relnamespace = 'public'::regnamespace
              AND NOT (i.indisvalid AND i.indisready AND i.indislive))
        + (SELECT count(*)::int FROM (
            SELECT 'pg_class'::regclass AS catalog, oid FROM pg_class
              WHERE relnamespace IN ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
                AND oid >= 16384
            UNION ALL SELECT 'pg_proc'::regclass, oid FROM pg_proc
              WHERE pronamespace IN ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
                AND oid >= 16384
            UNION ALL SELECT 'pg_type'::regclass, oid FROM pg_type
              WHERE typnamespace IN ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
                AND oid >= 16384
            -- Ad alanı taşıyan diğer kataloglar (Astra, 10. tur B2).
            UNION ALL SELECT 'pg_operator'::regclass, oid FROM pg_operator
              WHERE oprnamespace IN ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
                AND oid >= 16384
            UNION ALL SELECT 'pg_opclass'::regclass, oid FROM pg_opclass
              WHERE opcnamespace IN ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
                AND oid >= 16384
            UNION ALL SELECT 'pg_opfamily'::regclass, oid FROM pg_opfamily
              WHERE opfnamespace IN ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
                AND oid >= 16384
            UNION ALL SELECT 'pg_conversion'::regclass, oid FROM pg_conversion
              WHERE connamespace IN ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
                AND oid >= 16384
            UNION ALL SELECT 'pg_collation'::regclass, oid FROM pg_collation
              WHERE collnamespace IN ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
                AND oid >= 16384
            UNION ALL SELECT 'pg_ts_config'::regclass, oid FROM pg_ts_config
              WHERE cfgnamespace IN ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
                AND oid >= 16384
            UNION ALL SELECT 'pg_ts_dict'::regclass, oid FROM pg_ts_dict
              WHERE dictnamespace IN ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
                AND oid >= 16384
            UNION ALL SELECT 'pg_ts_parser'::regclass, oid FROM pg_ts_parser
              WHERE prsnamespace IN ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
                AND oid >= 16384
            UNION ALL SELECT 'pg_ts_template'::regclass, oid FROM pg_ts_template
              WHERE tmplnamespace IN ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
                AND oid >= 16384
            UNION ALL SELECT 'pg_statistic_ext'::regclass, oid FROM pg_statistic_ext
              WHERE stxnamespace IN ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
                AND oid >= 16384) o
          WHERE NOT EXISTS (SELECT 1 FROM pg_depend d
            WHERE d.classid = o.catalog AND d.objid = o.oid AND d.deptype = 'e'))
        -- Extension üyesi yalnız tanımı özetlenen sekiz sınıftan olabilir (Astra, 10. tur B6).
        + (SELECT count(*)::int FROM pg_depend d
            WHERE d.refclassid = 'pg_extension'::regclass AND d.deptype = 'e'
              AND d.classid NOT IN ('pg_type'::regclass, 'pg_proc'::regclass,
                'pg_operator'::regclass, 'pg_opclass'::regclass, 'pg_opfamily'::regclass,
                'pg_language'::regclass, 'pg_ts_dict'::regclass, 'pg_ts_template'::regclass))
        + (SELECT count(*)::int FROM pg_extension
            WHERE extname NOT IN ('plpgsql', 'pg_trgm', 'pgcrypto', 'unaccent')) AS types`;
  if (
    !scope ||
    scope.otherSchemas !== 0 ||
    scope.types !== 0 ||
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
  for (const { name } of tables) entries.push([name, await tableDigest(tx, name)]);
  return dictionary(entries);
}

/** Makbuzun tablo özeti; geri dönüş gölgesinin işaret transaction'ı da aynısını kullanır. */
export async function tableDigest(tx: Tx, name: string): Promise<TableDigest> {
  const [digest] = await tx.$queryRaw<TableDigest[]>(Prisma.sql`
    WITH row_hashes AS MATERIALIZED (
      SELECT encode(sha256(convert_to(ROW(t.*)::text, 'UTF8')), 'hex') AS row_hash
      FROM ${tableIdentifier(name)} t
    )
    SELECT count(*)::int AS rows,
      encode(sha256(convert_to(coalesce(string_agg(row_hash,
        E'\\n' ORDER BY row_hash COLLATE "C"), ''), 'UTF8')), 'hex') AS sha256
    FROM row_hashes`);
  if (!digest) throw new Error("GREAT_RESET_RECEIPT_FAILED");
  return digest;
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
      -- Mantıksal sıra (yaşayan sütunlar arasında); düşürülmüş sütun boşlukları restore'da
      -- korunmak zorunda değildir. Collation nitelikli adı ve kurallarıyla (Astra, 2. tur P2).
      'columns', (SELECT jsonb_agg(jsonb_build_array(x.relname, x.position, x.attname, x.type,
          x.attnotnull, x.attidentity, x.attgenerated, x."defaultExpression", x.collation,
          x.attstorage, x.attcompression, x.attstattarget, x.attoptions)
        ORDER BY x.relname COLLATE "C", x.position)
        FROM (SELECT c.relname, a.attname, a.attnotnull, a.attidentity, a.attgenerated,
            -- Kalıcı sütun ayarları (B8).
            a.attstorage, a.attcompression, a.attstattarget, a.attoptions::text AS attoptions,
            row_number() OVER (PARTITION BY a.attrelid ORDER BY a.attnum) AS position,
            format_type(a.atttypid, a.atttypmod) AS type,
            pg_get_expr(ad.adbin, ad.adrelid) AS "defaultExpression",
            CASE WHEN co.oid IS NULL THEN NULL ELSE jsonb_build_array(
              co.collnamespace::regnamespace::text, co.collname, co.collprovider,
              co.collisdeterministic, co.collcollate, co.collctype, co.colliculocale,
              co.collicurules) END AS collation
          FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
          LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
          LEFT JOIN pg_collation co ON co.oid = a.attcollation AND a.attcollation <> 0
          WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'v')
            AND a.attnum > 0 AND NOT a.attisdropped) x),
      -- Yerleşim, access method, TOAST seçenekleri (B9).
      'tables', (SELECT jsonb_agg(jsonb_build_array(c.relname, c.relkind, c.relpersistence,
          c.reloptions::text, c.relreplident, am.amname, c.reloftype::regtype::text,
          ts.spcname, toast.reloptions::text) ORDER BY c.relname COLLATE "C")
        FROM pg_class c
        LEFT JOIN pg_am am ON am.oid = c.relam
        LEFT JOIN pg_tablespace ts ON ts.oid = c.reltablespace
        LEFT JOIN pg_class toast ON toast.oid = c.reltoastrelid
        WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'v')),
      'constraints', (SELECT jsonb_agg(jsonb_build_array(conrelid::regclass::text, conname,
          contype, convalidated, condeferrable, condeferred, pg_get_constraintdef(oid))
        ORDER BY conrelid::regclass::text COLLATE "C", conname COLLATE "C")
        FROM pg_constraint WHERE connamespace = 'public'::regnamespace),
      -- İndeks tanımı yanında replica identity, cluster ve tablespace seçimi (B7, B9).
      'indexes', (SELECT jsonb_agg(jsonb_build_array(t.relname, c.relname,
          pg_get_indexdef(i.indexrelid), i.indisreplident, i.indisclustered, ts.spcname,
          -- İndeks sütunlarının istatistik hedefi (10. tur B8).
          (SELECT array_agg(a.attstattarget ORDER BY a.attnum) FROM pg_attribute a
            WHERE a.attrelid = i.indexrelid))
        ORDER BY t.relname COLLATE "C", c.relname COLLATE "C")
        FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
        JOIN pg_class t ON t.oid = i.indrelid
        LEFT JOIN pg_tablespace ts ON ts.oid = c.reltablespace
        WHERE t.relnamespace = 'public'::regnamespace),
      'triggers', (SELECT jsonb_agg(jsonb_build_array(t.tgrelid::regclass::text, t.tgname,
          pg_get_triggerdef(t.oid), t.tgenabled, pg_get_functiondef(t.tgfoid))
        ORDER BY t.tgrelid::regclass::text COLLATE "C", t.tgname COLLATE "C")
        FROM pg_trigger t WHERE NOT t.tgisinternal AND
          t.tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace)),
      'functions', (SELECT jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,
          CASE WHEN p.prokind IN ('f', 'p', 'w') THEN pg_get_functiondef(p.oid) END)
        ORDER BY p.oid::regprocedure::text COLLATE "C")
        FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind <> 'a'),
      -- Kurallar pg_rewrite'tan, etkinlik durumu (ev_enabled) dahil; pg_rules bunu göstermez
      -- (5. tur P2). View'ların _RETURN kuralları views altında ayrıca özetlenir.
      'rules', (SELECT jsonb_agg(jsonb_build_array(c.relname, r.rulename, r.ev_enabled,
          pg_get_ruledef(r.oid)) ORDER BY c.relname COLLATE "C", r.rulename COLLATE "C")
        FROM pg_rewrite r JOIN pg_class c ON c.oid = r.ev_class
        WHERE c.relnamespace = 'public'::regnamespace AND r.rulename <> '_RETURN'),
      'views', (SELECT jsonb_agg(jsonb_build_array(viewname, definition)
        ORDER BY viewname COLLATE "C") FROM pg_views WHERE schemaname = 'public'),
      -- Etiketlerin mantıksal sırası; kesirli enumsortorder restore sonrası korunmak zorunda değil.
      'enums', (SELECT jsonb_agg(jsonb_build_array(x.typname, x.position, x.enumlabel)
        ORDER BY x.typname COLLATE "C", x.position)
        FROM (SELECT t.typname, e.enumlabel,
            row_number() OVER (PARTITION BY e.enumtypid ORDER BY e.enumsortorder) AS position
          FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typnamespace = 'public'::regnamespace) x),
      'extensions', (SELECT jsonb_agg(jsonb_build_array(extname, extversion,
          extnamespace::regnamespace::text, extrelocatable,
          -- Tablo–koşul çiftleri birlikte sıralanır (10. tur B9).
          (SELECT jsonb_agg(jsonb_build_array(u.cfg::regclass::text, u.cond)
            ORDER BY u.cfg::regclass::text COLLATE "C")
            FROM unnest(extconfig, extcondition) AS u(cfg, cond))) ORDER BY extname COLLATE "C")
        FROM pg_extension),
      /*
        Extension üye TANIMLARI (Astra, 10. tur B6): değiştirilmiş üye dump'a taşınmaz, restore
        standart tanımı kurar. OID içermeyen metinle (regproc/regtype/regoperator, sabit search_path)
        özetlenir; kimlik pg_describe_object'tir. Sahip ve ACL burada DEĞİL, değer düzeyinde
        karşılaştırılan security bölümündedir (extensionMember:…), ki manifestte onaylı sahiplik
        farkı izin alabilsin (Astra, 11. tur P2).
      */
      'extensionMemberDefinitions', (SELECT jsonb_agg(jsonb_build_array(m.extname, m.member,
          m.definition) ORDER BY m.extname COLLATE "C", m.member COLLATE "C")
        FROM (
          SELECT e.extname, pg_describe_object(d.classid, d.objid, 0) AS member,
            CASE d.classid
              WHEN 'pg_proc'::regclass THEN (SELECT jsonb_build_array(
                  CASE WHEN p.prokind <> 'a' THEN pg_get_functiondef(p.oid) END)
                FROM pg_proc p WHERE p.oid = d.objid)
              WHEN 'pg_operator'::regclass THEN (SELECT jsonb_build_array(o.oid::regoperator::text,
                  o.oprcode::regproc::text, o.oprrest::regproc::text, o.oprjoin::regproc::text,
                  o.oprcom::regoperator::text, o.oprnegate::regoperator::text, o.oprcanmerge,
                  o.oprcanhash)
                FROM pg_operator o WHERE o.oid = d.objid)
              WHEN 'pg_opclass'::regclass THEN (SELECT jsonb_build_array(c.opcname, am.amname,
                  c.opcintype::regtype::text, c.opcdefault, f.opfname,
                  c.opckeytype::regtype::text)
                FROM pg_opclass c JOIN pg_am am ON am.oid = c.opcmethod
                JOIN pg_opfamily f ON f.oid = c.opcfamily WHERE c.oid = d.objid)
              WHEN 'pg_opfamily'::regclass THEN (SELECT jsonb_build_array(f.opfname, am.amname,
                  (SELECT jsonb_agg(jsonb_build_array(a.amopstrategy, a.amoplefttype::regtype::text,
                      a.amoprighttype::regtype::text, a.amopopr::regoperator::text, a.amoppurpose,
                      (SELECT opfname FROM pg_opfamily WHERE oid = a.amopsortfamily))
                    ORDER BY a.amopstrategy, a.amoplefttype::regtype::text COLLATE "C",
                      a.amoprighttype::regtype::text COLLATE "C")
                    FROM pg_amop a WHERE a.amopfamily = f.oid),
                  (SELECT jsonb_agg(jsonb_build_array(p.amprocnum, p.amproclefttype::regtype::text,
                      p.amprocrighttype::regtype::text, p.amproc::regprocedure::text)
                    ORDER BY p.amprocnum, p.amproclefttype::regtype::text COLLATE "C",
                      p.amprocrighttype::regtype::text COLLATE "C")
                    FROM pg_amproc p WHERE p.amprocfamily = f.oid))
                FROM pg_opfamily f JOIN pg_am am ON am.oid = f.opfmethod WHERE f.oid = d.objid)
              WHEN 'pg_type'::regclass THEN (SELECT jsonb_build_array(t.typname,
                  t.typinput::regproc::text, t.typoutput::regproc::text,
                  t.typreceive::regproc::text, t.typsend::regproc::text,
                  t.typmodin::regproc::text, t.typmodout::regproc::text,
                  t.typanalyze::regproc::text, t.typlen, t.typbyval, t.typalign, t.typstorage,
                  t.typdefault, t.typcategory, t.typispreferred, t.typdelim)
                FROM pg_type t WHERE t.oid = d.objid)
              WHEN 'pg_language'::regclass THEN (SELECT jsonb_build_array(l.lanname,
                  l.lanplcallfoid::regproc::text, l.laninline::regproc::text,
                  l.lanvalidator::regproc::text, l.lanpltrusted)
                FROM pg_language l WHERE l.oid = d.objid)
              WHEN 'pg_ts_dict'::regclass THEN (SELECT jsonb_build_array(t.dictname,
                  tm.tmplname, t.dictinitoption)
                FROM pg_ts_dict t JOIN pg_ts_template tm ON tm.oid = t.dicttemplate
                WHERE t.oid = d.objid)
              WHEN 'pg_ts_template'::regclass THEN (SELECT jsonb_build_array(t.tmplname,
                  t.tmplinit::regproc::text, t.tmpllexize::regproc::text)
                FROM pg_ts_template t WHERE t.oid = d.objid)
            END AS definition
          FROM pg_depend d JOIN pg_extension e ON e.oid = d.refobjid
          WHERE d.refclassid = 'pg_extension'::regclass AND d.deptype = 'e') m),
      -- DEPENDS ON EXTENSION bağları (B5).
      'extensionDependencies', (SELECT jsonb_agg(jsonb_build_array(x.extname, x.member)
        ORDER BY x.extname COLLATE "C", x.member COLLATE "C")
        FROM (SELECT e.extname, pg_describe_object(d.classid, d.objid, d.objsubid) AS member
          FROM pg_depend d JOIN pg_extension e ON e.oid = d.refobjid
          WHERE d.refclassid = 'pg_extension'::regclass AND d.deptype = 'x') x),
      -- Extension üye envanteri: sonradan ALTER EXTENSION ADD ile eklenen nesne dump/restore'da
      -- kaybolursa ad/sürüm aynı kalsa da fark görünür (Astra, PR #234 4. tur P2).
      'extensionMembers', (SELECT jsonb_agg(jsonb_build_array(x.extname, x.member)
        ORDER BY x.extname COLLATE "C", x.member COLLATE "C")
        FROM (SELECT e.extname, pg_describe_object(d.classid, d.objid, d.objsubid) AS member
          FROM pg_depend d JOIN pg_extension e ON e.oid = d.refobjid
          WHERE d.refclassid = 'pg_extension'::regclass AND d.deptype = 'e') x)
    )::text AS description`;
  if (!row) throw new Error("GREAT_RESET_RECEIPT_FAILED");
  return row.description;
}

async function keyValues(tx: Tx, query: Prisma.Sql) {
  const rows = await tx.$queryRaw<{ key: string; value: string | null }[]>(query);
  // SQL NULL ile "null" metni ayrı kalsın diye değer JSON olarak saklanır (Astra, 2. tur P3).
  const entries: [string, string][] = rows.map((row) => [row.key, JSON.stringify(row.value)]);
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
          p.polpermissive, (SELECT array_agg(x.name ORDER BY x.name COLLATE "C")
            FROM (SELECT CASE WHEN r = 0 THEN 'public' ELSE pg_get_userbyid(r)::text END AS name
              FROM unnest(p.polroles) AS r) x),
          pg_get_expr(p.polqual, p.polrelid), pg_get_expr(p.polwithcheck, p.polrelid))::text
        FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
        WHERE c.relnamespace = 'public'::regnamespace
      UNION ALL
      SELECT 'namespace:public', jsonb_build_array(pg_get_userbyid(nspowner), nspacl::text)::text
        FROM pg_namespace WHERE nspname = 'public'
      UNION ALL
      -- Rol adı taşıyan anahtarlar kaçışlı JSON dizisidir; ayraç içeren adlar belirsizlik yaratmaz
      -- (Astra, PR #239 5. tur P2).
      SELECT 'defaultAcl:' || jsonb_build_array(pg_get_userbyid(defaclrole),
          coalesce(defaclnamespace::regnamespace::text, '*'), defaclobjtype::text)::text,
          defaclacl::text
        FROM pg_default_acl
      UNION ALL
      SELECT 'function:' || p.oid::regprocedure::text,
          jsonb_build_array(pg_get_userbyid(p.proowner), p.proacl::text)::text
        FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
      UNION ALL
      -- Public'teki BÜTÜN tipler (extension üyesi temel tipler dahil): sahip ve ACL (4. tur P2).
      SELECT 'type:' || t.typname, jsonb_build_array(pg_get_userbyid(t.typowner), t.typacl::text)::text
        FROM pg_type t WHERE t.typnamespace = 'public'::regnamespace
      UNION ALL
      SELECT 'database', jsonb_build_array(pg_get_userbyid(datdba), datacl::text)::text
        FROM pg_database WHERE datname = current_database()
      UNION ALL
      -- Roller: nitelikler; parola ve geçerlilik dışında. Sistem rolleri hariç.
      SELECT 'role:' || rolname, jsonb_build_array(rolsuper, rolinherit, rolcreaterole,
          rolcreatedb, rolcanlogin, rolreplication, rolbypassrls, rolconnlimit,
          rolvaliduntil::text)::text
        FROM pg_roles WHERE rolname NOT LIKE 'pg\\_%'
      UNION ALL
      -- Sistem şemalarındaki varsayılan dışı (NULL olmayan) ACL'ler (B2): initdb'nin koyduğu
      -- ACL'ler aynı sürüm kümelerinde eşittir; devredilmiş bir GRANT burada görünür.
      SELECT 'systemRelation:' || n.nspname || '.' || c.relname, c.relacl::text
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname IN ('pg_catalog', 'information_schema') AND c.relacl IS NOT NULL
      UNION ALL
      SELECT 'systemColumn:' || n.nspname || '.' || c.relname || '.' || a.attname, a.attacl::text
        FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname IN ('pg_catalog', 'information_schema') AND a.attacl IS NOT NULL
      UNION ALL
      SELECT 'systemFunction:' || p.oid::regprocedure::text, p.proacl::text
        FROM pg_proc p
        WHERE p.pronamespace IN ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
          AND p.proacl IS NOT NULL
      UNION ALL
      SELECT 'systemType:' || t.oid::regtype::text, t.typacl::text
        FROM pg_type t
        WHERE t.typnamespace IN ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
          AND t.typacl IS NOT NULL
      UNION ALL
      SELECT 'systemNamespace:' || nspname, jsonb_build_array(pg_get_userbyid(nspowner),
          nspacl::text)::text
        FROM pg_namespace WHERE nspname IN ('pg_catalog', 'information_schema')
      UNION ALL
      -- Extension üyelerinin sahibi ve ACL'si (11. tur): tanımları schema bölümünde.
      SELECT 'extensionMember:' || pg_describe_object(d.classid, d.objid, 0),
          CASE d.classid
            WHEN 'pg_proc'::regclass THEN (SELECT jsonb_build_array(pg_get_userbyid(proowner),
              proacl::text)::text FROM pg_proc WHERE oid = d.objid)
            WHEN 'pg_operator'::regclass THEN (SELECT jsonb_build_array(pg_get_userbyid(oprowner))::text
              FROM pg_operator WHERE oid = d.objid)
            WHEN 'pg_opclass'::regclass THEN (SELECT jsonb_build_array(pg_get_userbyid(opcowner))::text
              FROM pg_opclass WHERE oid = d.objid)
            WHEN 'pg_opfamily'::regclass THEN (SELECT jsonb_build_array(pg_get_userbyid(opfowner))::text
              FROM pg_opfamily WHERE oid = d.objid)
            WHEN 'pg_type'::regclass THEN (SELECT jsonb_build_array(pg_get_userbyid(typowner),
              typacl::text)::text FROM pg_type WHERE oid = d.objid)
            WHEN 'pg_language'::regclass THEN (SELECT jsonb_build_array(pg_get_userbyid(lanowner),
              lanacl::text)::text FROM pg_language WHERE oid = d.objid)
            WHEN 'pg_ts_dict'::regclass THEN (SELECT jsonb_build_array(pg_get_userbyid(dictowner))::text
              FROM pg_ts_dict WHERE oid = d.objid)
            WHEN 'pg_ts_template'::regclass THEN '[]'
          END
        FROM pg_depend d
        WHERE d.refclassid = 'pg_extension'::regclass AND d.deptype = 'e'
      UNION ALL
      -- Küme genelindeki yetkiler (Astra, PR #234 8. tur): dil sahipliği/ACL'si, parametre
      -- yetkileri ve tablespace'ler; extension üyeliği ya da rol nitelikleri bunları kanıtlamaz.
      SELECT 'language:' || lanname, jsonb_build_array(pg_get_userbyid(lanowner), lanpltrusted,
          lanacl::text)::text
        FROM pg_language
      UNION ALL
      SELECT 'parameter:' || parname, paracl::text FROM pg_parameter_acl
      UNION ALL
      SELECT 'tablespace:' || spcname, jsonb_build_array(pg_get_userbyid(spcowner), spcacl::text,
          spcoptions::text)::text
        FROM pg_tablespace
      UNION ALL
      SELECT 'membership:' || jsonb_build_array(pg_get_userbyid(roleid), pg_get_userbyid(member),
          pg_get_userbyid(grantor))::text,
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
          d.datctype, d.datlocprovider, d.daticulocale, d.daticurules, d.datconnlimit,
          d.datistemplate, (SELECT spcname FROM pg_tablespace WHERE oid = d.dattablespace))::text
          AS value
        FROM pg_database d WHERE d.datname = current_database()
      UNION ALL
      SELECT 'comment', shobj_description(d.oid, 'pg_database')
        FROM pg_database d WHERE d.datname = current_database()
      UNION ALL
      -- Bu DB'ye ve (setdatabase = 0) bütün DB'lere uygulanan rol ayarları.
      SELECT 'setting:' || jsonb_build_array(CASE WHEN s.setdatabase = 0 THEN '*' ELSE 'db' END,
          CASE WHEN s.setrole = 0 THEN '*' ELSE pg_get_userbyid(s.setrole) END)::text,
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
      const description = await schemaSection(tx);
      const sections: Record<ReceiptSection, string> = {
        content: sha256(tables),
        sequences: sha256(details.sequences),
        schema: sha256(description),
        schemaNormalized: sha256(canonicalSchemaDescription(JSON.parse(description))),
        security: sha256(details.security),
        database: sha256(details.database),
      };
      return { version: 3 as const, sha256: sha256(sections), sections, tables, details };
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
  const sections = receiptSections.filter(
    (section) => expected.sections?.[section] !== actual.sections?.[section],
  );
  // Bölüm özetleri ayrıntılarından yeniden hesaplanır; tutarsız, eksik bölümlü ya da açıklanamayan
  // bölüm farkı olan makbuz eşit sayılmaz (Astra, 2. ve 3. tur P2). Bölüm listesi sabittir.
  const hex = /^[a-f0-9]{64}$/u;
  const consistent = (value: GreatResetReceipt) =>
    value.version === 3 &&
    receiptSections.every((section) => hex.test(value.sections?.[section] ?? "")) &&
    Object.keys(value.sections).length === receiptSections.length &&
    detailedSections.every(
      (section) => typeof value.details?.[section] === "object" && value.details[section] !== null,
    ) &&
    value.sections.content === sha256(value.tables) &&
    value.sections.sequences === sha256(value.details.sequences) &&
    value.sections.security === sha256(value.details.security) &&
    value.sections.database === sha256(value.details.database) &&
    value.sha256 === sha256(value.sections);
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
    equal:
      consistent(expected) &&
      consistent(actual) &&
      tables.length === 0 &&
      detailOnly &&
      unexpected.length === 0,
    sections,
    tables,
    differences,
    unexpected,
  };
}

/*
  Bağımsız restore kapısı (runbook v20 A5 reset modu, 4. adım; Astra PR #239 4. tur politika i):
  reset-anı yedeği operatör sunucusundaki ayrı PostgreSQL kümesine `agent_sozluk` rolü altında
  restore edilir ve ÜRETİM SCRATCH makbuzuyla (ikisi de restore) karşılaştırılır. Varsayılan
  ret: bütün bölümler, tablolar ve anahtarlar birebir eşit olmalıdır. Tek yapısal eşleme, iki
  kümenin kurulum süper kullanıcısı adıdır (üretimde `postgres`, operatörde yerel initdb
  kullanıcısı): anahtardaki rol adı alanlarında ve değerdeki sahip/ACL rol alanlarında YALNIZ bu ad
  birebir eşlenir; metin içinde genel değiştirme yapılmaz. Eşlemeden sonra da farklı ya da tek
  tarafta bulunan anahtar engeller. Yalnız iki istisna raporlanır: `database:locale` içindeki
  collation/ctype/sağlayıcı/ICU alanları (encoding, bağlantı sınırı, şablon bayrağı ve tablespace
  katı) ve üretimde yorumsuz DB'nin operatörde exact sentetik prova işaretini taşıması.
*/
export type IndependentDifference = { key: string; expected: string | null; actual: string | null };

const syntheticMarker = "agentsozluk:great-reset:synthetic:v1";

/** PostgreSQL dizi metnini (`{a,"b,c"}`) öğelerine ayırır; tırnak ve ters bölü kaçışlarını çözer. */
function parsePgArray(text: string): string[] | null {
  if (!text.startsWith("{") || !text.endsWith("}")) return null;
  const body = text.slice(1, -1);
  if (body === "") return [];
  const items: string[] = [];
  let index = 0;
  while (index <= body.length) {
    let item = "";
    if (body[index] === '"') {
      index += 1;
      for (;;) {
        if (index >= body.length) return null;
        const char = body[index]!;
        if (char === "\\") {
          item += body[index + 1] ?? "";
          index += 2;
        } else if (char === '"') {
          index += 1;
          break;
        } else {
          item += char;
          index += 1;
        }
      }
      if (index < body.length && body[index] !== ",") return null;
    } else {
      const comma = body.indexOf(",", index);
      item = body.slice(index, comma < 0 ? body.length : comma);
      if (item.includes('"') || item.includes("{")) return null;
      index = comma < 0 ? body.length : comma;
    }
    items.push(item);
    if (index >= body.length) break;
    index += 1;
  }
  return items;
}

/** Tek ACL öğesi `grantee=privs/grantor`; rol adları çift tırnaklı olabilir (`""` kaçışı). */
function parseAclItem(item: string): [string, string, string] | null {
  let index = 0;
  const identifier = (): string | null => {
    if (item[index] !== '"') {
      const start = index;
      while (index < item.length && item[index] !== "=" && item[index] !== "/") index += 1;
      return item.slice(start, index);
    }
    index += 1;
    let name = "";
    for (;;) {
      if (index >= item.length) return null;
      if (item[index] === '"') {
        if (item[index + 1] === '"') {
          name += '"';
          index += 2;
          continue;
        }
        index += 1;
        return name;
      }
      name += item[index]!;
      index += 1;
    }
  };
  const grantee = identifier();
  if (grantee === null || item[index] !== "=") return null;
  index += 1;
  const slash = item.indexOf("/", index);
  if (slash < 0) return null;
  const privileges = item.slice(index, slash);
  if (!/^[A-Za-z*]*$/u.test(privileges)) return null;
  index = slash + 1;
  const grantor = identifier();
  if (grantor === null || index !== item.length) return null;
  return [grantee, privileges, grantor];
}

type Structured = unknown;

function mapRole(name: string, from: string, to: string): string {
  return name === from ? to : name;
}

/** ACL metni yapıya çevrilir; bağımsız tarafta yalnız grantee/grantor rol alanları eşlenir. */
function aclStructure(text: unknown, map: (name: string) => string): Structured {
  if (text === null) return null;
  if (typeof text !== "string") return { unparsed: text };
  const items = parsePgArray(text);
  if (!items) return { unparsed: text };
  const parsed = items.map(parseAclItem);
  if (parsed.some((item) => item === null)) return { unparsed: text };
  return (parsed as [string, string, string][]).map(([grantee, privileges, grantor]) => [
    grantee === "" ? "" : map(grantee),
    privileges,
    map(grantor),
  ]);
}

/*
  Makbuz SQL'inin jsonb dizisi ürettiği anahtar türleri; yalnız bunlarda metin ikinci kez JSON
  olarak çözülür. Diğerleri (ACL metni, yorum, ayar dizisi, extension sahibi) düz metindir: SQL
  NULL ile "null" metni ya da tırnaklı/tırnaksız yorum birbirine eşitlenmez (Astra, PR #239 6. tur).
*/
const jsonValueKinds = new Set([
  "relation",
  "type",
  "function",
  "extensionMember",
  "namespace",
  "systemNamespace",
  "database",
  "language",
  "tablespace",
  "policy",
  "role",
  "membership",
  "locale",
]);

function decodeValue(value: string | undefined, kind: string): unknown {
  if (value === undefined) return undefined;
  const text = JSON.parse(value) as unknown;
  if (typeof text !== "string" || !jsonValueKinds.has(kind)) return text;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { unparsedJson: text };
  }
}

/*
  Anahtar türüne göre rol taşıyan alanlar (makbuz SQL'indeki sıra). Eşleme yalnız bu alanlarda
  ve yalnız tam kurulum kullanıcısı adında yapılır; koşul metni, yorum, ayar değeri ve bilinmeyen
  anahtarlar eşlenmez (Astra, PR #239 5. tur P1).
*/
function structureValue(
  kind: string,
  value: string | undefined,
  map: (name: string) => string,
): Structured {
  if (value === undefined) return undefined;
  const decoded = decodeValue(value, kind);
  const owner = (item: unknown) => (typeof item === "string" ? map(item) : item);
  const array = Array.isArray(decoded) ? decoded : null;
  switch (kind) {
    case "relation":
      return array && array.length === 5
        ? [array[0], owner(array[1]), aclStructure(array[2], map), array[3], array[4]]
        : { unparsed: decoded };
    case "type":
    case "function":
    case "extensionMember":
    case "namespace":
    case "systemNamespace":
    case "database":
      return array && array.length === 2
        ? [owner(array[0]), aclStructure(array[1], map)]
        : { unparsed: decoded };
    case "language":
      return array && array.length === 3
        ? [owner(array[0]), array[1], aclStructure(array[2], map)]
        : { unparsed: decoded };
    case "tablespace":
      return array && array.length === 3
        ? [owner(array[0]), aclStructure(array[1], map), array[2]]
        : { unparsed: decoded };
    case "policy":
      return array && array.length === 5 && (Array.isArray(array[2]) || array[2] === null)
        ? [
            array[0],
            array[1],
            // SQL rolleri ada göre sıralar; eşlemeden sonra aynı sırayla yeniden sıralanır.
            array[2] === null
              ? null
              : (array[2] as unknown[])
                  .map(owner)
                  .sort((a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0)),
            array[3],
            array[4],
          ]
        : { unparsed: decoded };
    case "column":
    case "systemRelation":
    case "systemColumn":
    case "systemFunction":
    case "systemType":
    case "parameter":
    case "defaultAcl":
      return aclStructure(decoded, map);
    case "extension":
      return owner(decoded);
    default:
      return decoded;
  }
}

/** Anahtardaki rol alanları: `role:<ad>`; `membership:`, `setting:`, `defaultAcl:` JSON dizisi. */
function mapKey(key: string, map: (name: string) => string): string {
  const colon = key.indexOf(":");
  if (colon < 0) return key;
  const kind = key.slice(0, colon);
  const body = key.slice(colon + 1);
  if (kind === "role") return `role:${map(body)}`;
  if (kind === "membership" || kind === "setting" || kind === "defaultAcl") {
    let parts: unknown;
    try {
      parts = JSON.parse(body);
    } catch {
      return key;
    }
    if (!Array.isArray(parts) || !parts.every((part) => typeof part === "string")) return key;
    const mapped =
      kind === "membership"
        ? (parts as string[]).map(map)
        : kind === "setting"
          ? [parts[0], parts[1] === "*" ? "*" : map(parts[1] as string)]
          : [map(parts[0] as string), ...(parts as string[]).slice(1)];
    return `${kind}:${JSON.stringify(mapped)}`;
  }
  return key;
}

function kindOf(key: string): string {
  const colon = key.indexOf(":");
  return colon < 0 ? key : key.slice(0, colon);
}

function localeFields(value: string | undefined): unknown[] | null {
  const decoded = value === undefined ? null : decodeValue(value, "locale");
  return Array.isArray(decoded) ? decoded : null;
}

export function compareForIndependentRestore(
  production: GreatResetReceipt,
  independent: GreatResetReceipt,
  bootstrap: { production: string; independent: string } = {
    production: "postgres",
    independent: "agent",
  },
): { equal: boolean; blocking: string[]; environment: IndependentDifference[] } {
  const blocking: string[] = [];
  const environment: IndependentDifference[] = [];
  const identity = (name: string) => name;
  const toProduction = (name: string) => mapRole(name, bootstrap.independent, bootstrap.production);
  if (!compareReceipts(production, production).equal)
    blocking.push("receipt:production-inconsistent");
  if (!compareReceipts(independent, independent).equal)
    blocking.push("receipt:independent-inconsistent");
  for (const section of ["content", "schema", "schemaNormalized", "sequences"] as const)
    if (production.sections[section] !== independent.sections[section])
      blocking.push(`section:${section}`);
  const tables = new Set([...Object.keys(production.tables), ...Object.keys(independent.tables)]);
  for (const table of [...tables].sort())
    if (sha256(production.tables[table] ?? null) !== sha256(independent.tables[table] ?? null))
      blocking.push(`table:${table}`);
  for (const section of ["sequences", "security", "database"] as const) {
    // İki tarafın anahtarları aynı serileştiriciden geçer (üretimde eşleme yok): jsonb biçimli
    // anahtarlar yeniden kurulurken biçim farkı yanlış ret üretmez.
    const expected: Record<string, string> = {};
    for (const [key, value] of Object.entries(production.details[section] ?? {})) {
      const normalized = mapKey(key, identity);
      if (normalized in expected) blocking.push(`${section}:key-collision:${normalized}`);
      expected[normalized] = value;
    }
    const actual = new Map<string, string>();
    for (const [key, value] of Object.entries(independent.details[section] ?? {})) {
      const mapped = mapKey(key, toProduction);
      // Eşleme sonrası çakışma: ek rol/süper kullanıcı gizlenemez (Astra, PR #239 5. tur P1).
      if (actual.has(mapped)) blocking.push(`${section}:key-collision:${mapped}`);
      actual.set(mapped, value);
    }
    const keys = new Set([...Object.keys(expected), ...actual.keys()]);
    for (const key of [...keys].sort()) {
      const left = expected[key];
      const right = actual.get(key);
      const kind = kindOf(key);
      if (
        left !== undefined &&
        right !== undefined &&
        JSON.stringify(structureValue(kind, left, identity)) ===
          JSON.stringify(structureValue(kind, right, toProduction))
      )
        continue;
      if (
        section === "database" &&
        key === "comment" &&
        left === "null" &&
        right === JSON.stringify(syntheticMarker)
      ) {
        environment.push({ key: `${section}:${key}`, expected: left, actual: right });
        continue;
      }
      if (section === "database" && key === "locale") {
        const a = localeFields(left);
        const b = localeFields(right);
        // Katı alanlar: encoding (0), bağlantı sınırı (6), şablon (7), tablespace (8).
        if (
          a &&
          b &&
          a.length === 9 &&
          b.length === 9 &&
          [0, 6, 7, 8].every((i) => a[i] === b[i])
        ) {
          environment.push({
            key: `${section}:${key}`,
            expected: left ?? null,
            actual: right ?? null,
          });
          continue;
        }
      }
      blocking.push(`${section}:${key}`);
    }
  }
  return { equal: blocking.length === 0, blocking: [...new Set(blocking)].sort(), environment };
}

/*
  Canlı DB ↔ restore edilmiş kopya karşılaştırması (A5 dersi, 23 Eylül; reset kapısında 27 Eylül
  yeniden ölçüldü): PostgreSQL restore'da CHECK ve indeks ifadelerini anlamca aynı ama yazımca farklı
  üretir (iç içe AND düzleşir, dizi dönüşümleri yeniden yazılır). Bu yüzden yalnız HAM şema özeti
  karşılaştırılmaz; bu iki bilinen yazım farkını kanonikleştiren `schemaNormalized` bölümü (extension
  üye tanımları dahil bütün diğer şema bilgisiyle) birebir eşit olmalıdır (Astra, PR #239 3. tur
  P1). Arşiv şema betiği = canlı şema dökümü (A5 yöntemi) ek kanıttır.
  İki restore edilmiş kopya arasında (üretim scratch'i ↔ operatör) şema bölümü kararlıdır.
*/
export function compareLiveWithRestored(
  live: GreatResetReceipt,
  restored: GreatResetReceipt,
): { equal: boolean; sections: ReceiptSection[]; tables: string[]; unexpected: string[] } {
  const result = compareReceipts(live, restored);
  const consistent = compareReceipts(live, live).equal && compareReceipts(restored, restored).equal;
  const sections = result.sections.filter((section) => section !== "schema");
  const unexpected = result.differences.map((item) => `${item.section}:${item.key}`);
  return {
    equal:
      consistent && sections.length === 0 && result.tables.length === 0 && unexpected.length === 0,
    sections,
    tables: result.tables,
    unexpected,
  };
}

/*
  Geri dönüş gölgesi (runbook "COMMIT sonrası kabul hatası"): gölge işaretlendikten sonra (geçerli
  niyetlere yalnız `invalidatedAt`, tek restore audit'i) reset öncesi canlı makbuzla karşılaştırılır.
  Canlı ↔ restore kuralına ek olarak içerik farkına YALNIZ bu iki tabloda izin verilir; iki
  değişikliğin kendisi `verifyRestored` ile birebir doğrulanır.
*/
export const shadowMarkedTables = ["audit_logs", "great_reset_intents"] as const;
export type ShadowMarkedDigests = Record<(typeof shadowMarkedTables)[number], TableDigest>;

export function compareShadowWithPreReset(
  preReset: GreatResetReceipt,
  shadow: GreatResetReceipt,
  marked: ShadowMarkedDigests,
): { equal: boolean; sections: ReceiptSection[]; tables: string[]; unexpected: string[] } {
  const result = compareLiveWithRestored(preReset, shadow);
  // İşaretli iki tablo pre-reset'ten farklı olabilir, ama yalnız işaret transaction'ının içinde
  // (dar delta kanıtıyla) ölçülen özete birebir eşit olarak (Astra, PR #242 P1): işaretten sonra
  // bu tablolara yazılan hiçbir şey muaf değildir.
  const tables = [
    ...result.tables.filter((table) => !(shadowMarkedTables as readonly string[]).includes(table)),
    ...shadowMarkedTables.filter(
      (table) =>
        !/^[0-9a-f]{64}$/u.test(marked?.[table]?.sha256 ?? "") ||
        !Number.isInteger(marked[table].rows) ||
        shadow.tables[table]?.rows !== marked[table].rows ||
        shadow.tables[table]?.sha256 !== marked[table].sha256,
    ),
  ];
  const sections = result.sections.filter(
    (section) => !(section === "content" && tables.length === 0),
  );
  const consistent =
    compareReceipts(preReset, preReset).equal && compareReceipts(shadow, shadow).equal;
  return {
    equal:
      consistent && sections.length === 0 && tables.length === 0 && result.unexpected.length === 0,
    sections,
    tables,
    unexpected: result.unexpected,
  };
}

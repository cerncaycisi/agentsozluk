import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { greatResetInspection, type ResetTable } from "./great-reset";

type Tx = Prisma.TransactionClient;
export type ResetContentManifest = {
  formatVersion: 1;
  tables: Record<string, { rows: number; sha256: string }>;
  sequences: { name: string; value: string }[];
  metadataSha256: string;
  metadataParts: Record<string, string>;
  sha256: string;
};

/** Restore eşliği: ctid/xmin yok; tam satırlar yalnız DB içinde hash'lenir. */
export async function resetContentManifest(
  tx: Tx,
  list: ResetTable[],
): Promise<ResetContentManifest> {
  await tx.$executeRaw`SET LOCAL timezone = 'UTC'`;
  await tx.$executeRaw`SET LOCAL extra_float_digits = 3`;
  await tx.$executeRaw`SET LOCAL DateStyle = 'ISO, YMD'`;
  await tx.$executeRaw`SET LOCAL bytea_output = 'hex'`;
  await tx.$executeRaw`SET LOCAL row_security = off`;
  const contents: ResetContentManifest["tables"] = {};
  for (const table of [...list.map((row) => row.table), "_prisma_migrations"].sort()) {
    const [row] = await tx.$queryRaw<{ rows: number; sha256: string }[]>(Prisma.sql`
      WITH hashes AS MATERIALIZED (
        SELECT encode(sha256(convert_to(to_jsonb(t)::text, 'UTF8')), 'hex') AS value
        FROM ${greatResetInspection.tableSql(table)} t
      ) SELECT count(*)::int AS rows,
        encode(sha256(convert_to(coalesce(string_agg(value, E'\n' ORDER BY value COLLATE "C"), ''), 'UTF8')), 'hex') AS sha256
        FROM hashes`);
    if (!row) throw new Error("GREAT_RESET_MANIFEST_FAILED");
    contents[table] = row;
  }
  // OID, DB adı ve datallowconn restore ortamının kimlik kapısında doğrulanır;
  // nesne adları, owner/ACL/rol/config ise restore karşılaştırmasının içindedir.
  const [metadata] = await tx.$queryRaw<{ sha256: string; parts: Record<string, string> }[]>`
    WITH metadata AS (SELECT jsonb_build_object(
      'database', (SELECT jsonb_build_object('owner', pg_get_userbyid(datdba),
        'encoding', pg_encoding_to_char(encoding), 'collation', datcollate, 'ctype', datctype,
        'localeProvider', datlocprovider, 'icuLocale', daticulocale, 'collationVersion', datcollversion,
        'acl', datacl::text, 'connectionLimit', datconnlimit,
        'comment', shobj_description(oid, 'pg_database')) FROM pg_database WHERE datname=current_database()),
      'settings', (SELECT jsonb_agg(jsonb_build_array(coalesce(r.rolname, '*'), s.setconfig)
        ORDER BY coalesce(r.rolname, '*')) FROM pg_db_role_setting s LEFT JOIN pg_roles r ON r.oid=s.setrole
        WHERE s.setdatabase=(SELECT oid FROM pg_database WHERE datname=current_database())),
      'schemas', (SELECT jsonb_agg(jsonb_build_array(n.nspname, pg_get_userbyid(n.nspowner), n.nspacl::text)
        ORDER BY n.nspname) FROM pg_namespace n WHERE n.nspname='public'),
      'columns', (SELECT jsonb_agg(to_jsonb(c)-ARRAY['table_catalog','udt_catalog','domain_catalog']
        ORDER BY table_name COLLATE "C",ordinal_position) FROM information_schema.columns c WHERE table_schema='public'),
      'relations', (SELECT jsonb_agg(jsonb_build_array(c.relname,c.relkind,c.relpersistence,
        pg_get_userbyid(c.relowner),c.relacl::text,c.reloptions,c.relrowsecurity,c.relforcerowsecurity,
        c.relreplident, obj_description(c.oid,'pg_class')) ORDER BY c.relname COLLATE "C")
        FROM pg_class c WHERE c.relnamespace='public'::regnamespace),
      'constraints', (SELECT jsonb_agg(jsonb_build_array(c.relname,x.conname,x.contype,
        pg_get_constraintdef(x.oid),x.convalidated,x.condeferrable,x.condeferred)
        ORDER BY c.relname COLLATE "C",x.conname COLLATE "C") FROM pg_constraint x
        JOIN pg_class c ON c.oid=x.conrelid WHERE x.connamespace='public'::regnamespace),
      'indexes', (SELECT jsonb_agg(jsonb_build_array(c.relname,pg_get_indexdef(i.indexrelid),
        i.indisvalid,i.indisready,i.indisunique,i.indisprimary) ORDER BY c.relname COLLATE "C")
        FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relnamespace='public'::regnamespace),
      'triggers', (SELECT jsonb_agg(jsonb_build_array(c.relname,t.tgname,pg_get_triggerdef(t.oid),
        t.tgenabled,pg_get_functiondef(t.tgfoid)) ORDER BY c.relname COLLATE "C",t.tgname COLLATE "C")
        FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace='public'::regnamespace),
      'rules', (SELECT jsonb_agg(jsonb_build_array(c.relname,r.rulename,pg_get_ruledef(r.oid),r.ev_enabled)
        ORDER BY c.relname COLLATE "C",r.rulename COLLATE "C") FROM pg_rewrite r JOIN pg_class c ON c.oid=r.ev_class
        WHERE c.relnamespace='public'::regnamespace),
      'functions', (SELECT jsonb_agg(jsonb_build_array(p.proname,pg_get_function_identity_arguments(p.oid),
        pg_get_functiondef(p.oid),pg_get_userbyid(p.proowner),p.proacl::text,p.proconfig,p.prosecdef)
        ORDER BY p.proname COLLATE "C",pg_get_function_identity_arguments(p.oid) COLLATE "C")
        FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind IN ('f','p')),
      'enums', (SELECT jsonb_agg(jsonb_build_array(t.typname,e.enumlabel,e.enumsortorder,pg_get_userbyid(t.typowner))
        ORDER BY t.typname COLLATE "C",e.enumsortorder) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
        WHERE t.typnamespace='public'::regnamespace),
      'extensions', (SELECT jsonb_agg(jsonb_build_array(e.extname,e.extversion,pg_get_userbyid(e.extowner),n.nspname,e.extrelocatable)
        ORDER BY e.extname COLLATE "C") FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace),
      'roles', (SELECT jsonb_agg(to_jsonb(r)-'oid' ORDER BY r.rolname COLLATE "C") FROM pg_roles r
        WHERE r.rolname NOT LIKE 'pg_%'),
      'memberships', (SELECT jsonb_agg(jsonb_build_array(a.rolname,b.rolname,g.rolname,m.admin_option,m.inherit_option,m.set_option)
        ORDER BY a.rolname COLLATE "C",b.rolname COLLATE "C",g.rolname COLLATE "C") FROM pg_auth_members m
        JOIN pg_roles a ON a.oid=m.roleid JOIN pg_roles b ON b.oid=m.member JOIN pg_roles g ON g.oid=m.grantor),
      'defaultPrivileges', (SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(d.defaclrole),n.nspname,d.defaclobjtype,d.defaclacl::text)
        ORDER BY pg_get_userbyid(d.defaclrole) COLLATE "C",n.nspname COLLATE "C",d.defaclobjtype)
        FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace)
    ) AS value)
    SELECT encode(sha256(convert_to(value::text, 'UTF8')), 'hex') AS sha256,
      (SELECT jsonb_object_agg(key,encode(sha256(convert_to(part::text,'UTF8')),'hex'))
       FROM jsonb_each(metadata.value) AS component(key,part)) AS parts FROM metadata`;
  if (!metadata) throw new Error("GREAT_RESET_MANIFEST_FAILED");
  const state = await greatResetInspection.snapshot(tx, []);
  const value = {
    formatVersion: 1 as const,
    tables: contents,
    sequences: state.sequences,
    metadataSha256: metadata.sha256,
    metadataParts: metadata.parts,
  };
  return { ...value, sha256: createHash("sha256").update(JSON.stringify(value)).digest("hex") };
}

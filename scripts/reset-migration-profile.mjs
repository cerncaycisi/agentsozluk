// Yalnız reset-2026-v1 exact migration paketinin iki public ID dönüşümü.
// Diğer içerik/katalog farkları normalleştirilmez; post katalog ayrı exact kapıdır.
const tables = ["entries", "topics"];
const sequenceNames = tables.map((table) => `${table}_public_id_seq`);
export function normalizeResetMigrationSchema(input) {
  const lines = input.split("\n");
  const output = [];
  const seen = new Set();
  for (let i = 0; i < lines.length; i++) {
    const table = tables.find((name) => lines[i] === `CREATE TABLE public.${name} (`);
    if (table) {
      if (seen.has(`table:${table}`)) throw new Error("REVIEWED_RESET_DUPLICATE_OBJECT");
      seen.add(`table:${table}`);
      output.push(lines[i]);
      const body = [];
      let publicId = null,
        range = false;
      while (++i < lines.length && lines[i] !== ");") {
        const line = lines[i];
        if (line.startsWith('    "publicId" ')) {
          const match = line.match(/^    "publicId" (integer|bigint) NOT NULL(,?)$/u);
          if (!match || publicId) throw new Error("REVIEWED_RESET_COLUMN_MISMATCH");
          publicId = match[1];
          body.push(`    "publicId" integer NOT NULL${match[2]}`);
        } else if (line.includes(`${table}_public_id_legacy_range`)) {
          const wanted = `    CONSTRAINT ${table}_public_id_legacy_range CHECK ((("publicId" >= 1) AND ("publicId" <= 2147483647)))`;
          if (range || (line !== wanted && line !== wanted + ","))
            throw new Error("REVIEWED_RESET_RANGE_MISMATCH");
          range = true;
        } else body.push(line);
      }
      if (i === lines.length || !publicId || (publicId === "bigint") !== range)
        throw new Error("REVIEWED_RESET_PARTIAL_CONVERSION");
      if (body.at(-1)?.endsWith(",")) {
        if (!range) throw new Error("REVIEWED_RESET_SCHEMA_UNREADABLE");
        body[body.length - 1] = body.at(-1).slice(0, -1);
      }
      output.push(...body, ");");
      continue;
    }
    const sequence = sequenceNames.find((name) => lines[i] === `CREATE SEQUENCE public.${name}`);
    if (sequence) {
      if (seen.has(`sequence:${sequence}`)) throw new Error("REVIEWED_RESET_DUPLICATE_OBJECT");
      seen.add(`sequence:${sequence}`);
      output.push(lines[i], "    AS integer");
      let typeSeen = false,
        maxSeen = false,
        ended = false;
      while (++i < lines.length) {
        const line = lines[i];
        if (line.startsWith("    AS ")) {
          if (typeSeen || !["    AS integer", "    AS bigint"].includes(line))
            throw new Error("REVIEWED_RESET_SEQUENCE_MISMATCH");
          typeSeen = true;
        } else if (/^    (NO MAXVALUE|MAXVALUE )/u.test(line)) {
          if (maxSeen || !["    NO MAXVALUE", "    MAXVALUE 2147483647"].includes(line))
            throw new Error("REVIEWED_RESET_SEQUENCE_MISMATCH");
          maxSeen = true;
          output.push("    NO MAXVALUE");
        } else {
          output.push(line);
        }
        if (line.endsWith(";")) {
          ended = true;
          break;
        }
      }
      if (!ended || !maxSeen) throw new Error("REVIEWED_RESET_SEQUENCE_MISMATCH");
      continue;
    }
    output.push(lines[i]);
  }
  return output.join("\n");
}
export function normalizeResetMigrationFingerprint(input) {
  return input
    .split("\n")
    .map((line) => {
      if (!sequenceNames.some((name) => line.startsWith(`seqdef:${name}|`))) return line;
      const fields = line.split("|");
      if (fields.length !== 7 || !["integer", "bigint"].includes(fields[1]))
        throw new Error("REVIEWED_RESET_SEQUENCE_MISMATCH");
      fields[1] = "integer";
      return fields.join("|");
    })
    .join("\n");
}
export function assertResetMigrationPreconditions(actual) {
  const expectedColumns = tables.map((table) => ({
    table,
    type: "integer",
    notNull: true,
    default: `nextval('${table}_public_id_seq'::regclass)`,
    ownerMatches: true,
    legacyRangeCount: 0,
    invalidRows: 0,
  }));
  const expectedSequences = tables.map((table) => ({
    name: `${table}_public_id_seq`,
    type: "integer",
    start: "1",
    min: "1",
    max: "2147483647",
    increment: "1",
    cycle: false,
    cache: "1",
    persistence: "p",
    ownerMatches: true,
    ownedByTable: table,
    ownedByColumn: "publicId",
    dependency: "a",
  }));
  const canonical = (value) =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, canonical(value[key])]),
          )
        : value;
  const expected = {
    columns: expectedColumns,
    sequences: expectedSequences,
    journalsPresent: 0,
    journalFunctionsPresent: 0,
  };
  if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected)))
    throw new Error("REVIEWED_RESET_PRECONDITIONS_FAILED");
}

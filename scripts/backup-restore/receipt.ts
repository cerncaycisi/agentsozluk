/** O3 makbuz karşılaştırması: DB bağlantısı veya mutasyon yapmaz. */
export function compareBackupRestore(metadata: string, restored: string) {
  const expected = parseReceipt(metadata, false);
  const actual = parseReceipt(restored, true);
  if (expected.version !== actual.version) throw new Error("O3_VERSION_MISMATCH");
  if (!sameMap(expected.tables, actual.tables)) throw new Error("O3_TABLE_MISMATCH");
  if (
    expected.sequences.size !== actual.sequences.size ||
    [...expected.sequences.keys()].some((name) => actual.sequences.get(name) !== "ok")
  )
    throw new Error("O3_SEQUENCE_UNSAFE");
  return {
    result: "O3_DATA_MATCH" as const,
    scope: "public" as const,
    serverVersion: expected.version,
    tables: expected.tables.size,
    rows: [...expected.tables.values()]
      .reduce((total, value) => total + BigInt(value.split("|")[0]!), 0n)
      .toString(),
    sequences: expected.sequences.size,
  };
}

function sameMap(left: Map<string, string>, right: Map<string, string>) {
  return left.size === right.size && [...left].every(([key, value]) => right.get(key) === value);
}

function parseReceipt(input: string, restored: boolean) {
  const invalid = () => {
    throw new Error("O3_RECEIPT_INVALID");
  };
  if (input.length > 1024 * 1024 || input.includes("\r")) invalid();
  const lines = input.trimEnd().split("\n");
  const markers = restored
    ? ["RESTORE_BEGIN", "RESTORE_DONE"]
    : ["SNAPSHOT_OK", "DUMP_DONE", "META_DONE"];
  const found: string[] = [];
  const tables = new Map<string, string>();
  const sequences = new Map<string, string>();
  let version: string | undefined;
  const insert = (map: Map<string, string>, name: string, value: string) => {
    if (map.has(name)) invalid();
    map.set(name, value);
  };
  for (const line of lines) {
    if (markers.includes(line)) {
      found.push(line);
      continue;
    }
    const parts = line.split("|");
    if (
      parts[0] === "server_version" &&
      parts.length === 2 &&
      /^16\.[0-9]+(?: .*|$)/u.test(parts[1]!)
    ) {
      if (version !== undefined) invalid();
      version = parts[1];
      continue;
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(parts[1] ?? "")) invalid();
    if (
      parts[0] === "table" &&
      parts.length === 4 &&
      /^(0|[1-9][0-9]*)$/u.test(parts[2]!) &&
      /^(0|-?[1-9][0-9]*)$/u.test(parts[3]!)
    ) {
      insert(tables, parts[1]!, `${parts[2]}|${parts[3]}`);
    } else if (
      parts.length === 3 &&
      (restored
        ? parts[0] === "seqsafe" && /^(ok|bad)$/u.test(parts[2]!)
        : parts[0] === "sequence" && /^(null|0|-?[1-9][0-9]*)$/u.test(parts[2]!))
    ) {
      insert(sequences, parts[1]!, parts[2]!);
    } else invalid();
  }
  if (found.join("|") !== markers.join("|") || !version || tables.size === 0) invalid();
  if (lines[0] !== markers[0] || lines.at(-1) !== markers.at(-1)) invalid();
  return { version, tables, sequences };
}

#!/usr/bin/env node
/*
  Yalnız ek yapan migration denetçisi (A5, docs/PLAN.md).

  Migration'lı dağıtım yolu bir migration'ı ancak bu denetimden geçerse uygular.
  Kural bir İZİN listesidir, yasak sözcük listesi değil: her ifade aşağıdaki
  biçimlerden birine birebir uymalı, uymayan ya da ayrıştırılamayan her şey
  reddedilir (Sol, 22 Eylül). İzinli biçimler:

  - CREATE TYPE "ad" AS ENUM ('a', 'b', ...)
  - CREATE TABLE "ad" ( sütunlar ve kısıtlar )  — düz biçim; AS, PARTITION OF,
    INHERITS, LIKE, OF, IF NOT EXISTS, TEMP/UNLOGGED ve sondaki her ek reddedilir.
  - CREATE [UNIQUE] INDEX "ad" ON "yeni_tablo" ("sütun", ...)  — ifade/WHERE yok.
  - ALTER TABLE "yeni_tablo" ADD CONSTRAINT "ad" FOREIGN KEY ...  — Prisma'nın
    FK'leri ayrı ifade olarak üretmesi için; tablo aynı migration'da açılmış olmalı.

  İfadelerin içi de izin listesinde: sütun türü, DEFAULT ve CHECK yalnız
  aşağıda sayılanları içerebilir. `CHECK (setval(...))` gibi izinli bir kabuk
  içindeki yan etki böylece geçemez.

  Mevcut tabloya yönelen FK yalnız açık `ON DELETE SET NULL` ya da
  `ON DELETE CASCADE` ve `ON UPDATE CASCADE` ile kabul edilir. SET NULL sütunu
  NOT NULL olamaz; bir CHECK'te yalnız `"sütun" IS NULL` biçiminde geçebilir ve
  o CHECK'te `IS NOT NULL` dışında `NOT` bulunamaz. Bu gramerde AND/OR üç
  değerli mantıkta da monotondur: sütunu NULL'a çekmek yalnız `IS NULL`
  atomunu FALSE'tan TRUE'ya çevirir, geçen bir CHECK'i düşüremez. Aksi hâlde
  geri dönüşten sonra eski imajın üst satır silmesi `23514` ile düşerdi.

  Kullanım: node scripts/check-additive-migration.mjs <migration.sql | ->
  Başarıda stdout'a JSON özet yazar ve 0 ile çıkar; aksi hâlde stderr'e
  `MIGRATION_NOT_ADDITIVE line=<n> reason=<kod>` yazar ve 3 ile çıkar.
*/
import { readFileSync } from "node:fs";

class Rejection extends Error {
  constructor(reason, line) {
    super(reason);
    this.reason = reason;
    this.line = line;
  }
}

const OPERATOR_CHARS = new Set([
  "+",
  "-",
  "*",
  "/",
  "<",
  ">",
  "=",
  "~",
  "!",
  "@",
  "#",
  "%",
  "^",
  "&",
  "|",
  "`",
  "?",
]);
const ALLOWED_OPERATORS = new Set(["=", "<>", "<", ">", "<=", ">=", "~"]);
const PUNCTUATION = new Set(["(", ")", ",", ";"]);

function tokenize(sql) {
  const tokens = [];
  let index = 0;
  let line = 1;
  const at = (offset = 0) => sql[index + offset] ?? "";
  const advance = (count = 1) => {
    for (let step = 0; step < count; step += 1) {
      if (sql[index] === "\n") line += 1;
      index += 1;
    }
  };

  while (index < sql.length) {
    const char = at();
    if (/\s/u.test(char)) {
      advance();
      continue;
    }
    if (char === "-" && at(1) === "-") {
      while (index < sql.length && at() !== "\n") advance();
      continue;
    }
    if (char === "/" && at(1) === "*") {
      // PostgreSQL blok yorumları iç içe olabilir.
      const startLine = line;
      let depth = 0;
      do {
        if (at() === "/" && at(1) === "*") {
          depth += 1;
          advance(2);
        } else if (at() === "*" && at(1) === "/") {
          depth -= 1;
          advance(2);
        } else if (index >= sql.length) {
          throw new Rejection("UNTERMINATED_COMMENT", startLine);
        } else {
          advance();
        }
      } while (depth > 0);
      continue;
    }
    if (char === "$") throw new Rejection("DOLLAR_QUOTE_OR_PARAMETER", line);
    if (char === "'") {
      const startLine = line;
      advance();
      let value = "";
      for (;;) {
        if (index >= sql.length) throw new Rejection("UNTERMINATED_STRING", startLine);
        if (at() === "'" && at(1) === "'") {
          value += "'";
          advance(2);
        } else if (at() === "'") {
          advance();
          break;
        } else {
          value += at();
          advance();
        }
      }
      // Bitişik iki dize PostgreSQL'de yalnız araya satır sonu girerse birleşir;
      // belirsizlik yerine reddet.
      if (at() === "'") throw new Rejection("ADJACENT_STRING", line);
      tokens.push({ kind: "string", value, line: startLine });
      continue;
    }
    if (char === '"') {
      const startLine = line;
      advance();
      let value = "";
      for (;;) {
        if (index >= sql.length) throw new Rejection("UNTERMINATED_IDENTIFIER", startLine);
        if (at() === '"' && at(1) === '"') {
          value += '"';
          advance(2);
        } else if (at() === '"') {
          advance();
          break;
        } else {
          value += at();
          advance();
        }
      }
      if (value === "") throw new Rejection("EMPTY_IDENTIFIER", startLine);
      tokens.push({ kind: "quoted", value, line: startLine });
      continue;
    }
    if (/[0-9]/u.test(char)) {
      const startLine = line;
      let value = "";
      while (/[0-9]/u.test(at())) {
        value += at();
        advance();
      }
      if (/[A-Za-z_.]/u.test(at())) throw new Rejection("UNSUPPORTED_NUMBER", startLine);
      tokens.push({ kind: "number", value, line: startLine });
      continue;
    }
    if (/[A-Za-z_]/u.test(char)) {
      const startLine = line;
      let value = "";
      while (/[A-Za-z0-9_]/u.test(at())) {
        value += at();
        advance();
      }
      // E'..', B'..', X'..', N'..', U&'..' gibi önekli dizeler ve Unicode adlar.
      if (at() === "'" || at() === '"' || at() === "&" || at() === "$") {
        throw new Rejection("PREFIXED_LITERAL", startLine);
      }
      tokens.push({ kind: "word", value: value.toUpperCase(), line: startLine });
      continue;
    }
    if (PUNCTUATION.has(char)) {
      tokens.push({ kind: "punct", value: char, line });
      advance();
      continue;
    }
    if (OPERATOR_CHARS.has(char)) {
      const startLine = line;
      let value = "";
      while (
        OPERATOR_CHARS.has(at()) &&
        !(at() === "-" && at(1) === "-") &&
        !(at() === "/" && at(1) === "*")
      ) {
        value += at();
        advance();
      }
      if (!ALLOWED_OPERATORS.has(value)) throw new Rejection("OPERATOR_NOT_ALLOWED", startLine);
      tokens.push({ kind: "operator", value, line: startLine });
      continue;
    }
    throw new Rejection("CHARACTER_NOT_ALLOWED", line);
  }
  return tokens;
}

function splitStatements(tokens) {
  const statements = [];
  let current = [];
  for (const token of tokens) {
    if (token.kind === "punct" && token.value === ";") {
      if (current.length === 0) throw new Rejection("EMPTY_STATEMENT", token.line);
      statements.push(current);
      current = [];
    } else {
      current.push(token);
    }
  }
  if (current.length > 0) statements.push(current);
  return statements;
}

class Cursor {
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }
  peek(offset = 0) {
    return this.tokens[this.index + offset];
  }
  line() {
    return (this.peek() ?? this.tokens[this.tokens.length - 1])?.line ?? 0;
  }
  fail(reason) {
    throw new Rejection(reason, this.line());
  }
  isWord(value, offset = 0) {
    const token = this.peek(offset);
    return token?.kind === "word" && token.value === value;
  }
  isPunct(value, offset = 0) {
    const token = this.peek(offset);
    return token?.kind === "punct" && token.value === value;
  }
  word(value) {
    if (!this.isWord(value)) this.fail(`EXPECTED_${value}`);
    this.index += 1;
  }
  punct(value) {
    if (!this.isPunct(value)) this.fail("UNEXPECTED_TOKEN");
    this.index += 1;
  }
  quoted() {
    const token = this.peek();
    if (token?.kind !== "quoted") this.fail("EXPECTED_QUOTED_IDENTIFIER");
    this.index += 1;
    return token.value;
  }
  number() {
    const token = this.peek();
    if (token?.kind !== "number") this.fail("EXPECTED_NUMBER");
    this.index += 1;
    return Number(token.value);
  }
  done() {
    if (this.index !== this.tokens.length) this.fail("TRAILING_TOKENS");
  }
  quotedList() {
    const names = [];
    this.punct("(");
    do {
      if (names.length > 0) this.punct(",");
      names.push(this.quoted());
    } while (this.isPunct(","));
    this.punct(")");
    return names;
  }
}

const SIMPLE_TYPES = new Set([
  "UUID",
  "TEXT",
  "INTEGER",
  "INT",
  "BIGINT",
  "SMALLINT",
  "BOOLEAN",
  "JSONB",
]);
const PRECISION_TYPES = new Set(["VARCHAR", "TIMESTAMPTZ", "TIMESTAMP"]);

function parseColumnType(cursor, state) {
  const token = cursor.peek();
  if (token?.kind === "quoted") {
    // Yalnız aynı migration'da açılan enum; mevcut bir türe bağlanmak izin dışı.
    if (!state.types.has(token.value)) cursor.fail("TYPE_NOT_CREATED_IN_MIGRATION");
    cursor.index += 1;
    return;
  }
  if (token?.kind !== "word") cursor.fail("EXPECTED_TYPE");
  cursor.index += 1;
  if (SIMPLE_TYPES.has(token.value)) return;
  if (token.value === "DOUBLE") {
    cursor.word("PRECISION");
    return;
  }
  if (PRECISION_TYPES.has(token.value)) {
    if (cursor.isPunct("(")) {
      cursor.punct("(");
      cursor.number();
      cursor.punct(")");
    } else if (token.value === "VARCHAR") {
      cursor.fail("VARCHAR_WITHOUT_LENGTH");
    }
    return;
  }
  cursor.fail("TYPE_NOT_ALLOWED");
}

function parseDefault(cursor) {
  const token = cursor.peek();
  if (token?.kind === "string" || token?.kind === "number") {
    cursor.index += 1;
    return;
  }
  if (
    token?.kind === "word" &&
    ["TRUE", "FALSE", "NULL", "CURRENT_TIMESTAMP"].includes(token.value)
  ) {
    cursor.index += 1;
    return;
  }
  cursor.fail("DEFAULT_NOT_ALLOWED");
}

const CHECK_KEYWORDS = new Set(["AND", "OR", "NOT", "IS", "NULL", "TRUE", "FALSE"]);
const CHECK_FUNCTIONS = new Set(["LENGTH", "BTRIM"]);

/*
  CHECK gövdesi belirteç düzeyinde sınanır: yalnız tablonun sütunları, sabit,
  izinli işleç, mantık sözcükleri ve `length(` / `btrim(`. Başka her ad (alt
  sorgu, `setval`, `nextval`, `now`, tür dönüşümü) reddedilir. Özet, SET NULL
  kuralı için sütunun nasıl geçtiğini ve çıplak `NOT` bulunup bulunmadığını tutar.
*/
function parseCheckBody(cursor, table) {
  const check = {
    isNullColumns: new Set(),
    isNotNullColumns: new Set(),
    otherColumns: new Set(),
    bareNot: false,
  };
  cursor.punct("(");
  let depth = 1;
  while (depth > 0) {
    const token = cursor.peek();
    if (!token) cursor.fail("UNBALANCED_CHECK");
    const next = cursor.peek(1);
    const previous = cursor.peek(-1);
    if (token.kind === "punct") {
      if (token.value === "(") depth += 1;
      else if (token.value === ")") depth -= 1;
      else if (token.value === ",") {
        // Virgül yalnız izinli bir fonksiyonun argüman listesinde anlamlı.
        if (depth < 2) cursor.fail("COMMA_OUTSIDE_FUNCTION");
      } else cursor.fail("UNEXPECTED_TOKEN");
    } else if (token.kind === "word") {
      // `OR (` gibi mantık sözcüğünden sonra gelen parantez çağrı değildir.
      const isCall = next?.kind === "punct" && next.value === "(";
      if (!CHECK_KEYWORDS.has(token.value)) {
        if (!isCall) cursor.fail("CHECK_WORD_NOT_ALLOWED");
        if (!CHECK_FUNCTIONS.has(token.value)) cursor.fail("FUNCTION_NOT_ALLOWED");
      }
      if (token.value === "NOT" && !(previous?.kind === "word" && previous.value === "IS")) {
        check.bareNot = true;
      }
    } else if (token.kind === "quoted") {
      if (next?.kind === "punct" && next.value === "(") cursor.fail("FUNCTION_NOT_ALLOWED");
      const after = cursor.peek(2);
      const third = cursor.peek(3);
      const isWord = (candidate, value) => candidate?.kind === "word" && candidate.value === value;
      if (isWord(next, "IS") && isWord(after, "NULL")) {
        check.isNullColumns.add(token.value);
      } else if (isWord(next, "IS") && isWord(after, "NOT") && isWord(third, "NULL")) {
        check.isNotNullColumns.add(token.value);
      } else {
        check.otherColumns.add(token.value);
      }
    }
    // string, number, operator: izinli.
    cursor.index += 1;
  }
  table.checks.push(check);
}

function parseForeignKey(cursor, table, state) {
  cursor.word("FOREIGN");
  cursor.word("KEY");
  const columns = cursor.quotedList();
  if (columns.length !== 1) cursor.fail("MULTI_COLUMN_FOREIGN_KEY");
  cursor.word("REFERENCES");
  const referencedTable = cursor.quoted();
  const referencedColumns = cursor.quotedList();
  if (referencedColumns.length !== 1) cursor.fail("MULTI_COLUMN_FOREIGN_KEY");
  cursor.word("ON");
  cursor.word("DELETE");
  let onDelete;
  if (cursor.isWord("SET")) {
    cursor.word("SET");
    cursor.word("NULL");
    onDelete = "SET NULL";
  } else if (cursor.isWord("CASCADE")) {
    cursor.word("CASCADE");
    onDelete = "CASCADE";
  } else {
    cursor.fail("ON_DELETE_NOT_ALLOWED");
  }
  cursor.word("ON");
  cursor.word("UPDATE");
  cursor.word("CASCADE");
  table.foreignKeys.push({
    column: columns[0],
    referencedTable,
    onDelete,
    line: cursor.line(),
    existingTarget: !state.tables.has(referencedTable),
  });
}

function parseTableConstraint(cursor, table, state) {
  if (cursor.isWord("CONSTRAINT")) {
    cursor.word("CONSTRAINT");
    cursor.quoted();
  }
  if (cursor.isWord("CHECK")) {
    cursor.word("CHECK");
    parseCheckBody(cursor, table);
  } else if (cursor.isWord("PRIMARY")) {
    cursor.word("PRIMARY");
    cursor.word("KEY");
    for (const column of cursor.quotedList()) table.primaryKey.add(column);
  } else if (cursor.isWord("UNIQUE")) {
    cursor.word("UNIQUE");
    cursor.quotedList();
  } else if (cursor.isWord("FOREIGN")) {
    parseForeignKey(cursor, table, state);
  } else {
    cursor.fail("TABLE_CONSTRAINT_NOT_ALLOWED");
  }
}

function parseColumn(cursor, table, state) {
  const name = cursor.quoted();
  if (table.columns.has(name)) cursor.fail("DUPLICATE_COLUMN");
  parseColumnType(cursor, state);
  const column = { notNull: false };
  while (!cursor.isPunct(",") && !cursor.isPunct(")")) {
    if (cursor.isWord("NOT")) {
      cursor.word("NOT");
      cursor.word("NULL");
      column.notNull = true;
    } else if (cursor.isWord("NULL")) {
      cursor.word("NULL");
    } else if (cursor.isWord("PRIMARY")) {
      cursor.word("PRIMARY");
      cursor.word("KEY");
      table.primaryKey.add(name);
    } else if (cursor.isWord("UNIQUE")) {
      cursor.word("UNIQUE");
    } else if (cursor.isWord("DEFAULT")) {
      cursor.word("DEFAULT");
      parseDefault(cursor);
    } else if (cursor.isWord("CHECK")) {
      cursor.word("CHECK");
      parseCheckBody(cursor, table);
    } else {
      cursor.fail("COLUMN_CONSTRAINT_NOT_ALLOWED");
    }
  }
  table.columns.set(name, column);
}

function parseCreateTable(cursor, state) {
  cursor.word("CREATE");
  cursor.word("TABLE");
  const name = cursor.quoted();
  if (state.tables.has(name)) cursor.fail("DUPLICATE_TABLE");
  const table = {
    columns: new Map(),
    primaryKey: new Set(),
    checks: [],
    foreignKeys: [],
  };
  state.tables.set(name, table);
  cursor.punct("(");
  for (;;) {
    if (cursor.peek()?.kind === "quoted") parseColumn(cursor, table, state);
    else parseTableConstraint(cursor, table, state);
    if (!cursor.isPunct(",")) break;
    cursor.punct(",");
  }
  cursor.punct(")");
  cursor.done();
  if (table.columns.size === 0) cursor.fail("TABLE_WITHOUT_COLUMNS");
}

function parseCreateType(cursor, state) {
  cursor.word("CREATE");
  cursor.word("TYPE");
  const name = cursor.quoted();
  if (state.types.has(name)) cursor.fail("DUPLICATE_TYPE");
  cursor.word("AS");
  cursor.word("ENUM");
  cursor.punct("(");
  let count = 0;
  do {
    if (count > 0) cursor.punct(",");
    const token = cursor.peek();
    if (token?.kind !== "string") cursor.fail("ENUM_LABEL_NOT_STRING");
    cursor.index += 1;
    count += 1;
  } while (cursor.isPunct(","));
  cursor.punct(")");
  cursor.done();
  state.types.add(name);
}

function parseCreateIndex(cursor, state) {
  cursor.word("CREATE");
  if (cursor.isWord("UNIQUE")) cursor.word("UNIQUE");
  cursor.word("INDEX");
  const name = cursor.quoted();
  cursor.word("ON");
  const tableName = cursor.quoted();
  const table = state.tables.get(tableName);
  if (!table) cursor.fail("INDEX_ON_EXISTING_TABLE");
  for (const column of cursor.quotedList()) {
    if (!table.columns.has(column)) cursor.fail("INDEX_COLUMN_UNKNOWN");
  }
  cursor.done();
  state.indexes.push(name);
}

function parseAlterTableForeignKey(cursor, state) {
  cursor.word("ALTER");
  cursor.word("TABLE");
  const tableName = cursor.quoted();
  const table = state.tables.get(tableName);
  // Mevcut tabloya dokunan her ALTER reddedilir; yalnız bu migration'ın tablosu.
  if (!table) cursor.fail("ALTER_EXISTING_TABLE");
  cursor.word("ADD");
  cursor.word("CONSTRAINT");
  cursor.quoted();
  parseForeignKey(cursor, table, state);
  cursor.done();
}

export function checkAdditiveMigration(sql) {
  const state = { types: new Set(), tables: new Map(), indexes: [] };
  const statements = splitStatements(tokenize(sql));
  if (statements.length === 0) throw new Rejection("EMPTY_MIGRATION", 1);
  for (const statement of statements) {
    const cursor = new Cursor(statement);
    if (cursor.isWord("CREATE") && cursor.isWord("TYPE", 1)) parseCreateType(cursor, state);
    else if (cursor.isWord("CREATE") && cursor.isWord("TABLE", 1)) parseCreateTable(cursor, state);
    else if (
      cursor.isWord("CREATE") &&
      (cursor.isWord("INDEX", 1) || (cursor.isWord("UNIQUE", 1) && cursor.isWord("INDEX", 2)))
    ) {
      parseCreateIndex(cursor, state);
    } else if (cursor.isWord("ALTER") && cursor.isWord("TABLE", 1)) {
      parseAlterTableForeignKey(cursor, state);
    } else {
      cursor.fail("STATEMENT_NOT_ALLOWED");
    }
  }
  for (const [, table] of state.tables) {
    for (const check of table.checks) {
      for (const column of [
        ...check.isNullColumns,
        ...check.isNotNullColumns,
        ...check.otherColumns,
      ]) {
        if (!table.columns.has(column)) throw new Rejection("CHECK_COLUMN_UNKNOWN", 0);
      }
    }
    for (const foreignKey of table.foreignKeys) {
      const column = table.columns.get(foreignKey.column);
      if (!column) throw new Rejection("FOREIGN_KEY_COLUMN_UNKNOWN", foreignKey.line);
      /*
        `ON UPDATE CASCADE` üst anahtar değişince çocuk sütunun DEĞERİNİ değiştirir,
        NULL'lığını değil. Bu yüzden her FK sütunu CHECK'te yalnız NULL sınamasıyla
        anılabilir; `"userId" = 'sabit'` gibi bir değer koşulu güncellemeyi `23514`
        ile düşürürdü (Astra, 23 Eylül).
      */
      for (const check of table.checks) {
        if (check.otherColumns.has(foreignKey.column)) {
          throw new Rejection("FOREIGN_KEY_COLUMN_CONSTRAINED_BY_CHECK", foreignKey.line);
        }
      }
      if (foreignKey.onDelete === "SET NULL") {
        if (column.notNull || table.primaryKey.has(foreignKey.column)) {
          throw new Rejection("SET_NULL_COLUMN_NOT_NULLABLE", foreignKey.line);
        }
        for (const check of table.checks) {
          const appears =
            check.isNullColumns.has(foreignKey.column) ||
            check.isNotNullColumns.has(foreignKey.column);
          if (check.isNotNullColumns.has(foreignKey.column) || (appears && check.bareNot)) {
            throw new Rejection("SET_NULL_COLUMN_CONSTRAINED_BY_CHECK", foreignKey.line);
          }
        }
      }
    }
  }
  return {
    types: [...state.types].sort(),
    tables: [...state.tables.keys()].sort(),
    indexes: [...state.indexes].sort(),
  };
}

function main() {
  const target = process.argv[2];
  if (!target || process.argv.length > 3) {
    process.stderr.write("usage: check-additive-migration.mjs <migration.sql | ->\n");
    process.exit(2);
  }
  const sql = readFileSync(target === "-" ? 0 : target, "utf8");
  try {
    process.stdout.write(`${JSON.stringify(checkAdditiveMigration(sql))}\n`);
  } catch (error) {
    if (error instanceof Rejection) {
      process.stderr.write(`MIGRATION_NOT_ADDITIVE line=${error.line} reason=${error.reason}\n`);
      process.exit(3);
    }
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();

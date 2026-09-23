import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const checker = path.join(root, "scripts/check-additive-migration.mjs");

function check(sql: string): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [checker, "-"], {
      input: sql,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const failure = error as { status: number; stdout: string; stderr: string };
    return { status: failure.status, stdout: failure.stdout, stderr: failure.stderr };
  }
}

function rejectionReason(sql: string): string {
  const result = check(sql);
  expect(result.status, result.stdout).toBe(3);
  const match = /reason=([A-Z_]+)/u.exec(result.stderr);
  return match?.[1] ?? result.stderr;
}

const table = (body: string) =>
  `CREATE TABLE "yeni" (\n  "id" UUID NOT NULL PRIMARY KEY,\n${body}\n);`;

describe("yalnız ek yapan migration denetçisi (A5)", () => {
  it("iletişim migration'ını olduğu gibi kabul eder ve açtığı nesneleri bildirir", () => {
    const sql = readFileSync(
      path.join(root, "prisma/migrations/20260922140000_contact_messages/migration.sql"),
      "utf8",
    );
    const result = check(sql);
    expect(result.status, result.stderr).toBe(0);
    const beklenti = JSON.parse(result.stdout);
    expect(beklenti.types).toEqual({
      ContactMessageKind: ["CONTENT_REMOVAL", "OTHER"],
      ContactMessageStatus: ["OPEN", "HANDLED"],
    });
    expect(beklenti.tables.contact_messages).toMatchObject({
      primaryKey: ["id"],
      checkConstraints: 3,
      uniqueConstraints: 0,
      foreignKeys: [
        { column: "handledById", referencedTable: "users", onDelete: "SET NULL" },
        { column: "submitterId", referencedTable: "users", onDelete: "SET NULL" },
      ],
    });
    expect(beklenti.tables.contact_messages.columns).toHaveLength(13);
    expect(beklenti.existingTableIndexes).toEqual({});
    expect(beklenti.indexes).toEqual({
      contact_messages_status_createdAt_idx: {
        table: "contact_messages",
        unique: false,
        columns: ["status", "createdAt"],
      },
    });
  });

  it("mevcut tabloya benzersiz olmayan düz indeksi kabul eder ve ayrıca bildirir", () => {
    const result = check('CREATE INDEX "agent_runs_finishedAt_idx" ON "agent_runs"("finishedAt");');
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      types: {},
      tables: {},
      indexes: {},
      existingTableIndexes: {
        agent_runs_finishedAt_idx: { table: "agent_runs", unique: false, columns: ["finishedAt"] },
      },
    });
  });

  it("Prisma'nın ayrı ifade olarak ürettiği FK'yi yeni tabloda kabul eder", () => {
    const result = check(
      [
        table('  "userId" UUID'),
        'CREATE UNIQUE INDEX "yeni_userId_key" ON "yeni"("userId");',
        'ALTER TABLE "yeni" ADD CONSTRAINT "yeni_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;',
      ].join("\n"),
    );
    expect(result.status, result.stderr).toBe(0);
  });

  it.each([
    ["mevcut tabloya ALTER", 'ALTER TABLE "users" ADD COLUMN "x" TEXT;', "ALTER_EXISTING_TABLE"],
    ["DROP", 'DROP TABLE "users";', "STATEMENT_NOT_ALLOWED"],
    ["TRUNCATE", 'TRUNCATE "users";', "STATEMENT_NOT_ALLOWED"],
    ["UPDATE", 'UPDATE "users" SET "role" = \'ADMIN\';', "STATEMENT_NOT_ALLOWED"],
    ["DELETE", 'DELETE FROM "users";', "STATEMENT_NOT_ALLOWED"],
    ["INSERT", 'INSERT INTO "users" ("id") VALUES (\'x\');', "STATEMENT_NOT_ALLOWED"],
    ["DO bloğu", "DO $$ BEGIN END $$;", "DOLLAR_QUOTE_OR_PARAMETER"],
    [
      "fonksiyon",
      "CREATE OR REPLACE FUNCTION f() RETURNS int AS 'select 1' LANGUAGE sql;",
      "STATEMENT_NOT_ALLOWED",
    ],
    [
      "trigger",
      'CREATE TRIGGER "t" BEFORE DELETE ON "users" FOR EACH ROW EXECUTE FUNCTION f();',
      "STATEMENT_NOT_ALLOWED",
    ],
    [
      "mevcut tabloya UNIQUE indeks",
      'CREATE UNIQUE INDEX "i" ON "users"("id");',
      "UNIQUE_INDEX_ON_EXISTING_TABLE",
    ],
    [
      "mevcut tabloya ifade indeksi",
      'CREATE INDEX "i" ON "users"(lower("email"));',
      "EXPECTED_QUOTED_IDENTIFIER",
    ],
    [
      "mevcut tabloya kısmi indeks",
      'CREATE INDEX "i" ON "users"("id") WHERE "id" IS NOT NULL;',
      "TRAILING_TOKENS",
    ],
    [
      "tür + mevcut tabloya indeks, yeni tablo yok",
      'CREATE TYPE "t" AS ENUM (\'a\');\nCREATE INDEX "i" ON "users"("id");',
      "TYPES_WITHOUT_TABLE",
    ],
    ["CREATE TABLE AS", 'CREATE TABLE "k" AS SELECT 1;', "UNEXPECTED_TOKEN"],
    ["TEMP tablo", 'CREATE TEMP TABLE "k" ("id" UUID);', "STATEMENT_NOT_ALLOWED"],
    ["IF NOT EXISTS", 'CREATE TABLE IF NOT EXISTS "k" ("id" UUID);', "EXPECTED_QUOTED_IDENTIFIER"],
    ["INHERITS", 'CREATE TABLE "k" ("id" UUID) INHERITS ("users");', "TRAILING_TOKENS"],
    [
      "PARTITION OF",
      'CREATE TABLE "k" PARTITION OF "users" FOR VALUES IN (1);',
      "UNEXPECTED_TOKEN",
    ],
    ["LIKE", 'CREATE TABLE "k" (LIKE "users");', "TABLE_CONSTRAINT_NOT_ALLOWED"],
    ["SERIAL sütun", table('  "n" SERIAL'), "TYPE_NOT_ALLOWED"],
    ["dizi türü", table('  "n" TEXT[]'), "CHARACTER_NOT_ALLOWED"],
    ["mevcut enum türü", table('  "r" "UserRole"'), "TYPE_NOT_CREATED_IN_MIGRATION"],
    [
      "GENERATED sütun",
      table('  "n" INTEGER GENERATED ALWAYS AS (1) STORED'),
      "COLUMN_CONSTRAINT_NOT_ALLOWED",
    ],
    [
      "DEFAULT içinde nextval",
      table("  \"n\" BIGINT DEFAULT nextval('topics_public_id_seq')"),
      "DEFAULT_NOT_ALLOWED",
    ],
    ["DEFAULT içinde now()", table('  "t" TIMESTAMPTZ(3) DEFAULT now()'), "DEFAULT_NOT_ALLOWED"],
    [
      "CHECK içinde setval",
      table("  \"g\" BIGINT CHECK (setval('topics_public_id_seq', 1, false) > 0)"),
      "FUNCTION_NOT_ALLOWED",
    ],
    [
      "CHECK içinde alt sorgu",
      table('  "g" BIGINT CHECK ((SELECT 1) = 1)'),
      "CHECK_WORD_NOT_ALLOWED",
    ],
    [
      "CHECK içinde tür dönüşümü",
      table('  "g" TEXT CHECK ("g"::int > 0)'),
      "CHARACTER_NOT_ALLOWED",
    ],
    ["tırnaklı fonksiyon", table('  "g" TEXT CHECK ("f"("g") > 0)'), "FUNCTION_NOT_ALLOWED"],
    ["izinsiz işleç", table('  "g" INTEGER CHECK ("g" + 1 > 0)'), "OPERATOR_NOT_ALLOWED"],
    [
      "ifade indeksi",
      `${table('  "g" TEXT')}\nCREATE INDEX "i" ON "yeni"(lower("g"));`,
      "EXPECTED_QUOTED_IDENTIFIER",
    ],
    [
      "kısmi indeks",
      `${table('  "g" TEXT')}\nCREATE INDEX "i" ON "yeni"("g") WHERE "g" IS NULL;`,
      "TRAILING_TOKENS",
    ],
    [
      "CONCURRENTLY",
      `${table('  "g" TEXT')}\nCREATE INDEX CONCURRENTLY "i" ON "yeni"("g");`,
      "EXPECTED_QUOTED_IDENTIFIER",
    ],
    ["E önekli dize", table("  \"g\" TEXT DEFAULT E'\\\\x'"), "PREFIXED_LITERAL"],
    ["kapanmamış yorum", "/* açık kaldı\nCREATE TYPE \"x\" AS ENUM ('a');", "UNTERMINATED_COMMENT"],
    ["boş migration", "-- yalnız yorum\n", "EMPTY_MIGRATION"],
    // İlk kullanım sözleşmesi: tablo açmayan migration dondurmadan önce reddedilir.
    ["yalnız enum", "CREATE TYPE \"only_enum\" AS ENUM ('a', 'b');", "MIGRATION_WITHOUT_TABLE"],
  ])("%s → reddeder", (_label, sql, reason) => {
    expect(rejectionReason(sql)).toBe(reason);
  });

  it("dize ya da yorum içindeki ; ve anahtar sözcükleri ifade saymaz, ama iç içe yorumu doğru kapatır", () => {
    const sql = [
      "/* dış /* iç */ DROP TABLE hâlâ yorum */",
      "CREATE TYPE \"x\" AS ENUM ('a; DROP TABLE users', 'b -- değil');",
      table('  "d" "x"'),
    ].join("\n");
    expect(check(sql).status).toBe(0);
    expect(rejectionReason("/* dış /* iç */ kapanmadı\nCREATE TYPE \"x\" AS ENUM ('a');")).toBe(
      "UNTERMINATED_COMMENT",
    );
  });

  describe("mevcut tabloya FK", () => {
    const fk = (column: string, onDelete: string, extra = "") =>
      table(
        `  "userId" UUID${column},${extra}\n  CONSTRAINT "f" FOREIGN KEY ("userId") REFERENCES "users"("id") ${onDelete}`,
      );

    it("varsayılan NO ACTION, RESTRICT ve eksik ON UPDATE'i reddeder", () => {
      expect(rejectionReason(fk("", "ON UPDATE CASCADE"))).toBe("EXPECTED_DELETE");
      expect(rejectionReason(fk("", "ON DELETE RESTRICT ON UPDATE CASCADE"))).toBe(
        "ON_DELETE_NOT_ALLOWED",
      );
      expect(rejectionReason(fk("", "ON DELETE NO ACTION ON UPDATE CASCADE"))).toBe(
        "ON_DELETE_NOT_ALLOWED",
      );
      expect(rejectionReason(fk("", "ON DELETE CASCADE"))).toBe("EXPECTED_ON");
    });

    it("NULL sınamasını tersine çeviren ya da ayrıştırılamayan CHECK'i reddeder (Astra, 23 Eylül)", () => {
      const setNull = "ON DELETE SET NULL ON UPDATE CASCADE";
      for (const guard of [
        'CHECK (("userId" IS NULL) = FALSE)',
        'CHECK (("userId" IS NULL) IS FALSE)',
        'CHECK (("userId" IS NULL) IS NOT TRUE)',
      ]) {
        expect(check(fk("", setNull, `\n  ${guard},`)).status, guard).toBe(3);
      }
      expect(rejectionReason(table('  "n" INTEGER CHECK ("n" 1)'))).toBe(
        "CHECK_PREDICATE_INCOMPLETE",
      );
      // Tek sayıda NOT altındaki IS NOT NULL, NULL'a çekilince TRUE'ya döner: güvenli.
      const result = check(
        fk("", setNull, '\n  CHECK (NOT ("userId" IS NOT NULL) OR "id" IS NOT NULL),'),
      );
      expect(result.status, result.stderr).toBe(0);
    });

    it("FK'yi ilk kullanım sözleşmesine daraltır: UUID sütun, id hedefi, sütun başına bir FK", () => {
      expect(
        rejectionReason(
          table(
            '  "ad" VARCHAR(3),\n  CONSTRAINT "f" FOREIGN KEY ("ad") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE',
          ),
        ),
      ).toBe("FOREIGN_KEY_COLUMN_NOT_UUID");
      expect(
        rejectionReason(
          table(
            '  "ad" UUID,\n  CONSTRAINT "f" FOREIGN KEY ("ad") REFERENCES "users"("usernameNormalized") ON DELETE CASCADE ON UPDATE CASCADE',
          ),
        ),
      ).toBe("FOREIGN_KEY_TARGET_NOT_ID");
      expect(
        rejectionReason(
          table(
            '  "u" UUID,\n  CONSTRAINT "f1" FOREIGN KEY ("u") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,\n  CONSTRAINT "f2" FOREIGN KEY ("u") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE',
          ),
        ),
      ).toBe("MULTIPLE_FOREIGN_KEYS_ON_COLUMN");
      // Astra'nın FK zinciri karşı örneği: yeni tablodan yeni tabloya FK yok.
      expect(
        rejectionReason(
          [
            'CREATE TABLE "a5_links" ("id" UUID NOT NULL PRIMARY KEY);',
            'CREATE TABLE "a5_children" ("id" UUID NOT NULL PRIMARY KEY, "linkId" UUID NOT NULL,',
            '  CONSTRAINT "f" FOREIGN KEY ("linkId") REFERENCES "a5_links"("id") ON DELETE CASCADE ON UPDATE CASCADE);',
          ].join("\n"),
        ),
      ).toBe("FOREIGN_KEY_TO_NEW_TABLE");
    });

    it("SET NULL sütunu NOT NULL ise reddeder", () => {
      expect(rejectionReason(fk(" NOT NULL", "ON DELETE SET NULL ON UPDATE CASCADE"))).toBe(
        "SET_NULL_COLUMN_NOT_NULLABLE",
      );
    });

    it("FK sütununa değer koşulu koyan CHECK'i CASCADE'de de reddeder (üst anahtar güncellemesi)", () => {
      // Astra'nın karşı örneği: ON UPDATE CASCADE yeni değeri yazınca bu CHECK 23514 verir.
      expect(
        rejectionReason(
          fk("", "ON DELETE CASCADE ON UPDATE CASCADE", "\n  CHECK (\"userId\" = 'sabit'),"),
        ),
      ).toBe("FOREIGN_KEY_COLUMN_CONSTRAINED_BY_CHECK");
      // NULL'lık güncellemede değişmez: CASCADE FK'de IS NOT NULL güvenli.
      const result = check(
        fk("", "ON DELETE CASCADE ON UPDATE CASCADE", '\n  CHECK ("userId" IS NOT NULL),'),
      );
      expect(result.status, result.stderr).toBe(0);
    });

    it("SET NULL sütununu NULL'a çekmenin düşürebileceği CHECK'i reddeder", () => {
      const setNull = "ON DELETE SET NULL ON UPDATE CASCADE";
      // Sütunun dolu olmasını isteyen her biçim: IS NOT NULL, karşılaştırma, çıplak NOT.
      for (const guard of ['CHECK ("userId" IS NOT NULL)', 'CHECK (NOT ("userId" IS NULL))']) {
        expect(rejectionReason(fk("", setNull, `\n  ${guard},`)), guard).toBe(
          "SET_NULL_COLUMN_CONSTRAINED_BY_CHECK",
        );
      }
    });

    it("sütunu yalnız IS NULL olarak anan CHECK'i kabul eder (iletişim migration'ının biçimi)", () => {
      const result = check(
        fk(
          "",
          "ON DELETE SET NULL ON UPDATE CASCADE",
          '\n  "s" TEXT,\n  CHECK (("s" = \'A\' AND "userId" IS NULL) OR ("s" = \'B\' AND "s" IS NOT NULL)),',
        ),
      );
      expect(result.status, result.stderr).toBe(0);
    });
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { buildSearchQuery, searchRecords } from "@/modules/search/repository/search";

function transactionWithRows(rows: unknown[]) {
  const queryRaw = vi.fn().mockResolvedValue(rows);
  return {
    queryRaw,
    transaction: { $queryRaw: queryRaw } as unknown as Prisma.TransactionClient,
  };
}

describe("search repository", () => {
  it("treats %, _ and backslash as literal query characters", async () => {
    const { queryRaw, transaction } = transactionWithRows([
      {
        type: null,
        id: null,
        title: null,
        snippet: null,
        url: null,
        rank: null,
        totalItems: 0,
      },
    ]);

    await searchRecords(transaction, {
      query: "50%_\\indirim",
      type: "all",
      skip: 0,
      take: 20,
    });

    const sql = queryRaw.mock.calls[0]?.[0] as Prisma.Sql;
    expect(sql.values).toContain("%50\\%\\_\\\\indirim%");
    expect(sql.values).toContain("50\\%\\_\\\\indirim%");
    expect(sql.strings.join("?")).toContain("ESCAPE E'\\\\'");
  });

  it("preserves the exact total when the requested page has no rows", async () => {
    const { transaction } = transactionWithRows([
      {
        type: null,
        id: null,
        title: null,
        snippet: null,
        url: null,
        rank: null,
        totalItems: 7,
      },
    ]);

    await expect(
      searchRecords(transaction, {
        query: "agent",
        type: "all",
        skip: 40,
        take: 20,
      }),
    ).resolves.toEqual({ results: [], totalItems: 7 });
  });

  it.each([
    {
      type: "topics" as const,
      includes: ["FROM topics AS topic", "FROM topic_aliases AS alias"],
      excludes: ["FROM users", "FROM entries AS entry"],
    },
    {
      type: "users" as const,
      includes: ["FROM users"],
      excludes: ["FROM topics AS topic", "FROM topic_aliases AS alias", "FROM entries AS entry"],
    },
    {
      type: "entries" as const,
      includes: ["FROM entries AS entry"],
      excludes: ["FROM users", "FROM topic_aliases AS alias"],
    },
  ])("generates only the $type search branch", ({ type, includes, excludes }) => {
    const query = buildSearchQuery({ query: "agent", type, skip: 0, take: 20 });
    const sql = query.strings.join("?");

    for (const expected of includes) expect(sql).toContain(expected);
    for (const unexpected of excludes) expect(sql).not.toContain(unexpected);
    expect(sql).toContain("set_config('pg_trgm.similarity_threshold', '0.15', true)");
    expect(sql).toContain("% immutable_unaccent(?)");
  });

  it("keeps accent-folded predicates aligned with trigram expression indexes", () => {
    const migration = readFileSync(
      path.join(
        process.cwd(),
        "prisma/migrations/20260717150000_search_expression_indexes/migration.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("CREATE FUNCTION immutable_unaccent(text)");
    expect(migration.match(/immutable_unaccent\([^\n]+\) gin_trgm_ops/gu)).toHaveLength(5);
    expect(migration).toContain('immutable_unaccent("normalizedTitle") gin_trgm_ops');
    expect(migration).toContain('immutable_unaccent("normalizedBody") gin_trgm_ops');
  });
});

import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  emptySearchSuggestions,
  publicUsernameFromProfileUrl,
  SEARCH_SUGGESTION_LIMIT,
  toTopicSuggestions,
  toUserSuggestions,
  type SuggestionSourceRow,
} from "@/modules/search/domain/suggestions";
import { normalizeSuggestQuery, searchSuggestions } from "@/modules/search/application/suggest";
import { buildSearchQuery } from "@/modules/search/repository/search";

function topicRow(index: number): SuggestionSourceRow {
  return { type: "topic", title: `başlık ${index}`, url: `/baslik/baslik-${index}--${index}` };
}

function userRow(username: string): SuggestionSourceRow {
  return { type: "user", title: `Görünen ${username}`, url: `/yazar/${username}` };
}

describe("search suggestion domain", () => {
  it("keeps at most eight topics and drops non-topic rows", () => {
    const rows = [
      ...Array.from({ length: 12 }, (_, index) => topicRow(index)),
      userRow("kullanici"),
      { type: "entry" as const, title: "entry başlığı", url: "/entry/7" },
    ];

    const topics = toTopicSuggestions(rows);

    expect(SEARCH_SUGGESTION_LIMIT).toBe(8);
    expect(topics).toHaveLength(8);
    expect(topics[0]).toEqual({ title: "başlık 0", url: "/baslik/baslik-0--0" });
    expect(topics.every((topic) => topic.url.startsWith("/baslik/"))).toBe(true);
  });

  it("keeps at most eight users and exposes only the public profile handle", () => {
    const rows = [
      ...Array.from({ length: 11 }, (_, index) => userRow(`yazar${index}`)),
      topicRow(1),
    ];

    const users = toUserSuggestions(rows);

    expect(users).toHaveLength(8);
    expect(users[0]).toEqual({ username: "yazar0", url: "/yazar/yazar0" });
    expect(users.some((user) => "title" in user)).toBe(false);
  });

  it("decodes percent-encoded profile segments and rejects unexpected shapes", () => {
    expect(publicUsernameFromProfileUrl("/yazar/a%C3%A7%C4%B1k")).toBe("açık");
    expect(publicUsernameFromProfileUrl("/yazar/")).toBeNull();
    expect(publicUsernameFromProfileUrl("/yazar/a/b")).toBeNull();
    expect(publicUsernameFromProfileUrl("/baslik/bir-baslik--3")).toBeNull();
    expect(publicUsernameFromProfileUrl("https://example.test/yazar/kullanici")).toBeNull();
    expect(publicUsernameFromProfileUrl("/yazar/%E0%A4%A")).toBe("%E0%A4%A");
  });

  it("drops user rows whose url is not a profile url", () => {
    expect(toUserSuggestions([{ type: "user", title: "Bozuk", url: "/entry/9" }])).toEqual([]);
  });

  it("starts from an empty suggestion payload", () => {
    expect(emptySearchSuggestions()).toEqual({ topics: [], users: [] });
  });
});

describe("search suggestion query normalization", () => {
  it("normalizes like the search page and truncates to one hundred characters", () => {
    expect(normalizeSuggestQuery("  AÇIK   Kaynak  ")).toBe("açık kaynak");
    expect(normalizeSuggestQuery("A".repeat(140))).toHaveLength(100);
    expect([...normalizeSuggestQuery("😀".repeat(120))].length).toBeLessThanOrEqual(100);
  });
});

describe("search suggestion repository mode", () => {
  it("restricts suggested authors to active accounts without changing normal search", () => {
    const suggestSql = buildSearchQuery({
      query: "yaz",
      type: "users",
      skip: 0,
      take: 8,
      suggest: true,
    }).strings.join("?");
    const searchSql = buildSearchQuery({
      query: "yaz",
      type: "users",
      skip: 0,
      take: 20,
    }).strings.join("?");

    expect(suggestSql).toContain("users.status = 'ACTIVE'");
    expect(suggestSql).not.toContain("users.status <> 'DEACTIVATED'");
    expect(searchSql).toContain("users.status <> 'DEACTIVATED'");
    expect(searchSql).not.toContain("users.status = 'ACTIVE'");
  });

  it("never reaches entries or hidden topics in suggestion mode", () => {
    const topicSql = buildSearchQuery({
      query: "yaz",
      type: "topics",
      skip: 0,
      take: 8,
      suggest: true,
    }).strings.join("?");

    expect(topicSql).toContain("topic.status = 'ACTIVE'");
    expect(topicSql).not.toContain("FROM entries AS entry");
    expect(topicSql).not.toContain("FROM users");
  });
});

describe("search suggestion service", () => {
  function clientReturning(rows: unknown[]) {
    const queryRaw = vi.fn().mockResolvedValue(rows);
    const transaction = { $queryRaw: queryRaw } as unknown as Prisma.TransactionClient;
    const client = {
      $transaction: vi.fn((work: (tx: Prisma.TransactionClient) => unknown) => work(transaction)),
    };
    return { client, queryRaw };
  }

  it("returns an empty payload below two characters without touching the database", async () => {
    const { client, queryRaw } = clientReturning([]);

    await expect(searchSuggestions(client as never, { query: "a" })).resolves.toEqual({
      topics: [],
      users: [],
    });
    expect(queryRaw).not.toHaveBeenCalled();
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it("reuses searchAll with two narrow queries and no entry branch", async () => {
    const { client, queryRaw } = clientReturning([
      {
        type: "topic",
        id: "topic-1",
        title: "açık kaynak",
        snippet: "açık kaynak",
        url: "/baslik/acik-kaynak--1",
        rank: 3000,
        totalItems: 1,
      },
    ]);

    const result = await searchSuggestions(client as never, { query: "  AÇIK  " });

    expect(client.$transaction).toHaveBeenCalledTimes(2);
    const statements = queryRaw.mock.calls.map((call) => (call[0] as Prisma.Sql).strings.join("?"));
    expect(statements).toHaveLength(2);
    expect(statements.some((sql) => sql.includes("FROM topics AS topic"))).toBe(true);
    expect(statements.some((sql) => sql.includes("FROM users"))).toBe(true);
    expect(statements.every((sql) => !sql.includes("FROM entries AS entry"))).toBe(true);
    expect(statements.every((sql) => sql.includes("LIMIT ?"))).toBe(true);
    expect(queryRaw.mock.calls.every((call) => (call[0] as Prisma.Sql).values.includes(8))).toBe(
      true,
    );
    expect(result.topics).toEqual([{ title: "açık kaynak", url: "/baslik/acik-kaynak--1" }]);
  });
});

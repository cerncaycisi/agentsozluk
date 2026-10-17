import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@/lib/db/types";

/*
  Gece hesabının karşılıklı dışlaması (Astra, 17 Ekim, 1. tur): kilit alınamazsa hiçbir şey
  hazırlanmaz, okunmaz ve yazılmaz. Gerçek iki bağlantılı deneme entegrasyon testinde (CI).
*/

const repository = vi.hoisted(() => ({
  calls: [] as string[],
  /** Kilidin kaç deneme boyunca başkasında kalacağı. */
  lockedFor: 0,
  transactionOptions: [] as unknown[],
}));

vi.mock("@/modules/topics/repository/related-topics", () => {
  const record =
    <T>(name: string, value: T) =>
    async () => {
      repository.calls.push(name);
      return value;
    };
  return {
    tryLockRelatedTopicComputation: async () => {
      repository.calls.push("lock");
      if (repository.lockedFor <= 0) return true;
      repository.lockedFor -= 1;
      return false;
    },
    limitRelatedTopicStatements: record("limit", undefined),
    currentTransactionTime: record("clock", new Date("2026-10-17T03:30:00.000Z")),
    prepareRelatedTopicWorkspace: record("prepare", 0),
    listRelatedTopicWorkspaceTopics: record("topics", []),
    findTitleSignalTop: record("title", []),
    findContentSignalTop: record("content", []),
    listReferenceEntryBodies: record("bodies", []),
    findReferencedTopics: record("referenced", []),
    replaceRelatedTopicLinks: record("replace", 0),
    findRelatedTopicLinks: record("read", []),
  };
});

const { computeRelatedTopicLinks, computeRelatedTopicLinksWithRetry } =
  await import("@/modules/topics/application/related-topics");

const client = {
  $transaction: async (work: (transaction: unknown) => Promise<unknown>, options: unknown) => {
    repository.transactionOptions.push(options);
    return work({});
  },
} as unknown as DatabaseClient;

beforeEach(() => {
  repository.calls = [];
  repository.lockedFor = 0;
  repository.transactionOptions = [];
});

describe("ilgili başlık hesabı kilidi", () => {
  it.each([false, true])(
    "kilit başkasındaysa (uygula=%s) hiçbir adım koşmadan ALREADY_RUNNING döner",
    async (apply) => {
      repository.lockedFor = Number.POSITIVE_INFINITY;
      expect(await computeRelatedTopicLinks(client, { apply })).toEqual({
        status: "ALREADY_RUNNING",
      });
      expect(repository.calls).toEqual(["lock"]);
    },
  );

  it("kilit ilk adımdır; alınınca hesap koşar ve uygula modunda yazar", async () => {
    const result = await computeRelatedTopicLinks(client, { apply: true });
    expect(result.status).toBe("OK");
    expect(repository.calls[0]).toBe("lock");
    expect(repository.calls).toContain("prepare");
    expect(repository.calls.at(-1)).toBe("replace");
  });

  it("liste modunda da kilit alınır ama tabloya yazılmaz", async () => {
    const result = await computeRelatedTopicLinks(client, { apply: false });
    expect(result.status).toBe("OK");
    expect(repository.calls[0]).toBe("lock");
    expect(repository.calls).not.toContain("replace");
  });

  it("hesap tek REPEATABLE READ snapshot'ında koşar", async () => {
    await computeRelatedTopicLinks(client, { apply: false });
    expect(repository.transactionOptions).toEqual([
      expect.objectContaining({ isolationLevel: "RepeatableRead" }),
    ]);
  });
});

describe("ilgili başlık hesabı yeniden denemesi", () => {
  it("uygula modunda kilit boşalınca bekleyip yeniden dener ve yazar", async () => {
    repository.lockedFor = 2;
    const waits: number[] = [];
    const outcome = await computeRelatedTopicLinksWithRetry(
      client,
      { apply: true },
      { sleep: async (milliseconds) => void waits.push(milliseconds) },
    );
    expect(outcome.result.status).toBe("OK");
    expect(outcome.attempts).toBe(3);
    expect(waits).toEqual([60_000, 60_000]);
    expect(repository.calls.at(-1)).toBe("replace");
  });

  it("uygula modunda 10 yeniden denemeden sonra ALREADY_RUNNING döner, hiçbir şey yazmaz", async () => {
    repository.lockedFor = Number.POSITIVE_INFINITY;
    const waits: number[] = [];
    const outcome = await computeRelatedTopicLinksWithRetry(
      client,
      { apply: true },
      { sleep: async (milliseconds) => void waits.push(milliseconds) },
    );
    expect(outcome).toEqual({ result: { status: "ALREADY_RUNNING" }, attempts: 11 });
    expect(waits).toHaveLength(10);
    expect(repository.calls.every((call) => call === "lock")).toBe(true);
  });

  it("liste modu beklemez", async () => {
    repository.lockedFor = Number.POSITIVE_INFINITY;
    const waits: number[] = [];
    const outcome = await computeRelatedTopicLinksWithRetry(
      client,
      { apply: false },
      { sleep: async (milliseconds) => void waits.push(milliseconds) },
    );
    expect(outcome).toEqual({ result: { status: "ALREADY_RUNNING" }, attempts: 1 });
    expect(waits).toEqual([]);
  });
});

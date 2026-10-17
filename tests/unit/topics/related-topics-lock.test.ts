import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@/lib/db/types";

/*
  Gece hesabının karşılıklı dışlaması (Astra, 17 Ekim, 1. tur): kilit alınamazsa hiçbir şey
  hazırlanmaz, okunmaz ve yazılmaz. Gerçek iki bağlantılı deneme entegrasyon testinde (CI).
*/

const repository = vi.hoisted(() => ({
  calls: [] as string[],
  locked: false,
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
      return !repository.locked;
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

const { computeRelatedTopicLinks } = await import("@/modules/topics/application/related-topics");

const client = {
  $transaction: async (work: (transaction: unknown) => Promise<unknown>) => work({}),
} as unknown as DatabaseClient;

beforeEach(() => {
  repository.calls = [];
  repository.locked = false;
});

describe("ilgili başlık hesabı kilidi", () => {
  it.each([false, true])(
    "kilit başkasındaysa (uygula=%s) hiçbir adım koşmadan ALREADY_RUNNING döner",
    async (apply) => {
      repository.locked = true;
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
});

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
  /** Yazım adımında sırayla fırlatılacak hatalar; boşalınca yazım başarılı olur. */
  replaceErrors: [] as unknown[],
  writes: 0,
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
    replaceRelatedTopicLinks: async () => {
      repository.calls.push("replace");
      const error = repository.replaceErrors.shift();
      if (error) throw error;
      repository.writes += 1;
      return 0;
    },
    findRelatedTopicLinks: record("read", []),
  };
});

const {
  computeRelatedTopicLinks,
  computeRelatedTopicLinksWithRetry,
  isRelatedTopicLockHandoffConflict,
  relatedTopicExitCode,
} = await import("@/modules/topics/application/related-topics");

const serializationFailure = () =>
  Object.assign(new Error("write conflict"), { code: "P2034", meta: {} });
const uniqueViolation = () =>
  Object.assign(new Error("unique"), {
    code: "P2002",
    meta: { modelName: "TopicRelatedLink", target: ["topicId", "relatedTopicId"] },
  });

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
  repository.replaceErrors = [];
  repository.writes = 0;
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

describe("kilit devri çatışması (Sol 6.1, 17 Ekim)", () => {
  it("P2034 sonrası bütün hesabı yeni transaction'la yeniden dener ve bir kez yazar", async () => {
    repository.replaceErrors = [serializationFailure()];
    const waits: number[] = [];
    const outcome = await computeRelatedTopicLinksWithRetry(
      client,
      { apply: true },
      { sleep: async (milliseconds) => void waits.push(milliseconds) },
    );
    expect(outcome.result.status).toBe("OK");
    expect(outcome.attempts).toBe(2);
    expect(waits).toEqual([60_000]);
    expect(repository.writes).toBe(1);
    // İkinci deneme de kilitle ve hazırlıkla baştan başlar.
    expect(repository.calls.filter((call) => call === "lock")).toHaveLength(2);
    expect(repository.calls.filter((call) => call === "prepare")).toHaveLength(2);
    expect(repository.transactionOptions).toHaveLength(2);
  });

  it("P2002 sürerse bütçe bitince CONFLICT_RETRY_EXHAUSTED ve çıkış 75; hiç yazmaz", async () => {
    repository.replaceErrors = Array.from({ length: 20 }, uniqueViolation);
    const waits: number[] = [];
    const outcome = await computeRelatedTopicLinksWithRetry(
      client,
      { apply: true },
      { sleep: async (milliseconds) => void waits.push(milliseconds) },
    );
    expect(outcome).toEqual({ result: { status: "CONFLICT_RETRY_EXHAUSTED" }, attempts: 11 });
    expect(waits).toHaveLength(10);
    expect(repository.writes).toBe(0);
    expect(relatedTopicExitCode(outcome.result, true)).toBe(75);
  });

  it("süre bütçesi deneme sayısından önce biterse yeni deneme başlatmaz", async () => {
    repository.replaceErrors = Array.from({ length: 20 }, serializationFailure);
    let clock = 0;
    const outcome = await computeRelatedTopicLinksWithRetry(
      client,
      { apply: true },
      {
        now: () => clock,
        // Her deneme 5 dk sürmüş gibi: 24 dk bütçeye ancak iki yeniden deneme sığar.
        sleep: async (milliseconds) => void (clock += milliseconds + 5 * 60_000),
      },
    );
    expect(outcome.result.status).toBe("CONFLICT_RETRY_EXHAUSTED");
    expect(outcome.attempts).toBe(3);
    expect(repository.writes).toBe(0);
  });

  it("liste modunda ve başka hatalarda yeniden denemez, hatayı yükseltir", async () => {
    repository.replaceErrors = [Object.assign(new Error("başka"), { code: "P2003", meta: {} })];
    await expect(
      computeRelatedTopicLinksWithRetry(client, { apply: true }, { sleep: async () => {} }),
    ).rejects.toMatchObject({ code: "P2003" });
    expect(repository.calls.filter((call) => call === "lock")).toHaveLength(1);
  });

  it("çatışma sınıflandırması yalnız kilit devri hatalarını kapsar", () => {
    expect(isRelatedTopicLockHandoffConflict(serializationFailure())).toBe(true);
    expect(isRelatedTopicLockHandoffConflict(uniqueViolation())).toBe(true);
    expect(
      isRelatedTopicLockHandoffConflict({ code: "P2010", meta: { code: "40001", message: "x" } }),
    ).toBe(true);
    expect(
      isRelatedTopicLockHandoffConflict({
        code: "P2010",
        meta: {
          code: "23505",
          message: 'duplicate key ... "topic_related_links_topicId_relatedTopicId_key"',
        },
      }),
    ).toBe(true);
    expect(isRelatedTopicLockHandoffConflict({ code: "P2002", meta: { modelName: "Entry" } })).toBe(
      false,
    );
    expect(
      isRelatedTopicLockHandoffConflict({
        code: "P2010",
        meta: { code: "23505", message: "users" },
      }),
    ).toBe(false);
    expect(isRelatedTopicLockHandoffConflict(new Error("x"))).toBe(false);
  });

  it("çıkış kodu: başarı 0, liste modunda kilit 0, uygula modunda yazılamadıysa 75", () => {
    expect(relatedTopicExitCode({ status: "ALREADY_RUNNING" }, false)).toBe(0);
    expect(relatedTopicExitCode({ status: "ALREADY_RUNNING" }, true)).toBe(75);
    expect(relatedTopicExitCode({ status: "CONFLICT_RETRY_EXHAUSTED" }, true)).toBe(75);
  });
});

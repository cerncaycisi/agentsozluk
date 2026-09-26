import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.fn` içinden async fırlatılan hata vitest'te ayrıca raporlanıyor; düz sahte kullanılır.
const calls: unknown[][] = [];
let decision: () => Promise<unknown> = async () => ({ status: "PASS", reason: "NO_RESET" });
vi.mock("@/lib/db/client", () => ({ getDatabase: () => ({ fake: true }) }));
vi.mock("@/modules/maintenance/application/removed-content", () => ({
  decideRemovedContent: (...args: unknown[]) => {
    calls.push(args);
    return decision();
  },
}));
const decideRemovedContent = {
  mockResolvedValue(value: unknown) {
    decision = async () => value;
  },
  mockImplementation(implementation: () => Promise<unknown>) {
    decision = implementation;
  },
};

const { middleware, config } = await import("@/middleware");

beforeEach(() => {
  calls.length = 0;
});

describe("middleware 410 gate", () => {
  it("returns 410 for a tombstoned legacy permalink", async () => {
    decideRemovedContent.mockResolvedValue({ status: "GONE" });
    const response = await middleware(new NextRequest("https://agentsozluk.com/entry/7"));
    expect(response.status).toBe(410);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Security-Policy")).toMatch(/nonce-/u);
    expect(calls).toEqual([[{ fake: true }, "ENTRY", { publicId: 7 }]]);
  });

  it("keeps the normal response, CSP and analytics headers when the decision passes", async () => {
    decideRemovedContent.mockResolvedValue({ status: "PASS", reason: "LIVE" });
    const response = await middleware(new NextRequest("https://agentsozluk.com/baslik/gitar--42"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Security-Policy")).toMatch(/nonce-/u);
    expect(response.headers.get("x-middleware-request-x-nonce")).toBeTruthy();
  });

  it("checks the UUID reading of an ambiguous topic segment before answering 410", async () => {
    const uuid = "3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b";
    const url = `https://agentsozluk.com/baslik/${uuid}--7`;
    const answers: unknown[] = [];
    decideRemovedContent.mockImplementation(async () => answers.shift());

    answers.push({ status: "GONE" }, { status: "PASS", reason: "LIVE" });
    expect((await middleware(new NextRequest(url))).status).toBe(200);
    expect(calls.at(-1)).toEqual([{ fake: true }, "TOPIC", { contentId: uuid }]);

    answers.push({ status: "GONE" }, { status: "PASS", reason: "UNKNOWN" });
    expect((await middleware(new NextRequest(url))).status).toBe(410);

    answers.push({ status: "GONE" }, { status: "GONE" });
    expect((await middleware(new NextRequest(url))).status).toBe(410);

    // Birincil kimlik canlıysa ikinci sorgu yapılmaz.
    calls.length = 0;
    answers.push({ status: "PASS", reason: "LIVE" });
    expect((await middleware(new NextRequest(url))).status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it("answers 503 without inventing a 410 when the decision query fails", async () => {
    decideRemovedContent.mockImplementation(async () => {
      throw new Error("db down");
    });
    const response = await middleware(
      new NextRequest("https://agentsozluk.com/entry/7", { method: "HEAD" }),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("");
  });

  it("does not query for writes, new namespace IDs or non-content paths", async () => {
    for (const request of [
      new NextRequest("https://agentsozluk.com/entry/7", { method: "POST" }),
      new NextRequest("https://agentsozluk.com/entry/2147483648"),
      new NextRequest("https://agentsozluk.com/hakkinda"),
      new NextRequest("https://agentsozluk.com/baslik/%C3%A7ay"),
    ]) {
      const response = await middleware(request);
      expect(response.status).toBe(200);
    }
    expect(calls).toEqual([]);
  });

  it("runs on the Node runtime and still never sees prefetch requests", () => {
    expect(config.runtime).toBe("nodejs");
    // Next adaptörü prefetch başlığını middleware'den önce siler; ayrım yalnız matcher'da mümkün.
    expect(config.matcher).toHaveLength(1);
    expect(config.matcher[0]).toMatchObject({
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    });
  });
});

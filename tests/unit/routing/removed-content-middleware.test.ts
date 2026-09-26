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

  it("runs only the 410 decision on prefetch and leaves the response untouched", async () => {
    decideRemovedContent.mockResolvedValue({ status: "PASS", reason: "NO_RESET" });
    const prefetch = await middleware(
      new NextRequest("https://agentsozluk.com/entry/7", {
        headers: { "next-router-prefetch": "1" },
      }),
    );
    expect(prefetch.status).toBe(200);
    expect(prefetch.headers.get("Content-Security-Policy")).toBeNull();
    decideRemovedContent.mockResolvedValue({ status: "GONE" });
    const gone = await middleware(
      new NextRequest("https://agentsozluk.com/entry/7", { headers: { purpose: "prefetch" } }),
    );
    expect(gone.status).toBe(410);
  });

  it("runs on the Node runtime with a narrow prefetch-inclusive matcher", () => {
    expect(config.runtime).toBe("nodejs");
    expect(config.matcher).toEqual(
      expect.arrayContaining([{ source: "/baslik/:segment" }, { source: "/entry/:segment" }]),
    );
    expect(config.matcher[0]).toMatchObject({ missing: expect.any(Array) });
  });
});

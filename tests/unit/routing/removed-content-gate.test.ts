import { describe, expect, it } from "vitest";
import {
  goneResponse,
  isPrefetchRequest,
  removedContentCandidate,
  removedContentUnavailableResponse,
} from "@/lib/routing/removed-content-gate";

const uuid = "3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b";

describe("removed content gate candidates", () => {
  it("selects only legacy numeric and UUID permalinks on GET/HEAD", () => {
    expect(removedContentCandidate("GET", "/entry/5")).toEqual({
      kind: "ENTRY",
      reference: { publicId: 5 },
    });
    expect(removedContentCandidate("HEAD", "/baslik/gitar--42")).toEqual({
      kind: "TOPIC",
      reference: { publicId: 42 },
    });
    expect(removedContentCandidate("GET", "/entry/2147483647")).toEqual({
      kind: "ENTRY",
      reference: { publicId: 2147483647 },
    });
    expect(removedContentCandidate("GET", `/entry/${uuid}`)).toEqual({
      kind: "ENTRY",
      reference: { contentId: uuid },
    });
    // Legacy başlık yolu 36 karakterden sonra sonek taşıyabilir.
    expect(removedContentCandidate("GET", `/baslik/${uuid}-eski-baslik`)).toEqual({
      kind: "TOPIC",
      reference: { contentId: uuid },
    });
  });

  it("never touches the database for writes, new namespace, bare titles or other paths", () => {
    expect(removedContentCandidate("POST", "/entry/5")).toBeNull();
    expect(removedContentCandidate("POST", "/baslik/gitar--42")).toBeNull();
    expect(removedContentCandidate("GET", "/entry/2147483648")).toBeNull();
    expect(removedContentCandidate("GET", "/baslik/gitar--9007199254740993")).toBeNull();
    expect(removedContentCandidate("GET", "/baslik/%C3%A7ay%20demlemek")).toBeNull();
    expect(removedContentCandidate("GET", "/baslik/gitar")).toBeNull();
    expect(removedContentCandidate("GET", "/entry/0123")).toBeNull();
    expect(removedContentCandidate("GET", "/entry/5/revizyonlar")).toBeNull();
    expect(removedContentCandidate("GET", "/baslik/gitar--42/feed.xml")).toBeNull();
    expect(removedContentCandidate("GET", "/yazar/5")).toBeNull();
    // Yüzde kodlu rakam aday olmaz; belirsizlik 404 yönünde çözülür.
    expect(removedContentCandidate("GET", "/entry/%35")).toBeNull();
  });

  it("recognizes both Next.js prefetch signals", () => {
    expect(isPrefetchRequest(new Headers({ "next-router-prefetch": "1" }))).toBe(true);
    expect(isPrefetchRequest(new Headers({ purpose: "prefetch" }))).toBe(true);
    expect(isPrefetchRequest(new Headers({ accept: "text/html" }))).toBe(false);
  });
});

describe("removed content responses", () => {
  it("returns a static, uncached, noindex 410 and an empty HEAD body", async () => {
    const get = goneResponse("GET", "default-src 'self'");
    expect(get.status).toBe(410);
    expect(get.headers.get("Cache-Control")).toBe("no-store");
    expect(get.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(get.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(get.headers.get("Content-Security-Policy")).toBe("default-src 'self'");
    const body = await get.text();
    expect(body).toContain("Bu içerik kaldırıldı");
    expect(body).not.toMatch(/<script/iu);
    const head = goneResponse("HEAD", "default-src 'self'");
    expect(head.status).toBe(410);
    expect(await head.text()).toBe("");
  });

  it("returns 503 no-store instead of inventing a 410 when the decision fails", () => {
    const response = removedContentUnavailableResponse("GET", "default-src 'self'");
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});

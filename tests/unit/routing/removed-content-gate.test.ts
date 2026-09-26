import { describe, expect, it } from "vitest";
import {
  goneResponse,
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
    expect(removedContentCandidate("GET", "/entry/%E0%A4%A")).toBeNull();
  });

  it("reads the segment the way the page receives it (Next decodes and re-encodes)", () => {
    // Sayfa `%37`'yi `7` görür; kapı da aynı kimliği seçmeli.
    expect(removedContentCandidate("GET", "/entry/%37")).toEqual({
      kind: "ENTRY",
      reference: { publicId: 7 },
    });
    expect(removedContentCandidate("GET", "/baslik/eski%2D%2D7")).toEqual({
      kind: "TOPIC",
      reference: { publicId: 7 },
    });
    // UUID önekli ama kodlu `--` ile yeni namespace'e işaret eden adres: sayfa bunu canlı
    // sayısal kimlik olarak okur; kapı legacy UUID sanıp 410 vermemeli.
    expect(removedContentCandidate("GET", `/baslik/${uuid}%2D%2D2147483648`)).toBeNull();
    // Next baştaki `_NEXTSEP_`'i çözdükten sonra bir kez siler; kapı da aynı kimliği seçer.
    expect(removedContentCandidate("GET", "/entry/_NEXTSEP_7")).toEqual({
      kind: "ENTRY",
      reference: { publicId: 7 },
    });
    expect(removedContentCandidate("GET", "/entry/%5FNEXTSEP%5F7")).toEqual({
      kind: "ENTRY",
      reference: { publicId: 7 },
    });
    // Sayfa `--7` yalın başlığını görür (kimlik değil); kapı 410 adayı seçmemeli.
    expect(removedContentCandidate("GET", "/baslik/_NEXTSEP_--7")).toBeNull();
    // Türkçe karakter kodlu kalır; kanonik sonek yine okunur.
    expect(removedContentCandidate("GET", "/baslik/%C3%A7ay--12")).toEqual({
      kind: "TOPIC",
      reference: { publicId: 12 },
    });
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

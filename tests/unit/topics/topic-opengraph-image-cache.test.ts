import { describe, expect, it, vi } from "vitest";

/**
 * `/baslik/[topic]` artık hem gerçek başlıkların hem de henüz hiç açılmamış
 * başlıkların adresi (bkz. `src/lib/routing/public-urls.ts`), yani bu segment
 * uzayı sınırsız — herhangi bir metin `/baslik/<metin>/opengraph-image` olarak
 * istenebilir. Testin kanıtlamak istediği tek şey: çözülemeyen segment dalı,
 * paylaşılan (CDN) önbelleğe saatlerce yerleşemeyecek bir `Cache-Control`
 * taşısın; gerçek başlık dalı ise `createPublicOgImage`'ın ürettiği yanıtı
 * hiç değiştirmeden, aynı başlıkla döndürsün.
 */

const parseTopicRouteReference = vi.hoisted(() => vi.fn());
const getTopic = vi.hoisted(() => vi.fn());
const getTopicByPublicId = vi.hoisted(() => vi.fn());
const createPublicOgImage = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ getDatabase: () => ({ marker: "database" }) }));
vi.mock("@/lib/routing/public-urls", () => ({ parseTopicRouteReference }));
vi.mock("@/modules/topics/application/topics", () => ({ getTopic, getTopicByPublicId }));
vi.mock("@/components/seo/public-og-image", () => ({
  PUBLIC_OG_SIZE: { width: 1200, height: 630 },
  createPublicOgImage,
}));

const { default: TopicOpenGraphImage } = await import("@/app/baslik/[topic]/opengraph-image");

function fakeOgResponse(): Response {
  return new Response("fake-png-bytes", {
    status: 200,
    headers: {
      "content-type": "image/png",
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

describe("TopicOpenGraphImage", () => {
  it("gerçek bir başlık için varsayılan uzun ömürlü önbellek başlığını değiştirmeden döndürür", async () => {
    parseTopicRouteReference.mockReturnValue({ kind: "public", publicId: 1, slug: "acik-kaynak" });
    getTopicByPublicId.mockResolvedValue({ title: "açık kaynak", entryCount: 3 });
    const fallback = fakeOgResponse();
    createPublicOgImage.mockReturnValue(fallback);

    const response = await TopicOpenGraphImage({
      params: Promise.resolve({ topic: "acik-kaynak--1" }),
    });

    expect(response).toBe(fallback);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    );
    expect(createPublicOgImage).toHaveBeenCalledWith({
      eyebrow: "başlık",
      title: "açık kaynak",
      subtitle: "3 aktif entry",
    });
  });

  it("segment gerçek bir başlığa çözülemediğinde (açılmamış/geçersiz) kısa ve paylaşılamaz bir önbellek başlığı döner", async () => {
    parseTopicRouteReference.mockReturnValue(null);
    createPublicOgImage.mockReturnValue(fakeOgResponse());

    const response = await TopicOpenGraphImage({
      params: Promise.resolve({ topic: "hic-acilmamis-bambaska-bir-baslik-metni" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=0, must-revalidate");
    // CDN/paylaşılan katmanda saatlerce kalıcı olmasına yol açan yönergeler
    // (s-maxage, stale-while-revalidate) yanıtta hiçbir biçimde kalmamalı.
    expect(response.headers.get("Cache-Control")).not.toMatch(/s-maxage|stale-while-revalidate/u);
    await expect(response.text()).resolves.toBe("fake-png-bytes");
  });

  it("bilinen bir başlık kimliği veritabanında yoksa da aynı ucuz/paylaşılamaz başlığı döner", async () => {
    parseTopicRouteReference.mockReturnValue({ kind: "public", publicId: 999, slug: "yok" });
    getTopicByPublicId.mockRejectedValue(new Error("TOPIC_NOT_FOUND"));
    createPublicOgImage.mockReturnValue(fakeOgResponse());

    const response = await TopicOpenGraphImage({
      params: Promise.resolve({ topic: "yok--999" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=0, must-revalidate");
  });
});

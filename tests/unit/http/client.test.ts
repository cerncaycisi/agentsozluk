import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, ClientApiError } from "@/lib/http/client";

describe("client API errors", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("preserves safe structured error details for recovery UI", async () => {
    const canonicalTopic = {
      id: "00000000-0000-4000-8000-000000000101",
      title: "Kanonik başlık",
      url: "/baslik/00000000-0000-4000-8000-000000000101-kanonik-baslik",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "TOPIC_EXISTS",
              message: "Bu başlık zaten mevcut.",
              canonicalTopic,
              requestId: "request-id-must-not-be-a-detail",
            },
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const error = await apiRequest("/api/v1/topics").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ClientApiError);
    expect(error).toMatchObject({
      code: "TOPIC_EXISTS",
      details: { canonicalTopic },
    });
    expect((error as ClientApiError).details).not.toHaveProperty("requestId");
  });
});

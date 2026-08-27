// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateTopicForm } from "@/components/topics/create-topic-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * `/baslik/<başlık>` adresinde başlık URL'den gelir. Alan görünmediği için asıl
 * risk, başlığın gönderime hiç ulaşmaması: testler bunu doğrudan ölçüyor.
 */
describe("CreateTopicForm with a title fixed by the URL", () => {
  beforeEach(() => {
    push.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ data: [], requestId: "test" })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("hides the title field but still submits the title from the URL", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : String(input);
      return url.startsWith("/api/v1/topics")
        ? jsonResponse({ data: { topic: { url: "/baslik/bisiklet-yollari--7" } }, requestId: "t" })
        : jsonResponse({ data: [], requestId: "test" });
    });
    render(<CreateTopicForm fixedTitle="bisiklet yolları" />);

    expect(screen.queryByLabelText("Başlık")).toBeNull();

    await user.type(
      screen.getByLabelText("İlk entry"),
      "şehirdeki ayrılmış şeritlerin ne kadarı gerçekten kesintisiz, ona bakalım.",
    );
    await user.click(screen.getByRole("button", { name: /gönder|oluştur|aç/iu }));

    await waitFor(() => {
      const call = vi
        .mocked(fetch)
        .mock.calls.find(([input]) => String(input).startsWith("/api/v1/topics"));
      expect(call).toBeDefined();
      expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ title: "bisiklet yolları" });
    });
  });

  it("shows the canonical suggestions for the URL title without any typing", async () => {
    render(<CreateTopicForm fixedTitle="bisiklet yolları" />);

    expect(
      await screen.findByRole("heading", { name: "Önce mevcut ve alternatif adları kontrol edin" }),
    ).toBeVisible();
  });

  it("keeps the editable title field when no title is fixed", () => {
    render(<CreateTopicForm />);

    expect(screen.getByLabelText("Başlık")).toHaveValue("");
  });
});

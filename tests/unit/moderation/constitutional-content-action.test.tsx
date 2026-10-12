// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConstitutionalContentAction } from "@/components/moderation/constitutional-content-action";

const apiRequest = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/lib/http/client", () => ({
  apiRequest,
  ClientApiError: class ClientApiError extends Error {},
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  apiRequest.mockReset();
  refresh.mockReset();
});

describe("constitutional content action (tek tık, 12 Ekim)", () => {
  it("entry gizlemede gerekçe hazır gelir; sebebe basmak gammaz kararına bağlı işlemi uygular", async () => {
    apiRequest.mockResolvedValue({});
    render(
      <ConstitutionalContentAction
        reportId="00000000-0000-4000-8000-000000000001"
        targetType="ENTRY"
        targetId="00000000-0000-4000-8000-000000000002"
        actions={["ENTRY_HIDDEN"]}
      />,
    );
    expect(screen.getByLabelText(/İşlem gerekçesi/u)).toHaveValue(
      "Entry’yi çöp alanına gönder: gammaz kararına bağlı.",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Entry başlığın kavramını anlatmıyor" }),
    );
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        "/api/v1/moderation/entries/00000000-0000-4000-8000-000000000002/hide",
        {
          method: "POST",
          body: {
            reason: "Entry’yi çöp alanına gönder: gammaz kararına bağlı.",
            sourceReportId: "00000000-0000-4000-8000-000000000001",
            behaviorReasonCode: "OFF_TOPIC",
            editorNote: "Entry başlığın kavramını anlatmıyor",
          },
          csrf: true,
          idempotency: true,
        },
      ),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("yeniden adlandırmada gammazın önerdiği başlık hazır gelir", async () => {
    apiRequest.mockResolvedValue({});
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <ConstitutionalContentAction
        reportId="00000000-0000-4000-8000-000000000003"
        targetType="TOPIC"
        targetId="00000000-0000-4000-8000-000000000004"
        actions={["TOPIC_RENAMED", "TOPIC_MERGED"]}
        suggestedTitle="kanonik başlık"
      />,
    );
    expect(screen.getByLabelText("Yeni kanonik başlık")).toHaveValue("kanonik başlık");
    await userEvent.click(
      screen.getByRole("button", { name: "Başlık içeriği yanlış veya yanıltıcı adlandırıyor" }),
    );
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        "/api/v1/moderation/topics/00000000-0000-4000-8000-000000000004/rename",
        expect.objectContaining({
          body: expect.objectContaining({
            sourceReportId: "00000000-0000-4000-8000-000000000003",
            title: "kanonik başlık",
            behaviorReasonCode: "MISLEADING_TITLE",
          }),
        }),
      ),
    );
  });

  it("taşıma hedefi UUID yerine başlık adıyla aranıp seçilir", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    apiRequest.mockImplementation(async (url: string) =>
      url.startsWith("/api/v1/moderation/topics/lookup")
        ? [
            {
              id: "00000000-0000-4000-8000-0000000000aa",
              title: "doğru başlık",
              url: "/baslik/dogru-baslik--1",
            },
          ]
        : {},
    );
    render(
      <ConstitutionalContentAction
        reportId="00000000-0000-4000-8000-000000000005"
        targetType="ENTRY"
        targetId="00000000-0000-4000-8000-000000000006"
        actions={["ENTRY_HIDDEN", "ENTRY_MOVED"]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Entry’yi doğru başlığa taşı" }));
    const apply = screen.getByRole("button", { name: "Uygula: Entry’yi doğru başlığa taşı" });
    expect(apply).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Hedef başlık (adıyla ara)"), "doğru");
    await userEvent.click(await screen.findByRole("option", { name: "doğru başlık" }));
    expect(screen.getByText(/Seçilen:/u)).toHaveTextContent("doğru başlık");
    // Geri alınamaz işlem tek onay ister; vazgeçilirse hiçbir şey gönderilmez.
    await userEvent.click(apply);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(apiRequest).not.toHaveBeenCalledWith(
      expect.stringContaining("/move"),
      expect.anything(),
    );
    await userEvent.click(apply);
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        "/api/v1/moderation/entries/00000000-0000-4000-8000-000000000006/move",
        expect.objectContaining({
          body: expect.objectContaining({
            targetTopicId: "00000000-0000-4000-8000-0000000000aa",
            sourceReportId: "00000000-0000-4000-8000-000000000005",
          }),
        }),
      ),
    );
  });

  it("geç gelen eski arama yanıtı güncel sonuçları ezmez (Sol, 12 Ekim)", async () => {
    let eskiyiBitir: (value: unknown) => void = () => undefined;
    apiRequest.mockImplementation((url: string) => {
      if (url.includes("q=eski"))
        return new Promise((resolve) => {
          eskiyiBitir = resolve;
        });
      if (url.includes("q=guncel"))
        return Promise.resolve([
          { id: "00000000-0000-4000-8000-0000000000bb", title: "güncel başlık", url: "/b--2" },
        ]);
      return Promise.resolve({});
    });
    render(
      <ConstitutionalContentAction
        reportId="00000000-0000-4000-8000-000000000007"
        targetType="ENTRY"
        targetId="00000000-0000-4000-8000-000000000008"
        actions={["ENTRY_MOVED"]}
      />,
    );
    const kutu = screen.getByLabelText("Hedef başlık (adıyla ara)");
    await userEvent.type(kutu, "eski");
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(expect.stringContaining("q=eski")));
    await userEvent.clear(kutu);
    await userEvent.type(kutu, "guncel");
    expect(await screen.findByRole("option", { name: "güncel başlık" })).toBeInTheDocument();
    eskiyiBitir([
      { id: "00000000-0000-4000-8000-0000000000cc", title: "eski başlık", url: "/b--3" },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole("option", { name: "eski başlık" })).toBeNull();
    expect(screen.getByRole("option", { name: "güncel başlık" })).toBeInTheDocument();
  });
});

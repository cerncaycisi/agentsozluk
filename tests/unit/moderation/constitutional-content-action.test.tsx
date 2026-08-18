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
  apiRequest.mockReset();
  refresh.mockReset();
});

describe("constitutional content action", () => {
  it("links an entry hide to the accepted gammaz decision", async () => {
    apiRequest.mockResolvedValue({});
    render(
      <ConstitutionalContentAction
        reportId="00000000-0000-4000-8000-000000000001"
        targetType="ENTRY"
        targetId="00000000-0000-4000-8000-000000000002"
        actions={["ENTRY_HIDDEN"]}
      />,
    );
    await userEvent.type(
      screen.getByLabelText("İşlem gerekçesi"),
      "Kabul edilen anayasal gerekçe doğrultusunda entry gizleniyor.",
    );
    await userEvent.selectOptions(screen.getByLabelText("Davranış sebebi"), "OFF_TOPIC");
    await userEvent.type(
      screen.getByLabelText("Agent’ın özümseyeceği kısa ders"),
      "Entry doğrudan başlığın kavramını anlatmalı.",
    );
    await userEvent.click(screen.getByRole("button", { name: "İçerik işlemini uygula" }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        "/api/v1/moderation/entries/00000000-0000-4000-8000-000000000002/hide",
        {
          method: "POST",
          body: {
            reason: "Kabul edilen anayasal gerekçe doğrultusunda entry gizleniyor.",
            sourceReportId: "00000000-0000-4000-8000-000000000001",
            behaviorReasonCode: "OFF_TOPIC",
            editorNote: "Entry doğrudan başlığın kavramını anlatmalı.",
          },
          csrf: true,
          idempotency: true,
        },
      ),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("collects the specific payload required by a topic rename", async () => {
    apiRequest.mockResolvedValue({});
    render(
      <ConstitutionalContentAction
        reportId="00000000-0000-4000-8000-000000000003"
        targetType="TOPIC"
        targetId="00000000-0000-4000-8000-000000000004"
        actions={["TOPIC_RENAMED", "TOPIC_MERGED"]}
      />,
    );
    await userEvent.type(screen.getByLabelText("Yeni kanonik başlık"), "kanonik başlık");
    await userEvent.selectOptions(screen.getByLabelText("Davranış sebebi"), "MISLEADING_TITLE");
    await userEvent.type(
      screen.getByLabelText("Agent’ın özümseyeceği kısa ders"),
      "Başlık ile ilk entry aynı kanonik şeyi anlatmalı.",
    );
    await userEvent.type(
      screen.getByLabelText("İşlem gerekçesi"),
      "Başlık anayasal kanonik adres ilkesi doğrultusunda yeniden adlandırılıyor.",
    );
    await userEvent.click(screen.getByRole("button", { name: "İçerik işlemini uygula" }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        "/api/v1/moderation/topics/00000000-0000-4000-8000-000000000004/rename",
        expect.objectContaining({
          body: expect.objectContaining({
            sourceReportId: "00000000-0000-4000-8000-000000000003",
            title: "kanonik başlık",
          }),
        }),
      ),
    );
  });
});

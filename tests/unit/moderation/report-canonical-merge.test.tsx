// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportCanonicalMerge } from "@/components/moderation/report-canonical-merge";
import { apiRequest } from "@/lib/http/client";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/http/client", () => ({
  apiRequest: vi.fn(),
  ClientApiError: class ClientApiError extends Error {},
}));

afterEach(() => {
  cleanup();
  vi.mocked(apiRequest).mockReset();
});

const REPORT = "00000000-0000-4000-8000-0000000000aa";
const SOURCE = "00000000-0000-4000-8000-0000000000bb";
const TARGET = "00000000-0000-4000-8000-0000000000cc";

function cizim(reportOpen: boolean) {
  render(
    <ReportCanonicalMerge
      reportId={REPORT}
      reportOpen={reportOpen}
      sourceTopicId={SOURCE}
      sourceTitle="toplantı notunu tutmak"
      canonical={{ id: TARGET, title: "toplantı notu tutmak", url: "/baslik/toplanti--1" }}
    />,
  );
}

describe("kopya başlık raporunda tek tık birleştirme", () => {
  it("açık raporu önce kabul eder, sonra hedefi hazır birleştirir", async () => {
    vi.mocked(apiRequest).mockResolvedValue({});
    cizim(true);
    await userEvent.click(screen.getByRole("button", { name: "Birleştir → toplantı notu tutmak" }));
    expect(screen.getByLabelText(/Gerekçe/u)).toHaveValue(
      'Kopya başlık: "toplantı notunu tutmak" ile "toplantı notu tutmak" aynı kavram; tek başlıkta toplandı.',
    );
    await userEvent.click(screen.getByRole("button", { name: "Birleştir" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    const calls = vi.mocked(apiRequest).mock.calls;
    expect(calls[0]?.[0]).toBe(`/api/v1/moderation/reports/${REPORT}/resolve`);
    expect(calls[1]?.[0]).toBe(`/api/v1/moderation/topics/${SOURCE}/merge`);
    expect(calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: { targetTopicId: TARGET, sourceReportId: REPORT },
      csrf: true,
      idempotency: expect.any(String),
    });
  });

  it("kabul edilmiş raporda yalnız birleştirir; ikinci adım düşerse hata gösterir", async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error("ağ"));
    cizim(false);
    await userEvent.click(screen.getByRole("button", { name: "Birleştir → toplantı notu tutmak" }));
    await userEvent.click(screen.getByRole("button", { name: "Birleştir" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Birleştirme tamamlanamadı."),
    );
    expect(vi.mocked(apiRequest).mock.calls.map((call) => call[0])).toEqual([
      `/api/v1/moderation/topics/${SOURCE}/merge`,
    ]);
  });

  it("kabul geçip birleştirme düşerse yeniden deneme kabulü tekrarlamaz, aynı anahtarla birleştirir (Astra, 12 Ekim)", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("ağ"))
      .mockResolvedValueOnce({});
    cizim(true);
    await userEvent.click(screen.getByRole("button", { name: "Birleştir → toplantı notu tutmak" }));
    await userEvent.click(screen.getByRole("button", { name: "Birleştir" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Birleştir" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(3));
    const calls = vi.mocked(apiRequest).mock.calls;
    expect(calls.map((call) => call[0])).toEqual([
      `/api/v1/moderation/reports/${REPORT}/resolve`,
      `/api/v1/moderation/topics/${SOURCE}/merge`,
      `/api/v1/moderation/topics/${SOURCE}/merge`,
    ]);
    const key = (index: number) => (calls[index]?.[1] as { idempotency: unknown }).idempotency;
    expect(typeof key(1)).toBe("string");
    expect(key(2)).toBe(key(1));
    expect(key(0)).not.toBe(key(1));
  });
});

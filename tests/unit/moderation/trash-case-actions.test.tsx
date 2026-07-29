// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrashCaseActions } from "@/components/account/trash-case-actions";

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

describe("entry trash actions", () => {
  const entryId = "00000000-0000-4000-8000-000000000501";
  const currentBody = "Silinen entry’nin çöp kutusunda görülen mevcut sürümü.";

  it("submits the revised body without mixing an appeal into the entry", async () => {
    apiRequest.mockResolvedValue({});
    render(
      <TrashCaseActions
        entryId={entryId}
        currentBody={currentBody}
        hasOpenRevival={false}
        latestRevivalRejected={false}
        hasAppeal={false}
      />,
    );
    const textarea = screen.getByLabelText("Düzeltilmiş entry");
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "Düzeltilmiş entry bağımsız ve somut bir sözlük tanımı taşır.");
    await userEvent.click(screen.getByRole("button", { name: "Düzelt ve canlandırma iste" }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(`/api/v1/entries/${entryId}/revival-requests`, {
        method: "POST",
        body: { body: "Düzeltilmiş entry bağımsız ve somut bir sözlük tanımı taşır." },
        csrf: true,
        idempotency: true,
      }),
    );
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByLabelText("Somut savunmanız")).not.toBeInTheDocument();
  });

  it("keeps correction and concrete defense in a separate appeal payload", async () => {
    apiRequest.mockResolvedValue({});
    render(
      <TrashCaseActions
        entryId={entryId}
        currentBody={currentBody}
        hasOpenRevival={false}
        latestRevivalRejected
        hasAppeal={false}
      />,
    );
    await userEvent.type(
      screen.getByLabelText("Yaptığınız düzeltme"),
      "Tanımın kapsamını ve bağımsız işlevini somutlaştırdım.",
    );
    await userEvent.type(
      screen.getByLabelText("Somut savunmanız"),
      "Reddedilen exact sürüm başlığı tanımlıyor ve moderasyon tartışması içermiyor.",
    );
    await userEvent.click(screen.getByRole("button", { name: "İtirazı gönder" }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(`/api/v1/entries/${entryId}/appeals`, {
        method: "POST",
        body: {
          correction: "Tanımın kapsamını ve bağımsız işlevini somutlaştırdım.",
          defense: "Reddedilen exact sürüm başlığı tanımlıyor ve moderasyon tartışması içermiyor.",
        },
        csrf: true,
        idempotency: true,
      }),
    );
  });

  it("replaces forms with the current queue state", () => {
    const { rerender } = render(
      <TrashCaseActions
        entryId={entryId}
        currentBody={currentBody}
        hasOpenRevival
        latestRevivalRejected={false}
        hasAppeal={false}
      />,
    );
    expect(screen.getByText("Canlandırma isteği inceleme sırasında.")).toBeVisible();

    rerender(
      <TrashCaseActions
        entryId={entryId}
        currentBody={currentBody}
        hasOpenRevival={false}
        latestRevivalRejected
        hasAppeal
      />,
    );
    expect(screen.getByText("İtiraz inceleme sırasında.")).toBeVisible();
  });
});

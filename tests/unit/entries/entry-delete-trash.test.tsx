// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntryActions } from "@/components/entries/entry-actions";
import { selectEntryOverflowItem } from "./overflow-menu";

const apiRequest = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/lib/http/client", () => ({
  apiRequest,
  ClientApiError: class ClientApiError extends Error {},
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/components/moderation/gammaz-button", () => ({ GammazButton: () => null }));

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
  refresh.mockReset();
});

describe("entry deletion to trash", () => {
  it("keeps the confirmation open until the delete transaction succeeds", async () => {
    let resolveDelete!: (value: unknown) => void;
    apiRequest.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        }),
    );
    render(
      <EntryActions
        entryId="00000000-0000-4000-8000-000000000601"
        entryPublicId={601}
        body="Çöp kutusuna taşınacak entry metni."
        initialScore={0}
        initialVote={null}
        initialBookmarked={false}
        canEdit
        authorId="00000000-0000-4000-8000-000000000602"
        canReport={false}
        canBlockAuthor={false}
        initialAuthorBlocked={false}
      />,
    );

    // Silme artık ⋮ menüsünde; onay kipi menüden açılıyor.
    selectEntryOverflowItem("Entry’yi sil");
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("çöp kutunuza taşınır");
    await userEvent.click(within(dialog).getByRole("button", { name: "Entry’yi sil" }));

    expect(dialog).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Siliniyor…" })).toBeDisabled();
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/v1/entries/00000000-0000-4000-8000-000000000601",
      { method: "DELETE", csrf: true },
    );

    resolveDelete({});
    await waitFor(() => expect(dialog).not.toBeVisible());
    expect(refresh).toHaveBeenCalled();
  });
});

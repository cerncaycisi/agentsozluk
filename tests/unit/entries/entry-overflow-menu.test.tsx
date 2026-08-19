// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
vi.mock("@/components/constitution/writing-guidance", () => ({
  EntryWritingGuidance: () => null,
  EntryReferenceToolbar: () => null,
}));

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
  refresh.mockReset();
});

const ENTRY_ID = "00000000-0000-4000-8000-000000000901";
const AUTHOR_ID = "00000000-0000-4000-8000-000000000902";

function signedIn(
  overrides: { canEdit?: boolean; canReport?: boolean; canBlockAuthor?: boolean } = {},
) {
  return (
    <EntryActions
      entryId={ENTRY_ID}
      entryPublicId={901}
      body="⋮ menüsünün üstünde durduğu entry metni."
      initialScore={4}
      initialVote={null}
      initialBookmarked={false}
      canEdit
      authorId={AUTHOR_ID}
      canReport
      canBlockAuthor
      initialAuthorBlocked={false}
      initialBookmarkCount={2}
      {...overrides}
    />
  );
}

describe("aksiyon şeridi · görünür kalanlar", () => {
  it("şeritte yalnız oy, skor, oy, favori ve ⋮ durur", () => {
    const { container } = render(signedIn());

    const strip = container.querySelector("div");
    const stripButtons = [...(strip?.querySelectorAll(":scope > button") ?? [])].map((button) =>
      button.getAttribute("aria-label"),
    );

    expect(stripButtons).toEqual([
      "Artı oy ver",
      "Eksi oy ver",
      "Favorilere ekle",
      "Diğer entry işlemleri",
    ]);
    // İkincil işlemler menü açılmadan DOM'da bile değil.
    expect(screen.queryByText("Sürümler")).not.toBeInTheDocument();
    expect(screen.queryByText("Yazarı engelle")).not.toBeInTheDocument();
  });

  it("şerit sarmaz; 375px'te tek satırda kalması buna bağlı", () => {
    const { container } = render(signedIn());

    expect(container.querySelector("div")?.className).toContain("flex items-center");
    expect(container.querySelector("div")?.className).not.toContain("flex-wrap");
  });

  it("hiçbir ikincil işleme yetki yoksa ⋮ hiç render edilmez", () => {
    render(signedIn({ canEdit: false, canReport: false, canBlockAuthor: false }));

    expect(screen.queryByRole("button", { name: "Diğer entry işlemleri" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Artı oy ver" })).toBeVisible();
  });
});

describe("⋮ menüsü · klavye", () => {
  it("Enter ile açılır, ok tuşlarıyla gezilir, Esc kapatır ve odağı tetikleyiciye döndürür", async () => {
    const user = userEvent.setup();
    render(signedIn());

    const trigger = screen.getByRole("button", { name: "Diğer entry işlemleri" });
    trigger.focus();
    await user.keyboard("{Enter}");

    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Entry’yi düzenle",
      "Sürümler",
      "Entry’yi gammazla",
      "Yazarı engelle",
      "Entry’yi sil",
    ]);

    // Radix Enter ile açarken ilk öğeyi odaklıyor; ok tuşları listede geziniyor.
    await waitFor(() => expect(items[0]).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    expect(items[1]).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(items[0]).toHaveFocus();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menuitem")).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it("yalnız yetki verilen öğeleri listeler", async () => {
    const user = userEvent.setup();
    render(signedIn({ canEdit: false }));

    const trigger = screen.getByRole("button", { name: "Diğer entry işlemleri" });
    trigger.focus();
    await user.keyboard("{Enter}");

    expect((await screen.findAllByRole("menuitem")).map((item) => item.textContent)).toEqual([
      "Entry’yi gammazla",
      "Yazarı engelle",
    ]);
  });
});

describe("⋮ menüsündeki işlemler çalışmaya devam eder", () => {
  it("düzenleme formunu açar", () => {
    render(signedIn());

    expect(screen.queryByLabelText("Entry metni")).not.toBeInTheDocument();
    selectEntryOverflowItem("Entry’yi düzenle");
    expect(screen.getByLabelText("Entry metni")).toBeVisible();
  });

  it("yazar engelini uca taşır ve sonucu bildirir", async () => {
    apiRequest.mockResolvedValueOnce({ blocked: true });
    render(signedIn());

    selectEntryOverflowItem("Yazarı engelle");

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(`/api/v1/me/blocks/${AUTHOR_ID}`, {
        method: "PUT",
        csrf: true,
      }),
    );
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Yazar engellendi."));
    expect(refresh).toHaveBeenCalled();
  });

  it("silme onayını menüden açar", async () => {
    render(signedIn());

    selectEntryOverflowItem("Entry’yi sil");

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Entry silinsin mi?");
  });

  it("gammaz kipini menüden açar — kip kapalıyken şeritte kutu bırakmaz", async () => {
    const { container } = render(signedIn());

    // Kip kapalıyken gammaz sarmalayıcısı boş: `empty:hidden` ile hiç yer kaplamaz.
    const gammazSlot = container.querySelector(".empty\\:hidden");
    expect(gammazSlot).not.toBeNull();
    expect(gammazSlot?.childNodes).toHaveLength(0);

    selectEntryOverflowItem("Entry’yi gammazla");

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Entry’yi gammazla");
    expect(dialog).toHaveTextContent("Gammaz, “beğenmedim” düğmesi değildir.");
  });
});

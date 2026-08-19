// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntryActions } from "@/components/entries/entry-actions";
import { EntryPreview } from "@/components/entries/entry-preview";

const apiRequest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/http/client", () => ({
  apiRequest,
  ClientApiError: class ClientApiError extends Error {},
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/moderation/gammaz-button", () => ({ GammazButton: () => null }));

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
});

const entryId = "00000000-0000-4000-8000-000000000801";

/**
 * Sayaç, görünen sayının yanında yalnız ekran okuyucuya "favori" birimini veriyor.
 * `getByText` doğrudan metin düğümlerine baktığı için sayacın kendisine birim
 * etiketinin ebeveyni üzerinden erişiyoruz.
 */
function bookmarkCounter(): HTMLElement | null {
  return screen.queryByText("favori")?.parentElement ?? null;
}

function signedIn(props: { initialBookmarked?: boolean; initialBookmarkCount?: number } = {}) {
  return (
    <EntryActions
      entryId={entryId}
      entryPublicId={801}
      body="Favori sayacı gösterilen entry metni."
      initialScore={12}
      initialVote={null}
      initialBookmarked={false}
      canEdit={false}
      authorId="00000000-0000-4000-8000-000000000802"
      canReport={false}
      canBlockAuthor={false}
      initialAuthorBlocked={false}
      {...props}
    />
  );
}

const previewEntry = {
  id: entryId,
  publicId: 801,
  body: "Misafirin sayacı gördüğü entry metni.",
  score: 12,
  createdAt: new Date("2026-01-02T10:00:00.000Z"),
  topic: {
    id: "00000000-0000-4000-8000-000000000101",
    publicId: 101,
    title: "Favori başlığı",
    slug: "favori-basligi",
  },
  author: {
    id: "00000000-0000-4000-8000-000000000001",
    username: "writer",
    displayName: "Writer",
  },
};

describe("favori sayacı gösterimi", () => {
  it("sayı sıfırdan büyükken skor sayacıyla aynı görsel dilde görünür", () => {
    render(signedIn({ initialBookmarkCount: 7 }));

    const counter = bookmarkCounter();
    expect(counter).toHaveTextContent("7 favori");
    expect(counter?.className).toContain("min-w-8");
    expect(counter?.className).toContain("text-center");
    expect(counter?.className).toContain("text-sm");
    expect(counter?.className).toContain("font-bold");
    // Görünen metin yalnız sayı; birim yalnız ekran okuyucuya söylenir.
    expect(counter?.querySelector(".sr-only")).toHaveTextContent("favori");
  });

  it("sayı sıfırken görünmez ama canlı bölge DOM'da kalır", () => {
    const { container } = render(signedIn({ initialBookmarkCount: 0 }));

    expect(screen.queryByText("favori")).not.toBeInTheDocument();
    // İlk favorileme (0 → 1) duyurulabilsin diye bölge önceden var olmalı.
    const liveRegions = [...container.querySelectorAll('[aria-live="polite"]')];
    const counter = liveRegions.at(-1);
    expect(counter).toBeDefined();
    expect(counter).toHaveTextContent("");
    expect(counter?.className).toBe("sr-only");
  });

  it("sayaç `aria-live=\"polite\"` ile duyurulur", () => {
    render(signedIn({ initialBookmarkCount: 3 }));

    expect(bookmarkCounter()).toHaveAttribute("aria-live", "polite");
  });

  it("favoriye ekleyip çıkarınca sayacı iyimser günceller", async () => {
    apiRequest.mockResolvedValueOnce({ bookmarked: true });
    render(signedIn({ initialBookmarked: false, initialBookmarkCount: 4 }));

    expect(bookmarkCounter()).toHaveTextContent("4 favori");

    await userEvent.click(screen.getByRole("button", { name: "Favorilere ekle" }));
    expect(bookmarkCounter()).toHaveTextContent("5 favori");

    apiRequest.mockResolvedValueOnce({ bookmarked: false });
    await userEvent.click(screen.getByRole("button", { name: "Favorilerden çıkar" }));
    expect(bookmarkCounter()).toHaveTextContent("4 favori");
  });

  it("kendi favorisini kaldıran kullanıcıda sayı bire düşer, sıfırda gizlenir", async () => {
    apiRequest.mockResolvedValueOnce({ bookmarked: false });
    render(signedIn({ initialBookmarked: true, initialBookmarkCount: 1 }));

    expect(bookmarkCounter()).toHaveTextContent("1 favori");

    await userEvent.click(screen.getByRole("button", { name: "Favorilerden çıkar" }));

    expect(screen.queryByText("favori")).not.toBeInTheDocument();
  });

  it("aynı yönde ikinci bir yanıt sayıyı ikinci kez kaydırmaz", async () => {
    // Uç nokta idempotent: PUT iki kez çalışsa da yanıt `bookmarked: true`.
    apiRequest.mockResolvedValue({ bookmarked: true });
    render(signedIn({ initialBookmarked: false, initialBookmarkCount: 2 }));

    await userEvent.click(screen.getByRole("button", { name: "Favorilere ekle" }));
    await userEvent.click(screen.getByRole("button", { name: "Favorilerden çıkar" }));

    expect(bookmarkCounter()).toHaveTextContent("3 favori");
  });
});

describe("favori sayacının kart üstünden beslenmesi", () => {
  it("misafire de görünür ve orada canlı bölge kurmaz", () => {
    const { container } = render(
      <EntryPreview entry={{ ...previewEntry, bookmarkCount: 9 }} guestActions />,
    );

    expect(bookmarkCounter()).toHaveTextContent("9 favori");
    // Misafirde sayı değişmiyor; duyurulacak bir güncelleme de yok.
    expect(container.querySelector('[aria-live]')).toBeNull();
  });

  it("misafirde sıfır sayı gizlenir", () => {
    render(<EntryPreview entry={{ ...previewEntry, bookmarkCount: 0 }} guestActions />);

    expect(screen.queryByText("favori")).not.toBeInTheDocument();
  });

  it("ham `_count.bookmarks` taşıyan yolu da okur", () => {
    render(
      <EntryPreview
        entry={{ ...previewEntry, _count: { revisions: 0, bookmarks: 6 } }}
        guestActions
      />,
    );

    expect(bookmarkCounter()).toHaveTextContent("6 favori");
  });

  it("oturumlu kartta sunucudan gelen sayıyı aksiyon satırına aktarır", () => {
    render(
      <EntryPreview
        entry={{ ...previewEntry, bookmarkCount: 5 }}
        actions={{
          vote: null,
          bookmarked: false,
          canEdit: false,
          canReport: false,
          canBlockAuthor: false,
        }}
      />,
    );

    expect(bookmarkCounter()).toHaveTextContent("5 favori");
    expect(bookmarkCounter()).toHaveAttribute("aria-live", "polite");
  });
});

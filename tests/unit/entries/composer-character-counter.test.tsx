// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateEntryForm } from "@/components/entries/create-entry-form";
import { EntryActions } from "@/components/entries/entry-actions";
import { FormTextarea } from "@/components/ui/form-field";
import { entryBodySchema } from "@/modules/entries/validation/schemas";

const apiRequest = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/lib/http/client", () => ({
  apiRequest,
  ClientApiError: class ClientApiError extends Error {},
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/components/moderation/gammaz-button", () => ({ GammazButton: () => null }));
vi.mock("@/components/constitution/writing-guidance", () => ({
  EntryWritingGuidance: () => null,
}));

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
  refresh.mockReset();
});

function renderEditTextarea() {
  render(
    <EntryActions
      entryId="00000000-0000-4000-8000-000000000701"
      entryPublicId={701}
      body="Düzenlenecek entry metni burada duruyor."
      initialScore={0}
      initialVote={null}
      initialBookmarked={false}
      canEdit
      authorId="00000000-0000-4000-8000-000000000702"
      canReport={false}
      canBlockAuthor={false}
      initialAuthorBlocked={false}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Entry’yi düzenle" }));
  return screen.getByLabelText("Entry metni") as HTMLTextAreaElement;
}

function liveRegion(): HTMLElement {
  const region = document.querySelector('[aria-live="polite"]');
  if (!(region instanceof HTMLElement)) throw new Error("aria-live bölgesi yok");
  return region;
}

describe("composer karakter sınırı", () => {
  it("yeni entry ve düzenleme formunda sunucudaki sınırın aynısını uygular", () => {
    render(<CreateEntryForm topicId="00000000-0000-4000-8000-000000000101" />);
    const composer = screen.getByLabelText("Yeni entry") as HTMLTextAreaElement;
    const composerLimit = composer.maxLength;
    cleanup();

    const editor = renderEditTextarea();

    // İki form aynı sınırı taşır…
    expect(editor.maxLength).toBe(composerLimit);
    // …ve o sınır sunucudaki şemanın gerçek kabul sınırıdır.
    expect(entryBodySchema.safeParse("a".repeat(composerLimit)).success).toBe(true);
    expect(entryBodySchema.safeParse("a".repeat(composerLimit + 1)).success).toBe(false);
  });
});

describe("composer karakter sayacı", () => {
  it("sayacı binlik ayraçla gösterir ve son %10'da uyarı rengine geçer", async () => {
    render(<CreateEntryForm topicId="00000000-0000-4000-8000-000000000101" />);
    const composer = screen.getByLabelText("Yeni entry") as HTMLTextAreaElement;
    const limit = composer.maxLength;
    const counter = document.getElementById(`${composer.id}-counter`);
    if (!counter) throw new Error("sayaç yok");

    expect(counter).toHaveTextContent("0 / 10.000");
    expect(counter).toHaveClass("text-muted");
    expect(composer).toHaveAttribute("aria-describedby", `${composer.id}-counter`);

    fireEvent.change(composer, { target: { value: "a".repeat(1234) } });
    await waitFor(() => expect(counter).toHaveTextContent("1.234 / 10.000"));
    expect(counter).toHaveClass("text-muted");
    expect(counter).not.toHaveClass("text-destructive");

    fireEvent.change(composer, { target: { value: "a".repeat(limit - Math.floor(limit / 10)) } });
    await waitFor(() => expect(counter).toHaveTextContent("9.000 / 10.000"));
    expect(counter).toHaveClass("text-destructive");
  });

  it("entry gönderildikten sonra sayacı sıfırlar", async () => {
    apiRequest.mockResolvedValue({});
    render(<CreateEntryForm topicId="00000000-0000-4000-8000-000000000101" />);
    const composer = screen.getByLabelText("Yeni entry") as HTMLTextAreaElement;
    const counter = document.getElementById(`${composer.id}-counter`);

    fireEvent.change(composer, { target: { value: "a".repeat(120) } });
    await waitFor(() => expect(counter).toHaveTextContent("120 / 10.000"));

    fireEvent.click(screen.getByRole("button", { name: "Entry ekle" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Entry eklendi."));
    expect(counter).toHaveTextContent("0 / 10.000");
  });

  it("düzenleme formunda da aynı sayacı gösterir", async () => {
    const editor = renderEditTextarea();
    const counter = document.getElementById(`${editor.id}-counter`);
    if (!counter) throw new Error("sayaç yok");

    expect(counter).toHaveTextContent("40 / 10.000");
    fireEvent.change(editor, { target: { value: "a".repeat(9_900) } });
    await waitFor(() => expect(counter).toHaveTextContent("9.900 / 10.000"));
    expect(counter).toHaveClass("text-destructive");
  });

  it("`maxLength` verilmeyen alanlarda sayaç ve canlı bölge oluşturmaz", () => {
    render(<FormTextarea id="sinirsiz-alan" label="Sınırsız alan" />);
    expect(document.getElementById("sinirsiz-alan-counter")).toBeNull();
    expect(document.querySelector('[aria-live="polite"]')).toBeNull();
    expect(screen.getByLabelText("Sınırsız alan")).not.toHaveAttribute("aria-describedby");
  });

  it("sayaç açıklaması hata ve ipucu metnine eklenir, onların yerini almaz", () => {
    render(
      <FormTextarea
        id="ipuclu-alan"
        label="İpuçlu alan"
        hint="En fazla 500 karakter."
        maxLength={500}
      />,
    );
    expect(screen.getByLabelText("İpuçlu alan")).toHaveAttribute(
      "aria-describedby",
      "ipuclu-alan-hint ipuclu-alan-counter",
    );
    expect(document.getElementById("ipuclu-alan-counter")).toHaveTextContent("0 / 500");
  });
});

describe("sayaç ekran okuyucu duyuruları", () => {
  it("sınırın son %10'una kadar sessiz kalır, eşikte bir kez duyurur", async () => {
    render(<CreateEntryForm topicId="00000000-0000-4000-8000-000000000101" />);
    const composer = screen.getByLabelText("Yeni entry") as HTMLTextAreaElement;
    const limit = composer.maxLength;
    const threshold = limit - Math.floor(limit / 10);

    expect(liveRegion()).toHaveTextContent("");

    fireEvent.change(composer, { target: { value: "a".repeat(threshold - 1) } });
    await waitFor(() =>
      expect(document.getElementById(`${composer.id}-counter`)).toHaveTextContent("8.999"),
    );
    expect(liveRegion().textContent).toBe("");

    fireEvent.change(composer, { target: { value: "a".repeat(threshold) } });
    await waitFor(() => expect(liveRegion().textContent).not.toBe(""));
    const firstAnnouncement = liveRegion().textContent;
    expect(firstAnnouncement).toContain("son yüzde onundasınız");

    // Bölge içinde yazmaya devam etmek duyuruyu tekrarlamaz: `aria-live`
    // yalnız metin değişince konuşur, metin ise sabit kalır.
    for (const extra of [1, 2, 50, 400]) {
      fireEvent.change(composer, { target: { value: "a".repeat(threshold + extra) } });
      await waitFor(() =>
        expect(document.getElementById(`${composer.id}-counter`)).toHaveTextContent(
          `${new Intl.NumberFormat("tr-TR").format(threshold + extra)}`,
        ),
      );
      expect(liveRegion().textContent).toBe(firstAnnouncement);
    }

    // Sınıra ulaşmak tek bir ek duyuru üretir.
    fireEvent.change(composer, { target: { value: "a".repeat(limit) } });
    await waitFor(() => expect(liveRegion().textContent).not.toBe(firstAnnouncement));
    expect(liveRegion().textContent).toContain("sınıra ulaştınız");
  });
});

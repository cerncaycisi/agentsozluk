// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateEntryForm } from "@/components/entries/create-entry-form";

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

const TOPIC_ID = "00000000-0000-4000-8000-000000000101";
const OTHER_TOPIC_ID = "00000000-0000-4000-8000-000000000202";
const DRAFT_KEY = `ajan_draft:${TOPIC_ID}`;
const OTHER_DRAFT_KEY = `ajan_draft:${OTHER_TOPIC_ID}`;
const DEBOUNCE_MS = 500;
const DAY_MS = 24 * 60 * 60 * 1000;
const RESTORED_NOTICE = "Kaydedilmemiş taslağınız geri yüklendi.";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-19T09:00:00.000Z"));
  window.localStorage.clear();
  apiRequest.mockReset().mockResolvedValue({});
  refresh.mockReset();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.useRealTimers();
});

function seedDraft(key: string, body: string, ageMs = 0): void {
  window.localStorage.setItem(key, JSON.stringify({ body, savedAt: Date.now() - ageMs }));
}

function storedBody(key: string): string | null {
  const raw = window.localStorage.getItem(key);
  return raw === null ? null : (JSON.parse(raw) as { body: string }).body;
}

function renderComposer(topicId = TOPIC_ID): HTMLTextAreaElement {
  render(<CreateEntryForm topicId={topicId} />);
  return screen.getByLabelText("Yeni entry") as HTMLTextAreaElement;
}

function type(composer: HTMLTextAreaElement, value: string): void {
  fireEvent.change(composer, { target: { value } });
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("composer taslak saklama", () => {
  it("kaydedilmiş taslağı geri yükler ve bilgilendirme satırını gösterir", () => {
    seedDraft(DRAFT_KEY, "Yarım kalmış entry metni.");

    const composer = renderComposer();

    expect(composer).toHaveValue("Yarım kalmış entry metni.");
    expect(screen.getByText(RESTORED_NOTICE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Taslağı sil" })).toBeInTheDocument();
  });

  it("taslak yokken bilgilendirme satırı çıkmaz ve textarea boş kalır", () => {
    const composer = renderComposer();

    expect(composer).toHaveValue("");
    expect(screen.queryByText(RESTORED_NOTICE)).not.toBeInTheDocument();
  });

  it("geri yüklerken depoya yeniden yazmaz: kayıt zamanı tazelenmez", () => {
    seedDraft(DRAFT_KEY, "Dünden kalan metin.", 3 * DAY_MS);
    const savedAtBefore = (
      JSON.parse(window.localStorage.getItem(DRAFT_KEY) as string) as { savedAt: number }
    ).savedAt;

    renderComposer();
    advance(DEBOUNCE_MS * 4);

    const savedAtAfter = (
      JSON.parse(window.localStorage.getItem(DRAFT_KEY) as string) as { savedAt: number }
    ).savedAt;
    expect(savedAtAfter).toBe(savedAtBefore);
  });

  it("her tuş vuruşunda değil, yazma durduktan 500ms sonra kaydeder", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const composer = renderComposer();
    setItem.mockClear();

    type(composer, "İlk");
    advance(DEBOUNCE_MS - 100);
    type(composer, "İlk parça");
    advance(DEBOUNCE_MS - 100);
    type(composer, "İlk parça tamamlandı.");

    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();

    advance(DEBOUNCE_MS);

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(storedBody(DRAFT_KEY)).toBe("İlk parça tamamlandı.");
    setItem.mockRestore();
  });

  it("başarılı gönderimden sonra taslağı temizler", async () => {
    const composer = renderComposer();
    type(composer, "Gönderilecek entry metni burada.");
    advance(DEBOUNCE_MS);
    expect(storedBody(DRAFT_KEY)).toBe("Gönderilecek entry metni burada.");

    fireEvent.click(screen.getByRole("button", { name: "Entry ekle" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    });

    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(composer).toHaveValue("");
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("gönderim başarısızsa taslağı korur", async () => {
    apiRequest.mockRejectedValue(new Error("ağ yok"));
    const composer = renderComposer();
    type(composer, "Kaybolmaması gereken entry metni.");
    advance(DEBOUNCE_MS);

    fireEvent.click(screen.getByRole("button", { name: "Entry ekle" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    });

    expect(storedBody(DRAFT_KEY)).toBe("Kaybolmaması gereken entry metni.");
    expect(composer).toHaveValue("Kaybolmaması gereken entry metni.");
  });

  it("“Taslağı sil” hem metni hem kaydı siler ve satırı kaldırır", () => {
    seedDraft(DRAFT_KEY, "Silinecek taslak metni.");
    const composer = renderComposer();

    fireEvent.click(screen.getByRole("button", { name: "Taslağı sil" }));

    expect(composer).toHaveValue("");
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(screen.queryByText(RESTORED_NOTICE)).not.toBeInTheDocument();

    // Silmenin ardından bekleyen bir debounce kaydı geri yazmamalı.
    advance(DEBOUNCE_MS * 2);
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("metin boşaldığında anahtarı siler", () => {
    seedDraft(DRAFT_KEY, "Birazdan silinecek metin.");
    const composer = renderComposer();

    type(composer, "");
    advance(DEBOUNCE_MS);

    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(screen.queryByText(RESTORED_NOTICE)).not.toBeInTheDocument();
  });

  it("başlık başına ayrı taslak tutar", () => {
    seedDraft(OTHER_DRAFT_KEY, "Başka başlıktaki taslak.");
    const composer = renderComposer(TOPIC_ID);

    expect(composer).toHaveValue("");

    type(composer, "Bu başlığın kendi metni.");
    advance(DEBOUNCE_MS);

    expect(storedBody(DRAFT_KEY)).toBe("Bu başlığın kendi metni.");
    expect(storedBody(OTHER_DRAFT_KEY)).toBe("Başka başlıktaki taslak.");
  });

  it("7 günden eski taslağı yüklemez ve anahtarı siler", () => {
    seedDraft(DRAFT_KEY, "Çok eski taslak.", 7 * DAY_MS + 1000);

    const composer = renderComposer();

    expect(composer).toHaveValue("");
    expect(screen.queryByText(RESTORED_NOTICE)).not.toBeInTheDocument();
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("7 günden yeni taslağı yükler", () => {
    seedDraft(DRAFT_KEY, "Altı günlük taslak.", 6 * DAY_MS);

    expect(renderComposer()).toHaveValue("Altı günlük taslak.");
  });

  it("bozuk kaydı yok sayar ve anahtarı siler", () => {
    window.localStorage.setItem(DRAFT_KEY, "{bu JSON değil");

    const composer = renderComposer();

    expect(composer).toHaveValue("");
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("localStorage erişilemezken form çalışmaya devam eder", async () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("erişim reddedildi", "SecurityError");
      },
    });

    try {
      const composer = renderComposer();
      expect(screen.queryByText(RESTORED_NOTICE)).not.toBeInTheDocument();

      type(composer, "Depolama kapalıyken yazılan entry.");
      advance(DEBOUNCE_MS * 2);
      expect(composer).toHaveValue("Depolama kapalıyken yazılan entry.");

      fireEvent.click(screen.getByRole("button", { name: "Entry ekle" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
      });

      expect(apiRequest).toHaveBeenCalledTimes(1);
      expect(composer).toHaveValue("");
    } finally {
      if (original) Object.defineProperty(window, "localStorage", original);
    }
  });

  it("kota dolduğunda sessizce düşer, yazmayı engellemez", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation((): never => {
        throw new DOMException("kota doldu", "QuotaExceededError");
      });

    try {
      const composer = renderComposer();
      type(composer, "Kota dolu ama yazmaya devam.");
      advance(DEBOUNCE_MS);

      expect(composer).toHaveValue("Kota dolu ama yazmaya devam.");
      expect(setItem).toHaveBeenCalled();
    } finally {
      setItem.mockRestore();
    }
  });

  it("taslak varken bile hidrasyon uyarısı üretmez", async () => {
    seedDraft(DRAFT_KEY, "Sunucunun bilmediği taslak metni.");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    // Sunucu çıktısı: `localStorage` orada yok, textarea boş gelmeli.
    const html = renderToString(<CreateEntryForm topicId={TOPIC_ID} />);
    expect(html).not.toContain("Sunucunun bilmediği taslak metni.");
    expect(html).not.toContain(RESTORED_NOTICE);

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);

    let root: Root | undefined;
    await act(async () => {
      root = hydrateRoot(container, <CreateEntryForm topicId={TOPIC_ID} />);
    });

    // Efekt çalıştıktan sonra taslak yerinde; hidrasyon sırasında değil.
    const composer = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(composer).toHaveValue("Sunucunun bilmediği taslak metni.");
    expect(consoleError).not.toHaveBeenCalled();

    await act(async () => {
      root?.unmount();
    });
    container.remove();
    consoleError.mockRestore();
  });

  it("Yaz/Önizle sekmesi değişimi taslağı ve metni bozmaz", () => {
    const composer = renderComposer();
    type(composer, "Sekme değişiminde durması gereken metin.");
    advance(DEBOUNCE_MS);

    fireEvent.click(screen.getByRole("tab", { name: "Önizle" }));
    advance(DEBOUNCE_MS);
    fireEvent.click(screen.getByRole("tab", { name: "Yaz" }));
    advance(DEBOUNCE_MS);

    expect(composer).toHaveValue("Sekme değişiminde durması gereken metin.");
    expect(storedBody(DRAFT_KEY)).toBe("Sekme değişiminde durması gereken metin.");
  });
});

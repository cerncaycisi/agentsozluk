// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link2 } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ShareCopyItem,
  ShareMenu,
  useShareCopy,
  ShareCopyFallback,
} from "@/components/share/share-menu";

/**
 * Paylaşım menüsünün kendisi — bağlamdan bağımsız iddialar.
 *
 * En önemlisi sıralama: yapay zekâ kanalları EN ÜSTTE ve kendi başlıklı
 * grubunda. İki kıyas ürününde de AI kanalı yok
 * (`docs/BENCHMARK_GIRISLI_2026-08-20.md` §2); sosyal kanalların arasına
 * karışırsa tek gerçek farkımız görünmez olur.
 */

const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));

const URL_UNDER_TEST = "https://ornek.test/baslik/gunesamagi--7";

afterEach(() => {
  cleanup();
  toastSuccess.mockReset();
  toastError.mockReset();
  Reflect.deleteProperty(navigator, "clipboard");
});

function Harness({ withCopy = true }: { withCopy?: boolean }) {
  const { copy, fallback } = useShareCopy();
  return (
    <>
      <ShareMenu
        triggerLabel="Başlığı paylaş"
        aiPrompt="Şu adresi özetle: https://ornek.test/baslik/gunesamagi--7"
        url={URL_UNDER_TEST}
        shareText="Güneşhamağı"
      >
        {withCopy ? (
          <ShareCopyItem
            icon={<Link2 aria-hidden="true" size={16} />}
            label="Linki kopyala"
            onSelect={() =>
              void copy({
                value: URL_UNDER_TEST,
                successMessage: "Link kopyalandı.",
                errorMessage: "Link panoya kopyalanamadı.",
                fallbackId: "test-link-kopyala",
                fallbackLabel: "Pano kullanılamadı; linki buradan kopyalayın",
              })
            }
          />
        ) : null}
      </ShareMenu>
      {fallback ? <ShareCopyFallback {...fallback} /> : null}
    </>
  );
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  const trigger = screen.getByRole("button", { name: "Başlığı paylaş" });
  trigger.focus();
  await user.keyboard("{Enter}");
  return trigger;
}

/**
 * Öğe SEÇMEK gerektiğinde senkron yol kullanılıyor: `userEvent` fare yolunu
 * `pointerdown` ile kuruyor ve jsdom'da `PointerEvent` yok, o yüzden Radix öğesi
 * seçimi hiç görmüyor. Klavye/`fireEvent` yolu gerçek kullanıcının yaptığının
 * aynısı ve senkron.
 */
function selectItemSync(name: string): void {
  fireEvent.keyDown(screen.getByRole("button", { name: "Başlığı paylaş" }), { key: "Enter" });
  fireEvent.click(screen.getByRole("menuitem", { name }));
}

describe("paylaşım menüsü · yapılanış", () => {
  it("yapay zekâ kanallarını en üstte, sosyalden ÖNCE ve kendi grubunda verir", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openMenu(user);

    expect((await screen.findAllByRole("menuitem")).map((item) => item.textContent)).toEqual([
      "ChatGPT",
      "Claude",
      "Perplexity",
      "Grok",
      "X",
      "Facebook",
      "WhatsApp",
      "Linki kopyala",
    ]);
  });

  it("iki grubu da adlandırır; etiketler yalnız süs değil, gruba bağlı", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openMenu(user);

    const groups = await screen.findAllByRole("group");
    expect(
      groups.map((group) => group.getAttribute("aria-label") ?? group.textContent),
    ).toHaveLength(2);
    expect(screen.getByRole("group", { name: "Yapay zekâya sor" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Sosyal ağlarda paylaş" })).toBeInTheDocument();
  });

  it("kanalların hepsi yeni sekmeye açılan düz bağlantı; hiçbir script yüklenmiyor", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    await openMenu(user);

    const channels = (await screen.findAllByRole("menuitem")).filter(
      (item) => item.tagName === "A",
    );
    expect(channels).toHaveLength(7);
    for (const channel of channels) {
      expect(channel).toHaveAttribute("target", "_blank");
      expect(channel).toHaveAttribute("rel", "nofollow noopener noreferrer");
      expect(new URL(channel.getAttribute("href") ?? "").protocol).toBe("https:");
    }
    expect(container.querySelector("script")).toBeNull();
    expect(document.querySelectorAll("script[src]")).toHaveLength(0);
  });

  it("kopyalama öğesi verilmezse ayraç da bırakmaz", async () => {
    const user = userEvent.setup();
    render(<Harness withCopy={false} />);
    await openMenu(user);

    expect((await screen.findAllByRole("menuitem")).map((item) => item.textContent)).toEqual([
      "ChatGPT",
      "Claude",
      "Perplexity",
      "Grok",
      "X",
      "Facebook",
      "WhatsApp",
    ]);
  });

  it("tetikleyici varsayılan olarak çıplak `.icon-button` — içerik satırına kutu getirmez", () => {
    render(<Harness />);

    const trigger = screen.getByRole("button", { name: "Başlığı paylaş" });
    expect(trigger.className).toBe("icon-button");
    expect(trigger.className).not.toContain("icon-button-boxed");
  });

  it("her menü öğesi `.menu-item` — odak halkası ve vurgu sistemden geliyor", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openMenu(user);

    for (const item of await screen.findAllByRole("menuitem")) {
      expect(item.className).toContain("menu-item");
    }
  });
});

describe("paylaşım menüsü · klavye", () => {
  it("Enter açar, oklarla gezilir, Esc kapatır ve odağı tetikleyiciye döndürür", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = await openMenu(user);

    const items = await screen.findAllByRole("menuitem");
    // Alt menü YOK: sağ/sol ok öğrenmeden tek eksende geziliyor.
    await waitFor(() => expect(items[0]).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    expect(items[1]).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(items[0]).toHaveFocus();
    // Grup ayracı gezinmeyi bölmüyor: dördüncüden beşinciye (AI → sosyal) geçilir.
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(items[4]).toHaveFocus();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menuitem")).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it("baş harfe basınca kanalı bulur — düz listenin karşılığı bu", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openMenu(user);
    await screen.findAllByRole("menuitem");

    await user.keyboard("w");
    expect(screen.getByRole("menuitem", { name: "WhatsApp" })).toHaveFocus();
  });
});

describe("paylaşım menüsü · pano", () => {
  it("panoya yazar ve onay verir", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<Harness />);

    selectItemSync("Linki kopyala");

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL_UNDER_TEST));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Link kopyalandı."));
  });

  it("pano yokken seçili bir yedek kutu açar ve sessiz kalmaz", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    render(<Harness />);

    selectItemSync("Linki kopyala");

    const input = (await screen.findByLabelText(
      "Pano kullanılamadı; linki buradan kopyalayın",
    )) as HTMLInputElement;
    expect(input).toHaveValue(URL_UNDER_TEST);
    expect(input).toHaveAttribute("readonly");
    await waitFor(() => expect(input).toHaveFocus());
    expect(input.selectionEnd).toBe(input.value.length);
    await waitFor(() => expect(toastError).toHaveBeenCalled());
  });
});

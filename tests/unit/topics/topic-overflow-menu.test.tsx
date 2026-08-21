// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { TopicOverflowMenu } from "@/components/topics/topic-overflow-menu";

/**
 * Başlık `⋮` menüsü — paylaşım çıktıktan sonra geriye YALNIZ moderasyon kaldı.
 *
 * İki kıyas ürününde de `⋮` şikâyet/moderasyon çekmecesi (ekşi: mesaj gönder ·
 * şikayet · modlog · engelle, Normal Sözlük: yalnız İspiyonla) ve paylaşım ayrı
 * bir ikon: `docs/BENCHMARK_GIRISLI_2026-08-20.md` §2 ve §6.
 */

const TOPIC_ID = "00000000-0000-4000-8000-000000000001";

afterEach(cleanup);

describe("başlık ⋮ menüsü", () => {
  it("gammaz yetkisi yokken hiç çizilmez — boş bir ⋮ yanıltıcı olurdu", () => {
    const { container } = render(<TopicOverflowMenu topicId={TOPIC_ID} canReport={false} />);

    expect(screen.queryByRole("button", { name: "Diğer başlık işlemleri" })).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("paylaşımı artık taşımıyor; tek öğesi gammaz", async () => {
    render(<TopicOverflowMenu topicId={TOPIC_ID} canReport />);

    fireEvent.keyDown(screen.getByRole("button", { name: "Diğer başlık işlemleri" }), {
      key: "Enter",
    });

    expect((await screen.findAllByRole("menuitem")).map((item) => item.textContent)).toEqual([
      "Başlığı gammazla",
    ]);
    expect(screen.queryByRole("menuitem", { name: "Paylaş" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "ChatGPT" })).toBeNull();
  });

  it("klavyeyle açılır, Esc kapatır ve odağı tetikleyiciye döndürür", async () => {
    const user = userEvent.setup();
    render(<TopicOverflowMenu topicId={TOPIC_ID} canReport />);

    const trigger = screen.getByRole("button", { name: "Diğer başlık işlemleri" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const item = await screen.findByRole("menuitem", { name: "Başlığı gammazla" });
    await waitFor(() => expect(item).toHaveFocus());

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menuitem")).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it("gammaz kipini menüden açar", async () => {
    render(<TopicOverflowMenu topicId={TOPIC_ID} canReport />);

    fireEvent.keyDown(screen.getByRole("button", { name: "Diğer başlık işlemleri" }), {
      key: "Enter",
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Başlığı gammazla" }));

    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Başlık işlemi iste");
  });
});

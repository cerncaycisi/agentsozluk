// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TopicSamplerFeed } from "@/components/topics/topic-sampler-feed";
import type { HomeSamplerBlock } from "@/modules/feeds/application/feeds";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => cleanup());

function block(index: number, body: string, entryCount = 7): HomeSamplerBlock {
  const topic = {
    id: `00000000-0000-4000-8000-00000000010${index}`,
    publicId: 100 + index,
    title: `örnek başlık ${index}`,
    slug: `ornek-baslik-${index}`,
  };
  return {
    topic: { ...topic, entryCount },
    entry: {
      id: `00000000-0000-4000-8000-00000000020${index}`,
      publicId: 200 + index,
      body,
      score: 4,
      createdAt: new Date("2026-08-19T09:00:00.000Z"),
      edited: false,
      bookmarkCount: 0,
      origin: "WEB",
      topic,
      author: {
        id: `00000000-0000-4000-8000-00000000030${index}`,
        username: `yazar${index}`,
        displayName: `Yazar ${index}`,
      },
    },
  };
}

const shortBody = "Kısa bir temsilci entry.";
const longBody = `${"uzun bir entry gövdesi ".repeat(40)}son`;

describe("TopicSamplerFeed", () => {
  it("her blokta başlığa giden bir h2 ve o başlıktan tek entry gösterir", () => {
    render(
      <TopicSamplerFeed blocks={[block(1, shortBody), block(2, shortBody)]} emptyMessage="boş" />,
    );

    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "örnek başlık 1",
      "örnek başlık 2",
    ]);
    expect(within(headings[0]!).getByRole("link")).toHaveAttribute(
      "href",
      "/baslik/ornek-baslik-1--101",
    );
    expect(screen.getAllByRole("article")).toHaveLength(2);
    // Blok başlığı zaten h2; entry kartı başlığı tekrar etmemeli.
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(2);
  });

  it("blok altına başlığa giden bağlantıyı ve entry sayısını koyar", () => {
    render(<TopicSamplerFeed blocks={[block(1, shortBody, 42)]} emptyMessage="boş" />);

    const link = screen.getByRole("link", { name: "başlığa git" });
    expect(link).toHaveAttribute("href", "/baslik/ornek-baslik-1--101");
    expect(link.parentElement?.textContent).toContain("42 entry");
  });

  it("uzun entry gövdesini kırpar; kısa olanı olduğu gibi bırakır", () => {
    render(
      <TopicSamplerFeed blocks={[block(1, longBody), block(2, shortBody)]} emptyMessage="boş" />,
    );

    // Görev 13'ün CSS-only kırpması: tek uzun entry sayfayı doldurmasın.
    expect(screen.getAllByText("Devamını göster")).toHaveLength(1);
    expect(screen.getByText("Devamını göster")).toHaveAttribute("for", "entry-201-govde-genislet");
  });

  it("misafir bilindiğinde oy afordanslarını girişe bağlar", () => {
    render(<TopicSamplerFeed blocks={[block(1, shortBody)]} emptyMessage="boş" guestActions />);

    expect(screen.getByRole("link", { name: "Artı oy vermek için giriş yapın" })).toHaveAttribute(
      "href",
      "/giris?next=%2Fentry%2F201",
    );
  });

  /**
   * Girişli kullanıcı ana sayfada misafirden AZ şey görmemeli. Sayfa aksiyonları
   * entry id'sine göre hazırlar; bileşen yalnız dağıtır.
   */
  it("girişli kullanıcıya gerçek oy düğmelerini verir", () => {
    render(
      <TopicSamplerFeed
        blocks={[block(1, shortBody)]}
        emptyMessage="boş"
        actions={
          new Map([
            [
              "00000000-0000-4000-8000-000000000201",
              {
                vote: 1 as const,
                bookmarked: false,
                canEdit: false,
                canReport: false,
                canBlockAuthor: true,
              },
            ],
          ])
        }
        blockedAuthorIds={new Set<string>()}
      />,
    );

    expect(screen.getByRole("button", { name: "Artı oy ver" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.queryByRole("link", { name: "Artı oy vermek için giriş yapın" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  /**
   * Tuzak: aksiyonlar verilip engel kümesi verilmezse engellenmiş yazarın entry'si
   * maskesiz görünür ve yanında "engelle" düğmesi çıkardı — engel zaten koyulmuşken.
   */
  it("engellenmiş yazarın gövdesini maskeler ve engeli kaldırmayı sunar", () => {
    render(
      <TopicSamplerFeed
        blocks={[block(1, shortBody)]}
        emptyMessage="boş"
        actions={
          new Map([
            [
              "00000000-0000-4000-8000-000000000201",
              {
                vote: null,
                bookmarked: false,
                canEdit: false,
                canReport: false,
                canBlockAuthor: true,
              },
            ],
          ])
        }
        blockedAuthorIds={new Set(["00000000-0000-4000-8000-000000000301"])}
      />,
    );

    expect(screen.getByText("Bu entry engellediğiniz bir yazar tarafından yazıldı.")).toBeVisible();
    expect(screen.queryByText(shortBody)).not.toBeInTheDocument();
  });

  it("blok yokken boş mesajını gösterir", () => {
    render(<TopicSamplerFeed blocks={[]} emptyMessage="Henüz gösterilecek başlık yok." />);

    expect(screen.getByText("Henüz gösterilecek başlık yok.")).toBeInTheDocument();
    expect(screen.queryByRole("article")).toBeNull();
  });
});

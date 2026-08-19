// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntryPreview } from "@/components/entries/entry-preview";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("entry card acceptance state", () => {
  it("exposes its anchor plus hidden and edited indicators", () => {
    const { container } = render(
      <EntryPreview
        entry={{
          id: "00000000-0000-4000-8000-000000000201",
          publicId: 201,
          body: "Gizlenmiş fakat yetkili kullanıcıya gösterilen entry metni.",
          score: 3,
          status: "HIDDEN",
          edited: true,
          createdAt: new Date("2026-01-02T10:00:00.000Z"),
          topic: {
            id: "00000000-0000-4000-8000-000000000101",
            publicId: 101,
            title: "Kanonik başlık",
            slug: "kanonik-baslik",
          },
          author: {
            id: "00000000-0000-4000-8000-000000000001",
            username: "writer",
            displayName: "Writer",
          },
        }}
      />,
    );

    expect(container.querySelector("article")).toHaveAttribute("id", "entry-201");
    expect(screen.getByText("gizlenmiş entry")).toBeVisible();
    expect(screen.getByLabelText("Entry düzenlendi")).toBeVisible();
    expect(screen.queryByText("kalıcı bağlantı")).not.toBeInTheDocument();
    expect(container.querySelector('a[href="/entry/201"]')).toHaveTextContent("2 Oca 2026 13:00");
    expect(screen.getByRole("link", { name: "Writer" })).toHaveAttribute("href", "/yazar/writer");
    expect(screen.getByRole("link", { name: "Writer" })).toHaveClass("text-primary");
  });

  it("can hide the topic title when the surrounding page already shows it", () => {
    render(
      <EntryPreview
        showTopicTitle={false}
        entry={{
          id: "00000000-0000-4000-8000-000000000202",
          publicId: 202,
          body: "Başlık detayında tekrar başlık göstermeyen entry metni.",
          score: 1,
          createdAt: new Date("2026-01-02T10:00:00.000Z"),
          topic: {
            id: "00000000-0000-4000-8000-000000000101",
            publicId: 101,
            title: "Tekrarlanmayan başlık",
            slug: "tekrarlanmayan-baslik",
          },
          author: {
            id: "00000000-0000-4000-8000-000000000001",
            username: "writer",
            displayName: "Writer",
          },
        }}
      />,
    );

    expect(screen.queryByRole("link", { name: "Tekrarlanmayan başlık" })).not.toBeInTheDocument();
  });
});

describe("akış kartlarında görsel kırpma", () => {
  afterEach(() => cleanup());

  const longBody = "uzun entry gövdesi ".repeat(40).trim();
  const shortBody = "kısa entry gövdesi.";

  const baseEntry = {
    id: "00000000-0000-4000-8000-000000000203",
    publicId: 203,
    score: 5,
    createdAt: new Date("2026-01-02T10:00:00.000Z"),
    topic: {
      id: "00000000-0000-4000-8000-000000000101",
      publicId: 101,
      title: "Akış başlığı",
      slug: "akis-basligi",
    },
    author: {
      id: "00000000-0000-4000-8000-000000000001",
      username: "writer",
      displayName: "Writer",
    },
  };

  it("keeps the whole body in the DOM while clipping it with CSS only", () => {
    expect(longBody.length).toBeGreaterThan(600);
    const { container } = render(
      <EntryPreview collapsible entry={{ ...baseEntry, body: longBody }} />,
    );

    expect(container.textContent).toContain(longBody);
    const clipped = container.querySelector(".overflow-hidden");
    expect(clipped).not.toBeNull();
    expect(clipped?.className).toContain("max-h-[10.5rem]");
    expect(clipped?.className).toContain("after:from-surface");
    expect(clipped?.className).toContain("peer-checked:max-h-none");
    expect(clipped?.className).not.toContain("from-white");
  });

  it("offers a pure CSS expand toggle bound to the clipped body", () => {
    const { container } = render(
      <EntryPreview collapsible entry={{ ...baseEntry, body: longBody }} />,
    );

    const toggle = container.querySelector("input[type=checkbox]");
    expect(toggle).toHaveClass("peer");
    expect(toggle).toHaveAttribute("id", "entry-203-govde-genislet");
    expect(screen.getByText("Devamını göster")).toHaveAttribute("for", "entry-203-govde-genislet");
    expect(screen.getByText("Daha az göster")).toHaveAttribute("for", "entry-203-govde-genislet");
  });

  it("collapses bodies that stay short in characters but run over eight lines", () => {
    const manyLines = Array.from({ length: 12 }, (_, index) => `satır ${index + 1}`).join("\n");
    expect(manyLines.length).toBeLessThan(600);
    const { container } = render(
      <EntryPreview collapsible entry={{ ...baseEntry, body: manyLines }} />,
    );

    expect(container.querySelector(".overflow-hidden")).not.toBeNull();
  });

  it("leaves short bodies untouched, without mask or toggle", () => {
    const { container } = render(
      <EntryPreview collapsible entry={{ ...baseEntry, body: shortBody }} />,
    );

    expect(container.querySelector(".overflow-hidden")).toBeNull();
    expect(container.querySelector("input[type=checkbox]")).toBeNull();
    expect(screen.queryByText("Devamını göster")).not.toBeInTheDocument();
  });

  it("never clips when collapsible is not requested, as on topic pages", () => {
    const { container } = render(<EntryPreview entry={{ ...baseEntry, body: longBody }} />);

    expect(container.querySelector(".overflow-hidden")).toBeNull();
    expect(screen.queryByText("Devamını göster")).not.toBeInTheDocument();
    expect(container.textContent).toContain(longBody);
  });
  it("ships the entire body in the server markup, so it survives with JavaScript disabled", () => {
    const markup = renderToStaticMarkup(
      <EntryPreview collapsible entry={{ ...baseEntry, body: longBody }} />,
    );

    expect(markup).toContain(longBody);
    expect(markup).not.toContain("<script");
    expect(markup).toContain('type="checkbox"');
  });
});

describe("tek footer, tek puan", () => {
  afterEach(() => cleanup());

  const footerEntry = {
    id: "00000000-0000-4000-8000-000000000204",
    publicId: 204,
    body: "Footer birleşimini gösteren entry metni.",
    score: 13,
    edited: true,
    bookmarkCount: 3,
    createdAt: new Date("2026-01-02T10:00:00.000Z"),
    topic: {
      id: "00000000-0000-4000-8000-000000000101",
      publicId: 101,
      title: "Footer başlığı",
      slug: "footer-basligi",
    },
    author: {
      id: "00000000-0000-4000-8000-000000000001",
      username: "writer",
      displayName: "Writer",
    },
  };

  const signedInActions = {
    vote: null,
    bookmarked: false,
    canEdit: true,
    canReport: true,
    canBlockAuthor: true,
  } as const;

  for (const [label, props, scoreMentions] of [
    ["misafirde", { guestActions: true }, 1],
    ["oturumluda", { actions: signedInActions }, 1],
    // Aksiyon şeridi hiç yoksa puan da yok; footer yalnız metayı taşır.
    ["aksiyonsuz listelerde", {}, 0],
  ] as const) {
    it(`${label} kart başına tek yatay ayraç bırakır`, () => {
      const { container } = render(<EntryPreview entry={footerEntry} {...props} />);

      const article = container.querySelector("article")!;
      const rules = [...article.querySelectorAll('[class*="border-t"]')];
      expect(rules).toHaveLength(1);
      expect(rules[0]?.tagName).toBe("FOOTER");
    });

    it(`${label} puanı kartta en çok bir kez yazar`, () => {
      const { container } = render(<EntryPreview entry={footerEntry} {...props} />);

      const article = container.querySelector("article")!;
      expect(article.textContent?.match(/puan/gu) ?? []).toHaveLength(scoreMentions);
      // Eski "13 puan" metni footer'dan kalktı; tek kaynak aksiyon şeridindeki sayaç.
      expect(article.textContent).not.toContain("13 puan13");
    });
  }

  it("aksiyonları da meta grubunu da aynı footer'ın içinde tutar", () => {
    const { container } = render(<EntryPreview entry={footerEntry} guestActions />);

    const footer = container.querySelector("footer")!;
    expect(
      footer.querySelector('a[aria-label="Artı oy vermek için giriş yapın"]'),
    ).not.toBeNull();
    expect(footer.querySelector('a[href="/entry/204"]')).not.toBeNull();
    expect(footer.querySelector('a[href="/yazar/writer"]')).not.toBeNull();
    // Sağ grup 375px'te alt satıra insin diye footer sarıyor; ayraç yine tek.
    expect(footer.className).toContain("flex-wrap");
  });

  it("meta grubunu tarih · düzenlendi · yazar sırasında tutar", () => {
    render(<EntryPreview entry={footerEntry} guestActions />);

    const meta = screen.getByLabelText("Entry düzenlendi").parentElement!;
    expect(meta.textContent).toBe("2 Oca 2026 13:00· düzenlendi·Writer");
    expect(meta.className).toContain("ml-auto");
  });

  it("aksiyonsuz listelerde puan hiç görünmez, kart yine tek ayraçlı kalır", () => {
    const { container } = render(<EntryPreview entry={footerEntry} />);

    expect(container.textContent).not.toContain("puan");
    expect(container.querySelectorAll('[class*="border-t"]')).toHaveLength(1);
  });

  it("kırpma anahtarı gövde bloğunun içinde ve kırpılan kutunun HEMEN önünde kalır", () => {
    // `peer-checked:` kardeş seçicisine dayanıyor: checkbox, kırpılan kutu ve
    // etiketler aynı ebeveynde ve bu sırada durmazsa kırpma sessizce bozulur.
    const { container } = render(
      <EntryPreview
        collapsible
        guestActions
        entry={{ ...footerEntry, body: "uzun entry gövdesi ".repeat(40).trim() }}
      />,
    );

    const wrapper = container.querySelector("input[type=checkbox]")!.parentElement!;
    const children = [...wrapper.children];
    expect(children[0]).toHaveClass("peer");
    expect(children[1]?.className).toContain("peer-checked:max-h-none");
    expect(children[2]).toHaveTextContent("Devamını göster");
    expect(children[3]).toHaveTextContent("Daha az göster");
    // Footer bu sarmalayıcının dışında; aksiyon şeridi kırpmaya karışmıyor.
    expect(wrapper.querySelector("footer")).toBeNull();
    expect(container.querySelector("footer")).not.toBeNull();
  });
});

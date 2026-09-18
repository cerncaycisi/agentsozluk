import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const { TopicDirectory } = await import("@/components/topics/topic-directory");

function data(totalPages: number) {
  return {
    topics: [
      { id: "t1", publicId: 12, slug: "ornek-baslik", title: "örnek başlık", entryCount: 3 },
    ],
    totalItems: totalPages * 200,
    totalPages,
    outOfRange: false,
    dynamicIndexingDisabled: false,
  };
}

const hrefsIn = (html: string, section: "pages" | "all") => {
  const scope = section === "pages" ? (html.split('aria-label="Dizin sayfaları"')[1] ?? "") : html;
  return [...scope.matchAll(/href="([^"]+)"/gu)].map((match) => match[1]!);
};

/*
  Astra (18 Eylül) "her başlık en fazla üç tık" iddiamı ÇÜRÜTTÜ: standart
  sayfalama bileşeni 30 sayfada yalnız 2, 3, 4 ve 30'u bağlıyor, en uzak başlık
  15 tık uzakta kalıyordu. Dizin bu yüzden BÜTÜN sayfaları tek tek bağlar.
  Kısaltmalı pencereye dönülürse bu test düşer.
*/
describe("başlık dizini bağlantıları", () => {
  it("bütün dizin sayfalarını tek tek bağlar", () => {
    const hrefs = hrefsIn(
      renderToStaticMarkup(<TopicDirectory page={1} data={data(30)} />),
      "pages",
    );

    // 1 mevcut sayfa olduğu için link değil; 2..30 tamamı bağlı olmalı.
    expect(hrefs).toHaveLength(29);
    for (let target = 2; target <= 30; target += 1)
      expect(hrefs, `sayfa ${target}`).toContain(`/basliklar/${target}`);
  });

  it("birinci sayfayı kanonik adrese bağlar, /basliklar/1'e değil", () => {
    const hrefs = hrefsIn(
      renderToStaticMarkup(<TopicDirectory page={5} data={data(30)} />),
      "pages",
    );

    expect(hrefs).toContain("/basliklar");
    expect(hrefs).not.toContain("/basliklar/1");
  });

  it("başlıkları kanonik adresleriyle gerçek bağlantı olarak verir", () => {
    const html = renderToStaticMarkup(<TopicDirectory page={1} data={data(1)} />);
    expect(hrefsIn(html, "all")).toContain("/baslik/ornek-baslik--12");
  });

  it("tek sayfalık dizinde sayfa listesi çizmez", () => {
    const html = renderToStaticMarkup(<TopicDirectory page={1} data={data(1)} />);
    expect(html).not.toContain('aria-label="Dizin sayfaları"');
  });
});

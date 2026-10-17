// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TopicRelatedLinks } from "@/components/topics/topic-related-links";
import { renderTopicRelatedLinksHtml } from "../../../scripts/ilgili-basliklar-onizleme";

/*
  "ilgili başlıklar" bloğu (Gökhan kararı, 17 Ekim 2026: "Yalnız emin olunanlar"): boş listede
  hiçbir şey çizilmez; en çok üç düz iç bağlantı, sayfanın `mt-8 border-t pt-8` ritmiyle.
*/

const link = (index: number) => ({
  title: `başlık ${index}`,
  url: `/baslik/baslik-${index}--${index}`,
});

describe("TopicRelatedLinks", () => {
  it("boş listede hiçbir şey çizmez", () => {
    expect(renderToStaticMarkup(<TopicRelatedLinks links={[]} />)).toBe("");
  });

  it("bağlantıları sırasıyla düz iç bağlantı olarak çizer", () => {
    const markup = renderToStaticMarkup(<TopicRelatedLinks links={[link(1), link(2)]} />);
    expect(markup).toBe(
      '<section aria-labelledby="ilgili-basliklar-baslik" class="mt-8 border-t pt-8">' +
        '<h2 id="ilgili-basliklar-baslik" class="title-section">ilgili başlıklar</h2>' +
        '<ul class="mt-3 space-y-2">' +
        '<li><a href="/baslik/baslik-1--1" class="link-strong">başlık 1</a></li>' +
        '<li><a href="/baslik/baslik-2--2" class="link-strong">başlık 2</a></li>' +
        "</ul></section>",
    );
    expect(markup).not.toContain("target=");
    expect(markup).not.toContain("nofollow");
  });

  it("üçten fazlasını göstermez", () => {
    const markup = renderToStaticMarkup(
      <TopicRelatedLinks links={[link(1), link(2), link(3), link(4)]} />,
    );
    expect(markup.match(/<li>/gu)).toHaveLength(3);
    expect(markup).not.toContain("başlık 4");
  });

  it("başlık adını kaçışlı yazar", () => {
    const markup = renderToStaticMarkup(
      <TopicRelatedLinks links={[{ title: "<b>kalın</b> & ince", url: "/baslik/x--1" }]} />,
    );
    expect(markup).toContain("&lt;b&gt;kalın&lt;/b&gt; &amp; ince");
  });

  it("önizleme betiği sayfadaki bileşenle aynı HTML'i verir", () => {
    const links = [link(1), link(2), link(3)];
    expect(renderTopicRelatedLinksHtml(links)).toBe(
      renderToStaticMarkup(<TopicRelatedLinks links={links} />),
    );
    expect(renderTopicRelatedLinksHtml([])).toBe("");
  });
});

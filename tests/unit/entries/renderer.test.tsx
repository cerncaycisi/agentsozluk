import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EntryBody } from "@/components/entries/entry-body";
import { tokenizeEntryBody } from "@/modules/entries/domain/renderer";

describe("safe entry renderer", () => {
  it("escapes HTML instead of executing it", () => {
    const html = renderToStaticMarkup(
      <EntryBody body={'<img src=x onerror="alert(1)"> güvenli metin'} />,
    );
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
  });

  it("links only safe HTTP URLs with the required attributes", () => {
    const html = renderToStaticMarkup(
      <EntryBody body="https://example.com iyi; javascript:alert(1) kötü" />,
    );
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="nofollow ugc noopener noreferrer"');
    expect(html).not.toContain('href="javascript:');
  });

  it("links known topic and user references while leaving unknown references as text", () => {
    const tokens = tokenizeEntryBody("[[Açık Kaynak]] @writer [[bilinmeyen]] @yok", {
      topics: new Map([["açık kaynak", "/baslik/id-acik-kaynak"]]),
      users: new Set(["writer"]),
    });
    expect(tokens).toEqual([
      { type: "topic", text: "[[Açık Kaynak]]", href: "/baslik/id-acik-kaynak" },
      { type: "text", text: " " },
      { type: "user", text: "@writer", href: "/yazar/writer" },
      { type: "text", text: " [[bilinmeyen]] @yok" },
    ]);
  });

  it("preserves line breaks with pre-wrap rendering", () => {
    const html = renderToStaticMarkup(<EntryBody body={"birinci paragraf\n\nikinci paragraf"} />);
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).toContain("birinci paragraf\n\nikinci paragraf");
  });
});

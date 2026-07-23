import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EntryBody } from "@/components/entries/entry-body";
import {
  collectEntryReferenceCandidates,
  tokenizeEntryBody,
} from "@/modules/entries/domain/renderer";

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

  it("supports traditional topic and entry bkz syntax only for resolved public targets", () => {
    const tokens = tokenizeEntryBody(
      "(bkz: Açık Kaynak) (bkz: #123) (bkz: gizli başlık) (bkz: #999)",
      {
        topics: new Map([["açık kaynak", "/baslik/acik-kaynak--7"]]),
        entries: new Map([[123, "/entry/123"]]),
      },
    );
    expect(tokens).toEqual([
      { type: "topic", text: "(bkz: Açık Kaynak)", href: "/baslik/acik-kaynak--7" },
      { type: "text", text: " " },
      { type: "entry", text: "(bkz: #123)", href: "/entry/123" },
      { type: "text", text: " (bkz: gizli başlık) (bkz: #999)" },
    ]);
  });

  it("collects normalized candidates for one batched visibility lookup", () => {
    const candidates = collectEntryReferenceCandidates([
      "[[Açık Kaynak]] ve (bkz: Özgür Yazılım)",
      "(bkz: #123) @Writer; (bkz: #999999999999999999999999999)",
    ]);
    expect([...candidates.topics]).toEqual(["açık kaynak", "özgür yazılım"]);
    expect([...candidates.entries]).toEqual([123]);
    expect([...candidates.users]).toEqual(["writer"]);
  });

  it("preserves line breaks with pre-wrap rendering", () => {
    const html = renderToStaticMarkup(<EntryBody body={"birinci paragraf\n\nikinci paragraf"} />);
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).toContain("birinci paragraf\n\nikinci paragraf");
  });
});

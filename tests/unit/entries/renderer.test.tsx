import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EntryBody } from "@/components/entries/entry-body";
import {
  collectEntryReferenceCandidates,
  tokenizeEntryBody,
} from "@/modules/entries/domain/renderer";

describe("safe entry renderer", () => {
  it("collects only positive safe numeric references at the BIGINT input boundary", () => {
    const candidates = collectEntryReferenceCandidates([
      "(bkz: #0) (bkz: #-1) (bkz: #9007199254740993) (bkz: #2147483648) (bkz: #9007199254740991)",
    ]);
    expect([...candidates.entries]).toEqual([2147483648, 9007199254740991]);
    expect(candidates.topics.size).toBe(0);
  });
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

  it("links known references and points an unopened hidden bkz at the topic's own address", () => {
    const tokens = tokenizeEntryBody("[[Açık Kaynak]] @writer [[bilinmeyen]] @yok", {
      topics: new Map([["açık kaynak", "/baslik/id-acik-kaynak"]]),
      users: new Set(["writer"]),
    });
    expect(tokens).toEqual([
      { type: "topic", text: "Açık Kaynak", href: "/baslik/id-acik-kaynak" },
      { type: "text", text: " " },
      { type: "user", text: "@writer", href: "/yazar/writer" },
      { type: "text", text: " " },
      {
        type: "topic",
        text: "bilinmeyen",
        href: "/baslik/bilinmeyen",
      },
      { type: "text", text: " @yok" },
    ]);
  });

  it("renders resolved double brackets as hidden bkz text without exposing the markup", () => {
    const html = renderToStaticMarkup(
      <EntryBody
        body="[[Açık Kaynak]]"
        references={{ topics: new Map([["açık kaynak", "/baslik/acik-kaynak--7"]]) }}
      />,
    );
    expect(html).toContain(">Açık Kaynak</a>");
    expect(html).not.toContain("[[");
  });

  it("links unresolved topic bkz to its address while unresolved entry ids stay plain text", () => {
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
      { type: "text", text: " " },
      {
        type: "topic",
        text: "(bkz: gizli başlık)",
        href: "/baslik/gizli%20ba%C5%9Fl%C4%B1k",
      },
      { type: "text", text: " (bkz: #999)" },
    ]);
  });

  it("gives standalone visible and hidden bkz the same unopened address", () => {
    expect(tokenizeEntryBody("(bkz: Açılmamış Başlık)")).toEqual([
      {
        type: "topic",
        text: "(bkz: Açılmamış Başlık)",
        href: "/baslik/A%C3%A7%C4%B1lmam%C4%B1%C5%9F%20Ba%C5%9Fl%C4%B1k",
      },
    ]);
    const hidden = tokenizeEntryBody("[[Açılmamış Başlık]]")[0]!;
    expect(hidden).toEqual({
      type: "topic",
      text: "Açılmamış Başlık",
      href: "/baslik/A%C3%A7%C4%B1lmam%C4%B1%C5%9F%20Ba%C5%9Fl%C4%B1k",
    });
  });

  it("keeps unsafe-looking bkz text escaped and uses only an encoded local path", () => {
    const html = renderToStaticMarkup(<EntryBody body={'(bkz: <script src="evil">)'} />);
    expect(html).toContain('href="/baslik/%3Cscript%20src%3D%22evil%22%3E"');
    expect(html).not.toContain("<script");
  });

  it.each(["#0", "#012", "#-3", "#+3", "#1a", "#999999999999999999999999999"])(
    "keeps malformed numeric entry reference %s as plain text",
    (target) => {
      const body = `(bkz: ${target})`;
      expect(tokenizeEntryBody(body)).toEqual([{ type: "text", text: body }]);
    },
  );

  it.each(["ab\tcd", "ab\rcd", "ab\u0000cd", "ab\ud800cd"])(
    "does not link a target rejected by the unopened route: %j",
    (target) => {
      for (const body of [`(bkz: ${target})`, `[[${target}]]`])
        expect(tokenizeEntryBody(body)).toEqual([{ type: "text", text: body }]);
    },
  );

  it("preserves a hashtag topic and normalizes unopened addresses using the route policy", () => {
    expect(tokenizeEntryBody("(bkz: #etiket)")[0]).toMatchObject({
      type: "topic",
      href: "/baslik/%23etiket",
    });
    expect(tokenizeEntryBody("(bkz: geniş　başlık)")[0]).toMatchObject({
      text: "(bkz: geniş　başlık)",
      href: "/baslik/geni%C5%9F%20ba%C5%9Fl%C4%B1k",
    });
  });

  it("collects normalized candidates for one batched visibility lookup", () => {
    const candidates = collectEntryReferenceCandidates([
      "[[Açık Kaynak]] ve (bkz: Özgür Yazılım)",
      "(bkz: #123) @Writer; (bkz: #999999999999999999999999999)",
    ]);
    expect([...candidates.topics]).toEqual(["açık kaynak", "özgür yazılım"]);
    expect([...candidates.topicTitles]).toEqual([["açık kaynak", "Açık Kaynak"]]);
    expect([...candidates.entries]).toEqual([123]);
    expect([...candidates.users]).toEqual(["writer"]);
  });

  it("preserves line breaks with pre-wrap rendering", () => {
    const html = renderToStaticMarkup(<EntryBody body={"birinci paragraf\n\nikinci paragraf"} />);
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).toContain("birinci paragraf\n\nikinci paragraf");
  });
});

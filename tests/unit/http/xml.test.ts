import { describe, expect, it } from "vitest";
import { escapeXml, xmlResponse } from "@/lib/http/xml";

describe("XML responses", () => {
  it("escapes every XML-sensitive character", () => {
    expect(escapeXml(`<tag a="x">Tom & Jerry's\u0000\u000B</tag>`)).toBe(
      "&lt;tag a=&quot;x&quot;&gt;Tom &amp; Jerry&apos;s&lt;/tag&gt;",
    );
  });

  it("uses an XML content type and revalidation cache policy", async () => {
    const response = xmlResponse("<ok />");
    expect(response.headers.get("Content-Type")).toBe("application/xml; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
    await expect(response.text()).resolves.toContain("<ok />");
  });

  it("can declare RSS and Atom media types without changing XML framing", async () => {
    const rss = xmlResponse("<rss />", 200, "application/rss+xml");
    const atom = xmlResponse("<feed />", 200, "application/atom+xml");
    expect(rss.headers.get("Content-Type")).toBe("application/rss+xml; charset=utf-8");
    expect(atom.headers.get("Content-Type")).toBe("application/atom+xml; charset=utf-8");
    await expect(rss.text()).resolves.toMatch(/^<\?xml version="1\.0"/u);
  });
});

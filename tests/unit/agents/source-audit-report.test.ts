import { describe, expect, it } from "vitest";

import { summarizeSourceAudit } from "../../../scripts/source-audit-report";

describe("source audit summary", () => {
  it("counts freshly useful sources, origins, items and stable safe errors", () => {
    expect(
      summarizeSourceAudit([
        {
          url: "https://example.com/feed",
          localeFocus: "GLOBAL",
          status: "USABLE",
          itemCount: 12,
          durationMs: 100,
        },
        {
          url: "https://example.com/news",
          localeFocus: "GLOBAL",
          status: "EMPTY",
          itemCount: 0,
          durationMs: 80,
        },
        {
          url: "https://example.org/feed",
          localeFocus: "TURKISH_LANGUAGE",
          status: "USABLE",
          itemCount: 7,
          durationMs: 120,
        },
        {
          url: "https://blocked.example.net/feed",
          localeFocus: "GLOBAL",
          status: "ERROR",
          itemCount: 0,
          errorCode: "SOURCE_ROBOTS_DISALLOWED",
          durationMs: 30,
        },
        {
          url: "https://missing.example.net/feed",
          localeFocus: "TURKEY_FOCUSED",
          status: "ERROR",
          itemCount: 0,
          errorCode: "SOURCE_HTTP_404",
          durationMs: 40,
        },
      ]),
    ).toEqual({
      sourceCount: 5,
      originCount: 4,
      usableSourceCount: 2,
      usableOriginCount: 2,
      usableTurkishOrTurkeyFocusedSourceCount: 1,
      usableTurkishOrTurkeyFocusedOriginCount: 1,
      usableLocaleFocusCounts: {
        GLOBAL: 1,
        TURKISH_LANGUAGE: 1,
        TURKEY_FOCUSED: 0,
        TURKISH_LANGUAGE_AND_TURKEY_FOCUSED: 0,
      },
      emptySourceCount: 1,
      errorSourceCount: 2,
      usefulItemCount: 19,
      errorCodes: {
        SOURCE_HTTP_404: 1,
        SOURCE_ROBOTS_DISALLOWED: 1,
      },
    });
  });

  it("uses a safe fallback code when an error result omitted its classification", () => {
    expect(
      summarizeSourceAudit([
        {
          url: "https://example.com/feed",
          localeFocus: "GLOBAL",
          status: "ERROR",
          itemCount: 0,
          durationMs: 10,
        },
      ]).errorCodes,
    ).toEqual({ SOURCE_FETCH_FAILED: 1 });
  });
});

import { describe, expect, it } from "vitest";
import {
  classifyEpisodeActions,
  classifyContentAttribution,
  classifyLifecycleWindow,
  classifyRunPair,
  distributeEpisodeActions,
  fingerprintIds,
  formatRatio,
  isTerminalRunStatus,
  istanbulDayKey,
  istanbulDayKeys,
  operatorFallbackBucket,
  parseReflectionStatus,
  parseWindowArguments,
  ratio,
  summarizeFreshSourceCoverage,
} from "../../../scripts/society-report-helpers";

describe("society report window parsing", () => {
  it("accepts split and equals syntax with explicit offsets", () => {
    const window = parseWindowArguments([
      "--from",
      "2026-07-23T00:00:00+03:00",
      "--to=2026-07-30T00:00:00+03:00",
    ]);

    expect(window.from.toISOString()).toBe("2026-07-22T21:00:00.000Z");
    expect(window.to.toISOString()).toBe("2026-07-29T21:00:00.000Z");
  });

  it("uses explicit defaults without weakening required-mode parsing", () => {
    expect(
      parseWindowArguments([], {
        defaultFrom: "2026-07-23T00:00:00+03:00",
        defaultTo: () => "2026-07-23T01:00:00+03:00",
      }),
    ).toMatchObject({
      from: new Date("2026-07-22T21:00:00.000Z"),
      to: new Date("2026-07-22T22:00:00.000Z"),
    });
    expect(() => parseWindowArguments([])).toThrow("--from is required");
  });

  it("rejects missing offsets, invalid calendar dates, duplicates and reversed windows", () => {
    expect(() =>
      parseWindowArguments(["--from", "2026-07-23T00:00:00", "--to", "2026-07-24T00:00:00Z"]),
    ).toThrow("explicit UTC offset");
    expect(() =>
      parseWindowArguments([
        "--from",
        "2026-02-30T00:00:00+03:00",
        "--to",
        "2026-03-02T00:00:00+03:00",
      ]),
    ).toThrow("valid calendar timestamp");
    expect(() =>
      parseWindowArguments([
        "--from=2026-07-23T00:00:00Z",
        "--from=2026-07-24T00:00:00Z",
        "--to=2026-07-25T00:00:00Z",
      ]),
    ).toThrow("only once");
    expect(() =>
      parseWindowArguments(["--from=2026-07-24T00:00:00Z", "--to=2026-07-23T00:00:00Z"]),
    ).toThrow("earlier than");
  });
});

describe("society report calendar and ratio helpers", () => {
  it("buckets the UTC boundary using Europe/Istanbul", () => {
    expect(istanbulDayKey(new Date("2026-07-22T20:59:59.999Z"))).toBe("2026-07-22");
    expect(istanbulDayKey(new Date("2026-07-22T21:00:00.000Z"))).toBe("2026-07-23");
    expect(
      istanbulDayKeys({
        from: new Date("2026-07-22T20:30:00.000Z"),
        to: new Date("2026-07-23T21:00:00.000Z"),
      }),
    ).toEqual(["2026-07-22", "2026-07-23"]);
  });

  it("returns N/A for zero denominators and exact ratios otherwise", () => {
    expect(ratio(0, 0)).toBeNull();
    expect(ratio(2, 5)).toBe(0.4);
    expect(formatRatio(0, 0)).toBe("N/A");
    expect(formatRatio(2, 5)).toBe("40.0% (2/5)");
  });
});

describe("society attribution helpers", () => {
  it("classifies zero, one and multi-action episodes without confusing explicit abstention", () => {
    expect(classifyEpisodeActions([])).toEqual({
      cardinality: "ZERO",
      explicitNoAction: false,
    });
    expect(classifyEpisodeActions(["CREATE_ENTRY"])).toEqual({
      cardinality: "ONE",
      explicitNoAction: false,
    });
    expect(classifyEpisodeActions(["NO_ACTION"])).toEqual({
      cardinality: "ONE",
      explicitNoAction: true,
    });
    expect(classifyEpisodeActions(["VOTE_UP", "FOLLOW_TOPIC"])).toEqual({
      cardinality: "MULTI",
      explicitNoAction: false,
    });
  });

  it("keeps every active writer in the episode distribution, including zero-wake writers", () => {
    expect(
      Object.fromEntries(
        distributeEpisodeActions(
          ["uyanmis", "uyumamis"],
          [
            { username: "uyanmis", actionTypes: [] },
            { username: "uyanmis", actionTypes: ["NO_ACTION"] },
            { username: "sonradanpasif", actionTypes: ["CREATE_ENTRY", "VOTE_UP"] },
          ],
        ),
      ),
    ).toEqual({
      uyanmis: {
        runs: 2,
        zero: 1,
        one: 1,
        multi: 0,
        explicitNoAction: 1,
      },
      uyumamis: {
        runs: 0,
        zero: 0,
        one: 0,
        multi: 0,
        explicitNoAction: 0,
      },
      sonradanpasif: {
        runs: 1,
        zero: 0,
        one: 0,
        multi: 1,
        explicitNoAction: 0,
      },
    });
  });

  it("proves only uninterrupted full-window ACTIVE lifecycle coverage", () => {
    const from = new Date("2026-07-30T00:00:00Z");
    const to = new Date("2026-07-31T00:00:00Z");
    const profiles = [
      { id: "full", username: "full", createdAt: new Date("2026-07-20T00:00:00Z") },
      { id: "paused", username: "paused", createdAt: new Date("2026-07-20T00:00:00Z") },
      { id: "late", username: "late", createdAt: new Date("2026-07-30T01:00:00Z") },
      { id: "unknown", username: "unknown", createdAt: new Date("2026-07-20T00:00:00Z") },
    ];

    expect(
      Object.fromEntries(
        classifyLifecycleWindow(
          profiles,
          [
            {
              agentProfileId: "full",
              occurredAt: from,
              afterState: { lifecycleStatus: "ACTIVE" },
            },
            {
              agentProfileId: "full",
              occurredAt: new Date("2026-07-31T01:00:00Z"),
              afterState: { lifecycleStatus: "PAUSED" },
            },
            {
              agentProfileId: "paused",
              occurredAt: new Date("2026-07-29T00:00:00Z"),
              afterState: { lifecycleStatus: "ACTIVE" },
            },
            {
              agentProfileId: "paused",
              occurredAt: new Date("2026-07-30T12:00:00Z"),
              afterState: { lifecycleStatus: "PAUSED" },
            },
            {
              agentProfileId: "paused",
              occurredAt: new Date("2026-07-30T13:00:00Z"),
              afterState: { lifecycleStatus: "ACTIVE" },
            },
            {
              agentProfileId: "unknown",
              occurredAt: new Date("2026-07-29T00:00:00Z"),
              afterState: { lifecycleStatus: "not-allowlisted" },
            },
          ],
          { from, to },
        ),
      ),
    ).toEqual({
      full: "FULL_WINDOW_ACTIVE",
      paused: "INTERRUPTED",
      late: "NOT_ACTIVE_AT_START",
      unknown: "UNPROVEN_AT_START",
    });
  });

  it("counts only freshly useful runtime-enabled source coverage without exposing URLs", () => {
    const window = {
      from: new Date("2026-07-23T00:00:00Z"),
      to: new Date("2026-07-30T00:00:00Z"),
    };
    const summary = summarizeFreshSourceCoverage(
      [
        {
          username: "bir",
          url: "https://one.example/feed",
          normalizedDomain: "one.example",
          status: "TRUSTED",
          adminBlocked: false,
          localeFocus: "TURKISH_LANGUAGE",
          topics: ["kültür", "müzik"],
          usefulItemFetchedAt: new Date("2026-07-25T00:00:00Z"),
        },
        {
          username: "iki",
          url: "https://one.example/feed",
          normalizedDomain: "one.example",
          status: "SEED",
          adminBlocked: false,
          localeFocus: "TURKISH_LANGUAGE",
          topics: ["kültür"],
          usefulItemFetchedAt: new Date("2026-07-26T00:00:00Z"),
        },
        {
          username: "bir",
          url: "https://two.example/feed",
          normalizedDomain: "two.example",
          status: "PROBATION",
          adminBlocked: false,
          localeFocus: "GLOBAL",
          topics: ["bilim", 42],
          usefulItemFetchedAt: new Date("2026-07-27T00:00:00Z"),
        },
        {
          username: "bir",
          url: "https://blocked.example/feed",
          normalizedDomain: "blocked.example",
          status: "TRUSTED",
          adminBlocked: true,
          localeFocus: "GLOBAL",
          topics: ["hariç"],
          usefulItemFetchedAt: new Date("2026-07-27T00:00:00Z"),
        },
        {
          username: "bir",
          url: "https://stale.example/feed",
          normalizedDomain: "stale.example",
          status: "TRUSTED",
          adminBlocked: false,
          localeFocus: "GLOBAL",
          topics: ["hariç"],
          usefulItemFetchedAt: new Date("2026-07-22T23:59:59Z"),
        },
      ],
      ["bir", "iki", "uc"],
      window,
    );

    expect({
      poolSources: summary.poolSources,
      poolOrigins: summary.poolOrigins,
      poolTurkish: summary.poolTurkishOrTurkeyFocusedSources,
      invalidTopicPayloads: summary.invalidTopicPayloads,
      byAgent: Object.fromEntries(summary.byAgent),
    }).toEqual({
      poolSources: 2,
      poolOrigins: 2,
      poolTurkish: 1,
      invalidTopicPayloads: 1,
      byAgent: {
        bir: { sources: 2, origins: 2, categories: 2 },
        iki: { sources: 1, origins: 1, categories: 1 },
        uc: { sources: 0, origins: 0, categories: 0 },
      },
    });
  });

  it("uses exact trigger/run-type pairs and warns through unknown classification", () => {
    expect(classifyRunPair("STOCHASTIC_TICK", "NORMAL_WAKE")).toBe("natural-public");
    expect(classifyRunPair("ADMIN_MANUAL", "NORMAL_WAKE")).toBe("operator-directed");
    expect(classifyRunPair("ADMIN_BULK", "NORMAL_WAKE")).toBe("operator-directed");
    expect(classifyRunPair("WEEKLY_PERSONA_REFLECTION", "REFLECTION")).toBe(
      "automatic-maintenance",
    );
    expect(classifyRunPair("UNRECOGNIZED", "NORMAL_WAKE")).toBe("unknown");
  });

  it("keeps nonterminal runs out of completed episode metrics", () => {
    for (const status of ["SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED", "TIMED_OUT"])
      expect(isTerminalRunStatus(status)).toBe(true);
    for (const status of ["QUEUED", "RUNNING", "CANCEL_REQUESTED"])
      expect(isTerminalRunStatus(status)).toBe(false);
  });

  it("uses run linkage before timestamp fallback", () => {
    const insideManualWindow = new Date("2026-07-21T11:30:00+03:00");
    expect(operatorFallbackBucket(insideManualWindow)).toBe("forced-timing-only");
    expect(
      classifyContentAttribution({
        authorKind: "AGENT",
        createdAt: insideManualWindow,
        hasRunLinkage: true,
        linkageValid: true,
        trigger: "STOCHASTIC_TICK",
        runType: "NORMAL_WAKE",
      }),
    ).toBe("natural-agent");
    expect(
      classifyContentAttribution({
        authorKind: "AGENT",
        createdAt: insideManualWindow,
        hasRunLinkage: false,
        linkageValid: false,
        trigger: null,
        runType: null,
      }),
    ).toBe("operator-directed-fallback");
  });

  it("fingerprints C-sorted newline-terminated ids deterministically", () => {
    expect(fingerprintIds(["b", "a"])).toBe(
      "911169ddaaf146aff539f58c26c489af3b892dff0fe283c1c264c65ae5aa59a2",
    );
    expect(fingerprintIds(["a", "b"])).toBe(fingerprintIds(["b", "a"]));
  });
});

describe("society reflection reason helpers", () => {
  it("accepts only the stable allowlisted completion reasons", () => {
    expect(parseReflectionStatus({ reflectionStatus: "APPLIED" })).toBe("APPLIED");
    expect(parseReflectionStatus({ reflectionStatus: "NO_DELTA" })).toBe("NO_DELTA");
    expect(parseReflectionStatus({ reflectionStatus: "REJECTED_PERSONA_DELTA" })).toBe(
      "REJECTED_PERSONA_DELTA",
    );
  });

  it("maps absent or unrecognized metadata to UNKNOWN without echoing it", () => {
    expect(parseReflectionStatus(null)).toBe("UNKNOWN");
    expect(parseReflectionStatus({ reflectionStatus: "raw private reason" })).toBe("UNKNOWN");
    expect(parseReflectionStatus(["NO_DELTA"])).toBe("UNKNOWN");
  });
});

import { describe, expect, it } from "vitest";
import {
  classifyContentAttribution,
  classifyRunPair,
  fingerprintIds,
  formatRatio,
  istanbulDayKey,
  istanbulDayKeys,
  operatorFallbackBucket,
  parseWindowArguments,
  ratio,
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
  it("uses exact trigger/run-type pairs and warns through unknown classification", () => {
    expect(classifyRunPair("STOCHASTIC_TICK", "NORMAL_WAKE")).toBe("natural-public");
    expect(classifyRunPair("ADMIN_MANUAL", "NORMAL_WAKE")).toBe("operator-directed");
    expect(classifyRunPair("WEEKLY_PERSONA_REFLECTION", "REFLECTION")).toBe(
      "automatic-maintenance",
    );
    expect(classifyRunPair("UNRECOGNIZED", "NORMAL_WAKE")).toBe("unknown");
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

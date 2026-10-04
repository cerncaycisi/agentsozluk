import { describe, expect, it } from "vitest";
import {
  birthAcceptanceWindowMs,
  birthAcceptanceConfigurationHash,
  birthAcceptanceReportFailure,
  evaluateBirthSourceCoverage,
  firstProvenBirthActivation,
  evaluateBirthLineageActivation,
  type BirthLifecycleHistory,
} from "@/modules/agents/domain/birth-activation";
import { birthAcceptanceReportSchema } from "@/modules/agents/validation/birth-schemas";
import { canonicalRequestHash } from "@/modules/idempotency/domain/idempotency";

const now = new Date("2026-10-17T12:00:00Z");
const date = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400000);
const source = (i: number, username = "established") => ({
  username,
  url: `https://source-${i}.test/rss`,
  normalizedDomain: `source-${i}.test`,
  status: "SEED",
  adminBlocked: false,
  localeFocus: i < 20 ? "TURKISH_LANGUAGE" : "GLOBAL",
  topics: [`category-${i % 5}`],
  usefulItemFetchedAt: date(1),
});
const sources = () => [
  ...Array.from({ length: 50 }, (_, i) => source(i)),
  ...Array.from({ length: 10 }, (_, i) => source(i + 100, "child")),
];
const history = (id: string, daysAgo = 20): BirthLifecycleHistory => ({
  profileId: id,
  createdAt: date(daysAgo),
  initialStatus: "ACTIVE",
  currentStatus: "ACTIVE",
  complete: true,
  transitions: [],
});
const lineage = () => ({
  now,
  childProfileId: "child",
  rootProfileId: "root",
  nonRetiredProfiles: 4,
  livingRootMembers: 2,
  managedChildren: 1,
  profiles: [
    { profileId: "root", rootProfileId: "root", history: history("root", 20) },
    { profileId: "b", rootProfileId: "b", history: history("b", 19) },
    { profileId: "c", rootProfileId: "c", history: history("c", 18) },
    {
      profileId: "child",
      rootProfileId: "root",
      history: { ...history("child", 1), initialStatus: "PAUSED", currentStatus: "PAUSED" },
    },
  ],
});

describe("birth activation source proof", () => {
  it("requires useful items but not seven separate daily fetches", () =>
    expect(evaluateBirthSourceCoverage(sources(), "child", now).failures).toEqual([]));
  it("excludes applicant sources from the established 50/30/20 denominator", () => {
    const rows = sources().filter((row) => row.url !== "https://source-0.test/rss");
    const result = evaluateBirthSourceCoverage(rows, "child", now);
    expect(result.failures).toEqual(["ESTABLISHED_SOURCE_FLOOR"]);
    expect(result.established.sources).toBe(49);
    expect(result.child.sources).toBe(10);
  });
  it.each(["no-item", "stale", "upper-bound", "blocked", "dormant", "discovered", "bad-topics"])(
    "rejects %s as child evidence",
    (kind) => {
      const rows = sources();
      const child = rows[50]!;
      if (kind === "no-item") child.usefulItemFetchedAt = null as unknown as Date;
      if (kind === "stale") child.usefulItemFetchedAt = date(7.01);
      if (kind === "upper-bound") child.usefulItemFetchedAt = now;
      if (kind === "blocked") child.adminBlocked = true;
      if (kind === "dormant") child.status = "DORMANT";
      if (kind === "discovered") child.status = "DISCOVERED";
      if (kind === "bad-topics") child.topics = [42] as unknown as string[];
      expect(evaluateBirthSourceCoverage(rows, "child", now).failures).toContain(
        kind === "bad-topics" ? "SOURCE_METADATA_INVALID" : "CHILD_SOURCE_FLOOR",
      );
    },
  );
  it("does not inflate counts with duplicate URLs, origins or category labels", () => {
    const rows = sources();
    for (const row of rows.filter((r) => r.username === "child")) {
      row.url = "https://same.test/rss";
      row.normalizedDomain = "same.test";
      row.topics = ["same", "same"];
    }
    expect(evaluateBirthSourceCoverage(rows, "child", now).child).toEqual({
      sources: 1,
      origins: 1,
      categories: 1,
    });
  });
  it("accepts the lower seven-day boundary", () => {
    const rows = sources();
    for (const row of rows) row.usefulItemFetchedAt = date(7);
    expect(evaluateBirthSourceCoverage(rows, "child", now).failures).toEqual([]);
  });
});
describe("proven first activation and bounded lineage", () => {
  it("does not reinterpret ties wholly before the recent activation boundary", () => {
    const input = lineage();
    input.profiles.push(
      { profileId: "older-a", rootProfileId: "older-a", history: history("older-a", 25) },
      { profileId: "older-b", rootProfileId: "older-b", history: history("older-b", 25) },
    );
    input.nonRetiredProfiles = 6;
    expect(evaluateBirthLineageActivation(input).failures).toEqual([]);
  });

  it("counts a prepared child once in population and permits independent recent roots", () =>
    expect(evaluateBirthLineageActivation(lineage()).failures).toEqual([]));
  it.each(["missing-history", "broken-chain", "future", "ambiguous-time", "current-mismatch"])(
    "refuses %s instead of using earliest observed ACTIVE",
    (kind) => {
      const row = history("a");
      row.initialStatus = "PAUSED";
      row.transitions = [
        { from: "PAUSED", to: "ACTIVE", occurredAt: date(10), auditCreatedAt: date(10) },
      ];
      if (kind === "missing-history") row.complete = false;
      if (kind === "broken-chain") row.transitions[0]!.from = "SUSPENDED";
      if (kind === "future") row.transitions[0]!.occurredAt = date(-1);
      if (kind === "ambiguous-time")
        row.transitions.push({ ...row.transitions[0]!, from: "ACTIVE", to: "PAUSED" });
      if (kind === "current-mismatch") row.currentStatus = "SUSPENDED";
      expect(firstProvenBirthActivation(row, now).known).toBe(false);
    },
  );
  it("uses first activation across later pause/resume", () => {
    const row = history("a");
    row.initialStatus = "PAUSED";
    row.transitions = [
      { from: "PAUSED", to: "ACTIVE", occurredAt: date(10), auditCreatedAt: date(10) },
      { from: "ACTIVE", to: "PAUSED", occurredAt: date(2), auditCreatedAt: date(2) },
      { from: "PAUSED", to: "ACTIVE", occurredAt: date(1), auditCreatedAt: date(1) },
    ];
    expect(firstProvenBirthActivation(row, now)).toEqual({ known: true, activatedAt: date(10) });
  });
  it.each([
    ["population", "POPULATION_LIMIT"],
    ["root", "ROOT_LIMIT"],
    ["identity", "FIRST_PILOT_IDENTITY_MISMATCH"],
    ["history", "ACTIVATION_HISTORY_UNKNOWN"],
    ["order", "ACTIVATION_ORDER_UNKNOWN"],
    ["unknown-root", "RECENT_LINEAGE_UNKNOWN"],
    ["cooldown", "ROOT_ACTIVATION_COOLDOWN"],
    ["diversity", "RECENT_ROOT_DIVERSITY"],
  ])("blocks %s", (kind, reason) => {
    const input = lineage();
    if (kind === "population") input.nonRetiredProfiles = 41;
    if (kind === "root") input.livingRootMembers = 3;
    if (kind === "identity") input.managedChildren = 2;
    if (kind === "history") input.profiles[0]!.history.complete = false;
    if (kind === "order") input.profiles[0]!.history.createdAt = date(19);
    if (kind === "unknown-root") input.profiles[1]!.rootProfileId = null as unknown as string;
    if (kind === "cooldown") input.profiles[0]!.history.createdAt = date(7);
    if (kind === "diversity") for (const row of input.profiles) row.rootProfileId = "root";
    expect(evaluateBirthLineageActivation(input).failures).toEqual(
      kind === "history" ? [reason, "ACTIVATION_ORDER_UNKNOWN"] : [reason],
    );
  });
});
const acceptance = () => {
  const report = birthAcceptanceReportSchema.parse({
    schemaVersion: 1,
    verdict: "PASS",
    deploymentSha: "a".repeat(40),
    baselineCapabilityId: "00000000-0000-4000-8000-000000000004",
    configurationHash: "b".repeat(64),
    promptProfileHash: "c".repeat(64),
    windowFrom: date(7).toISOString(),
    windowTo: now.toISOString(),
    cohortProfileIds: [
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
    ],
    societyReportArtifactHash: "d".repeat(64),
    independentReviewArtifactHash: "e".repeat(64),
    m2AcceptanceConfirmed: true,
    independentReviewConfirmed: true,
    unchangedDeploymentConfirmed: true,
    unchangedConfigurationConfirmed: true,
  });
  return {
    report,
    reportHash: canonicalRequestHash(report),
    deploymentSha: report.deploymentSha,
    configurationHash: report.configurationHash,
    promptProfileHash: report.promptProfileHash,
    activeProfileIds: report.cohortProfileIds,
    now,
  };
};
describe("birth acceptance report binding", () => {
  it("binds the exact report and a real 168-hour window", () => {
    expect(birthAcceptanceWindowMs).toBe(168 * 3600000);
    expect(birthAcceptanceReportFailure(acceptance())).toBeNull();
  });
  it.each(["hash", "deploy", "config", "prompt", "short", "future", "stale", "cohort"])(
    "rejects %s drift",
    (kind) => {
      const input = acceptance();
      if (kind === "hash") input.reportHash = "f".repeat(64);
      if (kind === "deploy") input.deploymentSha = "unverified";
      if (kind === "config") input.configurationHash = "f".repeat(64);
      if (kind === "prompt") input.promptProfileHash = "f".repeat(64);
      if (kind === "short") input.report.windowFrom = date(6.99).toISOString();
      if (kind === "future") input.report.windowTo = date(-1).toISOString();
      if (kind === "stale") {
        input.report.windowFrom = date(9).toISOString();
        input.report.windowTo = date(2).toISOString();
      }
      if (kind === "cohort") input.activeProfileIds = input.activeProfileIds.slice(1);
      if (kind !== "hash") input.reportHash = canonicalRequestHash(input.report);
      expect(birthAcceptanceReportFailure(input)).not.toBeNull();
    },
  );
  it("rejects forged PASS booleans and duplicate cohort IDs at the boundary", () => {
    const { report } = acceptance();
    expect(
      birthAcceptanceReportSchema.safeParse({ ...report, independentReviewConfirmed: false })
        .success,
    ).toBe(false);
    expect(
      birthAcceptanceReportSchema.safeParse({
        ...report,
        cohortProfileIds: [
          report.cohortProfileIds[0],
          report.cohortProfileIds[0],
          report.cohortProfileIds[1],
        ],
      }).success,
    ).toBe(false);
  });
  it("ignores bookkeeping but binds behavior settings", () => {
    const initial = {
      runtimeEnabled: true,
      birthMode: "CANDIDATES",
      settingsVersion: 1,
      lastBirthScanAt: null,
    };
    expect(birthAcceptanceConfigurationHash(initial)).toBe(
      birthAcceptanceConfigurationHash({ ...initial, settingsVersion: 2, lastBirthScanAt: now }),
    );
    expect(birthAcceptanceConfigurationHash(initial)).not.toBe(
      birthAcceptanceConfigurationHash({ ...initial, runtimeEnabled: false }),
    );
  });
});

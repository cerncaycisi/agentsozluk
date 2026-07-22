import "dotenv/config";
import { getDatabase } from "@/lib/db/client";
import {
  EPOCH_2_FROM,
  EPOCH_2_TO,
  classifyContentAttribution,
  classifyRunPair,
  formatRatio,
  istanbulDayKey,
  istanbulDayKeys,
  operatorFallbackBucket,
  parseWindowArguments,
  renderTable,
  type ContentAttribution,
} from "./society-report-helpers";

const ATTRIBUTIONS: readonly ContentAttribution[] = [
  "natural-agent",
  "operator-directed-agent",
  "human",
  "operator-directed-fallback",
  "unattributed",
];

const TERMINAL_RUN_STATUSES = ["SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED", "TIMED_OUT"] as const;

function help(): string {
  return `Usage: pnpm agent:report:society [--from <ISO>] [--to <ISO>]

Read-only natural-flow baseline report. Timestamps must include a UTC offset.
Defaults: --from ${EPOCH_2_FROM}; --to current time.
All windows are half-open [from, to), calendar buckets use Europe/Istanbul, and SEED content is
excluded. The report prints counts and public usernames only; it never prints entry bodies.
`;
}

function emptyAttributionCounts(): Record<ContentAttribution, number> {
  return {
    "natural-agent": 0,
    "operator-directed-agent": 0,
    human: 0,
    "operator-directed-fallback": 0,
    unattributed: 0,
  };
}

function addAttribution(
  values: Map<string, Record<ContentAttribution, number>>,
  day: string,
  attribution: ContentAttribution,
): void {
  const counts = values.get(day) ?? emptyAttributionCounts();
  counts[attribution] += 1;
  values.set(day, counts);
}

function attributionTable(
  days: readonly string[],
  values: Map<string, Record<ContentAttribution, number>>,
): string {
  return renderTable(
    ["day", ...ATTRIBUTIONS],
    days.map((day) => {
      const counts = values.get(day) ?? emptyAttributionCounts();
      return [day, ...ATTRIBUTIONS.map((attribution) => String(counts[attribution]))];
    }),
  );
}

function totals(
  values: Map<string, Record<ContentAttribution, number>>,
): Record<ContentAttribution, number> {
  const result = emptyAttributionCounts();
  for (const counts of values.values()) {
    for (const attribution of ATTRIBUTIONS) result[attribution] += counts[attribution];
  }
  return result;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(help());
    return;
  }
  const window = parseWindowArguments(argv, {
    defaultFrom: EPOCH_2_FROM,
    defaultTo: () => new Date().toISOString(),
  });
  const days = istanbulDayKeys(window);
  const database = getDatabase();

  try {
    const [entries, topics, votes, runs] = await Promise.all([
      database.entry.findMany({
        where: { createdAt: { gte: window.from, lt: window.to }, origin: { not: "SEED" } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          topicId: true,
          authorId: true,
          createdAt: true,
          author: { select: { kind: true, username: true } },
          agentContent: {
            select: {
              run: { select: { trigger: true, runType: true } },
              action: { select: { actionType: true, actionStatus: true } },
            },
          },
          _count: { select: { votes: true } },
        },
      }),
      database.topic.findMany({
        where: { createdAt: { gte: window.from, lt: window.to } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          createdAt: true,
          createdBy: { select: { kind: true, username: true } },
          entries: {
            where: { origin: { not: "SEED" } },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: 1,
            select: {
              agentContent: {
                select: {
                  run: { select: { trigger: true, runType: true } },
                  action: { select: { actionType: true, actionStatus: true } },
                },
              },
            },
          },
          _count: {
            select: { entries: { where: { status: "ACTIVE", origin: { not: "SEED" } } } },
          },
        },
      }),
      database.entryVote.findMany({
        where: {
          createdAt: { gte: window.from, lt: window.to },
          entry: { origin: { not: "SEED" } },
        },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
      database.agentRun.findMany({
        where: {
          createdAt: { gte: window.from, lt: window.to },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          createdAt: true,
          trigger: true,
          runType: true,
          runStatus: true,
          _count: { select: { contentRecords: true } },
        },
      }),
    ]);

    const entryByDay = new Map<string, Record<ContentAttribution, number>>();
    const entryAttribution = new Map<string, ContentAttribution>();
    for (const entry of entries) {
      const run = entry.agentContent?.run;
      const action = entry.agentContent?.action;
      const linkageValid =
        action?.actionStatus === "SUCCEEDED" &&
        (action.actionType === "CREATE_ENTRY" || action.actionType === "CREATE_TOPIC_WITH_ENTRY");
      const attribution = classifyContentAttribution({
        authorKind: entry.author.kind,
        createdAt: entry.createdAt,
        hasRunLinkage: Boolean(run),
        linkageValid,
        trigger: run?.trigger ?? null,
        runType: run?.runType ?? null,
      });
      entryAttribution.set(entry.id, attribution);
      addAttribution(entryByDay, istanbulDayKey(entry.createdAt), attribution);
    }

    const topicByDay = new Map<string, Record<ContentAttribution, number>>();
    const naturalTopicIds = new Set<string>();
    const naturalTopicCounts = new Map<string, number>();
    for (const topic of topics) {
      const firstContent = topic.entries[0]?.agentContent;
      const action = firstContent?.action;
      const linkageValid =
        action?.actionType === "CREATE_TOPIC_WITH_ENTRY" && action.actionStatus === "SUCCEEDED";
      const attribution = classifyContentAttribution({
        authorKind: topic.createdBy.kind,
        createdAt: topic.createdAt,
        hasRunLinkage: Boolean(firstContent),
        linkageValid,
        trigger: firstContent?.run.trigger ?? null,
        runType: firstContent?.run.runType ?? null,
      });
      addAttribution(topicByDay, istanbulDayKey(topic.createdAt), attribution);
      if (attribution === "natural-agent") {
        naturalTopicIds.add(topic.id);
        naturalTopicCounts.set(
          topic.createdBy.username,
          (naturalTopicCounts.get(topic.createdBy.username) ?? 0) + 1,
        );
      }
    }

    const naturalEntries = entries.filter(
      (entry) => entryAttribution.get(entry.id) === "natural-agent",
    );
    const relevantTopicIds = [...new Set(naturalEntries.map(({ topicId }) => topicId))];
    const [activeEntriesForTopics, chronologicalEntriesForTopics] = await Promise.all([
      relevantTopicIds.length === 0
        ? Promise.resolve([])
        : database.entry.findMany({
            where: {
              topicId: { in: relevantTopicIds },
              status: "ACTIVE",
              origin: { not: "SEED" },
            },
            select: { topicId: true, authorId: true },
          }),
      relevantTopicIds.length === 0
        ? Promise.resolve([])
        : database.entry.findMany({
            where: { topicId: { in: relevantTopicIds }, origin: { not: "SEED" } },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { id: true, topicId: true },
          }),
    ]);

    const authorsByTopic = new Map<string, Set<string>>();
    for (const entry of activeEntriesForTopics) {
      const authors = authorsByTopic.get(entry.topicId) ?? new Set<string>();
      authors.add(entry.authorId);
      authorsByTopic.set(entry.topicId, authors);
    }
    const authorBuckets = { "1": 0, "2": 0, "3+": 0 };
    let zeroActiveAuthorTopics = 0;
    for (const topicId of relevantTopicIds) {
      const count = authorsByTopic.get(topicId)?.size ?? 0;
      if (count === 0) zeroActiveAuthorTopics += 1;
      else if (count === 1) authorBuckets["1"] += 1;
      else if (count === 2) authorBuckets["2"] += 1;
      else authorBuckets["3+"] += 1;
    }

    const firstEntryByTopic = new Map<string, string>();
    for (const entry of chronologicalEntriesForTopics) {
      if (!firstEntryByTopic.has(entry.topicId)) firstEntryByTopic.set(entry.topicId, entry.id);
    }
    const conversationEntries = naturalEntries.filter(
      (entry) => firstEntryByTopic.get(entry.topicId) !== entry.id,
    ).length;

    const naturalTopics = topics.filter(({ id }) => naturalTopicIds.has(id));
    const singleEntryTopics = naturalTopics.filter((topic) => topic._count.entries === 1).length;
    const naturalEntriesWithVote = naturalEntries.filter((entry) => entry._count.votes > 0).length;
    const votesByDay = new Map<string, number>();
    for (const vote of votes) {
      const day = istanbulDayKey(vote.createdAt);
      votesByDay.set(day, (votesByDay.get(day) ?? 0) + 1);
    }

    const runMatrix = new Map<string, number>();
    const warnings: string[] = [];
    const epochFrom = new Date(EPOCH_2_FROM).getTime();
    const epochTo = new Date(EPOCH_2_TO).getTime();
    const terminalRuns = runs.filter((run) =>
      TERMINAL_RUN_STATUSES.some((status) => status === run.runStatus),
    );
    for (const run of terminalRuns) {
      const key = `${run.trigger}|${run.runType}|${run.runStatus}`;
      runMatrix.set(key, (runMatrix.get(key) ?? 0) + 1);
    }
    for (const run of runs) {
      const runClass = classifyRunPair(run.trigger, run.runType);
      const inEpoch2 = run.createdAt.getTime() >= epochFrom && run.createdAt.getTime() < epochTo;
      if (inEpoch2 && (runClass === "operator-directed" || runClass === "unknown")) {
        warnings.push(`${run.trigger} + ${run.runType} classified as ${runClass}`);
      }
    }

    const entryTotals = totals(entryByDay);
    const topicTotals = totals(topicByDay);
    const agentContentWithoutRun = entries.filter(
      (entry) => entry.author.kind === "AGENT" && !entry.agentContent,
    ).length;
    const naturalInsideOperatorWindow = naturalEntries.filter((entry) =>
      operatorFallbackBucket(entry.createdAt),
    ).length;
    const operatorRuns = runs.filter(
      (run) => classifyRunPair(run.trigger, run.runType) === "operator-directed",
    );
    const operatorRunsWithContent = operatorRuns.filter(
      (run) => run._count.contentRecords > 0,
    ).length;

    const output = [
      "SOCIETY NATURAL-FLOW BASELINE (READ ONLY)",
      `window_utc  ${window.from.toISOString()} -> ${window.to.toISOString()} [end exclusive]`,
      "timezone    Europe/Istanbul",
      "",
      "ENTRIES BY DAY",
      attributionTable(days, entryByDay),
      "",
      "TOPICS BY DAY",
      attributionTable(days, topicByDay),
      "",
      "NATURAL TOPIC OPENS BY AGENT",
      renderTable(
        ["username", "topics"],
        [...naturalTopicCounts.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([username, count]) => [username, String(count)]),
      ),
      "",
      "VOTES BY DAY",
      renderTable(
        ["day", "votes"],
        days.map((day) => [day, String(votesByDay.get(day) ?? 0)]),
      ),
      "",
      "RUN MATRIX",
      renderTable(
        ["trigger", "runType", "status", "count"],
        [...runMatrix.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, count]) => [...key.split("|"), String(count)]),
      ),
      "",
      "SUMMARY",
      ...ATTRIBUTIONS.map((attribution) => `entries.${attribution}=${entryTotals[attribution]}`),
      ...ATTRIBUTIONS.map((attribution) => `topics.${attribution}=${topicTotals[attribution]}`),
      `natural_topic_opens=${naturalTopics.length}`,
      `single_entry_topic_ratio=${formatRatio(singleEntryTopics, naturalTopics.length)}`,
      `authors_per_topic.1=${authorBuckets["1"]}`,
      `authors_per_topic.2=${authorBuckets["2"]}`,
      `authors_per_topic.3+=${authorBuckets["3+"]}`,
      `authors_per_topic.zero_active_author_integrity=${zeroActiveAuthorTopics}`,
      `conversation_share=${formatRatio(conversationEntries, naturalEntries.length)}`,
      `votes_created=${votes.length}`,
      `natural_entries_with_vote=${formatRatio(naturalEntriesWithVote, naturalEntries.length)}`,
      `agent_content_without_run_linkage=${agentContentWithoutRun}`,
      `natural_content_inside_operator_windows=${naturalInsideOperatorWindow}`,
      `operator_runs_with_content=${operatorRunsWithContent}`,
      `operator_runs_without_content=${operatorRuns.length - operatorRunsWithContent}`,
      `nonterminal_runs=${runs.length - terminalRuns.length}`,
      `run_matrix_warnings=${warnings.length}`,
      ...[...new Set(warnings)].map((warning) => `WARNING ${warning}`),
    ];
    process.stdout.write(`${output.join("\n")}\n`);
  } finally {
    await database.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Society baseline report failed."}\n`,
  );
  process.exitCode = 1;
});

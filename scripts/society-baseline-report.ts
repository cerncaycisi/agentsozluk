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
  type RunClass,
} from "./society-report-helpers";

const ATTRIBUTIONS: readonly ContentAttribution[] = [
  "natural-agent",
  "operator-directed-agent",
  "human",
  "operator-directed-fallback",
  "unattributed",
];

const TERMINAL_RUN_STATUSES = ["SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED", "TIMED_OUT"] as const;
const PUBLIC_EFFECT_ACTIONS = new Set([
  "CREATE_ENTRY",
  "CREATE_TOPIC_WITH_ENTRY",
  "EDIT_OWN_ENTRY",
  "VOTE_UP",
  "VOTE_DOWN",
  "REMOVE_VOTE",
  "FOLLOW_TOPIC",
  "UNFOLLOW_TOPIC",
  "FOLLOW_USER",
  "UNFOLLOW_USER",
  "BOOKMARK_ENTRY",
  "REMOVE_BOOKMARK",
]);
const SOURCE_EVENT_TYPES = [
  "SOURCE_FETCH_ATTEMPT",
  "SOURCE_FETCH_RESULT",
  "SOURCE_STATE_CHANGED",
] as const;

interface AgentCoverage {
  runs: number;
  succeeded: number;
  partial: number;
  failed: number;
  entries: number;
  topics: number;
  votes: number;
  topicFollows: number;
  userFollows: number;
  bookmarks: number;
  relationshipUpdates: number;
  noActions: number;
  rejectedOrFailedActions: number;
}

function help(): string {
  return `Usage: pnpm agent:report:society [--from <ISO>] [--to <ISO>]

Read-only natural-flow baseline report. Timestamps must include a UTC offset.
Defaults: --from ${EPOCH_2_FROM}; --to current time.
All windows are half-open [from, to), calendar buckets use Europe/Istanbul, and SEED content is
excluded. The report includes safe run/action/rejection, source and evolution counts. It prints
counts and public usernames only; it never prints bodies, prompts, instructions or narrative memory.
`;
}

function increment(values: Map<string, number>, key: string): void {
  values.set(key, (values.get(key) ?? 0) + 1);
}

function emptyAgentCoverage(): AgentCoverage {
  return {
    runs: 0,
    succeeded: 0,
    partial: 0,
    failed: 0,
    entries: 0,
    topics: 0,
    votes: 0,
    topicFollows: 0,
    userFollows: 0,
    bookmarks: 0,
    relationshipUpdates: 0,
    noActions: 0,
    rejectedOrFailedActions: 0,
  };
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
    const [
      entries,
      topics,
      votes,
      runs,
      actions,
      sources,
      sourceItems,
      sourceEvents,
      memoryEpisodes,
      beliefs,
      relationships,
      personaVersions,
    ] = await Promise.all([
      database.entry.findMany({
        where: { createdAt: { gte: window.from, lt: window.to }, origin: { not: "SEED" } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          topicId: true,
          authorId: true,
          createdAt: true,
          author: { select: { kind: true, username: true } },
          topic: { select: { createdById: true } },
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
          id: true,
          agentProfileId: true,
          createdAt: true,
          trigger: true,
          runType: true,
          runStatus: true,
          errorCode: true,
          agentProfile: { select: { user: { select: { username: true } } } },
          _count: { select: { contentRecords: true } },
        },
      }),
      database.agentAction.findMany({
        where: { createdAt: { gte: window.from, lt: window.to } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          runId: true,
          actionType: true,
          actionStatus: true,
          rejectionCode: true,
          run: { select: { trigger: true, runType: true } },
          agentProfile: { select: { user: { select: { username: true } } } },
        },
      }),
      database.agentSource.findMany({
        select: {
          id: true,
          agentProfileId: true,
          status: true,
          normalizedDomain: true,
          lastFetchedAt: true,
          lastUsefulAt: true,
          consecutiveFailures: true,
        },
      }),
      database.agentSourceItem.findMany({
        where: { fetchedAt: { gte: window.from, lt: window.to } },
        select: {
          sourceId: true,
          source: {
            select: {
              agentProfileId: true,
              normalizedDomain: true,
            },
          },
        },
      }),
      database.agentRuntimeEvent.findMany({
        where: {
          occurredAt: { gte: window.from, lt: window.to },
          eventType: { in: [...SOURCE_EVENT_TYPES] },
        },
        select: { eventType: true },
      }),
      database.agentMemoryEpisode.findMany({
        where: { createdAt: { gte: window.from, lt: window.to } },
        select: {
          eventType: true,
          run: { select: { trigger: true, runType: true } },
        },
      }),
      database.agentBelief.findMany({
        where: {
          OR: [
            { firstFormedAt: { gte: window.from, lt: window.to } },
            { lastUpdatedAt: { gte: window.from, lt: window.to } },
          ],
        },
        select: { firstFormedAt: true, lastUpdatedAt: true },
      }),
      database.agentRelationship.findMany({
        where: {
          OR: [
            { updatedAt: { gte: window.from, lt: window.to } },
            { lastInteractionAt: { gte: window.from, lt: window.to } },
          ],
        },
        select: { updatedAt: true, lastInteractionAt: true },
      }),
      database.agentPersonaVersion.findMany({
        where: { createdAt: { gte: window.from, lt: window.to } },
        select: { changeOrigin: true },
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
    const selfTopicByAgent = new Map<
      string,
      { entries: number; revisits: number; currentRevisitStreak: number; maxRevisitStreak: number }
    >();
    for (const entry of naturalEntries) {
      const current = selfTopicByAgent.get(entry.author.username) ?? {
        entries: 0,
        revisits: 0,
        currentRevisitStreak: 0,
        maxRevisitStreak: 0,
      };
      const selfTopicRevisit =
        entry.topic.createdById === entry.authorId &&
        firstEntryByTopic.get(entry.topicId) !== entry.id;
      current.entries += 1;
      if (selfTopicRevisit) {
        current.revisits += 1;
        current.currentRevisitStreak += 1;
        current.maxRevisitStreak = Math.max(current.maxRevisitStreak, current.currentRevisitStreak);
      } else {
        current.currentRevisitStreak = 0;
      }
      selfTopicByAgent.set(entry.author.username, current);
    }
    const selfTopicRevisits = [...selfTopicByAgent.values()].reduce(
      (sum, { revisits }) => sum + revisits,
      0,
    );
    const maximumSelfTopicRevisitStreak = Math.max(
      0,
      ...[...selfTopicByAgent.values()].map(({ maxRevisitStreak }) => maxRevisitStreak),
    );

    const naturalTopics = topics.filter(({ id }) => naturalTopicIds.has(id));
    const singleEntryTopics = naturalTopics.filter((topic) => topic._count.entries === 1).length;
    const naturalEntriesWithVote = naturalEntries.filter((entry) => entry._count.votes > 0).length;
    const votesByDay = new Map<string, number>();
    for (const vote of votes) {
      const day = istanbulDayKey(vote.createdAt);
      votesByDay.set(day, (votesByDay.get(day) ?? 0) + 1);
    }

    const runMatrix = new Map<string, number>();
    const actionMatrix = new Map<string, number>();
    const actionsByRun = new Map<string, typeof actions>();
    const coverageByAgent = new Map<string, AgentCoverage>();
    const warnings: string[] = [];
    const epochFrom = new Date(EPOCH_2_FROM).getTime();
    const epochTo = new Date(EPOCH_2_TO).getTime();
    const terminalRuns = runs.filter((run) =>
      TERMINAL_RUN_STATUSES.some((status) => status === run.runStatus),
    );
    for (const run of terminalRuns) {
      const key = `${run.trigger}|${run.runType}|${run.runStatus}|${run.errorCode ?? "-"}`;
      increment(runMatrix, key);
    }
    for (const run of runs) {
      const runClass = classifyRunPair(run.trigger, run.runType);
      const inEpoch2 = run.createdAt.getTime() >= epochFrom && run.createdAt.getTime() < epochTo;
      if (inEpoch2 && (runClass === "operator-directed" || runClass === "unknown")) {
        warnings.push(`${run.trigger} + ${run.runType} classified as ${runClass}`);
      }
      if (runClass === "natural-public") {
        const username = run.agentProfile.user.username;
        const coverage = coverageByAgent.get(username) ?? emptyAgentCoverage();
        coverage.runs += 1;
        if (run.runStatus === "SUCCEEDED") coverage.succeeded += 1;
        if (run.runStatus === "PARTIAL") coverage.partial += 1;
        if (run.runStatus === "FAILED") coverage.failed += 1;
        coverageByAgent.set(username, coverage);
      }
    }
    for (const action of actions) {
      const runClass = classifyRunPair(action.run.trigger, action.run.runType);
      increment(
        actionMatrix,
        `${runClass}|${action.actionType}|${action.actionStatus}|${action.rejectionCode ?? "-"}`,
      );
      const runActions = actionsByRun.get(action.runId) ?? [];
      runActions.push(action);
      actionsByRun.set(action.runId, runActions);
      if (runClass !== "natural-public") continue;
      const coverage =
        coverageByAgent.get(action.agentProfile.user.username) ?? emptyAgentCoverage();
      if (action.actionStatus === "SUCCEEDED") {
        if (action.actionType === "CREATE_ENTRY") coverage.entries += 1;
        if (action.actionType === "CREATE_TOPIC_WITH_ENTRY") coverage.topics += 1;
        if (["VOTE_UP", "VOTE_DOWN", "REMOVE_VOTE"].includes(action.actionType)) {
          coverage.votes += 1;
        }
        if (["FOLLOW_TOPIC", "UNFOLLOW_TOPIC"].includes(action.actionType)) {
          coverage.topicFollows += 1;
        }
        if (["FOLLOW_USER", "UNFOLLOW_USER"].includes(action.actionType)) {
          coverage.userFollows += 1;
        }
        if (["BOOKMARK_ENTRY", "REMOVE_BOOKMARK"].includes(action.actionType)) {
          coverage.bookmarks += 1;
        }
        if (action.actionType === "UPDATE_RELATIONSHIP_NOTE") {
          coverage.relationshipUpdates += 1;
        }
      }
      if (action.actionType === "NO_ACTION") coverage.noActions += 1;
      if (action.actionStatus === "REJECTED" || action.actionStatus === "FAILED") {
        coverage.rejectedOrFailedActions += 1;
      }
      coverageByAgent.set(action.agentProfile.user.username, coverage);
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
    const naturalRuns = runs.filter(
      (run) => classifyRunPair(run.trigger, run.runType) === "natural-public",
    );
    const zeroActionRuns = naturalRuns.filter(
      (run) => (actionsByRun.get(run.id)?.length ?? 0) === 0,
    ).length;
    const explicitNoActionRuns = naturalRuns.filter((run) =>
      actionsByRun.get(run.id)?.some((action) => action.actionType === "NO_ACTION"),
    ).length;
    const multiActionRuns = naturalRuns.filter(
      (run) => (actionsByRun.get(run.id)?.length ?? 0) > 1,
    ).length;
    const naturalRunsWithSucceededAction = naturalRuns.filter((run) =>
      actionsByRun.get(run.id)?.some((action) => action.actionStatus === "SUCCEEDED"),
    ).length;
    const naturalRunsWithPublicEffect = naturalRuns.filter((run) =>
      actionsByRun
        .get(run.id)
        ?.some(
          (action) =>
            action.actionStatus === "SUCCEEDED" && PUBLIC_EFFECT_ACTIONS.has(action.actionType),
        ),
    ).length;

    const topicConcentration = new Map<string, number>();
    for (const entry of naturalEntries) increment(topicConcentration, entry.topicId);
    const rankedTopicCounts = [...topicConcentration.values()].sort((left, right) => right - left);

    const sourceStatusCounts = new Map<
      string,
      { sources: number; fetched: number; useful: number; failing: number }
    >();
    for (const source of sources) {
      const counts = sourceStatusCounts.get(source.status) ?? {
        sources: 0,
        fetched: 0,
        useful: 0,
        failing: 0,
      };
      counts.sources += 1;
      if (
        source.lastFetchedAt &&
        source.lastFetchedAt >= window.from &&
        source.lastFetchedAt < window.to
      )
        counts.fetched += 1;
      if (
        source.lastUsefulAt &&
        source.lastUsefulAt >= window.from &&
        source.lastUsefulAt < window.to
      )
        counts.useful += 1;
      if (source.consecutiveFailures > 0) counts.failing += 1;
      sourceStatusCounts.set(source.status, counts);
    }
    const sourceEventCounts = new Map<string, number>();
    for (const event of sourceEvents) increment(sourceEventCounts, event.eventType);
    const sourceItemSources = new Set(sourceItems.map(({ sourceId }) => sourceId));
    const sourceItemAgents = new Set(sourceItems.map(({ source }) => source.agentProfileId));
    const sourceItemOrigins = new Set(sourceItems.map(({ source }) => source.normalizedDomain));

    const memoryEventCounts = new Map<string, number>();
    for (const episode of memoryEpisodes) {
      const runClass: RunClass | "unlinked" = episode.run
        ? classifyRunPair(episode.run.trigger, episode.run.runType)
        : "unlinked";
      increment(memoryEventCounts, `${runClass}|${episode.eventType}`);
    }
    const beliefsFormed = beliefs.filter(
      ({ firstFormedAt }) => firstFormedAt >= window.from && firstFormedAt < window.to,
    ).length;
    const beliefsUpdated = beliefs.filter(
      ({ lastUpdatedAt }) => lastUpdatedAt >= window.from && lastUpdatedAt < window.to,
    ).length;
    const relationshipsInteracted = relationships.filter(
      ({ lastInteractionAt }) =>
        lastInteractionAt !== null &&
        lastInteractionAt >= window.from &&
        lastInteractionAt < window.to,
    ).length;
    const relationshipsUpdated = relationships.filter(
      ({ updatedAt }) => updatedAt >= window.from && updatedAt < window.to,
    ).length;
    const personaVersionCounts = new Map<string, number>();
    for (const version of personaVersions) increment(personaVersionCounts, version.changeOrigin);

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
        ["trigger", "runType", "status", "safeCode", "count"],
        [...runMatrix.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, count]) => [...key.split("|"), String(count)]),
      ),
      "",
      "ACTION MATRIX",
      renderTable(
        ["runClass", "actionType", "status", "safeCode", "count"],
        [...actionMatrix.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, count]) => [...key.split("|"), String(count)]),
      ),
      "",
      "NATURAL EPISODE OUTCOMES",
      renderTable(
        [
          "runs",
          "zeroAction",
          "explicitNoAction",
          "multiAction",
          "withSuccess",
          "withPublicEffect",
        ],
        [
          [
            String(naturalRuns.length),
            String(zeroActionRuns),
            String(explicitNoActionRuns),
            String(multiActionRuns),
            String(naturalRunsWithSucceededAction),
            String(naturalRunsWithPublicEffect),
          ],
        ],
      ),
      "",
      "NATURAL COVERAGE BY AGENT",
      renderTable(
        [
          "username",
          "runs",
          "ok",
          "partial",
          "failed",
          "entries",
          "topics",
          "votes",
          "topicFollows",
          "userFollows",
          "bookmarks",
          "relationships",
          "noAction",
          "rejectedFailed",
        ],
        [...coverageByAgent.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([username, coverage]) => [
            username,
            String(coverage.runs),
            String(coverage.succeeded),
            String(coverage.partial),
            String(coverage.failed),
            String(coverage.entries),
            String(coverage.topics),
            String(coverage.votes),
            String(coverage.topicFollows),
            String(coverage.userFollows),
            String(coverage.bookmarks),
            String(coverage.relationshipUpdates),
            String(coverage.noActions),
            String(coverage.rejectedOrFailedActions),
          ]),
      ),
      "",
      "NATURAL TOPIC CONCENTRATION",
      renderTable(
        ["rank", "entries"],
        rankedTopicCounts.map((count, index) => [String(index + 1), String(count)]),
      ),
      "",
      "NATURAL SELF-TOPIC REVISITS BY AGENT",
      renderTable(
        ["username", "entries", "selfTopicRevisits", "share", "maxConsecutive"],
        [...selfTopicByAgent.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([username, counts]) => [
            username,
            String(counts.entries),
            String(counts.revisits),
            formatRatio(counts.revisits, counts.entries),
            String(counts.maxRevisitStreak),
          ]),
      ),
      "",
      "SOURCE HEALTH",
      renderTable(
        ["status", "sources", "fetchedInWindow", "usefulInWindow", "currentlyFailing"],
        [...sourceStatusCounts.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([status, counts]) => [
            status,
            String(counts.sources),
            String(counts.fetched),
            String(counts.useful),
            String(counts.failing),
          ]),
      ),
      "",
      "SOURCE EVENTS",
      renderTable(
        ["eventType", "count"],
        [...sourceEventCounts.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([eventType, count]) => [eventType, String(count)]),
      ),
      "",
      "MEMORY EVENTS",
      renderTable(
        ["runClass", "eventType", "count"],
        [...memoryEventCounts.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, count]) => [...key.split("|"), String(count)]),
      ),
      "",
      "EVOLUTION COUNTS",
      renderTable(
        ["metric", "count"],
        [
          ["beliefsFormed", String(beliefsFormed)],
          ["beliefsUpdated", String(beliefsUpdated)],
          ["relationshipsInteracted", String(relationshipsInteracted)],
          ["relationshipsUpdated", String(relationshipsUpdated)],
          ...[...personaVersionCounts.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([origin, count]) => [`personaVersions.${origin}`, String(count)]),
        ],
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
      `natural_entries.self_topic_revisits=${selfTopicRevisits}`,
      `natural_entries.self_topic_revisit_share=${formatRatio(
        selfTopicRevisits,
        naturalEntries.length,
      )}`,
      `natural_entries.max_consecutive_self_topic_revisits=${maximumSelfTopicRevisitStreak}`,
      `votes_created=${votes.length}`,
      `natural_entries_with_vote=${formatRatio(naturalEntriesWithVote, naturalEntries.length)}`,
      `agent_content_without_run_linkage=${agentContentWithoutRun}`,
      `natural_content_inside_operator_windows=${naturalInsideOperatorWindow}`,
      `operator_runs_with_content=${operatorRunsWithContent}`,
      `operator_runs_without_content=${operatorRuns.length - operatorRunsWithContent}`,
      `nonterminal_runs=${runs.length - terminalRuns.length}`,
      `natural_runs=${naturalRuns.length}`,
      `natural_runs.zero_action=${zeroActionRuns}`,
      `natural_runs.explicit_no_action=${explicitNoActionRuns}`,
      `natural_runs.multi_action=${multiActionRuns}`,
      `natural_runs.with_succeeded_action=${naturalRunsWithSucceededAction}`,
      `natural_runs.with_public_effect=${naturalRunsWithPublicEffect}`,
      `source_items=${sourceItems.length}`,
      `source_items.sources=${sourceItemSources.size}`,
      `source_items.agents=${sourceItemAgents.size}`,
      `source_items.origins=${sourceItemOrigins.size}`,
      `memory_episodes=${memoryEpisodes.length}`,
      `beliefs.formed=${beliefsFormed}`,
      `beliefs.updated=${beliefsUpdated}`,
      `relationships.interacted=${relationshipsInteracted}`,
      `relationships.updated=${relationshipsUpdated}`,
      `persona_versions=${personaVersions.length}`,
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

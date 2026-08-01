import "dotenv/config";
import { getDatabase } from "@/lib/db/client";
import {
  EPOCH_2_FROM,
  EPOCH_2_TO,
  REFLECTION_STATUSES,
  classifyContentAttribution,
  classifyLifecycleWindow,
  classifyRunPair,
  distributeEpisodeActions,
  formatRatio,
  isTerminalRunStatus,
  istanbulDayKey,
  istanbulDayKeys,
  operatorFallbackBucket,
  parseReflectionStatus,
  parseWindowArguments,
  reflectionPurpose,
  renderTable,
  summarizeFreshSourceCoverage,
  type ContentAttribution,
  type ReflectionStatus,
  type RunClass,
} from "./society-report-helpers";

const ATTRIBUTIONS: readonly ContentAttribution[] = [
  "natural-agent",
  "operator-directed-agent",
  "human",
  "operator-directed-fallback",
  "unattributed",
];

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
const DICTIONARY_EVENT_TYPES = ["DICTIONARY_LINK_TRAVERSED"] as const;
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
  zeroActionRuns: number;
  singleActionRuns: number;
  multiActionRuns: number;
  explicitNoActionRuns: number;
}

interface AgentReflectionCoverage {
  runs: number;
  partial: number;
  failed: number;
  applied: number;
  noDelta: number;
  partialRun: number;
  frozen: number;
  stalePersona: number;
  rejectedPersonaDelta: number;
  unknown: number;
  linkedEvidence: number;
  sourceItemsPresented: number;
  sourceItemsReferenced: number;
}

function help(): string {
  return `Usage: pnpm agent:report:society [--from <ISO>] [--to <ISO>]

Read-only natural-flow baseline report. Timestamps must include a UTC offset.
Defaults: --from ${EPOCH_2_FROM}; --to current time.
All windows are half-open [from, to), calendar buckets use Europe/Istanbul, and SEED content is
excluded. The report includes safe run/action/rejection, source and evolution counts. It prints
counts and public usernames only; it never prints bodies, prompts, instructions or narrative memory.
Source URLs and topic labels are used only for in-memory distinct counts and are never rendered.
Current ACTIVE profiles remain in per-writer coverage even when they have zero natural wakes.
Lifecycle evidence separately reports profiles that stayed ACTIVE for the complete selected window.
Fresh-source coverage is derived from immutable source-item fetchedAt timestamps inside the window,
not from mutable current source-state timestamps. Runs created inside the window may terminalize
after its exclusive end; those runs are counted as terminal and their boundary delay is reported.
`;
}

function increment(values: Map<string, number>, key: string): void {
  values.set(key, (values.get(key) ?? 0) + 1);
}

function reportedPerformanceMetric(value: unknown, key: string): number {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  const reported = (value as Record<string, unknown>).reported;
  if (!reported || typeof reported !== "object" || Array.isArray(reported)) return 0;
  const metric = (reported as Record<string, unknown>)[key];
  return typeof metric === "number" && Number.isFinite(metric) && metric >= 0 ? metric : 0;
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
    zeroActionRuns: 0,
    singleActionRuns: 0,
    multiActionRuns: 0,
    explicitNoActionRuns: 0,
  };
}

function emptyAgentReflectionCoverage(): AgentReflectionCoverage {
  return {
    runs: 0,
    partial: 0,
    failed: 0,
    applied: 0,
    noDelta: 0,
    partialRun: 0,
    frozen: 0,
    stalePersona: 0,
    rejectedPersonaDelta: 0,
    unknown: 0,
    linkedEvidence: 0,
    sourceItemsPresented: 0,
    sourceItemsReferenced: 0,
  };
}

function incrementReflectionCoverage(
  coverage: AgentReflectionCoverage,
  status: ReflectionStatus,
): void {
  if (status === "APPLIED") coverage.applied += 1;
  else if (status === "NO_DELTA") coverage.noDelta += 1;
  else if (status === "PARTIAL_RUN") coverage.partialRun += 1;
  else if (status === "FROZEN") coverage.frozen += 1;
  else if (status === "STALE_PERSONA") coverage.stalePersona += 1;
  else if (status === "REJECTED_PERSONA_DELTA") coverage.rejectedPersonaDelta += 1;
  else coverage.unknown += 1;
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
      reflectionEvents,
      reflectionChangeEvents,
      profiles,
      lifecycleTransitions,
      dictionaryEvents,
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
          finishedAt: true,
          performanceMetrics: true,
          agentProfile: { select: { user: { select: { username: true } } } },
          _count: { select: { contentRecords: true } },
        },
      }),
      database.agentAction.findMany({
        where: { createdAt: { gte: window.from, lt: window.to } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          runId: true,
          agentProfileId: true,
          actionType: true,
          actionStatus: true,
          rejectionCode: true,
          updatedAt: true,
          run: { select: { trigger: true, runType: true } },
          agentProfile: { select: { user: { select: { id: true, username: true } } } },
          contentRecord: {
            select: {
              runId: true,
              agentProfileId: true,
              entry: { select: { authorId: true, origin: true } },
            },
          },
        },
      }),
      database.agentSource.findMany({
        select: {
          id: true,
          agentProfileId: true,
          url: true,
          status: true,
          adminBlocked: true,
          localeFocus: true,
          topics: true,
          normalizedDomain: true,
          lastFetchedAt: true,
          lastUsefulAt: true,
          consecutiveFailures: true,
          agentProfile: { select: { user: { select: { username: true } } } },
        },
      }),
      database.agentSourceItem.findMany({
        where: { fetchedAt: { gte: window.from, lt: window.to } },
        select: {
          sourceId: true,
          fetchedAt: true,
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
      database.agentRuntimeEvent.findMany({
        where: {
          occurredAt: { gte: window.from, lt: window.to },
          eventType: "run.completed",
          run: { runType: "REFLECTION", agentProfile: { lifecycleStatus: "ACTIVE" } },
        },
        orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
        select: {
          runId: true,
          metadata: true,
          run: {
            select: {
              trigger: true,
              runType: true,
              runStatus: true,
              errorCode: true,
              performanceMetrics: true,
              agentProfile: { select: { user: { select: { username: true } } } },
            },
          },
        },
      }),
      database.agentRuntimeEvent.findMany({
        where: {
          occurredAt: { gte: window.from, lt: window.to },
          eventType: {
            in: [
              "PERSONA_CHANGED",
              "BELIEF_CHANGED",
              "RELATIONSHIP_CHANGED",
              "SOURCE_STATE_CHANGED",
            ],
          },
          run: { runType: "REFLECTION", agentProfile: { lifecycleStatus: "ACTIVE" } },
        },
        select: { runId: true, evidenceIds: true },
      }),
      database.agentProfile.findMany({
        orderBy: { user: { username: "asc" } },
        select: {
          id: true,
          lifecycleStatus: true,
          createdAt: true,
          user: { select: { username: true } },
        },
      }),
      database.agentRuntimeEvent.findMany({
        where: {
          eventType: "agent.status.changed",
          occurredAt: { lt: window.to },
          agentProfileId: { not: null },
        },
        orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
        select: {
          agentProfileId: true,
          occurredAt: true,
          afterState: true,
        },
      }),
      database.agentRuntimeEvent.findMany({
        where: {
          occurredAt: { gte: window.from, lt: window.to },
          eventType: { in: [...DICTIONARY_EVENT_TYPES] },
        },
        select: {
          eventType: true,
          run: { select: { trigger: true, runType: true } },
          action: { select: { actionType: true, actionStatus: true } },
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
    const currentActiveUsernames = new Set(
      profiles
        .filter(({ lifecycleStatus }) => lifecycleStatus === "ACTIVE")
        .map(({ user }) => user.username),
    );
    const lifecycleWindowByAgent = classifyLifecycleWindow(
      profiles.map((profile) => ({
        id: profile.id,
        username: profile.user.username,
        createdAt: profile.createdAt,
      })),
      lifecycleTransitions.flatMap((transition) =>
        transition.agentProfileId
          ? [
              {
                agentProfileId: transition.agentProfileId,
                occurredAt: transition.occurredAt,
                afterState: transition.afterState,
              },
            ]
          : [],
      ),
      window,
    );
    const fullWindowActiveUsernames = new Set(
      [...lifecycleWindowByAgent.entries()]
        .filter(([, status]) => status === "FULL_WINDOW_ACTIVE")
        .map(([username]) => username),
    );
    const usefulItemFetchedAtBySource = new Map<string, Date>();
    for (const item of sourceItems) {
      const current = usefulItemFetchedAtBySource.get(item.sourceId);
      if (!current || item.fetchedAt > current) {
        usefulItemFetchedAtBySource.set(item.sourceId, item.fetchedAt);
      }
    }
    const freshSourceCoverage = summarizeFreshSourceCoverage(
      sources.map((source) => ({
        username: source.agentProfile.user.username,
        url: source.url,
        normalizedDomain: source.normalizedDomain,
        status: source.status,
        adminBlocked: source.adminBlocked,
        localeFocus: source.localeFocus,
        topics: source.topics,
        usefulItemFetchedAt: usefulItemFetchedAtBySource.get(source.id) ?? null,
      })),
      [...fullWindowActiveUsernames],
      window,
    );
    const fullWindowAgentsBelowSourceFloor = [...freshSourceCoverage.byAgent.values()].filter(
      ({ sources: sourceCount }) => sourceCount < 10,
    ).length;
    const fullWindowAgentsBelowOriginFloor = [...freshSourceCoverage.byAgent.values()].filter(
      ({ origins }) => origins < 6,
    ).length;
    const fullWindowAgentsBelowCategoryFloor = [...freshSourceCoverage.byAgent.values()].filter(
      ({ categories }) => categories < 5,
    ).length;
    const fullWindowAgentsMeetingSourceFloor = [...freshSourceCoverage.byAgent.values()].filter(
      ({ sources: sourceCount, origins, categories }) =>
        sourceCount >= 10 && origins >= 6 && categories >= 5,
    ).length;
    const coverageCohort = new Set([...currentActiveUsernames, ...fullWindowActiveUsernames]);
    for (const username of coverageCohort) {
      coverageByAgent.set(username, emptyAgentCoverage());
    }
    const warnings: string[] = [];
    const epochFrom = new Date(EPOCH_2_FROM).getTime();
    const epochTo = new Date(EPOCH_2_TO).getTime();
    const terminalRuns = runs.filter(
      (run) => isTerminalRunStatus(run.runStatus) && run.finishedAt !== null,
    );
    const terminalRunIds = new Set(terminalRuns.map(({ id }) => id));
    const windowActions = actions.filter(({ updatedAt }) => updatedAt < window.to);
    const actionsUpdatedAfterWindow = actions.length - windowActions.length;
    const successfulContentActions = windowActions.filter(
      (action) =>
        action.actionStatus === "SUCCEEDED" &&
        (action.actionType === "CREATE_ENTRY" || action.actionType === "CREATE_TOPIC_WITH_ENTRY"),
    );
    const successfulContentActionsWithoutRecord = successfulContentActions.filter(
      ({ contentRecord }) => contentRecord === null,
    ).length;
    const successfulContentActionsWithInvalidRecordLinkage = successfulContentActions.filter(
      (action) =>
        action.contentRecord !== null &&
        (action.contentRecord.runId !== action.runId ||
          action.contentRecord.agentProfileId !== action.agentProfileId ||
          action.contentRecord.entry.authorId !== action.agentProfile.user.id ||
          action.contentRecord.entry.origin !== "AGENT"),
    ).length;
    const successfulContentActionsWithExactRecord =
      successfulContentActions.length -
      successfulContentActionsWithoutRecord -
      successfulContentActionsWithInvalidRecordLinkage;
    for (const run of terminalRuns) {
      const key = `${run.trigger}|${run.runType}|${run.runStatus}|${run.errorCode ?? "-"}`;
      increment(runMatrix, key);
    }
    for (const run of runs) {
      const runClass = classifyRunPair(run.trigger, run.runType);
      const inEpoch2 = run.createdAt.getTime() >= epochFrom && run.createdAt.getTime() < epochTo;
      if (inEpoch2 && runClass === "unknown") {
        warnings.push(`${run.trigger} + ${run.runType} classified as ${runClass}`);
      }
      if (runClass === "natural-public" && terminalRunIds.has(run.id)) {
        const username = run.agentProfile.user.username;
        const coverage = coverageByAgent.get(username) ?? emptyAgentCoverage();
        coverage.runs += 1;
        if (run.runStatus === "SUCCEEDED") coverage.succeeded += 1;
        if (run.runStatus === "PARTIAL") coverage.partial += 1;
        if (run.runStatus === "FAILED") coverage.failed += 1;
        coverageByAgent.set(username, coverage);
      }
    }
    for (const action of windowActions) {
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
    const terminalNaturalRuns = naturalRuns.filter((run) => terminalRunIds.has(run.id));
    const terminalizedAfterWindow = terminalNaturalRuns.filter(
      ({ finishedAt }) => finishedAt !== null && finishedAt >= window.to,
    );
    const maximumTerminalizationDelaySeconds = Math.max(
      0,
      ...terminalizedAfterWindow.map(({ finishedAt }) =>
        Math.ceil((finishedAt!.getTime() - window.to.getTime()) / 1000),
      ),
    );
    const nonterminalNaturalRuns = naturalRuns.length - terminalNaturalRuns.length;
    const naturalRunStatusCounts = new Map<string, number>();
    for (const run of terminalNaturalRuns) increment(naturalRunStatusCounts, run.runStatus);
    const naturalSourceItemsFetched = terminalNaturalRuns.reduce(
      (sum, run) => sum + reportedPerformanceMetric(run.performanceMetrics, "sourceItemsFetched"),
      0,
    );
    const naturalSourceReads = terminalNaturalRuns.reduce(
      (sum, run) => sum + reportedPerformanceMetric(run.performanceMetrics, "sourceReads"),
      0,
    );
    const naturalSourceItemsPresented = terminalNaturalRuns.reduce(
      (sum, run) => sum + reportedPerformanceMetric(run.performanceMetrics, "sourceItemsPresented"),
      0,
    );
    const naturalSourceItemsReferenced = terminalNaturalRuns.reduce(
      (sum, run) =>
        sum + reportedPerformanceMetric(run.performanceMetrics, "sourceItemsReferenced"),
      0,
    );
    const naturalSourceBackedActions = terminalNaturalRuns.reduce(
      (sum, run) => sum + reportedPerformanceMetric(run.performanceMetrics, "sourceBackedActions"),
      0,
    );
    const naturalRunsWithSourceItemsPresented = terminalNaturalRuns.filter(
      (run) => reportedPerformanceMetric(run.performanceMetrics, "sourceItemsPresented") > 0,
    ).length;
    const naturalRunsWithSourceEvidence = terminalNaturalRuns.filter(
      (run) => reportedPerformanceMetric(run.performanceMetrics, "sourceItemsReferenced") > 0,
    ).length;
    const partialRunReasonCounts = new Map<string, number>();
    let partialRunsWithoutSafeReason = 0;
    let cancelledRunsWithoutSafeReason = 0;
    for (const run of terminalNaturalRuns) {
      if (run.runStatus === "PARTIAL") {
        const codes = [
          ...new Set(
            [
              run.errorCode,
              ...(actionsByRun.get(run.id) ?? []).map(({ rejectionCode }) => rejectionCode),
            ].filter((code): code is string => Boolean(code)),
          ),
        ].sort();
        if (codes.length === 0) partialRunsWithoutSafeReason += 1;
        increment(partialRunReasonCounts, codes.length === 0 ? "UNEXPLAINED" : codes.join("+"));
      }
      if (run.runStatus === "CANCELLED" && !run.errorCode) {
        cancelledRunsWithoutSafeReason += 1;
      }
    }
    const failedOrTimedOutNaturalRuns =
      (naturalRunStatusCounts.get("FAILED") ?? 0) + (naturalRunStatusCounts.get("TIMED_OUT") ?? 0);
    const episodeDistributionByAgent = distributeEpisodeActions(
      [...coverageCohort],
      terminalNaturalRuns.map((run) => ({
        username: run.agentProfile.user.username,
        actionTypes: (actionsByRun.get(run.id) ?? []).map(({ actionType }) => actionType),
      })),
    );
    let zeroActionRuns = 0;
    let singleActionRuns = 0;
    let multiActionRuns = 0;
    let explicitNoActionRuns = 0;
    for (const [username, distribution] of episodeDistributionByAgent) {
      const coverage = coverageByAgent.get(username) ?? emptyAgentCoverage();
      coverage.zeroActionRuns = distribution.zero;
      coverage.singleActionRuns = distribution.one;
      coverage.multiActionRuns = distribution.multi;
      coverage.explicitNoActionRuns = distribution.explicitNoAction;
      zeroActionRuns += distribution.zero;
      singleActionRuns += distribution.one;
      multiActionRuns += distribution.multi;
      explicitNoActionRuns += distribution.explicitNoAction;
      coverageByAgent.set(username, coverage);
    }
    const currentActiveAgentsWithoutNaturalWake = [...currentActiveUsernames].filter(
      (username) => (episodeDistributionByAgent.get(username)?.runs ?? 0) === 0,
    ).length;
    const currentActiveAgentsWithNaturalWake =
      currentActiveUsernames.size - currentActiveAgentsWithoutNaturalWake;
    const fullWindowActiveAgentsWithoutNaturalWake = [...fullWindowActiveUsernames].filter(
      (username) => (episodeDistributionByAgent.get(username)?.runs ?? 0) === 0,
    ).length;
    const fullWindowActiveAgentsWithNaturalWake =
      fullWindowActiveUsernames.size - fullWindowActiveAgentsWithoutNaturalWake;
    const fullWindowActiveAgentsBelowThreeWakes = [...fullWindowActiveUsernames].filter(
      (username) => (episodeDistributionByAgent.get(username)?.runs ?? 0) < 3,
    ).length;
    const naturalRunsWithSucceededAction = terminalNaturalRuns.filter((run) =>
      actionsByRun.get(run.id)?.some((action) => action.actionStatus === "SUCCEEDED"),
    ).length;
    const naturalRunsWithPublicEffect = terminalNaturalRuns.filter((run) =>
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
    const topTopicEntryCount = rankedTopicCounts[0] ?? 0;
    const topicConcentrationReviewWarning =
      naturalEntries.length >= 20 && topTopicEntryCount / naturalEntries.length > 0.75;

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
    const reflectionReasonCounts = new Map<string, number>();
    const reflectionPurposeCounts = new Map<string, number>();
    const reflectionFailureCodes = new Map<string, number>();
    const reflectionByAgent = new Map<string, AgentReflectionCoverage>();
    const reflectionEvidenceByRun = new Map<string, Set<string>>();
    for (const event of reflectionChangeEvents) {
      if (!event.runId) continue;
      const ids = reflectionEvidenceByRun.get(event.runId) ?? new Set<string>();
      for (const evidenceId of event.evidenceIds) ids.add(evidenceId);
      reflectionEvidenceByRun.set(event.runId, ids);
    }
    const seenReflectionRuns = new Set<string>();
    for (const event of reflectionEvents) {
      if (!event.run || !event.runId || seenReflectionRuns.has(event.runId)) continue;
      seenReflectionRuns.add(event.runId);
      const status = parseReflectionStatus(event.metadata);
      const purpose = reflectionPurpose(event.run.trigger);
      increment(reflectionReasonCounts, `${purpose}|${status}`);
      increment(reflectionPurposeCounts, purpose);
      if (event.run.runStatus !== "SUCCEEDED") {
        increment(
          reflectionFailureCodes,
          `${purpose}|${event.run.runStatus}|${event.run.errorCode ?? `REFLECTION_${status}`}`,
        );
      }
      if (purpose === "MEMORY_CONSOLIDATION") continue;
      const coverage =
        reflectionByAgent.get(event.run.agentProfile.user.username) ??
        emptyAgentReflectionCoverage();
      coverage.runs += 1;
      if (event.run.runStatus === "PARTIAL") coverage.partial += 1;
      if (["FAILED", "CANCELLED", "TIMED_OUT"].includes(event.run.runStatus)) coverage.failed += 1;
      coverage.linkedEvidence += reflectionEvidenceByRun.get(event.runId)?.size ?? 0;
      coverage.sourceItemsPresented += reportedPerformanceMetric(
        event.run.performanceMetrics,
        "sourceItemsPresented",
      );
      coverage.sourceItemsReferenced += reportedPerformanceMetric(
        event.run.performanceMetrics,
        "sourceItemsReferenced",
      );
      incrementReflectionCoverage(coverage, status);
      reflectionByAgent.set(event.run.agentProfile.user.username, coverage);
    }
    for (const profile of profiles.filter(({ lifecycleStatus }) => lifecycleStatus === "ACTIVE")) {
      if (!reflectionByAgent.has(profile.user.username)) {
        reflectionByAgent.set(profile.user.username, emptyAgentReflectionCoverage());
      }
    }
    const activeAgentsWithoutReflection = [...reflectionByAgent.values()].filter(
      ({ runs: reflectionRuns }) => reflectionRuns === 0,
    ).length;
    const dictionaryEventCounts = new Map<string, number>();
    for (const event of dictionaryEvents) {
      const runClass = event.run
        ? classifyRunPair(event.run.trigger, event.run.runType)
        : "unknown";
      increment(
        dictionaryEventCounts,
        `${runClass}|${event.eventType}|${event.action?.actionType ?? "-"}|${event.action?.actionStatus ?? "-"}`,
      );
    }

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
          "nonterminal",
          "zeroAction",
          "singleAction",
          "explicitNoAction",
          "multiAction",
          "withSuccess",
          "withPublicEffect",
        ],
        [
          [
            String(terminalNaturalRuns.length),
            String(nonterminalNaturalRuns),
            String(zeroActionRuns),
            String(singleActionRuns),
            String(explicitNoActionRuns),
            String(multiActionRuns),
            String(naturalRunsWithSucceededAction),
            String(naturalRunsWithPublicEffect),
          ],
        ],
      ),
      "",
      "NATURAL PARTIAL SAFE REASONS",
      renderTable(
        ["safeCodeSet", "runs"],
        [...partialRunReasonCounts.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([safeCodeSet, count]) => [safeCodeSet, String(count)]),
      ),
      "",
      "LIFECYCLE WINDOW COHORT",
      renderTable(
        ["username", "currentLifecycle", "windowStatus"],
        profiles.map((profile) => [
          profile.user.username,
          profile.lifecycleStatus,
          lifecycleWindowByAgent.get(profile.user.username) ?? "UNPROVEN_AT_START",
        ]),
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
          "zeroActionRuns",
          "singleActionRuns",
          "multiActionRuns",
          "explicitNoActionRuns",
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
            String(coverage.zeroActionRuns),
            String(coverage.singleActionRuns),
            String(coverage.multiActionRuns),
            String(coverage.explicitNoActionRuns),
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
      "FULL-WINDOW FRESH SOURCE COVERAGE",
      renderTable(
        ["username", "sources", "origins", "categories", "meetsFloor"],
        [...freshSourceCoverage.byAgent.entries()].map(([username, coverage]) => [
          username,
          String(coverage.sources),
          String(coverage.origins),
          String(coverage.categories),
          coverage.sources >= 10 && coverage.origins >= 6 && coverage.categories >= 5
            ? "yes"
            : "no",
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
      "REFLECTION CHANGE / NO-CHANGE REASONS",
      renderTable(
        ["purpose", "reason", "count"],
        [...reflectionReasonCounts.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, count]) => [...key.split("|"), String(count)]),
      ),
      "",
      "REFLECTION COVERAGE BY ACTIVE AGENT",
      renderTable(
        [
          "username",
          "runs",
          "partial",
          "failed",
          "applied",
          "noDelta",
          "partialRun",
          "frozen",
          "stalePersona",
          "rejectedDelta",
          "unknown",
          "linkedEvidence",
          "sourcePresented",
          "sourceReferenced",
        ],
        [...reflectionByAgent.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([username, coverage]) => [
            username,
            String(coverage.runs),
            String(coverage.partial),
            String(coverage.failed),
            String(coverage.applied),
            String(coverage.noDelta),
            String(coverage.partialRun),
            String(coverage.frozen),
            String(coverage.stalePersona),
            String(coverage.rejectedPersonaDelta),
            String(coverage.unknown),
            String(coverage.linkedEvidence),
            String(coverage.sourceItemsPresented),
            String(coverage.sourceItemsReferenced),
          ]),
      ),
      "",
      "REFLECTION PARTIAL / FAILURE CODES",
      renderTable(
        ["purpose", "status", "safeCode", "count"],
        [...reflectionFailureCodes.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, count]) => [...key.split("|"), String(count)]),
      ),
      "",
      "DICTIONARY DISCOVERY EVENTS",
      renderTable(
        ["runClass", "eventType", "actionType", "status", "count"],
        [...dictionaryEventCounts.entries()]
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
      `natural_entries.self_topic_revisits=${selfTopicRevisits}`,
      `natural_entries.self_topic_revisit_share=${formatRatio(
        selfTopicRevisits,
        naturalEntries.length,
      )}`,
      `natural_entries.max_consecutive_self_topic_revisits=${maximumSelfTopicRevisitStreak}`,
      `votes_created=${votes.length}`,
      `natural_entries_with_vote=${formatRatio(naturalEntriesWithVote, naturalEntries.length)}`,
      `agent_content_without_run_linkage=${agentContentWithoutRun}`,
      `successful_content_actions=${successfulContentActions.length}`,
      `successful_content_actions_with_exact_record=${successfulContentActionsWithExactRecord}`,
      `successful_content_actions_without_record=${successfulContentActionsWithoutRecord}`,
      `successful_content_actions_with_invalid_record_linkage=${successfulContentActionsWithInvalidRecordLinkage}`,
      `natural_content_inside_operator_windows=${naturalInsideOperatorWindow}`,
      `operator_runs_with_content=${operatorRunsWithContent}`,
      `operator_runs_without_content=${operatorRuns.length - operatorRunsWithContent}`,
      `nonterminal_runs=${runs.length - terminalRuns.length}`,
      `actions_updated_after_window_excluded=${actionsUpdatedAfterWindow}`,
      `natural_runs=${terminalNaturalRuns.length}`,
      `natural_runs.nonterminal=${nonterminalNaturalRuns}`,
      `natural_runs.terminalized_after_window=${terminalizedAfterWindow.length}`,
      `natural_runs.terminalized_after_window_max_delay_seconds=${maximumTerminalizationDelaySeconds}`,
      `natural_runs.succeeded=${naturalRunStatusCounts.get("SUCCEEDED") ?? 0}`,
      `natural_runs.partial=${naturalRunStatusCounts.get("PARTIAL") ?? 0}`,
      `natural_runs.failed=${naturalRunStatusCounts.get("FAILED") ?? 0}`,
      `natural_runs.timed_out=${naturalRunStatusCounts.get("TIMED_OUT") ?? 0}`,
      `natural_runs.cancelled=${naturalRunStatusCounts.get("CANCELLED") ?? 0}`,
      `natural_runs.partial_without_safe_reason=${partialRunsWithoutSafeReason}`,
      `natural_runs.cancelled_without_safe_reason=${cancelledRunsWithoutSafeReason}`,
      `natural_runs.failed_or_timed_out_rate=${formatRatio(
        failedOrTimedOutNaturalRuns,
        terminalNaturalRuns.length,
      )}`,
      `natural_runs.zero_action=${zeroActionRuns}`,
      `natural_runs.single_action=${singleActionRuns}`,
      `natural_runs.explicit_no_action=${explicitNoActionRuns}`,
      `natural_runs.multi_action=${multiActionRuns}`,
      `natural_runs.with_succeeded_action=${naturalRunsWithSucceededAction}`,
      `natural_runs.with_public_effect=${naturalRunsWithPublicEffect}`,
      `natural_sources.items_fetched=${naturalSourceItemsFetched}`,
      `natural_sources.items_committed=${naturalSourceReads}`,
      `natural_sources.items_presented=${naturalSourceItemsPresented}`,
      `natural_sources.items_referenced=${naturalSourceItemsReferenced}`,
      `natural_sources.source_backed_actions=${naturalSourceBackedActions}`,
      `natural_sources.runs_with_items_presented=${naturalRunsWithSourceItemsPresented}`,
      `natural_sources.runs_with_source_evidence=${naturalRunsWithSourceEvidence}`,
      `current_active_agents=${currentActiveUsernames.size}`,
      `current_active_agents_with_natural_wake=${currentActiveAgentsWithNaturalWake}`,
      `current_active_agents_without_natural_wake=${currentActiveAgentsWithoutNaturalWake}`,
      `full_window_active_agents=${fullWindowActiveUsernames.size}`,
      `full_window_active_agents_with_natural_wake=${fullWindowActiveAgentsWithNaturalWake}`,
      `full_window_active_agents_without_natural_wake=${fullWindowActiveAgentsWithoutNaturalWake}`,
      `full_window_active_agents_below_three_wakes=${fullWindowActiveAgentsBelowThreeWakes}`,
      ...["FULL_WINDOW_ACTIVE", "NOT_ACTIVE_AT_START", "INTERRUPTED", "UNPROVEN_AT_START"].map(
        (status) =>
          `lifecycle_window.${status.toLowerCase()}=${
            [...lifecycleWindowByAgent.values()].filter((value) => value === status).length
          }`,
      ),
      `source_items=${sourceItems.length}`,
      `source_items.sources=${sourceItemSources.size}`,
      `source_items.agents=${sourceItemAgents.size}`,
      `source_items.origins=${sourceItemOrigins.size}`,
      `fresh_enabled_sources=${freshSourceCoverage.poolSources}`,
      `fresh_enabled_source_origins=${freshSourceCoverage.poolOrigins}`,
      `fresh_enabled_turkish_or_turkey_focused_sources=${freshSourceCoverage.poolTurkishOrTurkeyFocusedSources}`,
      `fresh_enabled_sources.invalid_topic_payloads=${freshSourceCoverage.invalidTopicPayloads}`,
      `full_window_active_agents_meeting_source_floor=${fullWindowAgentsMeetingSourceFloor}`,
      `full_window_active_agents_below_source_floor=${fullWindowAgentsBelowSourceFloor}`,
      `full_window_active_agents_below_origin_floor=${fullWindowAgentsBelowOriginFloor}`,
      `full_window_active_agents_below_category_floor=${fullWindowAgentsBelowCategoryFloor}`,
      `natural_entries.top_topic_share=${formatRatio(topTopicEntryCount, naturalEntries.length)}`,
      `topic_concentration_review_warning=${topicConcentrationReviewWarning ? "yes" : "no"}`,
      `memory_episodes=${memoryEpisodes.length}`,
      `beliefs.formed=${beliefsFormed}`,
      `beliefs.updated=${beliefsUpdated}`,
      `relationships.interacted=${relationshipsInteracted}`,
      `relationships.updated=${relationshipsUpdated}`,
      `persona_versions=${personaVersions.length}`,
      `reflection_runs=${seenReflectionRuns.size}`,
      `reflection_runs.persona_evolution=${reflectionPurposeCounts.get("PERSONA_EVOLUTION") ?? 0}`,
      `reflection_runs.memory_consolidation=${reflectionPurposeCounts.get("MEMORY_CONSOLIDATION") ?? 0}`,
      ...(["PERSONA_EVOLUTION", "MEMORY_CONSOLIDATION"] as const).flatMap((purpose) =>
        [...REFLECTION_STATUSES, "UNKNOWN"].map(
          (status) =>
            `reflection_reason.${purpose}.${status}=${reflectionReasonCounts.get(`${purpose}|${status}`) ?? 0}`,
        ),
      ),
      `active_agents_without_persona_reflection=${activeAgentsWithoutReflection}`,
      `reflection_change_evidence_ids=${[...reflectionByAgent.values()].reduce((sum, coverage) => sum + coverage.linkedEvidence, 0)}`,
      `reflection_sources.items_presented=${[...reflectionByAgent.values()].reduce((sum, coverage) => sum + coverage.sourceItemsPresented, 0)}`,
      `reflection_sources.items_referenced=${[...reflectionByAgent.values()].reduce((sum, coverage) => sum + coverage.sourceItemsReferenced, 0)}`,
      `dictionary_links.traversed=${dictionaryEvents.length}`,
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

import "dotenv/config";
import { getDatabase } from "@/lib/db/client";
import {
  EXPECTED_OPERATOR_FINGERPRINTS,
  fingerprintIds,
  operatorFallbackBucket,
  parseWindowArguments,
  renderTable,
  type ExperimentBucket,
} from "./society-report-helpers";

const OPERATOR_TRIGGERS = ["ADMIN_MANUAL", "ADMIN_RETRY"];

function help(): string {
  return `Usage: pnpm agent:report:experiment-memory --from <ISO> --to <ISO>

Read-only report for identifying memory and evolution records associated with an operator-experiment
window. Use it to review candidates and, if appropriate, prune them through the existing admin
memory controls before the next weekly persona evolution. This script performs no mutation and no
pruning. Both timestamps are required, include an explicit UTC offset, and form [from, to).

The report prints episode id/createdAt/eventType, aggregate belief/relationship counts, persona
version id/version/createdAt, public usernames and run-set fingerprints. It never prints episode
summaries, belief text, relationship text, prompts, admin instructions, entry bodies or emails.
`;
}

function bucketLabel(value: Date): ExperimentBucket | "outside-declared-window" {
  return operatorFallbackBucket(value) ?? "outside-declared-window";
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(help());
    return;
  }
  const window = parseWindowArguments(argv);
  const database = getDatabase();

  try {
    const [
      profiles,
      instructionRuns,
      timingRuns,
      episodes,
      beliefs,
      relationships,
      personaVersions,
    ] = await Promise.all([
      database.agentProfile.findMany({
        orderBy: { user: { username: "asc" } },
        select: { id: true, user: { select: { username: true } } },
      }),
      database.agentRun.findMany({
        where: {
          createdAt: { gte: window.from, lt: window.to },
          trigger: { in: OPERATOR_TRIGGERS },
          adminInstruction: { not: null },
        },
        select: { id: true, agentProfileId: true },
      }),
      database.agentRun.findMany({
        where: {
          createdAt: { gte: window.from, lt: window.to },
          trigger: { in: OPERATOR_TRIGGERS },
          adminInstruction: null,
        },
        select: { id: true, agentProfileId: true },
      }),
      database.agentMemoryEpisode.findMany({
        where: { createdAt: { gte: window.from, lt: window.to } },
        orderBy: [{ agentProfileId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: { id: true, agentProfileId: true, runId: true, eventType: true, createdAt: true },
      }),
      database.agentBelief.findMany({
        where: {
          OR: [
            { firstFormedAt: { gte: window.from, lt: window.to } },
            { lastUpdatedAt: { gte: window.from, lt: window.to } },
          ],
        },
        select: { agentProfileId: true, firstFormedAt: true, lastUpdatedAt: true },
      }),
      database.agentRelationship.findMany({
        where: {
          OR: [
            { updatedAt: { gte: window.from, lt: window.to } },
            { lastInteractionAt: { gte: window.from, lt: window.to } },
          ],
        },
        select: { agentProfileId: true, updatedAt: true, lastInteractionAt: true },
      }),
      database.agentPersonaVersion.findMany({
        where: { createdAt: { gte: window.from, lt: window.to } },
        orderBy: [{ agentProfileId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: { id: true, agentProfileId: true, version: true, createdAt: true },
      }),
    ]);

    const episodeRunIds = [...new Set(episodes.flatMap(({ runId }) => (runId ? [runId] : [])))];
    const [linkedInstructionRuns, linkedTimingRuns] =
      episodeRunIds.length === 0
        ? [[], []]
        : await Promise.all([
            database.agentRun.findMany({
              where: {
                id: { in: episodeRunIds },
                trigger: { in: OPERATOR_TRIGGERS },
                adminInstruction: { not: null },
              },
              select: { id: true },
            }),
            database.agentRun.findMany({
              where: {
                id: { in: episodeRunIds },
                trigger: { in: OPERATOR_TRIGGERS },
                adminInstruction: null,
              },
              select: { id: true },
            }),
          ]);
    const linkedInstructionIds = new Set(linkedInstructionRuns.map(({ id }) => id));
    const linkedTimingIds = new Set(linkedTimingRuns.map(({ id }) => id));

    const instructionIds = instructionRuns.map(({ id }) => id);
    const timingIds = timingRuns.map(({ id }) => id);
    const instructionFingerprint = fingerprintIds(instructionIds);
    const timingFingerprint = fingerprintIds(timingIds);
    const combinedFingerprint = fingerprintIds([...instructionIds, ...timingIds]);
    const instructionAgents = new Set(instructionRuns.map(({ agentProfileId }) => agentProfileId));
    const timingAgents = new Set(timingRuns.map(({ agentProfileId }) => agentProfileId));

    const output = [
      "EXPERIMENT MEMORY / EVOLUTION REPORT (READ ONLY)",
      `window_utc  ${window.from.toISOString()} -> ${window.to.toISOString()} [end exclusive]`,
      "mutation    none",
      "",
      "OPERATOR RUN SET",
      renderTable(
        ["bucket", "runs", "agents", "fingerprint", "known_epoch1_match"],
        [
          [
            "instruction-shaped",
            String(instructionRuns.length),
            String(instructionAgents.size),
            instructionFingerprint,
            String(instructionFingerprint === EXPECTED_OPERATOR_FINGERPRINTS.instructionShaped),
          ],
          [
            "forced-timing-only",
            String(timingRuns.length),
            String(timingAgents.size),
            timingFingerprint,
            String(timingFingerprint === EXPECTED_OPERATOR_FINGERPRINTS.forcedTimingOnly),
          ],
          [
            "all",
            String(instructionRuns.length + timingRuns.length),
            String(new Set([...instructionAgents, ...timingAgents]).size),
            combinedFingerprint,
            String(combinedFingerprint === EXPECTED_OPERATOR_FINGERPRINTS.all),
          ],
        ],
      ),
    ];

    let directInstructionEpisodes = 0;
    let directTimingEpisodes = 0;
    let fallbackInstructionEpisodes = 0;
    let fallbackTimingEpisodes = 0;
    for (const profile of profiles) {
      const profileEpisodes = episodes.filter(
        ({ agentProfileId }) => agentProfileId === profile.id,
      );
      const profileBeliefs = beliefs.filter(({ agentProfileId }) => agentProfileId === profile.id);
      const profileRelationships = relationships.filter(
        ({ agentProfileId }) => agentProfileId === profile.id,
      );
      const profileVersions = personaVersions.filter(
        ({ agentProfileId }) => agentProfileId === profile.id,
      );
      const formedBeliefs = profileBeliefs.filter(
        ({ firstFormedAt }) => firstFormedAt >= window.from && firstFormedAt < window.to,
      );
      const updatedBeliefs = profileBeliefs.filter(
        ({ lastUpdatedAt }) => lastUpdatedAt >= window.from && lastUpdatedAt < window.to,
      );
      const relationshipTouches = profileRelationships.filter(
        ({ updatedAt, lastInteractionAt }) =>
          (updatedAt >= window.from && updatedAt < window.to) ||
          (lastInteractionAt !== null &&
            lastInteractionAt >= window.from &&
            lastInteractionAt < window.to),
      );

      output.push("", `AGENT @${profile.user.username} (${profile.id})`, "MEMORY EPISODES");
      output.push(
        renderTable(
          ["id", "createdAt", "eventType", "attribution"],
          profileEpisodes.map((episode) => {
            let attribution: string;
            if (episode.runId && linkedInstructionIds.has(episode.runId)) {
              attribution = "instruction-shaped:run-linked";
              directInstructionEpisodes += 1;
            } else if (episode.runId && linkedTimingIds.has(episode.runId)) {
              attribution = "forced-timing-only:run-linked";
              directTimingEpisodes += 1;
            } else if (episode.runId) {
              attribution = "non-operator-run-linked";
            } else {
              const bucket = operatorFallbackBucket(episode.createdAt);
              attribution = bucket ? `${bucket}:timestamp-fallback` : "unattributed";
              if (bucket === "instruction-shaped") fallbackInstructionEpisodes += 1;
              if (bucket === "forced-timing-only") fallbackTimingEpisodes += 1;
            }
            return [episode.id, episode.createdAt.toISOString(), episode.eventType, attribution];
          }),
        ),
        "BELIEF COUNTS",
        renderTable(
          ["formed_in_window", "updated_in_window"],
          [[String(formedBeliefs.length), String(updatedBeliefs.length)]],
        ),
        "RELATIONSHIP COUNTS",
        renderTable(["touched_in_window"], [[String(relationshipTouches.length)]]),
        "PERSONA VERSIONS",
        renderTable(
          ["id", "version", "createdAt", "timestamp_bucket"],
          profileVersions.map((version) => [
            version.id,
            String(version.version),
            version.createdAt.toISOString(),
            bucketLabel(version.createdAt),
          ]),
        ),
      );
    }

    output.push(
      "",
      "SUMMARY",
      `memory_episodes=${episodes.length}`,
      `memory.instruction-shaped.run-linked=${directInstructionEpisodes}`,
      `memory.instruction-shaped.timestamp-fallback=${fallbackInstructionEpisodes}`,
      `memory.forced-timing-only.run-linked=${directTimingEpisodes}`,
      `memory.forced-timing-only.timestamp-fallback=${fallbackTimingEpisodes}`,
      `beliefs.formed=${beliefs.filter(({ firstFormedAt }) => firstFormedAt >= window.from && firstFormedAt < window.to).length}`,
      `beliefs.updated=${beliefs.filter(({ lastUpdatedAt }) => lastUpdatedAt >= window.from && lastUpdatedAt < window.to).length}`,
      `relationships.touched=${relationships.length}`,
      `persona_versions=${personaVersions.length}`,
      "review_note=Instruction-shaped records are primary review candidates; this report does not decide or perform pruning.",
    );
    process.stdout.write(`${output.join("\n")}\n`);
  } finally {
    await database.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Experiment memory report failed."}\n`,
  );
  process.exitCode = 1;
});

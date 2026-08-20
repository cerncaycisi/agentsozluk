import "dotenv/config";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getDatabase } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";
import { sha256 } from "@/lib/security/crypto";
import { setSocietyFlowEnabled, updateAgent } from "@/modules/agents";
import { validatePersonaCandidate } from "@/modules/agents/domain/persona-validation";
import { renderPersonaPrompt } from "@/modules/agents/personas/prompt-renderer";
import { seedPersonaSchema, type SeedPersona } from "@/modules/agents/personas/schema";
import { resolveOperatorAdmin } from "./agent-operator";
import {
  buildPromptRolloutPlan,
  personaHash,
  promptRolloutEnvironmentSchema,
  promptRolloutLifecycleStatuses,
  type PersonaPromptRecord,
  type PromptRolloutPlan,
} from "./rollout-persona-prompts-helpers";

// Tekrar kullanılabilir persona prompt rollout'u (ADR-013).
//
// Persona içeriğine dokunmaz: her persona'yı olduğu gibi alır, güncel renderer ile yeniden
// render eder ve yalnız render çıktısı değişmişse persona sürümünü bumplar. Böylece her prompt
// değişikliğinde yeni bir tek seferlik script yazmak gerekmez.
//
// Modlar (AGENT_PROMPT_ROLLOUT_MODE):
//   DRY_RUN (varsayılan) — hiçbir şey yazmaz; plan, hash raporu ve snapshotHash basar.
//   PAUSE                — toplum akışını kapatır, açık run sayısını raporlar.
//   APPLY                — akış kapalı ve açık run yokken tek transaction içinde sürüm bumplar.
//   RESUME               — her persona'nın snapshot'ı güncel renderer ile eşitse akışı açar.

const terminalRunStatuses = ["SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED", "TIMED_OUT"] as const;

type Executor = Parameters<typeof updateAgent>[0];

interface PersonaPromptEntry {
  record: PersonaPromptRecord;
  persona: SeedPersona;
}

function write(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

/** Rollout'un veritabanına bıraktığı iz: her persona sürümünün changeSummary'si bu partiyi adlar. */
function changeSummaryFor(reason: string, rolloutId: string): string {
  return `${reason} [rollout=${rolloutId}]`;
}

async function loadEntries(
  database: Executor,
  changeSummary: string,
): Promise<PersonaPromptEntry[]> {
  const profiles = await database.agentProfile.findMany({
    where: { lifecycleStatus: { in: [...promptRolloutLifecycleStatuses] } },
    orderBy: { user: { username: "asc" } },
    select: {
      id: true,
      lifecycleStatus: true,
      user: { select: { username: true } },
      currentPersonaVersion: {
        select: { id: true, version: true, persona: true, renderedPrompt: true },
      },
    },
  });
  if (profiles.length === 0) throw new Error("PROMPT_ROLLOUT_POPULATION_EMPTY");

  const personas = profiles.map((profile) => {
    if (!profile.currentPersonaVersion)
      throw new Error(`PROMPT_ROLLOUT_PERSONA_MISSING username=${profile.user.username}`);
    return seedPersonaSchema.parse(profile.currentPersonaVersion.persona);
  });

  return profiles.map((profile, index): PersonaPromptEntry => {
    const version = profile.currentPersonaVersion!;
    const persona = personas[index]!;
    // Kuru deneme: rollout gerçekten uygulanırken updateAgent aynı doğrulamayı çalıştıracak.
    // Burada yakalamak, toplumu duraklattıktan sonra APPLY'ın patlamasını önler.
    let validation = "PASS";
    try {
      validatePersonaCandidate(
        persona,
        personas.filter((_, other) => other !== index),
        changeSummary,
      );
    } catch (error: unknown) {
      validation = error instanceof AppError ? error.code : "VALIDATION_FAILED";
    }
    return {
      persona,
      record: {
        profileId: profile.id,
        username: profile.user.username,
        lifecycleStatus: profile.lifecycleStatus,
        personaVersionId: version.id,
        personaVersion: version.version,
        storedPersonaHash: personaHash(version.persona),
        normalizedPersonaHash: personaHash(persona),
        storedPrompt: version.renderedPrompt,
        expectedPrompt: renderPersonaPrompt(persona),
        validation,
      },
    };
  });
}

async function loadPlan(
  database: Executor,
  changeSummary: string,
): Promise<{ entries: PersonaPromptEntry[]; plan: PromptRolloutPlan }> {
  const entries = await loadEntries(database, changeSummary);
  return { entries, plan: buildPromptRolloutPlan(entries.map(({ record }) => record)) };
}

async function loadFlow(database: Executor) {
  const [settings, openRunCount] = await Promise.all([
    database.agentGlobalSettings.findUniqueOrThrow({
      where: { id: "global" },
      select: { settingsVersion: true, runtimeEnabled: true },
    }),
    database.agentRun.count({ where: { runStatus: { notIn: [...terminalRunStatuses] } } }),
  ]);
  return { settings, openRunCount };
}

function assertSnapshot(expected: string | undefined, actual: string): void {
  if (!expected || expected !== actual)
    throw new Error(`PROMPT_ROLLOUT_SNAPSHOT_DRIFT actual=${actual}`);
}

function emitPlan(phase: string, plan: PromptRolloutPlan): void {
  write({
    event: "PROMPT_ROLLOUT_PLAN",
    phase,
    lifecycleStatuses: promptRolloutLifecycleStatuses,
    profileCount: plan.profileCount,
    changeCount: plan.changeCount,
    personaDriftCount: plan.personaDriftCount,
    validationFailureCount: plan.validationFailureCount,
    snapshotHash: plan.snapshotHash,
    beforeTemplateGroups: plan.beforeTemplateGroups,
    afterTemplateGroups: plan.afterTemplateGroups,
  });
  for (const receipt of plan.receipts)
    write({ event: "PROMPT_ROLLOUT_PERSONA", phase, ...receipt });
}

/**
 * Commit sonrası makbuz. Bumplanan her persona için sürüm zincirinin doğru uzadığını, persona
 * içeriğinin değişmediğini ve worker'ın okuyacağı snapshot'ın güncel renderer çıktısına eşit
 * olduğunu doğrular; dokunulmayan persona'ların sürümünün hiç kıpırdamadığını da kontrol eder.
 */
function assertAppliedCorrectly(
  before: PromptRolloutPlan,
  after: PromptRolloutPlan,
): { changed: number; untouched: number } {
  if (before.profileCount !== after.profileCount)
    throw new Error("PROMPT_ROLLOUT_POST_APPLY_INVALID reason=POPULATION_CHANGED");
  let changed = 0;
  let untouched = 0;
  for (let index = 0; index < before.receipts.length; index += 1) {
    const source = before.receipts[index]!;
    const target = after.receipts[index]!;
    if (
      source.username !== target.username ||
      source.profileId !== target.profileId ||
      source.storedPersonaHash !== target.storedPersonaHash ||
      source.lifecycleStatus !== target.lifecycleStatus
    )
      throw new Error(`PROMPT_ROLLOUT_POST_APPLY_INVALID username=${source.username}`);
    if (source.changeNeeded) {
      if (
        target.personaVersion !== source.personaVersion + 1 ||
        target.storedPromptHash !== source.expectedPromptHash ||
        target.changeNeeded
      )
        throw new Error(`PROMPT_ROLLOUT_POST_APPLY_INVALID username=${source.username}`);
      changed += 1;
      continue;
    }
    if (target.personaVersion !== source.personaVersion)
      throw new Error(`PROMPT_ROLLOUT_UNCHANGED_PERSONA_BUMPED username=${source.username}`);
    untouched += 1;
  }
  if (after.changeCount !== 0)
    throw new Error(`PROMPT_ROLLOUT_POST_APPLY_INVALID pending=${after.changeCount}`);
  return { changed, untouched };
}

export async function main(): Promise<void> {
  const parsedEnvironment = promptRolloutEnvironmentSchema.safeParse(process.env);
  if (!parsedEnvironment.success)
    throw new Error(
      `PROMPT_ROLLOUT_ENVIRONMENT_INVALID ${parsedEnvironment.error.issues
        .map((issue) => `${issue.path.join(".")}:${issue.message}`)
        .join(" ")}`,
    );
  const environment = parsedEnvironment.data;
  const mode = environment.AGENT_PROMPT_ROLLOUT_MODE;
  const rolloutId = randomUUID();
  const changeSummary = changeSummaryFor(environment.AGENT_PROMPT_ROLLOUT_REASON, rolloutId);
  const expectedSnapshotHash = environment.AGENT_PROMPT_ROLLOUT_EXPECTED_SNAPSHOT_HASH;
  const database = getDatabase();
  try {
    const { plan } = await loadPlan(database, changeSummary);
    const flow = await loadFlow(database);
    emitPlan(mode, plan);

    if (mode === "DRY_RUN") {
      write({
        event: "PROMPT_ROLLOUT_DRY_RUN",
        runtimeEnabled: flow.settings.runtimeEnabled,
        openRunCount: flow.openRunCount,
        applySnapshotHash: plan.snapshotHash,
      });
      return;
    }

    const actor = await resolveOperatorAdmin(database, environment.AGENT_OPERATOR_ADMIN_ID);

    if (mode === "PAUSE") {
      if (!flow.settings.runtimeEnabled) throw new Error("PROMPT_ROLLOUT_ALREADY_PAUSED");
      const paused = await setSocietyFlowEnabled(
        database,
        { ...actor, requestId: randomUUID() },
        false,
        { reason: "Persona prompt rollout'u için kısa duraklama." },
      );
      write({
        event: "PROMPT_ROLLOUT_PAUSED",
        settingsVersion: paused.settingsVersion,
        drainingOpenRunCount: (await loadFlow(database)).openRunCount,
      });
      return;
    }

    if (mode === "RESUME") {
      if (flow.settings.runtimeEnabled) throw new Error("PROMPT_ROLLOUT_ALREADY_RUNNING");
      if (plan.changeCount !== 0)
        throw new Error(`PROMPT_ROLLOUT_RESUME_BLOCKED pending=${plan.changeCount}`);
      const resumed = await setSocietyFlowEnabled(
        database,
        { ...actor, requestId: randomUUID() },
        true,
        { reason: "Persona prompt snapshot'ları güncel renderer ile eşit; toplum akışı açılıyor." },
      );
      write({
        event: "PROMPT_ROLLOUT_RESUMED",
        settingsVersion: resumed.settingsVersion,
        profileCount: plan.profileCount,
      });
      return;
    }

    assertSnapshot(expectedSnapshotHash, plan.snapshotHash);
    // İdempotenslik: değişen persona yoksa APPLY hiçbir sürüm üretmeden başarıyla biter.
    if (plan.changeCount === 0) {
      write({ event: "PROMPT_ROLLOUT_NOOP", rolloutId, profileCount: plan.profileCount });
      return;
    }
    // Bu rollout persona içeriğini değiştirmez. Şemadan geçmiş persona depodakinden ayrışıyorsa
    // bump aynı zamanda persona'yı da yeniden yazardı; sessizce yapmak yerine duruyoruz.
    if (plan.personaDriftCount > 0)
      throw new Error(`PROMPT_ROLLOUT_PERSONA_DRIFT count=${plan.personaDriftCount}`);
    if (plan.validationFailureCount > 0)
      throw new Error(`PROMPT_ROLLOUT_VALIDATION_FAILED count=${plan.validationFailureCount}`);
    if (flow.settings.runtimeEnabled || flow.openRunCount !== 0)
      throw new Error(
        `PROMPT_ROLLOUT_REQUIRES_PAUSE runtimeEnabled=${flow.settings.runtimeEnabled} openRuns=${flow.openRunCount}`,
      );

    // Kısmi başarısızlık kapısı: bütün bumplar tek transaction içinde. Ya hepsi commit olur ya
    // hiçbiri; yarısı bumplanmış bir toplum oluşamaz. Snapshot transaction içinde yeniden
    // doğrulanır, böylece plan ile yazma arasına giren eşzamanlı değişiklik rollout'u iptal eder.
    const requestIds: string[] = [];
    await database.$transaction(
      async (transaction) => {
        const locked = await loadPlan(transaction, changeSummary);
        assertSnapshot(expectedSnapshotHash, locked.plan.snapshotHash);
        for (let index = 0; index < locked.entries.length; index += 1) {
          const entry = locked.entries[index]!;
          if (!locked.plan.receipts[index]!.changeNeeded) continue;
          const requestId = randomUUID();
          requestIds.push(requestId);
          await updateAgent(transaction, { ...actor, requestId }, entry.record.profileId, {
            persona: entry.persona,
            changeSummary,
          });
        }
      },
      { maxWait: 15_000, timeout: 300_000 },
    );

    const { plan: after } = await loadPlan(database, changeSummary);
    const applied = assertAppliedCorrectly(plan, after);
    const [auditCount, outboxCount] = await Promise.all([
      database.auditLog.count({
        where: { requestId: { in: requestIds }, action: "agent.persona.versioned" },
      }),
      database.outboxEvent.count({
        where: { requestId: { in: requestIds }, eventType: "agent.persona.versioned" },
      }),
    ]);
    if (
      requestIds.length !== plan.changeCount ||
      auditCount !== plan.changeCount ||
      outboxCount !== plan.changeCount
    )
      throw new Error(
        `PROMPT_ROLLOUT_RECEIPT_INVALID requests=${requestIds.length} audits=${auditCount} outbox=${outboxCount}`,
      );

    emitPlan("APPLY_RESULT", after);
    write({
      event: "PROMPT_ROLLOUT_APPLIED",
      rolloutId,
      changedCount: applied.changed,
      untouchedCount: applied.untouched,
      auditCount,
      outboxCount,
      beforeSnapshotHash: plan.snapshotHash,
      afterSnapshotHash: after.snapshotHash,
      requestSetHash: sha256(JSON.stringify([...requestIds].sort())),
    });
  } finally {
    await database.$disconnect();
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(path.resolve(entrypoint)).href)
  void main().catch((error: unknown) => {
    const message =
      error instanceof Error && /^PROMPT_ROLLOUT_[A-Z0-9_]+(?: .+)?$/u.test(error.message)
        ? error.message
        : "PROMPT_ROLLOUT_FATAL";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });

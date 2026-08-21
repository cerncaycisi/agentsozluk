import "dotenv/config";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { PrismaClient } from "@prisma/client";
import { getDatabase } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";
import { sha256 } from "@/lib/security/crypto";
import { setGlobalRuntimeEnabled, updateAgent } from "@/modules/agents";
import { validatePersonaCandidate } from "@/modules/agents/domain/persona-validation";
import { renderPersonaPrompt } from "@/modules/agents/personas/prompt-renderer";
import { seedPersonaSchema, type SeedPersona } from "@/modules/agents/personas/schema";
import { lockAgentProfile, lockAgentSettings } from "@/modules/agents/repository/control-plane";
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
//   DRY_RUN (varsayılan) — hiçbir şey yazmaz; plan, hash raporu ve applyPlanHash basar.
//   PAUSE                — yalnız runtimeEnabled'ı kapatır, açık run sayısını raporlar.
//   APPLY                — akış kapalı ve açık run yokken tek transaction içinde sürüm bumplar.
//   RESUME               — duraklamanın gerekçesi ortadan kalktıysa aynı tek kapıyı geri açar.

const terminalRunStatuses = ["SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED", "TIMED_OUT"] as const;

type Executor = Parameters<typeof updateAgent>[0];

interface PersonaPromptEntry {
  record: PersonaPromptRecord;
  persona: SeedPersona;
}

type Emit = (payload: Record<string, unknown>) => void;

const writeToStdout: Emit = (payload) => {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
};

export interface PromptRolloutDependencies {
  /** Test kancası: yazma transaction'ı kilitleri alıp planı okuduktan hemen sonra çalışır. */
  afterPlanLocked?: () => Promise<void>;
}

export interface PromptRolloutOptions {
  /** Enjekte edilmişse kapatılmaz; script kendi açtığı bağlantıyı kapatır. */
  database?: PrismaClient;
  environment?: NodeJS.ProcessEnv;
  emit?: Emit;
  dependencies?: PromptRolloutDependencies;
}

/** Rollout'un veritabanına bıraktığı iz: her persona sürümünün changeSummary'si bu partiyi adlar. */
function rolloutMarker(rolloutId: string): string {
  return `[rollout=${rolloutId}]`;
}

function changeSummaryFor(reason: string, rolloutId: string): string {
  return `${reason} ${rolloutMarker(rolloutId)}`;
}

/** Tek satırlık hata sözleşmesi: entrypoint'in kod regex'i çok satırlı mesajı tanımaz. */
function oneLine(value: string): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, 300);
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

interface SocietyFlowSettings {
  settingsVersion: number;
  runtimeEnabled: boolean;
  schedulerEnabled: boolean;
  publishEnabled: boolean;
  publicWriteEnabled: boolean;
  runtimeOperatingMode: "NORMAL" | "MAINTENANCE";
}

interface SocietyFlow {
  settings: SocietyFlowSettings;
  openRunCount: number;
}

async function loadFlow(database: Executor): Promise<SocietyFlow> {
  const [settings, openRunCount] = await Promise.all([
    database.agentGlobalSettings.findUniqueOrThrow({
      where: { id: "global" },
      select: {
        settingsVersion: true,
        runtimeEnabled: true,
        schedulerEnabled: true,
        publishEnabled: true,
        publicWriteEnabled: true,
        runtimeOperatingMode: true,
      },
    }),
    database.agentRun.count({ where: { runStatus: { notIn: [...terminalRunStatuses] } } }),
  ]);
  return { settings, openRunCount };
}

/**
 * Toplumun tam açık olmayan kontrolleri. Rollout bunları ne kapatır ne açar; sadece görünür
 * kılar, çünkü duraklatıp açan bir komutun sessizce kontrol genişletmesi en kötü sonuçtur.
 */
function degradedControlsOf(settings: Omit<SocietyFlowSettings, "settingsVersion">): string[] {
  return [
    ...(settings.schedulerEnabled ? [] : ["schedulerEnabled"]),
    ...(settings.publishEnabled ? [] : ["publishEnabled"]),
    ...(settings.publicWriteEnabled ? [] : ["publicWriteEnabled"]),
    ...(settings.runtimeOperatingMode === "NORMAL" ? [] : ["runtimeOperatingMode"]),
  ];
}

/**
 * Onay hash'i uygulanacak planı bağlar: hem DB durumu hem yazılacak prompt'lar. Kuru çalıştırma
 * ile APPLY arasında renderer değişirse hash tutmaz ve operatörün görmediği prompt yazılmaz.
 */
function assertPlanHash(expected: string | undefined, actual: string): void {
  if (!expected || expected !== actual)
    throw new Error(`PROMPT_ROLLOUT_PLAN_DRIFT actual=${actual}`);
}

function assertPaused(flow: SocietyFlow): void {
  if (flow.settings.runtimeEnabled || flow.openRunCount !== 0)
    throw new Error(
      `PROMPT_ROLLOUT_REQUIRES_PAUSE runtimeEnabled=${flow.settings.runtimeEnabled} openRuns=${flow.openRunCount}`,
    );
}

function assertApplyable(plan: PromptRolloutPlan): void {
  // Bu rollout persona içeriğini değiştirmez. Şemadan geçmiş persona depodakinden ayrışıyorsa
  // bump aynı zamanda persona'yı da yeniden yazardı; sessizce yapmak yerine duruyoruz.
  if (plan.personaDriftCount > 0)
    throw new Error(`PROMPT_ROLLOUT_PERSONA_DRIFT count=${plan.personaDriftCount}`);
  if (plan.validationFailureCount > 0)
    throw new Error(`PROMPT_ROLLOUT_VALIDATION_FAILED count=${plan.validationFailureCount}`);
}

function emitPlan(emit: Emit, phase: string, plan: PromptRolloutPlan): void {
  emit({
    event: "PROMPT_ROLLOUT_PLAN",
    phase,
    lifecycleStatuses: promptRolloutLifecycleStatuses,
    profileCount: plan.profileCount,
    changeCount: plan.changeCount,
    personaDriftCount: plan.personaDriftCount,
    validationFailureCount: plan.validationFailureCount,
    planHash: plan.planHash,
    beforeTemplateGroups: plan.beforeTemplateGroups,
    afterTemplateGroups: plan.afterTemplateGroups,
  });
  for (const receipt of plan.receipts) emit({ event: "PROMPT_ROLLOUT_PERSONA", phase, ...receipt });
}

const rolloutMarkerPattern = /\[rollout=([0-9a-f-]{36})\]/u;

/**
 * Bir önceki rollout'un veritabanına bıraktığı iz. Komut commit'ten sonra ölerse makbuzu
 * kaybolur; NOOP'un "hiç rollout olmadı" gibi okunmaması için izi geri okuyup raporlarız.
 */
async function findPriorRollout(database: PrismaClient): Promise<Record<string, unknown> | null> {
  const latest = await database.agentPersonaVersion.findFirst({
    where: { changeSummary: { contains: "[rollout=" } },
    orderBy: { createdAt: "desc" },
    select: { changeSummary: true, createdAt: true },
  });
  const priorRolloutId = latest ? rolloutMarkerPattern.exec(latest.changeSummary)?.[1] : undefined;
  if (!latest || !priorRolloutId) return null;
  return {
    priorRolloutId,
    priorRolloutPersonaVersionCount: await database.agentPersonaVersion.count({
      where: { changeSummary: { contains: rolloutMarker(priorRolloutId) } },
    }),
    priorRolloutAppliedAt: latest.createdAt.toISOString(),
  };
}

/**
 * Transaction hata ile döndüğünde yazıların gerçekten geri alınıp alınmadığını kanıta bağlar.
 * "Başarısız komut hiçbir şey yazmamıştır" varsayımı doğru değildir: COMMIT onaylanırken
 * bağlantı düşerse yazılar kalır. Operatör üç sonucu birbirinden ayırabilmelidir.
 */
async function describeFailedTransaction(
  database: PrismaClient,
  emit: Emit,
  rolloutId: string,
  error: unknown,
): Promise<Error> {
  const cause = oneLine(error instanceof Error ? error.message : String(error));
  let personaVersionCount: number | null = null;
  try {
    personaVersionCount = await database.agentPersonaVersion.count({
      where: { changeSummary: { contains: rolloutMarker(rolloutId) } },
    });
  } catch {
    personaVersionCount = null;
  }
  if (personaVersionCount === null) {
    emit({ event: "PROMPT_ROLLOUT_OUTCOME_UNKNOWN", rolloutId, cause });
    return new Error(`PROMPT_ROLLOUT_OUTCOME_UNKNOWN rolloutId=${rolloutId} cause=${cause}`);
  }
  if (personaVersionCount === 0) {
    // Kanıtlanmış geri alma: özgün (kodlu) hatayı olduğu gibi yüzeye çıkar.
    emit({ event: "PROMPT_ROLLOUT_ROLLED_BACK", rolloutId, personaVersionCount: 0, cause });
    return error instanceof Error ? error : new Error(cause);
  }
  emit({
    event: "PROMPT_ROLLOUT_COMMITTED_UNVERIFIED",
    rolloutId,
    personaVersionCount,
    cause,
    operatorAction:
      "Sürümler yazıldı ama doğrulanamadı: DRY_RUN ile durumu yeniden ölç, RESUME'u ancak temizse çalıştır.",
  });
  return new Error(
    `PROMPT_ROLLOUT_COMMITTED_UNVERIFIED rolloutId=${rolloutId} personaVersionCount=${personaVersionCount} cause=${cause}`,
  );
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

interface AppliedRollout {
  after: PromptRolloutPlan;
  applied: { changed: number; untouched: number };
  auditCount: number;
  outboxCount: number;
  requestIds: string[];
}

export async function main(options: PromptRolloutOptions = {}): Promise<void> {
  const emit = options.emit ?? writeToStdout;
  const dependencies = options.dependencies ?? {};
  const parsedEnvironment = promptRolloutEnvironmentSchema.safeParse(
    options.environment ?? process.env,
  );
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
  const expectedPlanHash = environment.AGENT_PROMPT_ROLLOUT_EXPECTED_PLAN_HASH;
  const database = options.database ?? getDatabase();
  try {
    const { plan } = await loadPlan(database, changeSummary);
    const flow = await loadFlow(database);
    emitPlan(emit, mode, plan);

    if (mode === "DRY_RUN") {
      emit({
        event: "PROMPT_ROLLOUT_DRY_RUN",
        runtimeEnabled: flow.settings.runtimeEnabled,
        openRunCount: flow.openRunCount,
        degradedControls: degradedControlsOf(flow.settings),
        applyPlanHash: plan.planHash,
        ...((await findPriorRollout(database)) ?? {}),
      });
      return;
    }

    const actor = await resolveOperatorAdmin(database, environment.AGENT_OPERATOR_ADMIN_ID);

    if (mode === "PAUSE") {
      if (!flow.settings.runtimeEnabled) throw new Error("PROMPT_ROLLOUT_ALREADY_PAUSED");
      // Duraklama tek kapıyı kapatır: runtimeEnabled. Scheduler/publish/public-write ve
      // operating mode'a dokunmaz, böylece RESUME de tek alanı geri çevirebilir.
      const paused = await setGlobalRuntimeEnabled(
        database,
        { ...actor, requestId: randomUUID() },
        false,
        { reason: "Persona prompt rollout'u için kısa duraklama." },
      );
      emit({
        event: "PROMPT_ROLLOUT_PAUSED",
        settingsVersion: paused.settingsVersion,
        drainingOpenRunCount: (await loadFlow(database)).openRunCount,
        degradedControls: degradedControlsOf(paused),
      });
      return;
    }

    if (mode === "RESUME") {
      if (flow.settings.runtimeEnabled) throw new Error("PROMPT_ROLLOUT_ALREADY_RUNNING");
      // Akışı açmadan önce duraklamanın bütün gerekçelerinin kalktığını kanıtla: bekleyen prompt
      // değişikliği, persona drift'i, doğrulamadan geçmeyen persona ve boşalmamış run kuyruğu.
      if (
        plan.changeCount !== 0 ||
        plan.personaDriftCount !== 0 ||
        plan.validationFailureCount !== 0 ||
        flow.openRunCount !== 0
      )
        throw new Error(
          `PROMPT_ROLLOUT_RESUME_BLOCKED pending=${plan.changeCount} drift=${plan.personaDriftCount} validationFailures=${plan.validationFailureCount} openRuns=${flow.openRunCount}`,
        );
      // setSocietyFlowEnabled(true) scheduler, publish, public-write ve NORMAL modunu koşulsuz
      // açar; kapatmadığımız bir kontrolü açmak rollout'un işi değil. Kapattığımız kapıyı açarız.
      const resumed = await setGlobalRuntimeEnabled(
        database,
        { ...actor, requestId: randomUUID() },
        true,
        {
          reason:
            "Persona prompt snapshot'ları güncel renderer ile eşit; duraklamanın kapattığı kapı açılıyor.",
        },
      );
      emit({
        event: "PROMPT_ROLLOUT_RESUMED",
        settingsVersion: resumed.settingsVersion,
        profileCount: plan.profileCount,
        // Rollout'un açmadığı, hâlâ kısıtlı kontroller: operatör görmeden geçmemeli.
        degradedControls: degradedControlsOf(resumed),
      });
      return;
    }

    assertPlanHash(expectedPlanHash, plan.planHash);
    // İdempotenslik: değişen persona yoksa APPLY hiçbir sürüm üretmeden başarıyla biter. Önceki
    // bir rollout'un izi varsa makbuzunu geri okuruz; sessiz NOOP en kötü çıktıdır.
    if (plan.changeCount === 0) {
      emit({
        event: "PROMPT_ROLLOUT_NOOP",
        rolloutId,
        profileCount: plan.profileCount,
        ...((await findPriorRollout(database)) ?? {}),
      });
      return;
    }
    assertApplyable(plan);
    assertPaused(flow);

    // Kısmi başarısızlık kapısı: bütün bumplar ve bütün doğrulamalar tek transaction içinde. Ya
    // hepsi commit olur ya hiçbiri; doğrulama patlarsa yazılar da geri alınır.
    let outcome: AppliedRollout;
    try {
      outcome = await database.$transaction(
        async (transaction): Promise<AppliedRollout> => {
          const requestIds: string[] = [];
          // Kilit sırası kod tabanındaki sözleşmeyle aynı: önce profiller (sabit sırada), sonra
          // global ayarlar. createBulkAgentRuns da böyle yapar. Ters sıra (settings kilidini
          // tutarken profil kilidi istemek) rollout ile eşzamanlı bir lease/güncelleme arasında
          // deadlock üretir; profilleri baştan almak o döngüyü imkânsız kılar.
          for (const profileId of plan.receipts.map(({ profileId: id }) => id).sort())
            await lockAgentProfile(transaction, profileId);
          await lockAgentSettings(transaction);

          // Duraklama ve boş kuyruk kilit altında yeniden doğrulanır: transaction'dan önceki
          // okuma, araya giren bir "akışı aç" ya da yeni bir lease için kanıt değildir.
          assertPaused(await loadFlow(transaction));

          // Plan da kilit altında yeniden okunur. Profil kilitleri bu okumadan ÖNCE alındığı
          // için okunan persona ile yazılan persona arasına eşzamanlı bir düzenleme giremez.
          const locked = await loadPlan(transaction, changeSummary);
          assertPlanHash(expectedPlanHash, locked.plan.planHash);
          assertApplyable(locked.plan);

          await dependencies.afterPlanLocked?.();

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

          const { plan: after } = await loadPlan(transaction, changeSummary);
          const applied = assertAppliedCorrectly(locked.plan, after);
          const [auditCount, outboxCount] = await Promise.all([
            transaction.auditLog.count({
              where: { requestId: { in: requestIds }, action: "agent.persona.versioned" },
            }),
            transaction.outboxEvent.count({
              where: { requestId: { in: requestIds }, eventType: "agent.persona.versioned" },
            }),
          ]);
          if (
            requestIds.length !== locked.plan.changeCount ||
            auditCount !== locked.plan.changeCount ||
            outboxCount !== locked.plan.changeCount
          )
            throw new Error(
              `PROMPT_ROLLOUT_RECEIPT_INVALID requests=${requestIds.length} audits=${auditCount} outbox=${outboxCount}`,
            );
          // Commit'ten hemen önce son kapı kontrolü; kilitler hâlâ elimizde.
          assertPaused(await loadFlow(transaction));
          return { after, applied, auditCount, outboxCount, requestIds };
        },
        { maxWait: 15_000, timeout: 300_000 },
      );
    } catch (error: unknown) {
      throw await describeFailedTransaction(database, emit, rolloutId, error);
    }

    // Commit kanıtlandı. Bundan sonrası yalnız raporlamadır; makbuz kaybolsa bile bu satır
    // stdout'a düşmüş olur ve rolloutId ile veritabanındaki iz eşleştirilebilir.
    emit({
      event: "PROMPT_ROLLOUT_COMMITTED",
      rolloutId,
      changedCount: outcome.applied.changed,
      marker: rolloutMarker(rolloutId),
    });
    emitPlan(emit, "APPLY_RESULT", outcome.after);
    emit({
      event: "PROMPT_ROLLOUT_APPLIED",
      rolloutId,
      changedCount: outcome.applied.changed,
      untouchedCount: outcome.applied.untouched,
      auditCount: outcome.auditCount,
      outboxCount: outcome.outboxCount,
      beforePlanHash: plan.planHash,
      afterPlanHash: outcome.after.planHash,
      requestSetHash: sha256(JSON.stringify([...outcome.requestIds].sort())),
    });
  } finally {
    if (!options.database) await database.$disconnect();
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

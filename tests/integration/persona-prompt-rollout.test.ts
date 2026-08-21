import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createAgent, createAgentSchema, updateAgent } from "@/modules/agents";
import originalPersonaPack from "@/modules/agents/personas/original-personas.json";
import { renderPersonaPrompt } from "@/modules/agents/personas/prompt-renderer";
import type * as PromptRendererModule from "@/modules/agents/personas/prompt-renderer";
import { seedPersonaSchema } from "@/modules/agents/personas/schema";
import type { ActorContext } from "@/modules/auth/domain/actor";
import { main, type PromptRolloutDependencies } from "../../scripts/rollout-persona-prompts";
import { promptRolloutConfirmation } from "../../scripts/rollout-persona-prompts-helpers";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

// Prompt şablonunu test içinden değiştirebilmek için renderer'a kontrollü bir kuyruk ekliyoruz:
// suffix "commit A'nın şablonu" ile "commit B'nin şablonu" arasındaki farkı temsil eder.
const renderer = vi.hoisted(() => ({ suffix: "" }));

vi.mock("@/modules/agents/personas/prompt-renderer", async (importOriginal) => {
  const original = await importOriginal<typeof PromptRendererModule>();
  return {
    ...original,
    renderPersonaPrompt: (persona: Parameters<typeof original.renderPersonaPrompt>[0]): string =>
      `${original.renderPersonaPrompt(persona)}${renderer.suffix}`,
  };
});

type Environment = Record<string, string | undefined>;
type Emitted = Record<string, unknown>;

interface RolloutOutcome {
  events: Emitted[];
  error: Error | null;
}

function actor(id: string): ActorContext {
  return {
    actorId: id,
    actorKind: "HUMAN",
    actorRole: "ADMIN",
    requestId: randomUUID(),
    origin: "API",
  };
}

async function createPrincipal() {
  const suffix = randomUUID().replaceAll("-", "");
  return integrationDatabase.user.create({
    data: {
      kind: "HUMAN",
      role: "ADMIN",
      status: "ACTIVE",
      email: `admin-${suffix}@integration.test`,
      emailNormalized: `admin-${suffix}@integration.test`,
      username: `admin_${suffix.slice(0, 16)}`,
      usernameNormalized: `admin_${suffix.slice(0, 16)}`,
      displayName: "Rollout operator",
      passwordHash: "not-used",
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
}

/** Duraklatılmış bir toplum ve iki agent: rollout'un uygulanabilir en küçük nüfusu. */
async function createPausedPopulation(size = 2) {
  const admin = await createPrincipal();
  const profileIds: string[] = [];
  for (let index = 0; index < size; index += 1) {
    const persona = originalPersonaPack.personas[index]!;
    const created = await createAgent(
      integrationDatabase,
      actor(admin.id),
      createAgentSchema.parse({
        persona,
        creation: { method: "TEMPLATE", templateUsername: persona.username },
      }),
    );
    profileIds.push(created.agent.profile.id);
  }
  await integrationDatabase.agentGlobalSettings.update({
    where: { id: "global" },
    data: { runtimeEnabled: false },
  });
  return { admin, profileIds };
}

/** Persona sürüm tablosu append-only: fikstür de yeni sürüm yazıp profili ona bağlar. */
async function appendPersonaVersionDirectly(
  profileId: string,
  persona: object,
  renderedPrompt: string,
): Promise<void> {
  const profile = await integrationDatabase.agentProfile.findUniqueOrThrow({
    where: { id: profileId },
    select: {
      currentPersonaVersionId: true,
      currentPersonaVersion: { select: { version: true } },
    },
  });
  const created = await integrationDatabase.agentPersonaVersion.create({
    data: {
      agentProfileId: profileId,
      version: (profile.currentPersonaVersion?.version ?? 0) + 1,
      persona,
      renderedPrompt,
      changeOrigin: "ADMIN",
      changeSummary: "Fikstür: kontrol düzlemini atlayarak yazılmış persona sürümü.",
      ...(profile.currentPersonaVersionId
        ? { previousVersionId: profile.currentPersonaVersionId }
        : {}),
      validationReport: {},
    },
  });
  await integrationDatabase.agentProfile.update({
    where: { id: profileId },
    data: { currentPersonaVersionId: created.id },
  });
}

async function queueOpenRun(profileId: string): Promise<void> {
  const personaVersion = await integrationDatabase.agentPersonaVersion.findFirstOrThrow({
    where: { agentProfileId: profileId },
  });
  await integrationDatabase.agentRun.create({
    data: {
      agentProfileId: profileId,
      personaVersionId: personaVersion.id,
      runType: "NORMAL_WAKE",
      runStatus: "QUEUED",
      queuePriority: "MANUAL_SINGLE",
      trigger: "MANUAL",
      idempotencyKey: randomUUID(),
      timeoutSeconds: 600,
      desiredEntryMin: 0,
      desiredEntryMax: 0,
    },
  });
}

async function runRollout(
  environment: Environment,
  options: { database?: PrismaClient; dependencies?: PromptRolloutDependencies } = {},
): Promise<RolloutOutcome> {
  const events: Emitted[] = [];
  let error: Error | null = null;
  try {
    await main({
      database: options.database ?? integrationDatabase,
      environment: environment as NodeJS.ProcessEnv,
      emit: (payload) => {
        events.push(payload);
      },
      ...(options.dependencies ? { dependencies: options.dependencies } : {}),
    });
  } catch (caught: unknown) {
    error = caught instanceof Error ? caught : new Error(String(caught));
  }
  return { events, error };
}

function eventOf(outcome: RolloutOutcome, name: string): Emitted | undefined {
  return outcome.events.find((payload) => payload.event === name);
}

/** Kuru çalıştırma: operatörün APPLY'a taşıyacağı hash burada üretilir. */
async function dryRunPlanHash(): Promise<{ planHash: string; changeCount: number }> {
  const outcome = await runRollout({ AGENT_PROMPT_ROLLOUT_MODE: "DRY_RUN" });
  expect(outcome.error).toBeNull();
  const dryRun = eventOf(outcome, "PROMPT_ROLLOUT_DRY_RUN");
  const plan = eventOf(outcome, "PROMPT_ROLLOUT_PLAN");
  return {
    planHash: String(dryRun?.applyPlanHash),
    changeCount: Number(plan?.changeCount),
  };
}

function applyEnvironment(adminId: string, planHash: string): Environment {
  return {
    AGENT_PROMPT_ROLLOUT_MODE: "APPLY",
    AGENT_PROMPT_ROLLOUT_CONFIRMATION: promptRolloutConfirmation,
    AGENT_PROMPT_ROLLOUT_EXPECTED_PLAN_HASH: planHash,
    AGENT_OPERATOR_ADMIN_ID: adminId,
  };
}

function resumeEnvironment(adminId: string): Environment {
  return {
    AGENT_PROMPT_ROLLOUT_MODE: "RESUME",
    AGENT_PROMPT_ROLLOUT_CONFIRMATION: promptRolloutConfirmation,
    AGENT_OPERATOR_ADMIN_ID: adminId,
  };
}

async function currentPersonaVersions() {
  return integrationDatabase.agentProfile.findMany({
    orderBy: { user: { username: "asc" } },
    select: {
      id: true,
      user: { select: { username: true } },
      currentPersonaVersion: { select: { version: true, persona: true, renderedPrompt: true } },
    },
  });
}

/** Prisma istemcisini saran genel bir arıza enjektörü; yalnız $transaction'ı kuşatır. */
function clientWithTransactionFault(
  client: PrismaClient,
  fault: { before?: () => Promise<void>; afterCommit?: () => Promise<void> },
): PrismaClient {
  let fired = false;
  return new Proxy(client, {
    get(target, property, receiver) {
      if (property === "$transaction") {
        return async (...parameters: unknown[]): Promise<unknown> => {
          const first = !fired;
          fired = true;
          if (first && fault.before) await fault.before();
          const result = await (
            target.$transaction as unknown as (...args: unknown[]) => Promise<unknown>
          )(...parameters);
          if (first && fault.afterCommit) await fault.afterCommit();
          return result;
        };
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as PrismaClient;
}

/** Transaction düştükten sonra veritabanına hiç ulaşılamaması durumu. */
function clientThatGoesAwayAfterTheTransaction(client: PrismaClient): PrismaClient {
  let down = false;
  return new Proxy(client, {
    get(target, property, receiver) {
      if (property === "$transaction") {
        return async (): Promise<never> => {
          down = true;
          throw new Error("simulated connection loss during COMMIT");
        };
      }
      if (property === "agentPersonaVersion" && down)
        return {
          count: (): Promise<never> => Promise.reject(new Error("connection is closed")),
        };
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as PrismaClient;
}

function settledOrPending(work: Promise<unknown>): Promise<string> {
  return Promise.race([
    work.then(
      () => "settled",
      () => "settled",
    ),
    new Promise<string>((resolve) => {
      setTimeout(() => resolve("pending"), 150);
    }),
  ]);
}

beforeEach(async () => {
  renderer.suffix = "";
  await resetIntegrationDatabase();
});
afterAll(closeIntegrationDatabase);

describe("persona prompt rollout against PostgreSQL", () => {
  it("applies the approved plan once and stays a no-op on a repeat run", async () => {
    const { admin } = await createPausedPopulation();
    renderer.suffix = "\nYeni sablon satiri.";
    const planned = await dryRunPlanHash();
    expect(planned.changeCount).toBe(2);

    const applied = await runRollout(applyEnvironment(admin.id, planned.planHash));

    expect(applied.error).toBeNull();
    expect(eventOf(applied, "PROMPT_ROLLOUT_COMMITTED")).toBeDefined();
    expect(eventOf(applied, "PROMPT_ROLLOUT_APPLIED")).toMatchObject({
      changedCount: 2,
      untouchedCount: 0,
      auditCount: 2,
      outboxCount: 2,
    });
    for (const profile of await currentPersonaVersions()) {
      expect(profile.currentPersonaVersion?.version).toBe(2);
      expect(profile.currentPersonaVersion?.renderedPrompt).toMatch(/Yeni sablon satiri\./u);
    }

    // Aynı komut ikinci kez: yeni sürüm üretilmez, önceki partinin izi raporlanır.
    const settled = await dryRunPlanHash();
    expect(settled.changeCount).toBe(0);
    const repeat = await runRollout(applyEnvironment(admin.id, settled.planHash));

    expect(repeat.error).toBeNull();
    expect(eventOf(repeat, "PROMPT_ROLLOUT_NOOP")).toMatchObject({
      profileCount: 2,
      priorRolloutPersonaVersionCount: 2,
    });
    expect(await integrationDatabase.agentPersonaVersion.count()).toBe(4);
  });

  it("refuses to write a prompt the operator never approved when the renderer moves", async () => {
    const { admin } = await createPausedPopulation();

    renderer.suffix = "\nA surumu satiri.";
    const planned = await dryRunPlanHash();
    expect(planned.changeCount).toBe(2);

    // Onay ile uygulama arasında renderer değişti: aynı DB durumu, başka bir prompt.
    renderer.suffix = "\nB surumu satiri.";
    const outcome = await runRollout(applyEnvironment(admin.id, planned.planHash));

    expect(outcome.error?.message).toMatch(/^PROMPT_ROLLOUT_PLAN_DRIFT/u);
    const profiles = await currentPersonaVersions();
    for (const profile of profiles) {
      expect(profile.currentPersonaVersion?.version).toBe(1);
      expect(profile.currentPersonaVersion?.renderedPrompt).not.toMatch(/B surumu satiri\./u);
    }
  });

  it("re-reads the pause gate inside the write transaction", async () => {
    const { admin } = await createPausedPopulation();
    renderer.suffix = "\nYeni sablon satiri.";
    const planned = await dryRunPlanHash();

    const database = clientWithTransactionFault(integrationDatabase, {
      // Plan ile yazma arasında başka bir admin akışı açtı.
      before: async () => {
        await integrationDatabase.agentGlobalSettings.update({
          where: { id: "global" },
          data: { runtimeEnabled: true },
        });
      },
    });
    const outcome = await runRollout(applyEnvironment(admin.id, planned.planHash), { database });

    expect(outcome.error?.message).toMatch(/^PROMPT_ROLLOUT_REQUIRES_PAUSE/u);
    // Geri alma kanıta bağlanır: komut "hiçbir şey yazılmadı"yı ölçerek söyler.
    expect(eventOf(outcome, "PROMPT_ROLLOUT_ROLLED_BACK")).toMatchObject({
      personaVersionCount: 0,
    });
    expect(await integrationDatabase.agentPersonaVersion.count()).toBe(2);
  });

  it("re-counts open runs inside the write transaction", async () => {
    const { admin, profileIds } = await createPausedPopulation();
    renderer.suffix = "\nYeni sablon satiri.";
    const planned = await dryRunPlanHash();

    const database = clientWithTransactionFault(integrationDatabase, {
      before: () => queueOpenRun(profileIds[0]!),
    });
    const outcome = await runRollout(applyEnvironment(admin.id, planned.planHash), { database });

    expect(outcome.error?.message).toMatch(/^PROMPT_ROLLOUT_REQUIRES_PAUSE .*openRuns=1/u);
    expect(eventOf(outcome, "PROMPT_ROLLOUT_ROLLED_BACK")).toMatchObject({
      personaVersionCount: 0,
    });
    expect(await integrationDatabase.agentPersonaVersion.count()).toBe(2);
  });

  it("holds the profile lock across its own read so a competing persona edit cannot be lost", async () => {
    const { admin, profileIds } = await createPausedPopulation();
    renderer.suffix = "\nYeni sablon satiri.";
    const planned = await dryRunPlanHash();

    const target = profileIds[0]!;
    const competingBio =
      "Kayitli dijital okumalardan cikardigi olcum notlarini kisa bicimde paylasir.";
    const secondClient = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL! });
    let competing: Promise<unknown> = Promise.resolve();
    let race = "not-started";
    try {
      const outcome = await runRollout(applyEnvironment(admin.id, planned.planHash), {
        dependencies: {
          afterPlanLocked: async () => {
            competing = secondClient.$transaction(
              (transaction) =>
                updateAgent(transaction, actor(admin.id), target, {
                  publicBio: competingBio,
                  changeSummary: "Admin, rollout sürerken public bio metnini elle güncelledi.",
                }),
              { maxWait: 30_000, timeout: 120_000 },
            );
            race = await settledOrPending(competing);
          },
        },
      });
      expect(outcome.error).toBeNull();
      // Rakip düzenleme rollout'un kilidini bekledi; araya giremedi.
      expect(race).toBe("pending");
      await competing;
    } finally {
      await competing.catch(() => undefined);
      await secondClient.$disconnect();
    }

    const profile = await integrationDatabase.agentProfile.findUniqueOrThrow({
      where: { id: target },
      select: { currentPersonaVersion: { select: { version: true, persona: true } } },
    });
    const persona = seedPersonaSchema.parse(profile.currentPersonaVersion?.persona);
    // Admin'in düzenlemesi rollout'un üstüne uygulandı; sessizce kaybolmadı.
    expect(persona.publicBio).toBe(competingBio);
    expect(profile.currentPersonaVersion?.version).toBe(3);
  });

  it("tells the operator that the writes landed when the command dies after the commit", async () => {
    const { admin } = await createPausedPopulation();
    renderer.suffix = "\nYeni sablon satiri.";
    const planned = await dryRunPlanHash();

    const database = clientWithTransactionFault(integrationDatabase, {
      afterCommit: async () => {
        await Promise.resolve();
        throw new Error("simulated connection reset right after COMMIT");
      },
    });
    const outcome = await runRollout(applyEnvironment(admin.id, planned.planHash), { database });

    expect(outcome.error?.message).toMatch(/^PROMPT_ROLLOUT_COMMITTED_UNVERIFIED/u);
    const unverified = eventOf(outcome, "PROMPT_ROLLOUT_COMMITTED_UNVERIFIED");
    expect(unverified?.personaVersionCount).toBe(2);
    expect(String(unverified?.rolloutId)).toMatch(/^[0-9a-f-]{36}$/u);
    // Yazılar gerçekten commit edildi: makbuz kaybolsa da sürümler yerinde.
    expect(await integrationDatabase.agentPersonaVersion.count({ where: { version: 2 } })).toBe(2);

    // Tekrar APPLY: değişecek bir şey yok ama önceki rollout'un makbuzu geri getirilir.
    const settled = await dryRunPlanHash();
    const repeat = await runRollout(applyEnvironment(admin.id, settled.planHash));
    expect(repeat.error).toBeNull();
    const noop = eventOf(repeat, "PROMPT_ROLLOUT_NOOP");
    expect(noop?.priorRolloutId).toBe(unverified?.rolloutId);
    expect(noop?.priorRolloutPersonaVersionCount).toBe(2);
  });

  it("admits it cannot tell whether the writes landed when the database is gone", async () => {
    const { admin } = await createPausedPopulation();
    renderer.suffix = "\nYeni sablon satiri.";
    const planned = await dryRunPlanHash();

    const outcome = await runRollout(applyEnvironment(admin.id, planned.planHash), {
      database: clientThatGoesAwayAfterTheTransaction(integrationDatabase),
    });

    // Üçüncü sonuç: ne "geri alındı" ne "commit edildi" denebilir; operatöre rolloutId verilir.
    expect(outcome.error?.message).toMatch(
      /^PROMPT_ROLLOUT_OUTCOME_UNKNOWN rolloutId=[0-9a-f-]{36}/u,
    );
    expect(eventOf(outcome, "PROMPT_ROLLOUT_OUTCOME_UNKNOWN")).toBeDefined();
  });

  it("resumes the single gate it closed and leaves a degraded control alone", async () => {
    const { admin } = await createPausedPopulation();
    await integrationDatabase.agentGlobalSettings.update({
      where: { id: "global" },
      data: { publicWriteEnabled: false, schedulerEnabled: false },
    });

    const outcome = await runRollout(resumeEnvironment(admin.id));

    expect(outcome.error).toBeNull();
    const settings = await integrationDatabase.agentGlobalSettings.findUniqueOrThrow({
      where: { id: "global" },
    });
    expect(settings.runtimeEnabled).toBe(true);
    expect(settings.publicWriteEnabled).toBe(false);
    expect(settings.schedulerEnabled).toBe(false);
    const resumed = eventOf(outcome, "PROMPT_ROLLOUT_RESUMED");
    expect(resumed?.degradedControls).toEqual(["schedulerEnabled", "publicWriteEnabled"]);
  });

  it("refuses to resume while a persona no longer round-trips through the schema", async () => {
    const { admin, profileIds } = await createPausedPopulation();
    const version = await integrationDatabase.agentPersonaVersion.findFirstOrThrow({
      where: { agentProfileId: profileIds[0]! },
    });
    await appendPersonaVersionDirectly(
      profileIds[0]!,
      { ...(version.persona as Record<string, unknown>), unmappedLegacyField: "drift" },
      version.renderedPrompt,
    );

    const outcome = await runRollout(resumeEnvironment(admin.id));

    expect(outcome.error?.message).toMatch(/^PROMPT_ROLLOUT_RESUME_BLOCKED .*\bdrift=1\b/u);
    await expect(
      integrationDatabase.agentGlobalSettings.findUniqueOrThrow({ where: { id: "global" } }),
    ).resolves.toMatchObject({ runtimeEnabled: false });
  });

  it("refuses to resume while a stored persona would fail its own validation", async () => {
    const { admin, profileIds } = await createPausedPopulation();
    const [first, second] = await Promise.all(
      profileIds.map((profileId) =>
        integrationDatabase.agentPersonaVersion.findFirstOrThrow({
          where: { agentProfileId: profileId },
        }),
      ),
    );
    // İki persona mizaç uzayında üst üste bindi: updateAgent bu adayı reddederdi.
    const clashing = {
      ...seedPersonaSchema.parse(second!.persona),
      temperament: seedPersonaSchema.parse(first!.persona).temperament,
    };
    await appendPersonaVersionDirectly(profileIds[1]!, clashing, renderPersonaPrompt(clashing));

    const outcome = await runRollout(resumeEnvironment(admin.id));

    expect(outcome.error?.message).toMatch(
      /^PROMPT_ROLLOUT_RESUME_BLOCKED .*validationFailures=[1-9]/u,
    );
    await expect(
      integrationDatabase.agentGlobalSettings.findUniqueOrThrow({ where: { id: "global" } }),
    ).resolves.toMatchObject({ runtimeEnabled: false });
  });

  it("refuses to resume before the pause has drained", async () => {
    const { admin, profileIds } = await createPausedPopulation();
    await queueOpenRun(profileIds[0]!);

    const outcome = await runRollout(resumeEnvironment(admin.id));

    expect(outcome.error?.message).toMatch(/^PROMPT_ROLLOUT_RESUME_BLOCKED .*\bopenRuns=1\b/u);
    await expect(
      integrationDatabase.agentGlobalSettings.findUniqueOrThrow({ where: { id: "global" } }),
    ).resolves.toMatchObject({ runtimeEnabled: false });
  });
});

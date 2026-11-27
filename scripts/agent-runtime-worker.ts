import { randomUUID } from "node:crypto";
import { z } from "zod";
import { agentRuntimeCodexProfileNames, CodexCliProvider } from "../src/runtime/codex-cli-provider";
import { RuntimeControlPlaneHttpClient } from "../src/runtime/control-plane-client";
import {
  loadRuntimeCredentialFile,
  loadRuntimeEnrollmentPrivateKeyFile,
} from "../src/runtime/credential-file";
import { RuntimeCredentialRosterLoader } from "../src/runtime/credential-roster";
import {
  AgentRuntimeWorker,
  DEFAULT_STOCHASTIC_TICK_MAXIMUM_MS,
  DEFAULT_STOCHASTIC_TICK_MINIMUM_MS,
  MAX_RUNTIME_PROCESSING_LANES,
  RUNTIME_PROMPT_PROFILE_HASH,
} from "../src/runtime/worker";
import { SafeSourceReader } from "../src/runtime/source-reader";
import { ClaudeCliProvider, ClaudeWriterError } from "../src/runtime/claude-cli-provider";
import {
  claudeWriterProfileNames,
  geminiWriterProfileNames,
} from "../src/runtime/claude-writer-profiles";
import { GeminiCliProvider } from "../src/runtime/gemini-cli-provider";
import {
  buildMainRuntimeProvider,
  mainRuntimeProviderEnvironmentShape,
  protectedRuntimeDirectoriesFromEnvironment,
  validateMainRuntimeProviderEnvironment,
} from "../src/runtime/main-provider";
import { TopicReferenceFetcher } from "../src/runtime/topic-reference";

const workerEnvironmentSchema = z
  .object({
    AGENT_RUNTIME_BASE_URL: z.string().url(),
    AGENT_RUNTIME_CREDENTIAL_FILE: z.string().min(1),
    ...mainRuntimeProviderEnvironmentShape,
    AGENT_RUNTIME_CODEX_HOME: z.string().min(1).optional(),
    AGENT_RUNTIME_WORK_ROOT: z.string().min(1).optional(),
    AGENT_RUNTIME_WORKER_ID: z
      .string()
      .min(3)
      .max(200)
      .regex(/^[A-Za-z0-9._:-]+$/u),
    CODEX_EXECUTABLE: z.string().min(1).optional(),
    CODEX_SANDBOX_EXECUTABLE: z.string().min(1),
    // Kapalı liste; varsayılan üretimin kanıtlanmış profili (14 Ekim, model denemesi).
    AGENT_RUNTIME_CODEX_PROFILE: z.enum(agentRuntimeCodexProfileNames).default("luna-max"),
    /*
      Karma yazım profili (16 Ekim; `src/runtime/voice-rewrite.ts`). Boşsa faz kapalıdır ve
      üretim davranışı değişmez. Geri dönüş: değişkeni silip worker'ı yeniden başlatmak.
    */
    AGENT_RUNTIME_VOICE_PROFILE: z.enum(agentRuntimeCodexProfileNames).optional(),
    /*
      Claude yazar (23 Kasım; `src/runtime/entry-writer.ts`). Boşsa faz kapalıdır ve üretim
      davranışı değişmez. Açıkken Claude CLI, Gökhan'ın elle giriş yaptığı izole dizinde
      (`AGENT_RUNTIME_CLAUDE_HOME`) codex'le aynı sandbox kalıbında koşar. Geri dönüş: değişkeni
      silip worker'ı yeniden başlatmak.
    */
    AGENT_RUNTIME_WRITER_PROFILE: z.enum(claudeWriterProfileNames).optional(),
    AGENT_RUNTIME_WRITER_REFERENCE: z.enum(["none", "wikipedia"]).default("wikipedia"),
    // Claude'a düşen koşu payı; 0.5 canlı yazı tura karşılaştırması (23 Kasım).
    AGENT_RUNTIME_WRITER_CLAUDE_SHARE: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      z.coerce.number().min(0).max(1).default(1),
    ),
    CLAUDE_EXECUTABLE: z.string().min(1).default("/usr/local/bin/claude"),
    /*
      Gemini yazar (27 Kasım; `src/runtime/gemini-cli-provider.ts`). Claude yazar açıkken ek koldur:
      payı Claude payından sonra gelir, ikisinin toplamı 1'i aşamaz. Profil boşsa ya da `agy`
      sandbox'ta açılmazsa Gemini kolu kapalıdır, Claude yazar aynen sürer.
    */
    AGENT_RUNTIME_WRITER_GEMINI_PROFILE: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      z.enum(geminiWriterProfileNames).optional(),
    ),
    AGENT_RUNTIME_WRITER_GEMINI_SHARE: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      z.coerce.number().min(0).max(1).default(0),
    ),
    GEMINI_EXECUTABLE: z.string().min(1).default("/usr/local/bin/agy"),
    AGENT_RUNTIME_GEMINI_HOME: z.string().min(1).optional(),
    AGENT_RUNTIME_GEMINI_WORK_ROOT: z.string().min(1).optional(),
    AGENT_RUNTIME_POLL_MS: z.coerce.number().int().min(1000).max(60_000).default(5000),
    AGENT_RUNTIME_PROCESSING_LANES: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_RUNTIME_PROCESSING_LANES)
      .default(MAX_RUNTIME_PROCESSING_LANES),
    AGENT_RUNTIME_STOCHASTIC_TICK_MIN_MS: z.coerce
      .number()
      .int()
      .min(60_000)
      .max(30 * 60_000)
      .default(DEFAULT_STOCHASTIC_TICK_MINIMUM_MS),
    AGENT_RUNTIME_STOCHASTIC_TICK_MAX_MS: z.coerce
      .number()
      .int()
      .min(60_000)
      .max(30 * 60_000)
      .default(DEFAULT_STOCHASTIC_TICK_MAXIMUM_MS),
  })
  .refine(
    (environment) =>
      environment.AGENT_RUNTIME_STOCHASTIC_TICK_MAX_MS >=
      environment.AGENT_RUNTIME_STOCHASTIC_TICK_MIN_MS,
    { message: "Stochastic tick maksimumu minimumdan küçük olamaz." },
  )
  .superRefine(validateMainRuntimeProviderEnvironment)
  .passthrough();

async function main(): Promise<void> {
  const workerStartedAt = new Date();
  const workerBootId = randomUUID();
  const environment = workerEnvironmentSchema.parse(process.env);
  const { credentialFile, credentials } = await loadRuntimeCredentialFile(
    environment.AGENT_RUNTIME_CREDENTIAL_FILE,
  );
  const provider = buildMainRuntimeProvider({
    mainProvider: environment.AGENT_RUNTIME_MAIN_PROVIDER,
    codexExecutable: environment.CODEX_EXECUTABLE,
    sandboxExecutable: environment.CODEX_SANDBOX_EXECUTABLE,
    credentialFile,
    codexHome: environment.AGENT_RUNTIME_CODEX_HOME,
    workRoot: environment.AGENT_RUNTIME_WORK_ROOT,
    codexProfile: environment.AGENT_RUNTIME_CODEX_PROFILE,
    geminiExecutable: environment.GEMINI_EXECUTABLE,
    geminiHome: environment.AGENT_RUNTIME_GEMINI_HOME,
    geminiWorkRoot: environment.AGENT_RUNTIME_GEMINI_WORK_ROOT,
    geminiProfile: environment.AGENT_RUNTIME_GEMINI_MAIN_PROFILE,
    protectedDirectories: protectedRuntimeDirectoriesFromEnvironment(environment),
  });
  const capability = await provider.inspect();
  if (!capability.supportsStructuredOutput)
    throw new Error("Installed runtime provider structured output desteklemiyor.");
  process.stdout.write(
    `agent-runtime started (${capability.version}; ${capability.model} ${capability.reasoningEffort})\n`,
  );
  // Aynı CLI, sandbox, kimlik ve dizinler; yalnız model profili farklı. Çağrılar koşu içinde sıralı.
  const voiceProvider =
    environment.AGENT_RUNTIME_VOICE_PROFILE &&
    environment.CODEX_EXECUTABLE &&
    environment.AGENT_RUNTIME_CODEX_HOME &&
    environment.AGENT_RUNTIME_WORK_ROOT
      ? new CodexCliProvider({
          executable: environment.CODEX_EXECUTABLE,
          sandboxExecutable: environment.CODEX_SANDBOX_EXECUTABLE,
          credentialFile,
          runtimeHome: environment.AGENT_RUNTIME_CODEX_HOME,
          workRoot: environment.AGENT_RUNTIME_WORK_ROOT,
          codexProfile: environment.AGENT_RUNTIME_VOICE_PROFILE,
        })
      : undefined;
  if (voiceProvider) {
    const voiceCapability = await voiceProvider.inspect();
    if (!voiceCapability.supportsStructuredOutput)
      throw new Error("Installed Codex CLI structured output desteklemiyor.");
    // Ayrı satır: başlangıç satırının biçimi dağıtım betiklerince okunuyor.
    process.stdout.write(
      `agent-runtime voice rewrite enabled (${voiceCapability.model} ${voiceCapability.reasoningEffort})\n`,
    );
  }
  /*
    Claude yazar fail-open başlar: CLI ya da sandbox çalışmazsa worker yazarsız (luna) devam eder;
    toplum durmaz. Sonuç ayrı satırda yazılır.
  */
  let writer:
    | {
        provider: ClaudeCliProvider;
        reference?: TopicReferenceFetcher;
        claudeShare: number;
        gemini?: GeminiCliProvider;
        geminiShare?: number;
      }
    | undefined;
  if (environment.AGENT_RUNTIME_WRITER_PROFILE) {
    if (!environment.AGENT_RUNTIME_CLAUDE_HOME || !environment.AGENT_RUNTIME_CLAUDE_WORK_ROOT)
      throw new Error(
        "Claude yazar için AGENT_RUNTIME_CLAUDE_HOME ve AGENT_RUNTIME_CLAUDE_WORK_ROOT gerekli.",
      );
    const writerProvider = new ClaudeCliProvider({
      executable: environment.CLAUDE_EXECUTABLE,
      sandboxExecutable: environment.CODEX_SANDBOX_EXECUTABLE,
      configHome: environment.AGENT_RUNTIME_CLAUDE_HOME,
      workRoot: environment.AGENT_RUNTIME_CLAUDE_WORK_ROOT,
      profile: environment.AGENT_RUNTIME_WRITER_PROFILE,
    });
    try {
      const writerCapability = await writerProvider.inspect();
      writer = {
        provider: writerProvider,
        claudeShare: environment.AGENT_RUNTIME_WRITER_CLAUDE_SHARE,
        ...(environment.AGENT_RUNTIME_WRITER_REFERENCE === "wikipedia"
          ? { reference: new TopicReferenceFetcher(new SafeSourceReader()) }
          : {}),
      };
      process.stdout.write(
        `agent-runtime writer enabled (claude ${writerCapability.version}; ${environment.AGENT_RUNTIME_WRITER_PROFILE}; reference ${environment.AGENT_RUNTIME_WRITER_REFERENCE}; claude share ${environment.AGENT_RUNTIME_WRITER_CLAUDE_SHARE})\n`,
      );
      const geminiProfile = environment.AGENT_RUNTIME_WRITER_GEMINI_PROFILE;
      const geminiHome = environment.AGENT_RUNTIME_GEMINI_HOME;
      const geminiWorkRoot = environment.AGENT_RUNTIME_GEMINI_WORK_ROOT;
      // Gemini kolu ek koldur: eksik ayar ya da 1'i aşan pay worker'ı durdurmaz, kolu kapatır.
      if (
        geminiProfile &&
        (!geminiHome ||
          !geminiWorkRoot ||
          environment.AGENT_RUNTIME_WRITER_CLAUDE_SHARE +
            environment.AGENT_RUNTIME_WRITER_GEMINI_SHARE >
            1 + 1e-9)
      )
        process.stderr.write("agent-runtime gemini writer disabled (GEMINI_CONFIG_INVALID)\n");
      else if (geminiProfile && geminiHome && geminiWorkRoot) {
        const geminiProvider = new GeminiCliProvider({
          executable: environment.GEMINI_EXECUTABLE,
          sandboxExecutable: environment.CODEX_SANDBOX_EXECUTABLE,
          configHome: geminiHome,
          workRoot: geminiWorkRoot,
          profile: geminiProfile,
          protectedDirectories: [
            "/var/lib/agent-sozluk-runtime",
            "/etc/agent-sozluk",
            credentialFile,
            ...(environment.AGENT_RUNTIME_ENROLLMENT_KEY_FILE
              ? [environment.AGENT_RUNTIME_ENROLLMENT_KEY_FILE]
              : []),
            ...(environment.AGENT_RUNTIME_CODEX_HOME ? [environment.AGENT_RUNTIME_CODEX_HOME] : []),
            ...(environment.AGENT_RUNTIME_WORK_ROOT ? [environment.AGENT_RUNTIME_WORK_ROOT] : []),
            environment.AGENT_RUNTIME_CLAUDE_HOME,
            environment.AGENT_RUNTIME_CLAUDE_WORK_ROOT,
          ],
        });
        try {
          const geminiCapability = await geminiProvider.inspect();
          writer.gemini = geminiProvider;
          writer.geminiShare = environment.AGENT_RUNTIME_WRITER_GEMINI_SHARE;
          process.stdout.write(
            `agent-runtime gemini writer enabled (agy ${geminiCapability.version}; ${geminiProfile}; gemini share ${environment.AGENT_RUNTIME_WRITER_GEMINI_SHARE})\n`,
          );
        } catch (error) {
          const code = error instanceof ClaudeWriterError ? error.safeCode : "GEMINI_EXEC_FAILED";
          process.stderr.write(`agent-runtime gemini writer disabled (${code})\n`);
        }
      }
    } catch (error) {
      const code = error instanceof ClaudeWriterError ? error.safeCode : "CLAUDE_EXEC_FAILED";
      process.stderr.write(`agent-runtime writer disabled (${code})\n`);
    }
  }
  const controlPlane = new RuntimeControlPlaneHttpClient(environment.AGENT_RUNTIME_BASE_URL);
  const credentialRoster = environment.AGENT_RUNTIME_ENROLLMENT_KEY_FILE
    ? new RuntimeCredentialRosterLoader({
        controlPlane,
        workerId: environment.AGENT_RUNTIME_WORKER_ID,
        privateKeyPem: (
          await loadRuntimeEnrollmentPrivateKeyFile(
            environment.AGENT_RUNTIME_ENROLLMENT_KEY_FILE,
            environment.AGENT_RUNTIME_CREDENTIAL_FILE,
          )
        ).privateKeyPem,
        workerTelemetry: {
          bootId: workerBootId,
          processingLanes: environment.AGENT_RUNTIME_PROCESSING_LANES,
          codexVersion: capability.version,
          promptProfileHash: RUNTIME_PROMPT_PROFILE_HASH,
          startedAt: workerStartedAt.toISOString(),
        },
      })
    : null;
  const worker = new AgentRuntimeWorker({
    workerId: environment.AGENT_RUNTIME_WORKER_ID,
    credentials,
    loadCredentials: async () => {
      const loaded = await loadRuntimeCredentialFile(environment.AGENT_RUNTIME_CREDENTIAL_FILE);
      return credentialRoster ? credentialRoster.refresh(loaded.credentials) : loaded.credentials;
    },
    controlPlane,
    stochasticScheduling: { controlPlane },
    provider,
    actionWorthinessProvider: provider,
    // 1 Kasım 2026: kalite kapısı sağlayıcısı zorunlu (fail-closed).
    requireNoveltyGate: true,
    ...(voiceProvider && environment.AGENT_RUNTIME_VOICE_PROFILE
      ? { voice: { provider: voiceProvider, profile: environment.AGENT_RUNTIME_VOICE_PROFILE } }
      : {}),
    ...(writer ? { writer } : {}),
    sourceReader: new SafeSourceReader(),
    pollIntervalMs: environment.AGENT_RUNTIME_POLL_MS,
    processingLanes: environment.AGENT_RUNTIME_PROCESSING_LANES,
    stochasticTickMinimumMs: environment.AGENT_RUNTIME_STOCHASTIC_TICK_MIN_MS,
    stochasticTickMaximumMs: environment.AGENT_RUNTIME_STOCHASTIC_TICK_MAX_MS,
    onSafeEvent: ({ level, code, runId }) =>
      process[level === "error" ? "stderr" : "stdout"].write(
        `${code}${runId ? ` run=${runId}` : ""}\n`,
      ),
  });
  const controller = new AbortController();
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => controller.abort());
  await worker.run(controller.signal);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown runtime worker error";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

import { z } from "zod";
import { CodexCliProvider, type AgentRuntimeCodexProfileName } from "@/runtime/codex-cli-provider";
import {
  agentRuntimeGeminiProfileNames,
  type AgentRuntimeGeminiProfileName,
} from "@/runtime/gemini-profiles";
import { GeminiRuntimeProvider } from "@/runtime/gemini-runtime-provider";
import type { RuntimeProvider } from "@/runtime/provider";

export const agentRuntimeMainProviderNames = ["codex", "gemini"] as const;
export type AgentRuntimeMainProviderName = (typeof agentRuntimeMainProviderNames)[number];

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

export const mainRuntimeProviderEnvironmentShape = {
  AGENT_RUNTIME_MAIN_PROVIDER: z.preprocess(
    emptyToUndefined,
    z.enum(agentRuntimeMainProviderNames).default("codex"),
  ),
  AGENT_RUNTIME_GEMINI_MAIN_PROFILE: z.preprocess(
    emptyToUndefined,
    z.enum(agentRuntimeGeminiProfileNames).default("hydrogen-high"),
  ),
  GEMINI_EXECUTABLE: z.preprocess(
    emptyToUndefined,
    z.string().min(1).default("/usr/local/bin/agy"),
  ),
  AGENT_RUNTIME_GEMINI_HOME: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  AGENT_RUNTIME_GEMINI_WORK_ROOT: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  AGENT_RUNTIME_ENROLLMENT_KEY_FILE: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  AGENT_RUNTIME_CLAUDE_HOME: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  AGENT_RUNTIME_CLAUDE_WORK_ROOT: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
};

export function protectedRuntimeDirectoriesFromEnvironment(environment: {
  AGENT_RUNTIME_ENROLLMENT_KEY_FILE?: string | undefined;
  AGENT_RUNTIME_CLAUDE_HOME?: string | undefined;
  AGENT_RUNTIME_CLAUDE_WORK_ROOT?: string | undefined;
}): string[] {
  return [
    ...(environment.AGENT_RUNTIME_ENROLLMENT_KEY_FILE
      ? [environment.AGENT_RUNTIME_ENROLLMENT_KEY_FILE]
      : []),
    ...(environment.AGENT_RUNTIME_CLAUDE_HOME ? [environment.AGENT_RUNTIME_CLAUDE_HOME] : []),
    ...(environment.AGENT_RUNTIME_CLAUDE_WORK_ROOT
      ? [environment.AGENT_RUNTIME_CLAUDE_WORK_ROOT]
      : []),
  ];
}

export interface MainRuntimeProviderEnvironmentInput {
  AGENT_RUNTIME_MAIN_PROVIDER: AgentRuntimeMainProviderName;
  AGENT_RUNTIME_CODEX_HOME?: string | undefined;
  AGENT_RUNTIME_WORK_ROOT?: string | undefined;
  CODEX_EXECUTABLE?: string | undefined;
  AGENT_RUNTIME_VOICE_PROFILE?: unknown;
  AGENT_RUNTIME_GEMINI_HOME?: string | undefined;
  AGENT_RUNTIME_GEMINI_WORK_ROOT?: string | undefined;
  GEMINI_EXECUTABLE?: string | undefined;
}

/** Seçilen ana sağlayıcıya (ve varsa voice profiline) göre gerekli dizin ve ikilileri zorunlu kılar. */
export function validateMainRuntimeProviderEnvironment(
  environment: MainRuntimeProviderEnvironmentInput,
  context: z.RefinementCtx,
): void {
  if (
    environment.AGENT_RUNTIME_MAIN_PROVIDER === "codex" ||
    environment.AGENT_RUNTIME_VOICE_PROFILE !== undefined
  ) {
    if (!environment.AGENT_RUNTIME_CODEX_HOME)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AGENT_RUNTIME_CODEX_HOME"],
        message: "Codex ana sağlayıcısı veya voice profili için AGENT_RUNTIME_CODEX_HOME gerekir.",
      });
    if (!environment.AGENT_RUNTIME_WORK_ROOT)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AGENT_RUNTIME_WORK_ROOT"],
        message: "Codex ana sağlayıcısı veya voice profili için AGENT_RUNTIME_WORK_ROOT gerekir.",
      });
    if (!environment.CODEX_EXECUTABLE)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CODEX_EXECUTABLE"],
        message: "Codex ana sağlayıcısı veya voice profili için CODEX_EXECUTABLE gerekir.",
      });
  }
  if (environment.AGENT_RUNTIME_MAIN_PROVIDER === "gemini") {
    if (!environment.AGENT_RUNTIME_GEMINI_HOME)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AGENT_RUNTIME_GEMINI_HOME"],
        message: "Gemini ana sağlayıcısı için AGENT_RUNTIME_GEMINI_HOME gerekir.",
      });
    if (!environment.AGENT_RUNTIME_GEMINI_WORK_ROOT)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AGENT_RUNTIME_GEMINI_WORK_ROOT"],
        message: "Gemini ana sağlayıcısı için AGENT_RUNTIME_GEMINI_WORK_ROOT gerekir.",
      });
  }
}

export interface BuildMainRuntimeProviderOptions {
  mainProvider: AgentRuntimeMainProviderName;
  sandboxExecutable: string;
  credentialFile: string;
  codexExecutable?: string | undefined;
  codexHome?: string | undefined;
  workRoot?: string | undefined;
  codexProfile: AgentRuntimeCodexProfileName;
  geminiExecutable: string;
  geminiHome?: string | undefined;
  geminiWorkRoot?: string | undefined;
  geminiProfile: AgentRuntimeGeminiProfileName;
  protectedDirectories?: string[];
}

export function buildMainRuntimeProvider(
  options: BuildMainRuntimeProviderOptions,
): RuntimeProvider {
  if (options.mainProvider === "gemini") {
    if (!options.geminiHome || !options.geminiWorkRoot)
      throw new Error(
        "Gemini ana sağlayıcısı için AGENT_RUNTIME_GEMINI_HOME ve AGENT_RUNTIME_GEMINI_WORK_ROOT gerekli.",
      );
    return new GeminiRuntimeProvider({
      executable: options.geminiExecutable,
      sandboxExecutable: options.sandboxExecutable,
      credentialFile: options.credentialFile,
      configHome: options.geminiHome,
      workRoot: options.geminiWorkRoot,
      geminiProfile: options.geminiProfile,
      protectedDirectories: [
        ...(options.codexHome ? [options.codexHome] : []),
        ...(options.workRoot ? [options.workRoot] : []),
        ...(options.protectedDirectories ?? []),
      ],
    });
  }
  if (!options.codexExecutable || !options.codexHome || !options.workRoot)
    throw new Error(
      "Codex ana sağlayıcısı için CODEX_EXECUTABLE, AGENT_RUNTIME_CODEX_HOME ve AGENT_RUNTIME_WORK_ROOT gerekli.",
    );
  return new CodexCliProvider({
    executable: options.codexExecutable,
    sandboxExecutable: options.sandboxExecutable,
    credentialFile: options.credentialFile,
    runtimeHome: options.codexHome,
    workRoot: options.workRoot,
    codexProfile: options.codexProfile,
  });
}

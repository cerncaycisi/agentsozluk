/*
  Üslup laboratuvarı (27 Eylül, Gökhan: "local kopya üzerinde sorunu bul ve çöz").
  Yerel DB kopyasındaki gerçek bir koşunun bağlamını (dondurulmuş perception, persona sürümü,
  ajan) getRuntimeRunContext ile aynı biçimde kurar; talimatı worker'ın buildRuntimePrompt'u ile
  üretir ve modeli worker'la aynı argümanlarla (sandbox/credential katmanı hariç) çağırır.
*/
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { seedPersonaSchema } from "@/modules/agents/personas/schema";
import { parseRuntimeDecisionOutput } from "@/runtime/output";
import {
  containsDirectQuoteClaim,
  hasUnrecordedOfflineFirstPersonClaim,
  seriousFactualClaimRequiresStrongEvidence,
} from "@/modules/agents/domain/action-policy";
import { constitutionalEntryWritingIssue } from "@/lib/content/constitution-writing-policy";
import type { RuntimeContext } from "@/runtime/control-plane-client";
import {
  AGENT_RUNTIME_CODEX_MODEL,
  AGENT_RUNTIME_CODEX_REASONING_EFFORT,
} from "@/runtime/codex-cli-provider";

export async function loadContext(db: PrismaClient, runId: string): Promise<RuntimeContext> {
  const run = await db.agentRun.findUniqueOrThrow({
    where: { id: runId },
    include: { agentProfile: { include: { user: true } }, personaVersion: true },
  });
  if (!run.perceptionSummary || typeof run.perceptionSummary !== "object")
    throw new Error(`perception yok: ${runId}`);
  const persona = seedPersonaSchema.parse(run.personaVersion.persona);
  return {
    run: {
      id: run.id,
      runType: run.runType,
      trigger: run.trigger,
      timeoutSeconds: run.timeoutSeconds,
      desiredEntryMin: run.desiredEntryMin,
      desiredEntryMax: run.desiredEntryMax,
      allowTopicCreation: run.allowTopicCreation,
      allowVoting: run.allowVoting,
      allowFollowing: run.allowFollowing,
      allowSourceReading: run.allowSourceReading,
      publishEnabled: true,
      publicWriteEnabled: true,
      runtimeOperatingMode: "NORMAL",
      sourceFetchLimit: 10,
      debugRetentionHours: 0,
      adminInstruction: run.adminInstruction,
      cancelRequested: false,
    },
    agent: {
      username: run.agentProfile.user.username,
      displayName: run.agentProfile.user.displayName,
      publicBio: run.agentProfile.user.bio,
    },
    persona: {
      version: run.personaVersion.version,
      document: run.personaVersion.persona,
      renderedPrompt: run.personaVersion.renderedPrompt,
      behavior: {
        topicCreationTendency: persona.behavior.topicCreationTendency,
        votingTendency: persona.behavior.votingTendency,
        followingTendency: persona.behavior.followingTendency,
      },
      writing: { entryLength: persona.writing.entryLength },
    },
    perception: run.perceptionSummary as Record<string, unknown>,
  } as RuntimeContext;
}

export async function callCodex(
  prompt: string,
  schema: unknown,
  options: { effort?: string; model?: string; timeoutMs?: number } = {},
): Promise<{ output: unknown; ms: number }> {
  const dir = await mkdtemp(path.join(tmpdir(), "style-lab-"));
  const schemaPath = path.join(dir, "schema.json");
  const outputPath = path.join(dir, "output.json");
  await writeFile(schemaPath, JSON.stringify(schema));
  const args = [
    "--ask-for-approval",
    "never",
    "--model",
    options.model ?? AGENT_RUNTIME_CODEX_MODEL,
    "-c",
    `model_reasoning_effort="${options.effort ?? AGENT_RUNTIME_CODEX_REASONING_EFFORT}"`,
    "-c",
    "features.shell_tool=false",
    "exec",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    "--output-schema",
    schemaPath,
    "--output-last-message",
    outputPath,
    "-",
  ];
  const started = Date.now();
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("codex", args, { cwd: dir, stdio: ["pipe", "ignore", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = (stderr + chunk.toString()).slice(-4000);
      });
      const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs ?? 900_000);
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`codex çıkış ${code}: ${stderr.slice(-600)}`));
      });
      child.stdin.end(prompt);
    });
    return { output: JSON.parse(await readFile(outputPath, "utf8")), ms: Date.now() - started };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export type LabEntry = {
  actionType: string;
  title: string | null;
  body: string;
  evidenceType?: string | undefined;
  issues?: string[];
};

// Sunucu doğrulayıcılarının saf kısmı (kaynak metni gerektirenler hariç): varyant kabul oranı.
export function validatorIssues(body: string, evidenceType: string | undefined): string[] {
  const issues: string[] = [];
  if (hasUnrecordedOfflineFirstPersonClaim(body)) issues.push("OFFLINE_FIRST_PERSON");
  const constitution = constitutionalEntryWritingIssue(body);
  if (constitution) issues.push(constitution.code);
  if (evidenceType === "MODEL_KNOWLEDGE" && containsDirectQuoteClaim(body))
    issues.push("MODEL_KNOWLEDGE_DIRECT_QUOTE");
  if (
    seriousFactualClaimRequiresStrongEvidence(body) &&
    !["TRUSTED_SOURCE", "MULTIPLE_SOURCES"].includes(evidenceType ?? "")
  )
    issues.push("SERIOUS_CLAIM_SOURCE_INSUFFICIENT");
  return issues;
}

function topicTitleIndex(perception: Record<string, unknown>): Map<string, string> {
  const index = new Map<string, string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const id = record.topicId ?? record.id;
    const title = record.topicTitle ?? record.title;
    if (typeof id === "string" && typeof title === "string") index.set(id, title);
    Object.values(record).forEach(visit);
  };
  visit(perception);
  return index;
}

export function extractEntries(context: RuntimeContext, output: unknown): LabEntry[] {
  const parsed = parseRuntimeDecisionOutput(output);
  if (!parsed.success) return [];
  const titles = topicTitleIndex(context.perception as Record<string, unknown>);
  return parsed.data.actions
    .filter((action) => ["CREATE_ENTRY", "CREATE_TOPIC_WITH_ENTRY"].includes(action.actionType))
    .map((action): LabEntry => {
      const input = action.input as Record<string, unknown>;
      const title =
        action.actionType === "CREATE_TOPIC_WITH_ENTRY"
          ? String(input.title ?? "")
          : (titles.get(String(action.targetId ?? input.topicId ?? "")) ?? null);
      const body = String(input.body ?? "");
      const evidenceType = (action as { provenance?: { evidenceType?: string } }).provenance
        ?.evidenceType;
      return {
        actionType: action.actionType,
        title,
        body,
        evidenceType,
        issues: validatorIssues(body, evidenceType),
      };
    });
}

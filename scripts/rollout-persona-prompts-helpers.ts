import { z } from "zod";
import { sha256 } from "@/lib/security/crypto";

// ADR-013: renderPersonaPrompt() yalnız persona sürümü oluşturulurken çağrılıyor ve çıktısı
// persona sürüm satırına `renderedPrompt` olarak yazılıyor. Worker o snapshot'ı okur. Yani
// prompt şablonunu değiştirmek canlı yazarları etkilemez; sürüm bumplayan bir rollout gerekir.
// Bu modül o rollout'un saf (veritabanısız) karar mantığını tutar; yürütülebilir tarafı
// `rollout-persona-prompts.ts` içinde.

export const promptRolloutConfirmation = "ROLLOUT_PERSONA_PROMPTS";

/** RETIRED hariç her yaşam döngüsü durumu kapsamdadır: emekli agent düzenlenemez. */
export const promptRolloutLifecycleStatuses = ["DRAFT", "PAUSED", "ACTIVE", "SUSPENDED"] as const;

export const defaultPromptRolloutReason =
  "Persona içeriği değişmeden güncel prompt şablonuyla yeniden render edildi.";

export const promptRolloutEnvironmentSchema = z
  .object({
    AGENT_PROMPT_ROLLOUT_MODE: z.enum(["DRY_RUN", "PAUSE", "APPLY", "RESUME"]).default("DRY_RUN"),
    AGENT_PROMPT_ROLLOUT_CONFIRMATION: z.string().optional(),
    AGENT_PROMPT_ROLLOUT_EXPECTED_SNAPSHOT_HASH: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
    AGENT_PROMPT_ROLLOUT_REASON: z.string().min(12).max(900).default(defaultPromptRolloutReason),
    AGENT_OPERATOR_ADMIN_ID: z.string().uuid().optional(),
  })
  .passthrough()
  .superRefine((environment, context) => {
    if (
      environment.AGENT_PROMPT_ROLLOUT_MODE !== "DRY_RUN" &&
      environment.AGENT_PROMPT_ROLLOUT_CONFIRMATION !== promptRolloutConfirmation
    )
      context.addIssue({
        code: "custom",
        path: ["AGENT_PROMPT_ROLLOUT_CONFIRMATION"],
        message: "PROMPT_ROLLOUT_CONFIRMATION_REQUIRED",
      });
    if (
      environment.AGENT_PROMPT_ROLLOUT_MODE === "APPLY" &&
      !environment.AGENT_PROMPT_ROLLOUT_EXPECTED_SNAPSHOT_HASH
    )
      context.addIssue({
        code: "custom",
        path: ["AGENT_PROMPT_ROLLOUT_EXPECTED_SNAPSHOT_HASH"],
        message: "PROMPT_ROLLOUT_SNAPSHOT_HASH_REQUIRED",
      });
  });

export type PromptRolloutEnvironment = z.infer<typeof promptRolloutEnvironmentSchema>;

export interface PersonaPromptRecord {
  profileId: string;
  username: string;
  lifecycleStatus: string;
  personaVersionId: string;
  personaVersion: number;
  /** Veritabanındaki ham persona JSON'unun hash'i. */
  storedPersonaHash: string;
  /** Şemadan geçirilmiş persona JSON'unun hash'i; ikisi ayrışırsa rollout persona'yı da değiştirirdi. */
  normalizedPersonaHash: string;
  /** Persona sürüm satırında duran, worker'ın gerçekten okuduğu snapshot. */
  storedPrompt: string;
  /** Güncel renderer'ın aynı persona için ürettiği prompt. */
  expectedPrompt: string;
  /** validatePersonaCandidate kuru denemesinin sonucu: "PASS" veya hata kodu. */
  validation: string;
}

export interface PersonaPromptReceipt {
  [key: string]: string | number | boolean;
  username: string;
  profileId: string;
  lifecycleStatus: string;
  personaVersion: number;
  storedPersonaHash: string;
  personaNormalizationDrift: boolean;
  storedPromptHash: string;
  expectedPromptHash: string;
  storedPromptLength: number;
  expectedPromptLength: number;
  promptLengthDelta: number;
  storedTemplateSignature: string;
  expectedTemplateSignature: string;
  validation: string;
  changeNeeded: boolean;
}

export interface PromptTemplateGroup {
  signature: string;
  count: number;
  usernames: string[];
}

export interface PromptRolloutPlan {
  profileCount: number;
  changeCount: number;
  personaDriftCount: number;
  validationFailureCount: number;
  /** APPLY'ın beklediği durum parmak izi; kuru çalıştırma ile yazma arasındaki kaymayı yakalar. */
  snapshotHash: string;
  /** Aynı şablondan render edilmiş görünen prompt kümeleri — "iki popülasyon" ölçüsü. */
  beforeTemplateGroups: PromptTemplateGroup[];
  afterTemplateGroups: PromptTemplateGroup[];
  receipts: PersonaPromptReceipt[];
}

const promptLines = (prompt: string): string[] => prompt.split("\n");

/**
 * Anahtar sırasından bağımsız JSON serileştirme. Postgres `jsonb` anahtarları kendi sırasına
 * göre saklar; şemadan geçmiş nesne başka bir sıra üretir. Sıralı karşılaştırma olmadan her
 * persona "değişmiş" görünür ve rollout hiçbir zaman uygulanamaz.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return `{${Object.keys(source)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(source[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Persona içeriğinin sıralamadan bağımsız parmak izi. */
export function personaHash(persona: unknown): string {
  return sha256(canonicalJson(persona));
}

/**
 * Persona'ya özgü olmayan (yani nüfusun çoğunluğunda birebir geçen) satırlar. Persona başına
 * tek sayılır, yoksa bir persona'nın kendi stored+expected kopyası satırı iki kez saydırır.
 */
export function sharedPromptLines(personaPrompts: ReadonlyArray<readonly string[]>): Set<string> {
  const counts = new Map<string, number>();
  for (const prompts of personaPrompts) {
    const seen = new Set(prompts.flatMap(promptLines));
    for (const line of seen) counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  const threshold = Math.max(2, Math.ceil(personaPrompts.length / 2));
  const shared = new Set<string>();
  for (const [line, count] of counts) if (count >= threshold) shared.add(line);
  return shared;
}

/** Prompt'un yalnız paylaşılan (şablon) satırlarının parmak izi; persona içeriği elenir. */
export function templateSignature(prompt: string, shared: ReadonlySet<string>): string {
  return sha256(JSON.stringify(promptLines(prompt).filter((line) => shared.has(line))));
}

export function groupByTemplateSignature(
  entries: ReadonlyArray<{ username: string; signature: string }>,
): PromptTemplateGroup[] {
  const groups = new Map<string, string[]>();
  for (const { username, signature } of entries) {
    const bucket = groups.get(signature);
    if (bucket) bucket.push(username);
    else groups.set(signature, [username]);
  }
  return [...groups.entries()]
    .map(([signature, usernames]) => ({
      signature,
      count: usernames.length,
      usernames: [...usernames].sort(),
    }))
    .sort(
      (left, right) => right.count - left.count || left.signature.localeCompare(right.signature),
    );
}

export function buildPromptRolloutPlan(
  records: ReadonlyArray<PersonaPromptRecord>,
): PromptRolloutPlan {
  const shared = sharedPromptLines(
    records.map(({ storedPrompt, expectedPrompt }) => [storedPrompt, expectedPrompt]),
  );
  const receipts = records.map((record): PersonaPromptReceipt => {
    const storedPromptHash = sha256(record.storedPrompt);
    const expectedPromptHash = sha256(record.expectedPrompt);
    return {
      username: record.username,
      profileId: record.profileId,
      lifecycleStatus: record.lifecycleStatus,
      personaVersion: record.personaVersion,
      storedPersonaHash: record.storedPersonaHash,
      personaNormalizationDrift: record.storedPersonaHash !== record.normalizedPersonaHash,
      storedPromptHash,
      expectedPromptHash,
      storedPromptLength: record.storedPrompt.length,
      expectedPromptLength: record.expectedPrompt.length,
      promptLengthDelta: record.expectedPrompt.length - record.storedPrompt.length,
      storedTemplateSignature: templateSignature(record.storedPrompt, shared),
      expectedTemplateSignature: templateSignature(record.expectedPrompt, shared),
      validation: record.validation,
      changeNeeded: storedPromptHash !== expectedPromptHash,
    };
  });
  return {
    profileCount: receipts.length,
    changeCount: receipts.filter(({ changeNeeded }) => changeNeeded).length,
    personaDriftCount: receipts.filter(({ personaNormalizationDrift }) => personaNormalizationDrift)
      .length,
    validationFailureCount: receipts.filter(({ validation }) => validation !== "PASS").length,
    snapshotHash: sha256(
      JSON.stringify(
        records.map((record) => ({
          profileId: record.profileId,
          username: record.username,
          lifecycleStatus: record.lifecycleStatus,
          personaVersionId: record.personaVersionId,
          personaVersion: record.personaVersion,
          storedPersonaHash: record.storedPersonaHash,
          storedPromptHash: sha256(record.storedPrompt),
        })),
      ),
    ),
    beforeTemplateGroups: groupByTemplateSignature(
      receipts.map(({ username, storedTemplateSignature }) => ({
        username,
        signature: storedTemplateSignature,
      })),
    ),
    afterTemplateGroups: groupByTemplateSignature(
      receipts.map(({ username, expectedTemplateSignature }) => ({
        username,
        signature: expectedTemplateSignature,
      })),
    ),
    receipts,
  };
}

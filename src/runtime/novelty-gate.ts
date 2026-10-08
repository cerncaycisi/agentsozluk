import { z } from "zod";
import {
  applyRuntimeActionWorthinessVerdict,
  type RuntimeActionWorthinessVerdict,
} from "@/runtime/action-worthiness";
import type { RuntimeDecision } from "@/runtime/output";

/*
  Yenilik kapısı (7 Ekim 2026): ajan okuduğu bir başlığa entry yazmadan önce, taslağı o
  başlıktaki önceki entry'lerle ayrı bir çağrıda karşılaştırır ve YAYIMLA / VAZGEC der.

  Neden ayrı çağrı: karar ve AW istemine "tekrar etme" cümlesi eklemek ölçülebilir fark
  yaratmadı (v50/v51, 7 Ekim). Kelime düzeyi `topicSemanticRepetition` paraphrase'ı kaçırıyor
  (Richard Wright: "kaydı/kayıtla"). Ayrı ve dar soru 2 Ekim etiketli setinde yayımlanmış
  TEKRAR'ın 21/30'unu durdurdu, KISMI'nin 30/30'unu ve YENI'nin 55/55'ini korudu.

  Hata ya da süre yetmezse taslak YAYIMLANIR (istemdeki "emin değilsen YAYIMLA" ile aynı
  yön); bu durum ayrı telemetri olayıyla sayılır.
*/

/** Koşu başına en fazla bu kadar yenilik çağrısı; fazlası denetlenmeden geçer ve sayılır. */
export const runtimeNoveltyCallLimit = 2;

export const runtimeNoveltyVerdictSchema = z
  .object({ karar: z.enum(["YAYIMLA", "VAZGEC"]) })
  .strict();

export const runtimeNoveltyVerdictJsonSchema: Record<string, unknown> = Object.fromEntries(
  Object.entries(z.toJSONSchema(runtimeNoveltyVerdictSchema)).filter(([key]) => key !== "$schema"),
);

export type RuntimeNoveltyCandidate = {
  sequence: number;
  topicTitle: string;
  previousEntries: Array<{ username: string; mine: boolean; body: string }>;
  draft: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Okunan ve en az bir entry'si olan başlığa yazılan `CREATE_ENTRY` adayları. Sunucu dolu
 * başlığa yalnız okunan başlıktan `CREATE_ENTRY` kabul eder (`TOPIC_NOT_READ`); dolu başlığa
 * yeni-başlık yoluyla yazımı reddeder (`TOPIC_EXISTS_UNREAD`, `TOPIC_EXISTS_WRITE_AS_ENTRY`).
 * Böylece dolu başlığa giden her entry bu seçiciden geçer.
 */
export function runtimeNoveltyCandidates(
  decision: RuntimeDecision,
  perception: Record<string, unknown>,
): RuntimeNoveltyCandidate[] {
  const readTopics = Array.isArray(perception.readTopics) ? perception.readTopics : [];
  const topics = new Map<string, Record<string, unknown>>();
  for (const value of readTopics) {
    const topic = record(value);
    if (topic && typeof topic.id === "string") topics.set(topic.id, topic);
  }
  return decision.actions.flatMap((action) => {
    if (action.actionType !== "CREATE_ENTRY") return [];
    const topicId = action.input.topicId;
    const draft = action.input.body;
    if (typeof topicId !== "string" || typeof draft !== "string") return [];
    const topic = topics.get(topicId);
    if (!topic || typeof topic.title !== "string" || !Array.isArray(topic.entries)) return [];
    const previousEntries = topic.entries.flatMap((value) => {
      const entry = record(value);
      return entry && typeof entry.body === "string"
        ? [
            {
              username: typeof entry.username === "string" ? entry.username : "yazar",
              mine: entry.mine === true,
              body: entry.body,
            },
          ]
        : [];
    });
    return previousEntries.length === 0
      ? []
      : [{ sequence: action.sequence, topicTitle: topic.title, previousEntries, draft }];
  });
}

/** VAZGEC denen adayları karardan çıkarır; hepsi çıkarsa koşu NO_ACTION olur. */
export function applyRuntimeNoveltyDrops(
  decision: RuntimeDecision,
  droppedSequences: ReadonlySet<number>,
): RuntimeDecision {
  if (droppedSequences.size === 0) return decision;
  const kept = decision.actions
    .filter(({ sequence }) => !droppedSequences.has(sequence))
    .map(({ sequence }) => sequence);
  const keptPublic = decision.actions.some(
    ({ sequence, actionType }) => !droppedSequences.has(sequence) && actionType !== "NO_ACTION",
  );
  // Kapı iki nedenle vazgeçer: tekrar ya da "yazmak için yazılmış" madde; gerekçe ikisini de kapsar.
  const safeReason =
    "Yenilik kontrolü taslağın başlığı okuyana yeni bir şey vermediğine karar verdi.";
  const verdict: RuntimeActionWorthinessVerdict = {
    verdict: keptPublic ? "ACT" : "NO_ACTION",
    confidence: 1,
    evaluations: decision.actions.map(({ sequence }) => ({
      sequence,
      decision: keptPublic && kept.includes(sequence) ? "ACCEPT" : "REJECT",
      safeReason,
    })),
    selectedSequences: keptPublic ? kept : [],
    safeReason,
  };
  return applyRuntimeActionWorthinessVerdict(decision, verdict, {
    subject: "yenilik kontrolü",
    selectedSummary: "Yenilik kontrolü okura yeni bir şey vermeyen taslakları çıkardı.",
    rejectedSummary: "Yenilik kontrolü hiçbir taslağı yayımlamaya değer bulmadı.",
  });
}

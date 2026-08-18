type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };

export const agentBehaviorReasonLabels = {
  UNDEFINED_TOPIC: "Başlık bağımsız ve tanımlanabilir bir kavram değil",
  WRONG_TOPIC_SCOPE: "İçerik yanlış başlık veya kapsam altında",
  MISLEADING_TITLE: "Başlık içeriği yanlış veya yanıltıcı adlandırıyor",
  OFF_TOPIC: "Entry başlığın kavramını anlatmıyor",
  REPETITIVE: "Entry mevcut katkıyı anlamlı yenilik olmadan tekrarlıyor",
  SYNTHETIC_TONE: "Metin doğal sözlük üslubu yerine sentetik bir kalıba düşüyor",
  META_LANGUAGE: "Metin entry veya kayıt olmasını gereksiz biçimde anlatıyor",
  UNSUPPORTED_CLAIM: "İddia görünür kanıtla yeterince desteklenmiyor",
  LINKING_ERROR: "Bkz veya kavram bağlantısı yanlış kullanılıyor",
  OTHER_EDITORIAL: "Diğer editoryal davranış sorunu",
} as const;

export type AgentBehaviorReasonCode = keyof typeof agentBehaviorReasonLabels;

interface FeedbackEvent {
  id: bigint;
  eventType: string;
  metadata: JsonValue;
  occurredAt: Date;
}

function record(value: JsonValue): Record<string, JsonValue | undefined> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

export function projectActiveAgentBehaviorLessons(events: readonly FeedbackEvent[], limit = 5) {
  const seen = new Set<string>();
  const lessons: Array<{
    reasonCode: AgentBehaviorReasonCode;
    lesson: string;
    contentType: "ENTRY" | "TOPIC";
    operation: "HIDDEN" | "RENAMED";
    learnedAt: string;
  }> = [];
  for (const event of events) {
    const metadata = record(event.metadata);
    const feedbackKey = metadata?.feedbackKey;
    if (typeof feedbackKey !== "string" || seen.has(feedbackKey)) continue;
    seen.add(feedbackKey);
    if (event.eventType !== "CONTENT_MODERATED") continue;
    const reasonCode = metadata?.behaviorReasonCode;
    const lesson = metadata?.editorNote;
    const contentType = metadata?.contentType;
    const operation = metadata?.operation;
    if (
      typeof reasonCode !== "string" ||
      !(reasonCode in agentBehaviorReasonLabels) ||
      typeof lesson !== "string" ||
      !["ENTRY", "TOPIC"].includes(String(contentType)) ||
      !["HIDDEN", "RENAMED"].includes(String(operation))
    )
      continue;
    lessons.push({
      reasonCode: reasonCode as AgentBehaviorReasonCode,
      lesson,
      contentType: contentType as "ENTRY" | "TOPIC",
      operation: operation as "HIDDEN" | "RENAMED",
      learnedAt: event.occurredAt.toISOString(),
    });
    if (lessons.length >= limit) break;
  }
  return lessons;
}

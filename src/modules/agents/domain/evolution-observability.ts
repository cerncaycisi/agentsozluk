export const REFLECTION_STATUSES = [
  "APPLIED",
  "NO_DELTA",
  "PARTIAL_RUN",
  "FROZEN",
  "STALE_PERSONA",
  "REJECTED_PERSONA_DELTA",
] as const;

export type ReflectionStatus = (typeof REFLECTION_STATUSES)[number] | "UNKNOWN";
export type ReflectionPurpose = "PERSONA_EVOLUTION" | "MEMORY_CONSOLIDATION";

const MEMORY_CONSOLIDATION_TRIGGERS = new Set([
  "NIGHTLY_MEMORY_CONSOLIDATION",
  "ADMIN_MEMORY_RECONSOLIDATE",
]);

const OUTCOME_COPY: Record<
  ReflectionStatus,
  { label: string; explanation: string; tone: "positive" | "neutral" | "warning" }
> = {
  APPLIED: {
    label: "Değişiklik uygulandı",
    explanation:
      "Yeterli gözlemden türetilen kontrollü değişiklik doğrulamaları geçti ve yeni persona sürümü kaydedildi.",
    tone: "positive",
  },
  NO_DELTA: {
    label: "Değişiklik önermedi",
    explanation:
      "Çalışma tamamlandı fakat eldeki gözlem güvenli ve anlamlı bir değişiklik önermeye yetmedi.",
    tone: "neutral",
  },
  PARTIAL_RUN: {
    label: "Çalışma kısmi kaldı",
    explanation: "İç değerlendirme başarıyla tamamlanmadığı için önerilen değişiklik uygulanmadı.",
    tone: "warning",
  },
  FROZEN: {
    label: "Evolution kapalı",
    explanation:
      "Global veya yazar düzeyindeki evolution anahtarı kapalı olduğu için değişiklik uygulanmadı.",
    tone: "neutral",
  },
  STALE_PERSONA: {
    label: "Persona sürümü eskidi",
    explanation:
      "Çalışma sürerken güncel persona değişti; eski sürüme dayanan öneri güvenli biçimde atlandı.",
    tone: "warning",
  },
  REJECTED_PERSONA_DELTA: {
    label: "Öneri doğrulamadan geçmedi",
    explanation:
      "Önerilen değişiklik persona bütünlüğü, sabit alan veya mesafe sınırlarından birini geçemedi.",
    tone: "warning",
  },
  UNKNOWN: {
    label: "Sonuç sınıflandırılamadı",
    explanation: "Kayıt bilinen güvenli sonuç sözleşmesiyle eşleşmedi; ham metadata gösterilmedi.",
    tone: "warning",
  },
};

export function reflectionPurpose(trigger: string): ReflectionPurpose {
  return MEMORY_CONSOLIDATION_TRIGGERS.has(trigger) ? "MEMORY_CONSOLIDATION" : "PERSONA_EVOLUTION";
}

export function parseReflectionStatus(metadata: unknown): ReflectionStatus {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "UNKNOWN";
  const value = (metadata as Record<string, unknown>).reflectionStatus;
  return typeof value === "string" && (REFLECTION_STATUSES as readonly string[]).includes(value)
    ? (value as (typeof REFLECTION_STATUSES)[number])
    : "UNKNOWN";
}

export function describeReflectionOutcome(input: { trigger: string; status: ReflectionStatus }) {
  const purpose = reflectionPurpose(input.trigger);
  if (purpose === "MEMORY_CONSOLIDATION" && input.status === "NO_DELTA") {
    return {
      purpose,
      purposeLabel: "Hafıza toparlama",
      label: "Persona değişimi beklenmiyordu",
      explanation:
        "Bu çalışma hafıza kayıtlarını toparladı; persona, kanaat veya ilişki değişikliği üretmek için çalışmadı.",
      tone: "neutral" as const,
    };
  }
  const copy = OUTCOME_COPY[input.status];
  return {
    purpose,
    purposeLabel:
      purpose === "MEMORY_CONSOLIDATION" ? "Hafıza toparlama" : "Kişilik değerlendirmesi",
    ...copy,
  };
}

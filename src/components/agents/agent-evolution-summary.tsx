import Link from "next/link";
import { formatIstanbulTimestamp } from "@/lib/format/time";
import type {
  ReflectionPurpose,
  ReflectionStatus,
} from "@/modules/agents/domain/evolution-observability";

interface EvolutionOutcome {
  runId: string;
  trigger: string;
  runStatus: string;
  errorCode: string | null;
  createdAt: Date;
  finishedAt: Date | null;
  status: ReflectionStatus;
  purpose: ReflectionPurpose;
  purposeLabel: string;
  label: string;
  explanation: string;
  tone: "positive" | "neutral" | "warning";
  safeChangeReason: string | null;
  evidence: {
    linkedEvidenceCount: number;
    sourceItemsPresented: number;
    sourceItemsReferenced: number;
  };
  changes: {
    persona: number;
    belief: number;
    relationship: number;
    source: number;
  };
}

export function AgentEvolutionSummary({
  personaEvolutionEnabled,
  sourceEvolutionEnabled,
  evolution,
}: {
  personaEvolutionEnabled: boolean;
  sourceEvolutionEnabled: boolean;
  evolution: {
    sampledRunCount: number;
    statusCounts: Record<ReflectionStatus, number>;
    outcomes: EvolutionOutcome[];
  };
}) {
  const personaReviews = evolution.outcomes.filter(
    ({ purpose }) => purpose === "PERSONA_EVOLUTION",
  ).length;
  const memoryConsolidations = evolution.sampledRunCount - personaReviews;

  return (
    <section id="evolution" className="surface-card mt-5 scroll-mt-24 p-5">
      <h2 className="title-section">Gelişim: ne değişti, neden?</h2>
      <p className="mt-1 text-sm text-muted">
        Son {evolution.sampledRunCount} iç değerlendirme gösteriliyor. Ham prompt, özel hafıza veya
        model düşüncesi değil; yalnız doğrulanmış sonuç, güvenli neden ve gerçekten değişen kayıt
        sayıları görünür.
      </p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Persona gelişimi" value={personaEvolutionEnabled ? "Açık" : "Kapalı"} />
        <Fact label="Kaynak gelişimi" value={sourceEvolutionEnabled ? "Açık" : "Kapalı"} />
        <Fact label="Kişilik değerlendirmesi" value={String(personaReviews)} />
        <Fact label="Hafıza toparlama" value={String(memoryConsolidations)} />
        <Fact label="Uygulanan değişiklik" value={String(evolution.statusCounts.APPLIED)} />
        <Fact label="Değişiklik önermedi" value={String(evolution.statusCounts.NO_DELTA)} />
        <Fact
          label="Doğrulamadan dönen"
          value={String(evolution.statusCounts.REJECTED_PERSONA_DELTA)}
        />
        <Fact label="Sınıflandırılamayan" value={String(evolution.statusCounts.UNKNOWN)} />
      </dl>

      {evolution.outcomes.length === 0 ? (
        <p className="mt-5 rounded-lg border p-4 text-sm">
          Henüz iç değerlendirme kaydı yok. Bu, “değişmemeyi seçti” anlamına gelmez; çalışma henüz
          gerçekleşmemiştir.
        </p>
      ) : (
        <ol className="mt-5 space-y-3">
          {evolution.outcomes.map((outcome) => {
            const changed = Object.entries(outcome.changes).filter(([, count]) => count > 0);
            return (
              <li
                key={outcome.runId}
                className={`rounded-xl border p-4 text-sm ${toneClass(outcome.tone)}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="title-item">{outcome.label}</p>
                    <p className="mt-1 text-xs font-medium text-muted">
                      {outcome.purposeLabel} · {outcome.status} · run {outcome.runStatus}
                    </p>
                  </div>
                  <Link
                    href={`/moderasyon/agentlar/calisma/${outcome.runId}`}
                    className="font-medium text-primary"
                  >
                    Çalışmayı aç
                  </Link>
                </div>
                <p className="mt-3">{outcome.explanation}</p>
                {outcome.safeChangeReason ? (
                  <p className="mt-2">
                    <span className="font-medium">Güvenli değişim nedeni:</span>{" "}
                    {outcome.safeChangeReason}
                  </p>
                ) : null}
                <p className="mt-2 text-muted">
                  Kanıt zinciri: {outcome.evidence.linkedEvidenceCount} bağlantılı kayıt ·{" "}
                  {outcome.evidence.sourceItemsPresented} kaynak item sunuldu ·{" "}
                  {outcome.evidence.sourceItemsReferenced} kaynak item referanslandı
                </p>
                {changed.length > 0 ? (
                  <p className="mt-2 font-medium">
                    Gerçek değişim:{" "}
                    {changed
                      .map(([key, count]) => `${changeLabel(key)} ${String(count)}`)
                      .join(" · ")}
                  </p>
                ) : (
                  <p className="mt-2 text-muted">Kalıcı state değişikliği kaydedilmedi.</p>
                )}
                {outcome.runStatus !== "SUCCEEDED" && outcome.errorCode ? (
                  <p className="mt-2 font-mono text-xs">Güvenli hata kodu: {outcome.errorCode}</p>
                ) : null}
                <p className="mt-2 text-xs text-muted">
                  {formatIstanbulTimestamp(outcome.finishedAt ?? outcome.createdAt, {
                    includeSeconds: true,
                  })}
                  {" · "}
                  {outcome.trigger}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function toneClass(tone: EvolutionOutcome["tone"]): string {
  if (tone === "positive") return "border-success/40 bg-success/10";
  if (tone === "warning") return "border-warning/40 bg-warning/10";
  return "";
}

function changeLabel(key: string): string {
  return (
    {
      persona: "persona sürümü",
      belief: "kanaat",
      relationship: "ilişki",
      source: "kaynak güveni",
    }[key] ?? key
  );
}

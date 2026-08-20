import { agentBehaviorReasonLabels } from "@/modules/agents/domain/behavior-feedback";
import type { AgentBehaviorReasonCode } from "@/modules/moderation/validation/schemas";

export function AgentBehaviorFeedbackFields({
  reasonCode,
  editorNote,
  onReasonCodeChange,
  onEditorNoteChange,
  disabled = false,
}: {
  reasonCode: AgentBehaviorReasonCode | "";
  editorNote: string;
  onReasonCodeChange: (value: AgentBehaviorReasonCode | "") => void;
  onEditorNoteChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-4 rounded-xl border border-accent/30 bg-page p-4">
      <p className="text-sm text-muted">
        Agent içeriğiyse bu bilgi yalnız ilgili agent’ın kalıcı, geri alınabilir davranış dersine
        dönüşür.
      </p>
      <label className="block text-sm font-medium">
        Davranış sebebi
        <select
          value={reasonCode}
          onChange={(event) =>
            onReasonCodeChange(event.target.value as AgentBehaviorReasonCode | "")
          }
          required
          disabled={disabled}
          className="mt-1 min-h-11 w-full rounded-xl border bg-surface px-3"
        >
          <option value="">Seçin</option>
          {Object.entries(agentBehaviorReasonLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">
        Agent’ın özümseyeceği kısa ders
        <textarea
          value={editorNote}
          onChange={(event) => onEditorNoteChange(event.target.value)}
          minLength={3}
          maxLength={240}
          required
          disabled={disabled}
          placeholder="Örn. Bir proje adını etkinliğin kendisiymiş gibi başlıklaştırma."
          className="mt-1 min-h-24 w-full rounded-xl border bg-surface p-3"
        />
      </label>
    </div>
  );
}

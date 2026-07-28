"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { apiRequest, ClientApiError } from "@/lib/http/client";
import type { ConstitutionalContentAction } from "@/modules/moderation/domain/constitutional-moderation";

const ACTION_LABELS: Record<ConstitutionalContentAction, string> = {
  ENTRY_HIDDEN: "Entry’yi çöp alanına gönder",
  ENTRY_MOVED: "Entry’yi doğru başlığa taşı",
  TOPIC_HIDDEN: "Başlığı gizle",
  TOPIC_RENAMED: "Başlığı yeniden adlandır",
  TOPIC_MERGED: "Başlığı kanonik başlıkla birleştir",
};

function endpointFor(
  targetType: "ENTRY" | "TOPIC",
  targetId: string,
  action: ConstitutionalContentAction,
): string {
  if (targetType === "ENTRY")
    return `/api/v1/moderation/entries/${targetId}/${action === "ENTRY_MOVED" ? "move" : "hide"}`;
  if (action === "TOPIC_RENAMED") return `/api/v1/moderation/topics/${targetId}/rename`;
  if (action === "TOPIC_MERGED") return `/api/v1/moderation/topics/${targetId}/merge`;
  return `/api/v1/moderation/topics/${targetId}/hide`;
}

export function ConstitutionalContentAction({
  reportId,
  targetType,
  targetId,
  actions,
}: {
  reportId: string;
  targetType: "ENTRY" | "TOPIC";
  targetId: string;
  actions: readonly ConstitutionalContentAction[];
}) {
  const router = useRouter();
  const [action, setAction] = useState<ConstitutionalContentAction>(actions[0]!);
  const [reason, setReason] = useState("");
  const [targetTopicId, setTargetTopicId] = useState("");
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const needsTargetTopic = action === "ENTRY_MOVED" || action === "TOPIC_MERGED";
  const needsTitle = action === "TOPIC_RENAMED";
  const endpoint = useMemo(
    () => endpointFor(targetType, targetId, action),
    [action, targetId, targetType],
  );
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      await apiRequest(endpoint, {
        method: "POST",
        body: {
          reason,
          sourceReportId: reportId,
          ...(needsTargetTopic ? { targetTopicId } : {}),
          ...(needsTitle ? { title } : {}),
        },
        csrf: true,
        idempotency: true,
      });
      setReason("");
      setTargetTopicId("");
      setTitle("");
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof ClientApiError
          ? submitError.message
          : "İçerik işlemi tamamlanamadı.",
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <form onSubmit={submit} className="mt-5 grid gap-4">
      <div>
        <label htmlFor="constitutional-action" className="mb-2 block text-sm font-bold">
          Uygulanacak işlem
        </label>
        <select
          id="constitutional-action"
          value={action}
          onChange={(event) => setAction(event.target.value as ConstitutionalContentAction)}
          className="min-h-11 w-full rounded-xl border bg-page px-3"
        >
          {actions.map((item) => (
            <option key={item} value={item}>
              {ACTION_LABELS[item]}
            </option>
          ))}
        </select>
      </div>
      {needsTargetTopic ? (
        <div>
          <label htmlFor="constitutional-target-topic" className="mb-2 block text-sm font-bold">
            Hedef başlık UUID
          </label>
          <input
            id="constitutional-target-topic"
            value={targetTopicId}
            onChange={(event) => setTargetTopicId(event.target.value)}
            required
            className="min-h-11 w-full rounded-xl border bg-page px-3"
          />
        </div>
      ) : null}
      {needsTitle ? (
        <div>
          <label htmlFor="constitutional-topic-title" className="mb-2 block text-sm font-bold">
            Yeni kanonik başlık
          </label>
          <input
            id="constitutional-topic-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            minLength={2}
            maxLength={120}
            required
            className="min-h-11 w-full rounded-xl border bg-page px-3"
          />
        </div>
      ) : null}
      <div>
        <label htmlFor="constitutional-action-reason" className="mb-2 block text-sm font-bold">
          İşlem gerekçesi
        </label>
        <textarea
          id="constitutional-action-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          minLength={10}
          maxLength={1000}
          required
          className="min-h-28 w-full rounded-xl border bg-page p-3"
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={
          pending ||
          reason.trim().length < 10 ||
          (needsTargetTopic && targetTopicId.trim().length === 0) ||
          (needsTitle && title.trim().length < 2)
        }
        className="button-primary justify-self-start"
      >
        {pending ? "Uygulanıyor…" : "İçerik işlemini uygula"}
      </button>
    </form>
  );
}

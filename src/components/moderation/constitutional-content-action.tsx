"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest, ClientApiError } from "@/lib/http/client";
import type { ConstitutionalContentAction } from "@/modules/moderation/domain/constitutional-moderation";
import { agentBehaviorReasonLabels } from "@/modules/agents/domain/behavior-feedback";
import type { AgentBehaviorReasonCode } from "@/modules/moderation/validation/schemas";
import { useAppRouter } from "@/lib/navigation/app-navigation";

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

interface TopicTarget {
  id: string;
  title: string;
  url: string;
}

/*
  TEK TIK (Gökhan, 12 Ekim 2026). İşlem düğmeyle seçilir; gerekçe hazır gelir; taşıma ve
  birleştirme hedefi UUID yerine başlık adıyla aranır; yeniden adlandırmada gammazın önerdiği
  başlık hazır gelir. Agent dersi isteyen işlemde sebebe basmak işlemi uygular; ders metni
  sebebin kendisidir. Sunucu kuralları değişmedi.
*/
export function ConstitutionalContentAction({
  reportId,
  targetType,
  targetId,
  actions,
  suggestedTitle,
}: {
  reportId: string;
  targetType: "ENTRY" | "TOPIC";
  targetId: string;
  actions: readonly ConstitutionalContentAction[];
  suggestedTitle?: string;
}) {
  const router = useAppRouter();
  const [action, setAction] = useState<ConstitutionalContentAction>(actions[0]!);
  const [reason, setReason] = useState(`${ACTION_LABELS[actions[0]!]}: gammaz kararına bağlı.`);
  const [target, setTarget] = useState<TopicTarget>();
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<TopicTarget[]>([]);
  const [title, setTitle] = useState(suggestedTitle ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const needsTargetTopic = action === "ENTRY_MOVED" || action === "TOPIC_MERGED";
  const needsTitle = action === "TOPIC_RENAMED";
  const needsBehaviorFeedback = ["ENTRY_HIDDEN", "TOPIC_HIDDEN", "TOPIC_RENAMED"].includes(action);
  const endpoint = useMemo(
    () => endpointFor(targetType, targetId, action),
    [action, targetId, targetType],
  );

  useEffect(() => {
    if (!needsTargetTopic || Array.from(query.trim()).length < 2) {
      setOptions([]);
      return;
    }
    const timer = setTimeout(() => {
      void apiRequest<TopicTarget[]>(
        `/api/v1/moderation/topics/lookup?q=${encodeURIComponent(query.trim())}`,
      )
        .then((found) => setOptions(found.filter((topic) => topic.id !== targetId)))
        .catch(() => setOptions([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [needsTargetTopic, query, targetId]);

  const chooseAction = (next: ConstitutionalContentAction) => {
    setAction(next);
    setReason(`${ACTION_LABELS[next]}: gammaz kararına bağlı.`);
    setError(undefined);
  };

  const apply = async (behavior?: AgentBehaviorReasonCode) => {
    setPending(true);
    setError(undefined);
    try {
      await apiRequest(endpoint, {
        method: "POST",
        body: {
          reason: reason.trim(),
          sourceReportId: reportId,
          ...(needsTargetTopic && target ? { targetTopicId: target.id } : {}),
          ...(needsTitle ? { title: title.trim() } : {}),
          ...(behavior
            ? { behaviorReasonCode: behavior, editorNote: agentBehaviorReasonLabels[behavior] }
            : {}),
        },
        csrf: true,
        idempotency: true,
      });
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

  const ready =
    !pending &&
    Array.from(reason.trim()).length >= 10 &&
    (!needsTargetTopic || target !== undefined) &&
    (!needsTitle || Array.from(title.trim()).length >= 2);

  return (
    <div className="mt-6 grid gap-4">
      {actions.length > 1 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Uygulanacak işlem">
          {actions.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={item === action}
              onClick={() => chooseAction(item)}
              className={item === action ? "button-primary" : "button-secondary"}
            >
              {ACTION_LABELS[item]}
            </button>
          ))}
        </div>
      ) : null}
      {needsTargetTopic ? (
        <div>
          <label htmlFor="constitutional-target-topic" className="mb-2 block text-sm font-medium">
            Hedef başlık (adıyla ara)
          </label>
          <input
            id="constitutional-target-topic"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setTarget(undefined);
            }}
            autoComplete="off"
            className="min-h-11 w-full rounded border bg-page px-3"
          />
          {target ? (
            <p className="mt-2 text-sm">
              Seçilen:{" "}
              <a href={target.url} className="link-strong">
                {target.title}
              </a>
            </p>
          ) : options.length > 0 ? (
            <div className="mt-2 grid gap-1" role="listbox" aria-label="Bulunan başlıklar">
              {options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    setTarget(option);
                    setQuery(option.title);
                    setOptions([]);
                  }}
                  className="button-secondary justify-start text-left"
                >
                  {option.title}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {needsTitle ? (
        <div>
          <label htmlFor="constitutional-topic-title" className="mb-2 block text-sm font-medium">
            Yeni kanonik başlık
          </label>
          <input
            id="constitutional-topic-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            minLength={2}
            maxLength={120}
            className="min-h-11 w-full rounded border bg-page px-3"
          />
        </div>
      ) : null}
      <div>
        <label htmlFor="constitutional-action-reason" className="mb-2 block text-sm font-medium">
          İşlem gerekçesi (hazır; istersen değiştir)
        </label>
        <input
          id="constitutional-action-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          minLength={10}
          maxLength={1000}
          className="min-h-11 w-full rounded border bg-page px-3"
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {needsBehaviorFeedback ? (
        <div className="grid gap-2" role="group" aria-label="Sebep">
          <p className="text-sm text-muted">
            Sebebe basmak işlemi uygular; agent içeriğiyse sebep agent’ın dersine dönüşür.
          </p>
          {(Object.entries(agentBehaviorReasonLabels) as [AgentBehaviorReasonCode, string][]).map(
            ([code, text]) => (
              <button
                key={code}
                type="button"
                disabled={!ready}
                onClick={() => void apply(code)}
                className="button-secondary justify-start text-left"
              >
                {text}
              </button>
            ),
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={!ready}
          onClick={() => void apply()}
          className="button-primary justify-self-start"
        >
          {pending ? "Uygulanıyor…" : `Uygula: ${ACTION_LABELS[action]}`}
        </button>
      )}
    </div>
  );
}

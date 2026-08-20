"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatIstanbulTimestamp } from "@/lib/format/time";
import { apiRequest } from "@/lib/http/client";

export interface SafeRuntimeEvent {
  id: string;
  agentProfileId: string | null;
  runId: string | null;
  eventType: string;
  safeMessage: string;
  metadata: unknown;
  createdAt: string;
  agentProfile: {
    user: { displayName: string; username: string };
  } | null;
}

export const LIVE_EVENT_POLL_INTERVAL_MS = 5000;

function mergeEvents(current: SafeRuntimeEvent[], incoming: SafeRuntimeEvent[]) {
  const byId = new Map(current.map((event) => [event.id, event]));
  for (const event of incoming) byId.set(event.id, event);
  return [...byId.values()]
    .sort((left, right) => Number(BigInt(left.id) - BigInt(right.id)))
    .slice(-100);
}

function eventLabel(eventType: string): string {
  const normalized = eventType.toLowerCase();
  if (normalized === "agent.heartbeat") return "Teknik heartbeat";
  if (normalized.includes("failed") || normalized.includes("error")) return "Çalışma hatası";
  if (normalized.includes("rejected")) return "Aksiyon reddedildi";
  if (normalized.startsWith("run.") || normalized.startsWith("agent.run.")) return "Çalışma durumu";
  if (normalized.includes("action")) return "Agent aksiyonu";
  if (normalized.includes("source")) return "Kaynak olayı";
  if (
    normalized.includes("created") ||
    normalized.includes("paused") ||
    normalized.includes("resumed") ||
    normalized.includes("retired") ||
    normalized.includes("credential")
  )
    return "Yazar yaşam döngüsü";
  if (normalized.includes("scheduler") || normalized.includes("runtime")) return "Toplum runtime";
  return "Agent olayı";
}

export function AgentRuntimeEvents({
  initialEvents,
  live = true,
  includeTechnical = false,
}: {
  initialEvents: SafeRuntimeEvent[];
  live?: boolean;
  includeTechnical?: boolean;
}) {
  const [events, setEvents] = useState(initialEvents);
  const [connection, setConnection] = useState<"CONNECTING" | "LIVE" | "POLLING" | "HISTORY">(
    live ? "CONNECTING" : "HISTORY",
  );
  const latestId = useRef(initialEvents.at(-1)?.id);

  useEffect(() => {
    setEvents(initialEvents);
    latestId.current = initialEvents.at(-1)?.id;
    setConnection(live ? "CONNECTING" : "HISTORY");
  }, [initialEvents, live]);

  useEffect(() => {
    if (!live) {
      setConnection("HISTORY");
      return;
    }
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    const poll = async () => {
      try {
        const query = new URLSearchParams({ poll: "1", limit: "100" });
        if (latestId.current) query.set("afterId", latestId.current);
        if (includeTechnical) query.set("technical", "1");
        const incoming = await apiRequest<SafeRuntimeEvent[]>(
          `/api/v1/admin/agent-runtime/events?${query.toString()}`,
        );
        if (incoming.length) {
          latestId.current = incoming.at(-1)!.id;
          setEvents((current) => mergeEvents(current, incoming));
        }
      } catch {
        // The next five-second poll retries without exposing sensitive details.
      }
    };
    const startPolling = () => {
      setConnection("POLLING");
      if (!pollTimer) pollTimer = setInterval(() => void poll(), LIVE_EVENT_POLL_INTERVAL_MS);
    };
    const source = new EventSource(
      `/api/v1/admin/agent-runtime/events${includeTechnical ? "?technical=1" : ""}`,
    );
    source.onopen = () => {
      setConnection("LIVE");
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = undefined;
    };
    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as SafeRuntimeEvent;
        latestId.current = event.id;
        setEvents((current) => mergeEvents(current, [event]));
      } catch {
        // Ignore malformed transport data; persisted events remain unchanged.
      }
    };
    source.onerror = startPolling;
    return () => {
      source.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [includeTechnical, live]);

  return (
    <section>
      <p className="mb-4 text-sm font-medium" role="status">
        Bağlantı: {connection}
      </p>
      <ol className="space-y-3" aria-live="polite">
        {[...events].reverse().map((event) => (
          <li key={event.id} className="surface-card p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <strong>{eventLabel(event.eventType)}</strong>
                <p className="mt-0.5 font-mono text-xs text-muted">{event.eventType}</p>
              </div>
              <time className="text-xs text-muted">
                {formatIstanbulTimestamp(event.createdAt, { includeSeconds: true })}
              </time>
            </div>
            <p className="mt-2">{event.safeMessage}</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
              {event.agentProfileId && event.agentProfile ? (
                <Link
                  href={`/moderasyon/agentlar/${event.agentProfileId}`}
                  className="font-medium text-primary underline"
                >
                  {event.agentProfile.user.displayName} (@{event.agentProfile.user.username})
                </Link>
              ) : (
                <span className="text-muted">Toplum geneli</span>
              )}
              {event.runId ? (
                <Link
                  href={`/moderasyon/agentlar/calisma/${event.runId}`}
                  className="font-medium text-primary underline"
                >
                  Çalışma detayını aç
                </Link>
              ) : null}
            </div>
            {includeTechnical ? (
              <details className="mt-3 rounded-lg bg-page p-3 text-xs">
                <summary className="cursor-pointer font-medium">Teknik kayıt</summary>
                <p className="mt-2 break-all text-muted">
                  event {event.id} · agent {event.agentProfileId ?? "GLOBAL"} · run{" "}
                  {event.runId ?? "—"}
                </p>
                <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words">
                  {JSON.stringify(event.metadata, null, 2)}
                </pre>
              </details>
            ) : null}
          </li>
        ))}
      </ol>
      {events.length === 0 ? <p className="surface-card p-6 text-muted">Henüz olay yok.</p> : null}
    </section>
  );
}

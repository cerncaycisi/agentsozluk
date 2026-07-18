"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/http/client";

export interface SafeRuntimeEvent {
  id: string;
  agentProfileId: string | null;
  runId: string | null;
  eventType: string;
  safeMessage: string;
  metadata: unknown;
  createdAt: string;
}

export const LIVE_EVENT_POLL_INTERVAL_MS = 5000;

function mergeEvents(current: SafeRuntimeEvent[], incoming: SafeRuntimeEvent[]) {
  const byId = new Map(current.map((event) => [event.id, event]));
  for (const event of incoming) byId.set(event.id, event);
  return [...byId.values()]
    .sort((left, right) => Number(BigInt(left.id) - BigInt(right.id)))
    .slice(-100);
}

export function AgentRuntimeEvents({ initialEvents }: { initialEvents: SafeRuntimeEvent[] }) {
  const [events, setEvents] = useState(initialEvents);
  const [connection, setConnection] = useState<"CONNECTING" | "LIVE" | "POLLING">("CONNECTING");
  const latestId = useRef(initialEvents.at(-1)?.id);

  useEffect(() => {
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    const poll = async () => {
      try {
        const query = latestId.current ? `&afterId=${latestId.current}` : "";
        const incoming = await apiRequest<SafeRuntimeEvent[]>(
          `/api/v1/admin/agent-runtime/events?poll=1&limit=100${query}`,
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
    const source = new EventSource("/api/v1/admin/agent-runtime/events");
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
  }, []);

  return (
    <section>
      <p className="mb-4 text-sm font-bold" role="status">
        Bağlantı: {connection}
      </p>
      <ol className="space-y-3" aria-live="polite">
        {[...events].reverse().map((event) => (
          <li key={event.id} className="surface-card p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong>{event.eventType}</strong>
              <time className="text-xs text-muted">
                {new Date(event.createdAt).toLocaleString("tr-TR")}
              </time>
            </div>
            <p className="mt-2">{event.safeMessage}</p>
            <p className="mt-2 break-all text-xs text-muted">
              event {event.id} · agent {event.agentProfileId ?? "GLOBAL"} · run {event.runId ?? "—"}
            </p>
          </li>
        ))}
      </ol>
      {events.length === 0 ? <p className="surface-card p-6 text-muted">Henüz olay yok.</p> : null}
    </section>
  );
}

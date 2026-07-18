"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { apiRequest, ClientApiError } from "@/lib/http/client";

export type AgentLifeSubject =
  | string
  | number
  | boolean
  | Record<string, unknown>
  | unknown[]
  | null;

export interface AgentLifeEventView {
  id: string;
  agentProfileId: string;
  runId: string | null;
  actionId: string | null;
  decisionSeq: number | null;
  eventType: string;
  subject: AgentLifeSubject;
  summary: string;
  confidence: number | null;
  evidenceIds: string[];
  causedBy: string[];
  before: unknown;
  after: unknown;
  changedFields: string[];
  metadata: unknown;
  occurredAt: string;
  createdAt: string;
  schemaVersion: number;
  agentSequence: string | null;
  batchId: string | null;
  batchSequence: number | null;
  contentHash: string | null;
  eventHash: string | null;
  previousEventHash: string | null;
}

interface AgentLifePage {
  items: AgentLifeEventView[];
  nextCursor: string | null;
}

interface LifeFilters {
  eventType: string;
  runId: string;
  from: string;
  to: string;
}

const emptyFilters: LifeFilters = { eventType: "", runId: "", from: "", to: "" };

function filtersEqual(left: LifeFilters, right: LifeFilters) {
  return (
    left.eventType === right.eventType &&
    left.runId === right.runId &&
    left.from === right.from &&
    left.to === right.to
  );
}

function errorMessage(error: unknown) {
  return error instanceof ClientApiError
    ? error.message
    : "Hayat defteri yüklenemedi; kalıcı kayıtlar değişmedi.";
}

function stringifySafe(value: unknown) {
  if (value === null || value === undefined) return "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "[gösterilemeyen yapılandırılmış değer]";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function displayScalar(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  return null;
}

function subjectLabel(subject: AgentLifeSubject): string | null {
  const scalar = displayScalar(subject);
  if (scalar !== null) return scalar;
  if (!isRecord(subject)) return subject === null ? null : stringifySafe(subject);

  const label = displayScalar(subject.label);
  if (label !== null) return label;

  const kind = displayScalar(subject.kind);
  const type = displayScalar(subject.type);
  const actionType = displayScalar(subject.actionType);
  const id = displayScalar(subject.id);
  const sequence = displayScalar(subject.sequence);
  const parts = [actionType ?? type ?? kind, sequence === null ? null : `#${sequence}`, id].filter(
    (part): part is string => part !== null,
  );
  return parts.length > 0 ? parts.join(" · ") : stringifySafe(subject);
}

function decisionKind(subject: AgentLifeSubject): string | null {
  return isRecord(subject) ? displayScalar(subject.kind) : null;
}

function buildQuery(filters: LifeFilters, cursor?: string) {
  const query = new URLSearchParams({ limit: "50" });
  if (filters.eventType.trim()) query.set("eventType", filters.eventType.trim());
  if (filters.runId.trim()) query.set("runId", filters.runId.trim());
  if (filters.from) query.set("from", new Date(`${filters.from}T00:00:00`).toISOString());
  if (filters.to) query.set("to", new Date(`${filters.to}T23:59:59.999`).toISOString());
  if (cursor) query.set("cursor", cursor);
  return query;
}

function mergeUnique(current: AgentLifeEventView[], incoming: AgentLifeEventView[]) {
  const indexed = new Map(current.map((event) => [event.id, event]));
  for (const event of incoming) indexed.set(event.id, event);
  return [...indexed.values()].sort((left, right) => {
    const byTime = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
    if (byTime) return byTime;
    if (left.agentSequence === right.agentSequence) return left.id.localeCompare(right.id);
    if (left.agentSequence === null) return -1;
    if (right.agentSequence === null) return 1;
    const leftSequence = BigInt(left.agentSequence);
    const rightSequence = BigInt(right.agentSequence);
    return leftSequence < rightSequence ? -1 : 1;
  });
}

const decisionKindLabels: Record<string, string> = {
  OBSERVATION: "Gözlem",
  INTERPRETATION: "Yorum",
  OPTION_CONSIDERED: "Değerlendirilen seçenek",
  OPTION_REJECTED: "Reddedilen seçenek",
  OPTION_SELECTED: "Seçilen seçenek",
  STATE_PROPOSAL: "Durum önerisi",
};

function DecisionBadge({ eventType, subject }: { eventType: string; subject: AgentLifeSubject }) {
  if (eventType !== "DECISION_STEP_RECORDED") return null;
  const kind = decisionKind(subject);
  if (kind === null) return null;
  const label = decisionKindLabels[kind] ?? "Karar adımı";
  return (
    <span className="rounded-full border px-2 py-1 text-xs font-bold" data-decision-kind={kind}>
      {label}
    </span>
  );
}

function LifeEventCard({ event }: { event: AgentLifeEventView }) {
  const renderedSubject = subjectLabel(event.subject);
  return (
    <li className="surface-card p-4 text-sm" data-life-event={event.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <strong>{event.eventType}</strong>
            <DecisionBadge eventType={event.eventType} subject={event.subject} />
          </div>
          {renderedSubject ? <p className="mt-1 break-all font-bold">{renderedSubject}</p> : null}
        </div>
        <time className="text-xs text-muted" dateTime={event.occurredAt}>
          {new Date(event.occurredAt).toLocaleString("tr-TR")}
        </time>
      </div>

      <p className="mt-3 whitespace-pre-wrap">{event.summary}</p>
      <dl className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-2">
        <div>
          <dt className="font-bold text-foreground">Sıra</dt>
          <dd>{event.agentSequence ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-bold text-foreground">Güven</dt>
          <dd>{event.confidence === null ? "—" : event.confidence.toFixed(3)}</dd>
        </div>
        <div>
          <dt className="font-bold text-foreground">Run / action</dt>
          <dd className="break-all">
            {event.runId ?? "—"} / {event.actionId ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="font-bold text-foreground">Karar sırası / şema</dt>
          <dd>
            {event.decisionSeq ?? "—"} / v{event.schemaVersion}
          </dd>
        </div>
        <div>
          <dt className="font-bold text-foreground">Batch / batch sırası</dt>
          <dd className="break-all">
            {event.batchId ?? "—"} / {event.batchSequence ?? "—"}
          </dd>
        </div>
      </dl>

      {event.evidenceIds.length > 0 ? (
        <section className="mt-3" aria-label="Kanıt bağlantıları">
          <h3 className="text-xs font-black">Kanıtlar</h3>
          <p className="mt-1 break-all text-xs text-muted">{event.evidenceIds.join(" · ")}</p>
        </section>
      ) : null}
      {event.causedBy.length > 0 ? (
        <section className="mt-3" aria-label="Nedensel bağlantılar">
          <h3 className="text-xs font-black">Buna yol açan olaylar</h3>
          <p className="mt-1 break-all text-xs text-muted">{event.causedBy.join(" · ")}</p>
        </section>
      ) : null}

      {event.before !== null || event.after !== null ? (
        <section className="mt-4" aria-label="Önce ve sonra">
          <h3 className="font-black">Değişim</h3>
          <div className="mt-2 grid gap-3 lg:grid-cols-2">
            <div>
              <h4 className="text-xs font-black">Önce</h4>
              <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-page p-3 text-xs">
                {stringifySafe(event.before)}
              </pre>
            </div>
            <div>
              <h4 className="text-xs font-black">Sonra</h4>
              <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-page p-3 text-xs">
                {stringifySafe(event.after)}
              </pre>
            </div>
          </div>
          {event.changedFields.length > 0 ? (
            <p className="mt-2 break-all text-xs text-muted">
              Değişen alanlar: {event.changedFields.join(" · ")}
            </p>
          ) : null}
        </section>
      ) : null}

      <details className="mt-4">
        <summary className="cursor-pointer text-xs font-black">
          Bütünlük ve güvenli metadata
        </summary>
        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-page p-3 text-xs">
          {stringifySafe({
            eventId: event.id,
            contentHash: event.contentHash,
            eventHash: event.eventHash,
            previousEventHash: event.previousEventHash,
            batchId: event.batchId,
            batchSequence: event.batchSequence,
            changedFields: event.changedFields,
            createdAt: event.createdAt,
            metadata: event.metadata,
          })}
        </pre>
      </details>
    </li>
  );
}

export function AgentLifeTimeline({ agentId }: { agentId: string }) {
  const eventTypeId = useId();
  const runId = useId();
  const fromId = useId();
  const toId = useId();
  const [draftFilters, setDraftFilters] = useState<LifeFilters>(emptyFilters);
  const [filters, setFilters] = useState<LifeFilters>(emptyFilters);
  const [events, setEvents] = useState<AgentLifeEventView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const endpoint = useMemo(
    () => `/api/v1/admin/agents/${agentId}/life?${buildQuery(filters).toString()}`,
    [agentId, filters],
  );
  const exportHref = useMemo(() => {
    const query = buildQuery(filters);
    query.delete("limit");
    query.set("format", "jsonl");
    return `/api/v1/admin/agents/${agentId}/life?${query.toString()}`;
  }, [agentId, filters]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    setEvents([]);
    setNextCursor(null);
    void apiRequest<AgentLifePage>(endpoint)
      .then((page) => {
        if (!active) return;
        setEvents(mergeUnique([], page.items));
        setNextCursor(page.nextCursor);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setEvents([]);
        setNextCursor(null);
        setError(errorMessage(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [endpoint]);

  return (
    <section>
      <div className="surface-card mb-5 p-4">
        <h2 className="font-black">Ajanın beyan ettiği karar günlüğü</h2>
        <p className="mt-2 text-sm text-muted">
          Bu görünüm erişilemeyen ham model iç tokenlarını değil; ajanın açıkça beyan ettiği gözlem,
          seçenek, gerekçe ve durum değişimlerini, sunucu tarafından kaydedilen sonuçlarla birlikte
          gösterir. Kayıtlar append-only bütünlük zincirindedir.
        </p>
      </div>

      <form
        className="surface-card mb-5 grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5"
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          if (filtersEqual(filters, draftFilters)) return;
          setEvents([]);
          setNextCursor(null);
          setFilters({ ...draftFilters });
        }}
      >
        <label htmlFor={eventTypeId} className="text-sm font-bold">
          Olay türü
          <input
            id={eventTypeId}
            value={draftFilters.eventType}
            onChange={(event) =>
              setDraftFilters((current) => ({ ...current, eventType: event.target.value }))
            }
            placeholder="BELIEF_CHANGED"
            className="mt-1 w-full rounded-xl border bg-page p-3 font-normal"
          />
        </label>
        <label htmlFor={runId} className="text-sm font-bold">
          Run ID
          <input
            id={runId}
            value={draftFilters.runId}
            onChange={(event) =>
              setDraftFilters((current) => ({ ...current, runId: event.target.value }))
            }
            className="mt-1 w-full rounded-xl border bg-page p-3 font-normal"
          />
        </label>
        <label htmlFor={fromId} className="text-sm font-bold">
          Başlangıç
          <input
            id={fromId}
            type="date"
            value={draftFilters.from}
            onChange={(event) =>
              setDraftFilters((current) => ({ ...current, from: event.target.value }))
            }
            className="mt-1 w-full rounded-xl border bg-page p-3 font-normal"
          />
        </label>
        <label htmlFor={toId} className="text-sm font-bold">
          Bitiş
          <input
            id={toId}
            type="date"
            value={draftFilters.to}
            onChange={(event) =>
              setDraftFilters((current) => ({ ...current, to: event.target.value }))
            }
            className="mt-1 w-full rounded-xl border bg-page p-3 font-normal"
          />
        </label>
        <div className="flex items-end gap-2">
          <button className="button-primary" disabled={loading}>
            Filtrele
          </button>
          <button
            type="button"
            className="button-secondary"
            disabled={loading}
            onClick={() => {
              setDraftFilters(emptyFilters);
              if (filtersEqual(filters, emptyFilters)) return;
              setEvents([]);
              setNextCursor(null);
              setFilters(emptyFilters);
            }}
          >
            Temizle
          </button>
        </div>
      </form>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-bold" role="status">
          {loading ? "Hayat defteri yükleniyor…" : `${events.length} olay gösteriliyor`}
        </p>
        <a className="button-secondary" href={exportHref} download>
          Filtrelenmiş JSONL indir
        </a>
      </div>

      {error ? (
        <p role="alert" className="surface-card mb-4 p-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <ol className="space-y-3" aria-label="Agent hayat olayları">
        {events.map((event) => (
          <LifeEventCard key={event.id} event={event} />
        ))}
      </ol>
      {!loading && !error && events.length === 0 ? (
        <p className="surface-card p-6 text-muted">Bu filtrelerde hayat olayı yok.</p>
      ) : null}
      {nextCursor ? (
        <button
          type="button"
          className="button-secondary mt-5"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            setError(undefined);
            try {
              const query = buildQuery(filters, nextCursor);
              const page = await apiRequest<AgentLifePage>(
                `/api/v1/admin/agents/${agentId}/life?${query.toString()}`,
              );
              setEvents((current) => mergeUnique(current, page.items));
              setNextCursor(page.nextCursor);
            } catch (loadError) {
              setError(errorMessage(loadError));
            } finally {
              setLoading(false);
            }
          }}
        >
          Daha eski olayları yükle
        </button>
      ) : null}
    </section>
  );
}

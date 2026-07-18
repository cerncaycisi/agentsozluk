"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { apiRequest, ClientApiError } from "@/lib/http/client";

type SourceStatus =
  | "SEED"
  | "DISCOVERED"
  | "PROBATION"
  | "TRUSTED"
  | "DORMANT"
  | "REJECTED"
  | "BLOCKED";

export interface AgentSourceAdminRow {
  id: string;
  url: string;
  normalizedDomain: string;
  sourceType: string;
  status: SourceStatus;
  trustScore: number;
  interestScore: number;
  noveltyScore: number;
  usefulnessScore: number;
  adminPinned: boolean;
  adminBlocked: boolean;
  lastFetchedAt: string | null;
  lastUsefulAt: string | null;
  consecutiveFailures: number;
  agentProfile: { id: string; user: { username: string; displayName: string } };
  _count: { items: number };
}

function errorMessage(error: unknown): string {
  return error instanceof ClientApiError ? error.message : "Source güncellenemedi.";
}

export function AgentSourceAdmin({ rows }: { rows: AgentSourceAdminRow[] }) {
  return (
    <div className="space-y-4">
      {rows.map((source) => (
        <SourceCard key={source.id} source={source} />
      ))}
      {rows.length === 0 ? (
        <p className="surface-card p-6 text-muted">Filtrede source yok.</p>
      ) : null}
    </div>
  );
}

function SourceCard({ source }: { source: AgentSourceAdminRow }) {
  const router = useRouter();
  const [status, setStatus] = useState(source.status);
  const [adminPinned, setAdminPinned] = useState(source.adminPinned);
  const [adminBlocked, setAdminBlocked] = useState(source.adminBlocked);
  const [trustScore, setTrustScore] = useState(source.trustScore);
  const [interestScore, setInterestScore] = useState(source.interestScore);
  const [noveltyScore, setNoveltyScore] = useState(source.noveltyScore);
  const [usefulnessScore, setUsefulnessScore] = useState(source.usefulnessScore);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  async function update(body: Record<string, unknown>, message: string) {
    setPending(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await apiRequest(`/api/v1/admin/agent-sources/${source.id}`, {
        method: "PATCH",
        body: { ...body, reason },
        csrf: true,
        idempotency: true,
      });
      setNotice(message);
      toast.success(message);
      setReason("");
      router.refresh();
    } catch (submitError) {
      const message = errorMessage(submitError);
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="surface-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-black">
            {source.agentProfile.user.displayName} · {source.status}
          </h2>
          <p className="break-all text-sm text-muted">{source.url}</p>
          <p className="mt-1 text-xs text-muted">
            @{source.agentProfile.user.username} · {source._count.items} item · failures{" "}
            {source.consecutiveFailures}
          </p>
        </div>
        <div className="flex gap-2 text-xs font-bold">
          {source.adminPinned ? <span className="rounded-lg border px-2 py-1">PINNED</span> : null}
          {source.adminBlocked ? (
            <span className="rounded-lg border px-2 py-1">BLOCKED</span>
          ) : null}
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <label className="text-sm font-bold">
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as SourceStatus)}
            className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
          >
            {["SEED", "DISCOVERED", "PROBATION", "TRUSTED", "DORMANT", "REJECTED", "BLOCKED"].map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </select>
        </label>
        <ScoreField label="Trust" value={trustScore} setValue={setTrustScore} />
        <ScoreField label="Interest" value={interestScore} setValue={setInterestScore} />
        <ScoreField label="Novelty" value={noveltyScore} setValue={setNoveltyScore} />
        <ScoreField label="Usefulness" value={usefulnessScore} setValue={setUsefulnessScore} />
        <label className="flex items-center gap-2 rounded-xl border p-3 text-sm font-bold">
          <input
            type="checkbox"
            checked={adminPinned}
            onChange={(event) => setAdminPinned(event.target.checked)}
          />
          Pinned
        </label>
        <label className="flex items-center gap-2 rounded-xl border p-3 text-sm font-bold">
          <input
            type="checkbox"
            checked={adminBlocked}
            onChange={(event) => setAdminBlocked(event.target.checked)}
          />
          Blocked
        </label>
      </div>
      <label className="mt-4 block text-sm font-bold">
        Değişiklik gerekçesi
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          minLength={10}
          maxLength={1000}
          className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
        />
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="button-primary"
          disabled={pending || reason.trim().length < 10}
          onClick={() =>
            void update(
              {
                status,
                adminPinned,
                adminBlocked,
                trustScore,
                interestScore,
                noveltyScore,
                usefulnessScore,
              },
              "Source güncellendi.",
            )
          }
        >
          Kaydet
        </button>
        <button
          type="button"
          className="button-secondary"
          disabled={pending || source.adminPinned || reason.trim().length < 10}
          onClick={() =>
            void update({ status: "DORMANT", adminBlocked: false }, "Source kaldırıldı.")
          }
        >
          Kaldır
        </button>
        <button
          type="button"
          className="button-secondary"
          disabled={pending || reason.trim().length < 10}
          onClick={() =>
            void update(
              { status: "PROBATION", adminBlocked: false },
              "Source yeniden değerlendirmeye alındı.",
            )
          }
        >
          Yeniden değerlendir
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="mt-3 text-sm font-bold">{notice}</p> : null}
    </article>
  );
}

function ScoreField({
  label,
  value,
  setValue,
}: {
  label: string;
  value: number;
  setValue: (value: number) => void;
}) {
  return (
    <label className="text-sm font-bold">
      {label}
      <input
        type="number"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(event) => setValue(Number(event.target.value))}
        className="mt-1 min-h-11 w-full rounded-xl border bg-page px-3"
      />
    </label>
  );
}

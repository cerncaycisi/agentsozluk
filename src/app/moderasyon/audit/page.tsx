import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { ModerationLayout } from "@/components/moderation/moderation-nav";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { getDatabase } from "@/lib/db/client";
import { requireModerationPage } from "@/lib/auth/server-session";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { getAuditLogs } from "@/modules/moderation/application/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Audit kayıtları",
  robots: { index: false, follow: false },
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string; requestId?: string }>;
}) {
  const session = await requireModerationPage();
  const params = await searchParams;
  const rawPage = Number(params.page ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = 20;
  const [logs, totalItems] = await getAuditLogs(
    getDatabase(),
    actorFromSession(session, randomUUID(), "WEB"),
    {
      ...(params.action ? { action: params.action } : {}),
      ...(params.requestId ? { requestId: params.requestId } : {}),
      skip: (page - 1) * pageSize,
      take: pageSize,
    },
  );
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return (
    <ModerationLayout
      title="Audit kayıtları"
      description="Actor, işlem, varlık, tarih ve requestId ile denetlenebilir geçmiş."
    >
      <form className="mb-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <div>
          <label htmlFor="audit-action" className="mb-1 block text-sm font-bold">
            İşlem
          </label>
          <input
            id="audit-action"
            name="action"
            defaultValue={params.action}
            className="min-h-11 w-full rounded-xl border bg-surface px-3"
          />
        </div>
        <div>
          <label htmlFor="audit-request" className="mb-1 block text-sm font-bold">
            Request ID
          </label>
          <input
            id="audit-request"
            name="requestId"
            defaultValue={params.requestId}
            className="min-h-11 w-full rounded-xl border bg-surface px-3"
          />
        </div>
        <button className="button-secondary self-end">Filtrele</button>
      </form>
      <div className="space-y-3">
        {logs.map((log) => (
          <article key={log.id} className="surface-card p-5">
            <div className="flex flex-wrap justify-between gap-3">
              <h2 className="font-bold">{log.action}</h2>
              <time className="text-sm text-muted">{log.createdAt.toLocaleString("tr-TR")}</time>
            </div>
            <p className="mt-2 break-all text-sm text-muted">
              {log.entityType} · {log.entityId ?? "—"} · {log.requestId}
            </p>
          </article>
        ))}
      </div>
      {logs.length === 0 ? (
        <p className="surface-card p-6 text-muted">Audit kaydı bulunamadı.</p>
      ) : null}
      <PaginationLinks
        page={page}
        totalPages={totalPages}
        hrefFor={(next) =>
          `?action=${encodeURIComponent(params.action ?? "")}&requestId=${encodeURIComponent(params.requestId ?? "")}&page=${next}`
        }
      />
    </ModerationLayout>
  );
}

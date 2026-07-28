import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { ModerationLayout } from "@/components/moderation/moderation-nav";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { getDatabase } from "@/lib/db/client";
import { formatIstanbulDate } from "@/lib/format/time";
import { requireModerationPage } from "@/lib/auth/server-session";
import { pageFrom } from "@/lib/http/pagination";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { getModerationReports } from "@/modules/moderation/application/reports";
import {
  gammazDecisionLabel,
  reviewTrackForGammazReason,
  reviewTrackLabel,
} from "@/modules/moderation/domain/constitutional-moderation";
import { gammazReasonLabel, isGammazReason } from "@/modules/moderation/domain/gammaz";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gammazlar", robots: { index: false, follow: false } };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; track?: string }>;
}) {
  const session = await requireModerationPage();
  const params = await searchParams;
  const page = pageFrom(params.page);
  const status =
    params.status === "RESOLVED" || params.status === "REJECTED" ? params.status : "OPEN";
  const track = params.track === "LEGAL" ? "LEGAL" : "FORMAT";
  const pageSize = 20;
  const [reports, totalItems] = await getModerationReports(
    getDatabase(),
    actorFromSession(session, randomUUID(), "WEB"),
    { status, reviewTrack: track, skip: (page - 1) * pageSize, take: pageSize },
  );
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return (
    <ModerationLayout
      title="Gammazlar"
      description="Anayasal gammazları ve tarihsel bildirim kayıtlarını inceleyin."
    >
      <nav aria-label="Moderasyon kuyruğu" className="mb-5 flex flex-wrap gap-2">
        {(["FORMAT", "LEGAL"] as const).map((item) => (
          <Link
            key={item}
            href={`?track=${item}&status=${status}`}
            aria-current={track === item ? "page" : undefined}
            className={track === item ? "button-primary" : "button-secondary"}
          >
            {reviewTrackLabel(item)}
          </Link>
        ))}
      </nav>
      <form className="mb-5 flex gap-3">
        <input type="hidden" name="track" value={track} />
        <label htmlFor="report-status" className="sr-only">
          Gammaz durumu
        </label>
        <select
          id="report-status"
          name="status"
          defaultValue={status}
          className="min-h-11 rounded-xl border bg-surface px-3"
        >
          <option value="OPEN">Açık</option>
          <option value="RESOLVED">Çözüldü</option>
          <option value="REJECTED">Reddedildi</option>
        </select>
        <button className="button-secondary" type="submit">
          Filtrele
        </button>
      </form>
      <div className="hidden overflow-x-auto rounded-2xl border bg-surface md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="p-4">Tür</th>
              <th className="p-4">Gerekçe</th>
              <th className="p-4">Gammazlayan</th>
              <th className="p-4">Tarih</th>
              <th className="p-4">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.id} className="border-b last:border-0">
                <td className="p-4">{report.targetType}</td>
                <td className="p-4">{gammazReasonLabel(report.reason)}</td>
                <td className="p-4">@{report.reporter.username}</td>
                <td className="p-4">{formatIstanbulDate(report.createdAt)}</td>
                <td className="p-4">
                  <Link
                    className="font-semibold text-primary hover:underline"
                    href={`/moderasyon/raporlar/${report.id}`}
                  >
                    İncele
                  </Link>
                  {report.decision ? (
                    <span className="mt-1 block text-xs text-muted">
                      {gammazDecisionLabel(report.decision.outcome)}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 md:hidden">
        {reports.map((report) => (
          <article key={report.id} className="surface-card p-5">
            <p className="text-accent-contrast text-xs font-bold">
              {report.targetType} ·{" "}
              {isGammazReason(report.reason)
                ? reviewTrackLabel(reviewTrackForGammazReason(report.reason))
                : report.status}
            </p>
            <h2 className="mt-2 font-bold">{gammazReasonLabel(report.reason)}</h2>
            <p className="mt-2 text-sm text-muted">
              @{report.reporter.username} · {formatIstanbulDate(report.createdAt)}
            </p>
            <Link
              className="mt-4 inline-block font-semibold text-primary"
              href={`/moderasyon/raporlar/${report.id}`}
            >
              İncele
            </Link>
          </article>
        ))}
      </div>
      {reports.length === 0 ? (
        <p className="surface-card p-6 text-muted">Bu filtrede gammaz yok.</p>
      ) : null}
      <PaginationLinks
        page={page}
        totalPages={totalPages}
        hrefFor={(next) => `?track=${track}&status=${status}&page=${next}`}
      />
    </ModerationLayout>
  );
}

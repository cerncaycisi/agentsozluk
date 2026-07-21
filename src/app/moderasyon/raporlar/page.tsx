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

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bildirimler", robots: { index: false, follow: false } };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const session = await requireModerationPage();
  const params = await searchParams;
  const page = pageFrom(params.page);
  const status =
    params.status === "RESOLVED" || params.status === "REJECTED" ? params.status : "OPEN";
  const pageSize = 20;
  const [reports, totalItems] = await getModerationReports(
    getDatabase(),
    actorFromSession(session, randomUUID(), "WEB"),
    { status, skip: (page - 1) * pageSize, take: pageSize },
  );
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return (
    <ModerationLayout
      title="Bildirimler"
      description="Açık ve sonuçlanmış kullanıcı bildirimlerini inceleyin."
    >
      <form className="mb-5 flex gap-3">
        <label htmlFor="report-status" className="sr-only">
          Bildirim durumu
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
              <th className="p-4">Bildiren</th>
              <th className="p-4">Tarih</th>
              <th className="p-4">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.id} className="border-b last:border-0">
                <td className="p-4">{report.targetType}</td>
                <td className="p-4">{report.reason}</td>
                <td className="p-4">@{report.reporter.username}</td>
                <td className="p-4">{formatIstanbulDate(report.createdAt)}</td>
                <td className="p-4">
                  <Link
                    className="font-semibold text-primary hover:underline"
                    href={`/moderasyon/raporlar/${report.id}`}
                  >
                    İncele
                  </Link>
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
              {report.targetType} · {report.status}
            </p>
            <h2 className="mt-2 font-bold">{report.reason}</h2>
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
        <p className="surface-card p-6 text-muted">Bu filtrede bildirim yok.</p>
      ) : null}
      <PaginationLinks
        page={page}
        totalPages={totalPages}
        hrefFor={(next) => `?status=${status}&page=${next}`}
      />
    </ModerationLayout>
  );
}

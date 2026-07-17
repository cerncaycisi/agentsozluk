import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConfirmAction } from "@/components/moderation/confirm-action";
import { ModerationLayout } from "@/components/moderation/moderation-nav";
import { getDatabase } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";
import { pageUuidFrom } from "@/lib/http/page-params";
import { requireModerationPage } from "@/lib/auth/server-session";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { getModerationReport } from "@/modules/moderation/application/reports";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Bildirim detayı",
  robots: { index: false, follow: false },
};

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = pageUuidFrom(rawId);
  const session = await requireModerationPage();
  let data;
  try {
    data = await getModerationReport(
      getDatabase(),
      actorFromSession(session, randomUUID(), "WEB"),
      id,
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "REPORT_NOT_FOUND") notFound();
    throw error;
  }
  const { report } = data;
  const targetStatus = data.target?.status;
  const targetEndpoint =
    report.targetType === "ENTRY"
      ? `/api/v1/moderation/entries/${report.targetId}/${targetStatus === "HIDDEN" ? "restore" : "hide"}`
      : report.targetType === "TOPIC"
        ? `/api/v1/moderation/topics/${report.targetId}/${targetStatus === "HIDDEN" ? "restore" : "hide"}`
        : `/api/v1/moderation/users/${report.targetId}/${targetStatus === "SUSPENDED" ? "unsuspend" : "suspend"}`;
  return (
    <ModerationLayout
      title="Bildirim detayı"
      description={`${report.targetType} hedefi için ${report.reason} bildirimi.`}
    >
      <div className="grid gap-5">
        <section className="surface-card p-6">
          <h2 className="text-xl font-black">Bildirim</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Durum</dt>
              <dd className="font-bold">{report.status}</dd>
            </div>
            <div>
              <dt className="text-muted">Bildiren</dt>
              <dd className="font-bold">@{report.reporter.username}</dd>
            </div>
            <div>
              <dt className="text-muted">Gerekçe</dt>
              <dd className="font-bold">{report.reason}</dd>
            </div>
            <div>
              <dt className="text-muted">Tarih</dt>
              <dd className="font-bold">{report.createdAt.toLocaleString("tr-TR")}</dd>
            </div>
          </dl>
          {report.details ? (
            <p className="mt-5 whitespace-pre-wrap rounded-xl bg-page p-4">{report.details}</p>
          ) : null}
        </section>
        <section className="surface-card p-6">
          <h2 className="text-xl font-black">Hedef önizleme</h2>
          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-xl bg-page p-4 text-sm">
            {JSON.stringify(data.target, null, 2)}
          </pre>
        </section>
        {report.status === "OPEN" ? (
          <section className="surface-card p-6">
            <h2 className="text-xl font-black">Karar ve hedef işlemleri</h2>
            <div className="mt-5 flex flex-wrap gap-3">
              <ConfirmAction
                endpoint={`/api/v1/moderation/reports/${report.id}/resolve`}
                label="Çöz"
                title="Bildirimi çöz"
                description="İncelemeyi tamamlayıp bildirimi çözüldü olarak işaretleyin."
                fieldName="resolutionNote"
              />
              <ConfirmAction
                endpoint={`/api/v1/moderation/reports/${report.id}/reject`}
                label="Reddet"
                title="Bildirimi reddet"
                description="Bildirimin neden reddedildiğini kaydedin."
                fieldName="resolutionNote"
                destructive
              />
              <ConfirmAction
                endpoint={targetEndpoint}
                label="Hedefe işlem yap"
                title="Hedef işlemini onayla"
                description="Hedefin mevcut durumuna uygun moderasyon işlemi uygulanır."
                destructive
              />
            </div>
          </section>
        ) : null}
        <section className="surface-card p-6">
          <h2 className="text-xl font-black">Geçmiş işlemler</h2>
          <ul className="mt-4 space-y-3">
            {data.moderationActions.map((action) => (
              <li key={action.id} className="rounded-xl bg-page p-4">
                <strong>{action.actionType}</strong>
                <p className="mt-1 text-sm text-muted">{action.reason}</p>
              </li>
            ))}
          </ul>
          {data.moderationActions.length === 0 ? (
            <p className="mt-3 text-muted">Geçmiş işlem yok.</p>
          ) : null}
        </section>
      </div>
    </ModerationLayout>
  );
}

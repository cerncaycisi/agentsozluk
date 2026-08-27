import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ConfirmAction } from "@/components/moderation/confirm-action";
import { ConstitutionalContentAction } from "@/components/moderation/constitutional-content-action";
import { ModerationLayout } from "@/components/moderation/moderation-nav";
import { getDatabase } from "@/lib/db/client";
import { formatIstanbulTimestamp } from "@/lib/format/time";
import { AppError } from "@/lib/http/errors";
import { pageUuidFrom } from "@/lib/http/page-params";
import { requireModerationPage } from "@/lib/auth/server-session";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { getModerationReport } from "@/modules/moderation/application/reports";
import {
  gammazDecisionLabel,
  allowedContentActions,
  reviewTrackForGammazReason,
  reviewTrackLabel,
} from "@/modules/moderation/domain/constitutional-moderation";
import {
  gammazEvidenceRows,
  gammazReasonLabel,
  isGammazReason,
} from "@/modules/moderation/domain/gammaz";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Gammaz detayı",
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
    // Gammaz türüne göre ayrı yetenek isteniyor; yetkisi olmayan moderatör
    // beyaz hata sayfası değil "yetkiniz yok" ekranı görmeli.
    if (error instanceof AppError && error.code === "MODERATION_CAPABILITY_REQUIRED")
      redirect("/yasak");
    throw error;
  }
  const { report } = data;
  const evidenceRows = gammazEvidenceRows(report.evidence);
  const reviewTrack = isGammazReason(report.reason)
    ? reviewTrackForGammazReason(report.reason)
    : null;
  const appliedContentAction = report.decision
    ? data.moderationActions.find(
        (action) =>
          action.decisionId === report.decision?.id &&
          action.actionType !== "GAMMAZ_REASON_ACCEPTED" &&
          action.actionType !== "GAMMAZ_REASON_REJECTED",
      )
    : null;
  return (
    <ModerationLayout
      title="Gammaz detayı"
      description={`${report.targetType} hedefi için ${gammazReasonLabel(report.reason)}.`}
    >
      <div className="grid gap-4">
        <section className="surface-card p-6">
          <h2 className="title-section">Gammaz</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Durum</dt>
              <dd className="font-medium">{report.status}</dd>
            </div>
            <div>
              <dt className="text-muted">Gammazlayan</dt>
              <dd className="font-medium">@{report.reporter.username}</dd>
            </div>
            <div>
              <dt className="text-muted">Gerekçe</dt>
              <dd className="font-medium">{gammazReasonLabel(report.reason)}</dd>
            </div>
            <div>
              <dt className="text-muted">Tarih</dt>
              <dd className="font-medium">{formatIstanbulTimestamp(report.createdAt)}</dd>
            </div>
            {reviewTrack ? (
              <div>
                <dt className="text-muted">İnceleme hattı</dt>
                <dd className="font-medium">{reviewTrackLabel(reviewTrack)}</dd>
              </div>
            ) : null}
          </dl>
          {report.details ? (
            <p className="mt-4 whitespace-pre-wrap rounded-lg bg-page p-4">{report.details}</p>
          ) : null}
          {evidenceRows.length > 0 ? (
            <dl className="mt-4 grid gap-3 rounded-lg bg-page p-4 text-sm sm:grid-cols-2">
              {evidenceRows.map((row) => (
                <div key={row.label}>
                  <dt className="text-muted">{row.label}</dt>
                  <dd className="font-medium">{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </section>
        {report.decision ? (
          <section className="surface-card p-6">
            <h2 className="title-section">Gammaz kararı</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Sonuç</dt>
                <dd className="font-medium">{gammazDecisionLabel(report.decision.outcome)}</dd>
              </div>
              <div>
                <dt className="text-muted">Karar veren</dt>
                <dd className="font-medium">@{report.decision.moderator.username}</dd>
              </div>
              <div>
                <dt className="text-muted">Hat</dt>
                <dd className="font-medium">{reviewTrackLabel(report.decision.reviewTrack)}</dd>
              </div>
              <div>
                <dt className="text-muted">Anayasa maddeleri</dt>
                <dd className="font-medium">
                  {report.decision.constitutionalArticles
                    .map((article) => `Madde ${article}`)
                    .join(", ")}
                </dd>
              </div>
            </dl>
            <p className="mt-4 whitespace-pre-wrap rounded-lg bg-page p-4">
              {report.decision.rationale}
            </p>
          </section>
        ) : null}
        <section className="surface-card p-6">
          <h2 className="title-section">Hedef önizleme</h2>
          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-lg bg-page p-4 text-sm">
            {JSON.stringify(data.target, null, 2)}
          </pre>
        </section>
        {report.status === "OPEN" ? (
          <section className="surface-card p-6">
            <h2 className="title-section">Gammaz gerekçesi kararı</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              <ConfirmAction
                endpoint={`/api/v1/moderation/reports/${report.id}/resolve`}
                label="Gerekçeyi kabul et"
                title="Gammaz gerekçesini kabul et"
                description="Gammaz gerekçesinin doğru olduğunu kaydedin. İçerik işlemi ayrıca uygulanır."
                fieldName="resolutionNote"
              />
              <ConfirmAction
                endpoint={`/api/v1/moderation/reports/${report.id}/reject`}
                label="Gerekçeyi reddet"
                title="Gammaz gerekçesini reddet"
                description="Seçilen gerekçenin neden doğrulanmadığını kaydedin."
                fieldName="resolutionNote"
                destructive
              />
            </div>
          </section>
        ) : null}
        {report.decision?.outcome === "ACCEPTED" ? (
          <section className="surface-card p-6">
            <h2 className="title-section">İçerik işlemi</h2>
            <p className="mt-2 text-muted">
              Gammaz gerekçesi kabul edildi. Hide, move, rename veya merge işlemi bu karardan ayrı
              bir moderasyon kaydı olarak uygulanır.
            </p>
            {appliedContentAction ? (
              <p className="mt-4 rounded-lg bg-page p-4 font-medium">
                Uygulandı: {appliedContentAction.actionType}
              </p>
            ) : isGammazReason(report.reason) &&
              (report.targetType === "ENTRY" || report.targetType === "TOPIC") ? (
              <ConstitutionalContentAction
                reportId={report.id}
                targetType={report.targetType}
                targetId={report.targetId}
                actions={allowedContentActions(report.reason, report.targetType)}
              />
            ) : null}
          </section>
        ) : null}
        <section className="surface-card p-6">
          <h2 className="title-section">Geçmiş işlemler</h2>
          <ul className="mt-4 space-y-3">
            {data.moderationActions.map((action) => (
              <li key={action.id} className="rounded-lg bg-page p-4">
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

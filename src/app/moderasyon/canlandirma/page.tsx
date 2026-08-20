import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmAction } from "@/components/moderation/confirm-action";
import { ModerationLayout } from "@/components/moderation/moderation-nav";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { requireModerationPage } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
import { formatIstanbulDate } from "@/lib/format/time";
import { pageFrom } from "@/lib/http/pagination";
import { entryPublicUrl, topicPublicUrl } from "@/lib/routing/public-urls";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { listAppealQueue, listRevivalQueue } from "@/modules/moderation/application/trash-appeal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Canlandırma ve itiraz",
  robots: { index: false, follow: false },
};

export default async function EntryReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ revivalPage?: string; appealPage?: string }>;
}) {
  const session = await requireModerationPage();
  const params = await searchParams;
  const revivalPage = pageFrom(params.revivalPage);
  const appealPage = pageFrom(params.appealPage);
  const pageSize = 20;
  const actor = actorFromSession(session, randomUUID(), "WEB");
  const [revivals, appeals] = await Promise.all([
    listRevivalQueue(getDatabase(), actor, {
      skip: (revivalPage - 1) * pageSize,
      take: pageSize,
    }),
    listAppealQueue(getDatabase(), actor, {
      skip: (appealPage - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  const revivalPages = Math.max(1, Math.ceil(revivals.totalItems / pageSize));
  const appealPages = Math.max(1, Math.ceil(appeals.totalItems / pageSize));
  return (
    <ModerationLayout
      title="Canlandırma ve itiraz"
      description="Entry revizyonlarını, exact silme gerekçesini ve somut itirazı ayrı kararlarda inceleyin."
    >
      <section>
        <h2 className="title-section">Canlandırma kuyruğu</h2>
        <div className="mt-4 space-y-4">
          {revivals.items.map((request) => (
            <article key={request.id} className="surface-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="title-item">
                    <Link href={entryPublicUrl(request.entry)} className="link-strong">
                      Entry #{request.entry.publicId}
                    </Link>
                  </h3>
                  <p className="mt-1 text-sm text-muted">
                    @{request.requestedBy.username} · {formatIstanbulDate(request.createdAt)}
                  </p>
                </div>
                <span className="text-xs font-medium text-muted">{request.entry.status}</span>
              </div>
              <div className="mt-4 rounded-lg border bg-page p-4">
                <p className="eyebrow text-muted">Exact çöp gerekçesi</p>
                <p className="mt-2 leading-7">{request.trashCase.sourceReason}</p>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <p className="eyebrow text-muted">Önceki sürüm</p>
                  <p className="mt-2 whitespace-pre-wrap leading-7">
                    {request.previousRevision.body}
                  </p>
                </div>
                <div>
                  <p className="eyebrow text-muted">Düzeltilmiş sürüm</p>
                  <p className="mt-2 whitespace-pre-wrap leading-7">{request.submittedBody}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <ConfirmAction
                  endpoint={`/api/v1/moderation/revival-requests/${request.id}/accept`}
                  label="Canlandır"
                  title="Entry canlandırılsın mı?"
                  description="Entry public akışa döner ve çöp vakası kapanır."
                  fieldName="rationale"
                />
                <ConfirmAction
                  endpoint={`/api/v1/moderation/revival-requests/${request.id}/reject`}
                  label="Reddet"
                  title="Canlandırma reddedilsin mi?"
                  description="Entry çöp kutusunda kalır; yazar somut itiraz verebilir."
                  fieldName="rationale"
                  destructive
                />
              </div>
            </article>
          ))}
          {revivals.items.length === 0 ? (
            <p className="surface-card p-6 text-muted">Açık canlandırma isteği yok.</p>
          ) : null}
        </div>
        <PaginationLinks
          page={revivalPage}
          totalPages={revivalPages}
          hrefFor={(nextPage) => `?revivalPage=${nextPage}&appealPage=${appealPage}`}
        />
      </section>

      <section className="mt-12 border-t pt-8">
        <h2 className="title-section">İtiraz kuyruğu</h2>
        <div className="mt-4 space-y-4">
          {appeals.items.map((appeal) => (
            <article key={appeal.id} className="surface-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="title-item">
                    <Link href={topicPublicUrl(appeal.topic)} className="link-strong">
                      {appeal.topicTitleSnapshot}
                    </Link>{" "}
                    ·{" "}
                    <Link href={entryPublicUrl(appeal.entry)} className="link-strong">
                      #{appeal.entry.publicId}
                    </Link>
                  </h3>
                  <p className="mt-1 text-sm text-muted">
                    @{appeal.appellant.username} · {formatIstanbulDate(appeal.createdAt)}
                  </p>
                </div>
                <span className="text-xs font-medium text-muted">{appeal.entry.status}</span>
              </div>
              <dl className="mt-4 grid gap-4">
                <div className="rounded-lg border bg-page p-4">
                  <dt className="eyebrow text-muted">Exact moderasyon gerekçesi</dt>
                  <dd className="mt-2 leading-7">{appeal.moderationReason}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium">Yapılan düzeltme</dt>
                  <dd className="mt-2 whitespace-pre-wrap leading-7">{appeal.correction}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium">Somut savunma</dt>
                  <dd className="mt-2 whitespace-pre-wrap leading-7">{appeal.defense}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium">İtiraz edilen exact entry sürümü</dt>
                  <dd className="mt-2 whitespace-pre-wrap leading-7">{appeal.bodySnapshot}</dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-3">
                <ConfirmAction
                  endpoint={`/api/v1/moderation/appeals/${appeal.id}/accept`}
                  label="İtirazı kabul et"
                  title="İtiraz kabul edilsin mi?"
                  description="Entry public akışa döner ve çöp vakası kapanır."
                  fieldName="rationale"
                />
                <ConfirmAction
                  endpoint={`/api/v1/moderation/appeals/${appeal.id}/reject`}
                  label="İtirazı reddet"
                  title="İtiraz reddedilsin mi?"
                  description="Entry çöp kutusunda kalır ve karar immutable geçmişe eklenir."
                  fieldName="rationale"
                  destructive
                />
              </div>
            </article>
          ))}
          {appeals.items.length === 0 ? (
            <p className="surface-card p-6 text-muted">Açık itiraz yok.</p>
          ) : null}
        </div>
        <PaginationLinks
          page={appealPage}
          totalPages={appealPages}
          hrefFor={(nextPage) => `?revivalPage=${revivalPage}&appealPage=${nextPage}`}
        />
      </section>
    </ModerationLayout>
  );
}

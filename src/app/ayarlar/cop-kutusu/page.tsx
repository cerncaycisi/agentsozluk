import type { Metadata } from "next";
import Link from "next/link";
import { SettingsShell } from "@/components/account/settings-shell";
import { TrashCaseActions } from "@/components/account/trash-case-actions";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { requirePageSession } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
import { formatIstanbulDate } from "@/lib/format/time";
import { pageFrom } from "@/lib/http/pagination";
import { entryPublicUrl, topicPublicUrl } from "@/lib/routing/public-urls";
import { listOwnEntryTrash } from "@/modules/moderation/application/trash-appeal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Entry çöp kutusu",
  robots: { index: false, follow: false },
};

export default async function TrashPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await requirePageSession();
  const page = pageFrom((await searchParams).page);
  const pageSize = 20;
  const result = await listOwnEntryTrash(getDatabase(), session.userId, {
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  const totalPages = Math.max(1, Math.ceil(result.totalItems / pageSize));
  return (
    <SettingsShell
      title="Entry çöp kutusu"
      description="Silinen veya moderasyonla gizlenen entry’lerinizi, exact gerekçeyi ve karar geçmişini görün."
    >
      <div className="space-y-6">
        {result.items.map((trashCase) => {
          const openRequest = trashCase.revivalRequests.find(
            (request) => request.decision === null,
          );
          const latestRequest = trashCase.revivalRequests[0];
          const appeal = trashCase.appeals[0];
          return (
            <article key={trashCase.id} className="surface-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="title-item">
                  <Link className="link-strong" href={topicPublicUrl(trashCase.topic)}>
                    {trashCase.topic.title}
                  </Link>
                </h2>
                <span className="text-xs font-medium text-muted">
                  {trashCase.closedAt ? "KAPANDI" : "ÇÖPTE"}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted">
                <Link href={entryPublicUrl(trashCase.entry)} className="hover:text-primary">
                  #{trashCase.entry.publicId}
                </Link>{" "}
                · {formatIstanbulDate(trashCase.openedAt)}
              </p>
              <div className="mt-4 rounded-lg border bg-page p-4">
                <p className="eyebrow text-muted">Exact gerekçe</p>
                <p className="mt-2 leading-7">{trashCase.sourceReason}</p>
              </div>
              <p className="mt-4 whitespace-pre-wrap leading-7">{trashCase.entry.body}</p>
              {latestRequest?.decision ? (
                <div className="mt-4 rounded-lg border p-4 text-sm">
                  <p className="font-medium">
                    Son canlandırma kararı:{" "}
                    {latestRequest.decision.outcome === "ACCEPTED" ? "Kabul" : "Ret"}
                  </p>
                  <p className="mt-2 text-muted">{latestRequest.decision.rationale}</p>
                </div>
              ) : null}
              {appeal?.decision ? (
                <div className="mt-4 rounded-lg border p-4 text-sm">
                  <p className="font-medium">
                    İtiraz kararı: {appeal.decision.outcome === "ACCEPTED" ? "Kabul" : "Ret"}
                  </p>
                  <p className="mt-2 text-muted">{appeal.decision.rationale}</p>
                </div>
              ) : null}
              {!trashCase.closedAt ? (
                <TrashCaseActions
                  entryId={trashCase.entryId}
                  currentBody={trashCase.entry.body}
                  hasOpenRevival={Boolean(openRequest)}
                  latestRevivalRejected={latestRequest?.decision?.outcome === "REJECTED"}
                  hasAppeal={Boolean(appeal)}
                />
              ) : null}
            </article>
          );
        })}
      </div>
      {result.items.length === 0 ? (
        <p className="surface-card p-6 text-muted">Çöp kutusunda entry yok.</p>
      ) : null}
      <PaginationLinks
        page={page}
        totalPages={totalPages}
        hrefFor={(nextPage) => `?page=${nextPage}`}
      />
    </SettingsShell>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDatabase } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";
import { pageUuidFrom } from "@/lib/http/page-params";
import { pageFrom } from "@/lib/http/pagination";
import { requirePageSession } from "@/lib/auth/server-session";
import { getEntryRevisions } from "@/modules/entries/application/entries";
import { PaginationLinks } from "@/components/ui/pagination-links";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Entry sürümleri",
  robots: { index: false, follow: false },
};

export default async function EntryRevisionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id: rawId } = await params;
  const id = pageUuidFrom(rawId);
  const session = await requirePageSession();
  const page = pageFrom((await searchParams).page);
  const pageSize = 20;
  let result;
  try {
    result = await getEntryRevisions(
      getDatabase(),
      id,
      {
        userId: session.userId,
        role: session.user.role,
        status: session.user.status,
      },
      { skip: (page - 1) * pageSize, take: pageSize },
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "ENTRY_NOT_FOUND") notFound();
    throw error;
  }
  return (
    <main id="ana-icerik" className="mx-auto max-w-[820px] px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight">Entry sürümleri</h1>
      <p className="mt-3 text-muted">Düzenleme öncesindeki metinler en yeniden eskiye sıralanır.</p>
      <div className="mt-7 space-y-4">
        {result.revisions.map((revision) => (
          <article key={revision.id} className="surface-card p-5">
            <p className="whitespace-pre-wrap leading-7">{revision.body}</p>
            <p className="mt-4 border-t pt-3 text-sm text-muted">
              {revision.createdAt.toLocaleString("tr-TR")} · @{revision.editedBy.username}
            </p>
          </article>
        ))}
        {result.revisions.length === 0 ? (
          <p className="surface-card p-6 text-muted">Henüz önceki sürüm yok.</p>
        ) : null}
      </div>
      <PaginationLinks
        page={page}
        totalPages={Math.max(1, Math.ceil(result.totalItems / pageSize))}
        hrefFor={(next) => `?page=${next}`}
      />
    </main>
  );
}

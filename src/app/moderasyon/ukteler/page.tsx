import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAgentAdminPage } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
import { actorFromSession } from "@/modules/auth/domain/actor";
import { listAdminUktes } from "@/modules/uktes/application/uktes";
import { ukteAdminListSchema } from "@/modules/uktes/validation/schemas";
import { UkteList } from "@/components/uktes/ukte-list";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ukte yönetimi",
  robots: { index: false, follow: false },
};
export default async function UkteModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string; status?: string }>;
}) {
  const session = await requireAgentAdminPage();
  const params = await searchParams;
  const parsed = ukteAdminListSchema.safeParse({ before: params.before, status: params.status });
  if (!parsed.success) notFound();
  const list = await listAdminUktes(
    getDatabase(),
    actorFromSession(session, randomUUID(), "WEB"),
    parsed.data,
  );
  return (
    <main id="ana-icerik" tabIndex={-1} className="page-main">
      <h1 className="title-page">Ukte yönetimi</h1>
      <p className="mt-3 text-muted">
        Gizlenen ukteler açık listede yer almaz. Geri açma işlemi güncel başlık durumunu yeniden
        denetler.
      </p>
      <nav aria-label="Ukte durumu" className="my-6 flex gap-4">
        <Link className="link-strong" href="/moderasyon/ukteler?status=OPEN">
          Açık
        </Link>
        <Link className="link-strong" href="/moderasyon/ukteler?status=HIDDEN">
          Gizli
        </Link>
      </nav>
      <UkteList
        {...list}
        admin
        signedIn
        basePath={`/moderasyon/ukteler?status=${parsed.data.status}`}
      />
    </main>
  );
}

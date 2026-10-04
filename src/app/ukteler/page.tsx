import type { Metadata } from "next";
import Link from "next/link";
import { currentPageSession } from "@/lib/auth/server-session";
import { getDatabase } from "@/lib/db/client";
import { UkteCreateForm } from "@/components/uktes/ukte-create-form";
import { UkteList } from "@/components/uktes/ukte-list";
import { listPublicUktes } from "@/modules/uktes/application/uktes";
import { ukteListSchema } from "@/modules/uktes/validation/schemas";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ukteler",
  description: "Okurların yazı okumak istediği, henüz açılmamış başlıklar.",
  robots: { index: false, follow: false },
};
export default async function UktesPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string }>;
}) {
  const params = await searchParams;
  const parsed = ukteListSchema.safeParse({ before: params.before });
  if (!parsed.success) notFound();
  const session = await currentPageSession();
  const list = await listPublicUktes(getDatabase(), {
    ...parsed.data,
    viewerId:
      session?.user.kind === "HUMAN" && session.user.status === "ACTIVE"
        ? session.userId
        : undefined,
  });
  const canWrite =
    session?.user.kind === "HUMAN" &&
    session.user.status === "ACTIVE" &&
    session.user.writerApproved;
  return (
    <main id="ana-icerik" tabIndex={-1} className="page-main">
      <h1 className="title-page">Ukteler</h1>
      <p className="mt-3 text-muted">
        Henüz açılmamış bir başlıkta yazı okumak mı istiyorsunuz? Onaylı yazar hesabınızla buraya
        bir ukte bırakın. İsteyen yazar ilk entry’yi yazabilir.
      </p>
      <p className="mt-2 text-sm text-muted">
        Boş bir bkz de kendi başına anlam taşıyabilir. Her bkz bir yazı isteği değildir.
      </p>
      <div className="mt-6">
        {canWrite ? (
          <UkteCreateForm />
        ) : !session ? (
          <p className="surface-card p-5 text-muted">
            Ukte bırakmak için{" "}
            <Link href="/giris?next=%2Fukteler" className="link-strong">
              giriş yapın
            </Link>
            .
          </p>
        ) : (
          <p className="surface-card p-5 text-muted">
            Ukte bırakmak için aktif ve onaylanmış bir yazar hesabı gerekir.
          </p>
        )}
      </div>
      <section aria-label="Açık ukteler" className="mt-8">
        <UkteList {...list} signedIn={Boolean(session)} />
      </section>
      {parsed.data.before && (
        <p className="mt-6">
          <Link href="/ukteler" className="link-strong">
            En yeni ukteler
          </Link>
        </p>
      )}
    </main>
  );
}

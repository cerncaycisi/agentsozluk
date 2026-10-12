import { WRITER_INTAKE_CLOSED_MESSAGE, writerIntakeOpen } from "@/config/writer-intake";
import type { Metadata } from "next";
import { CreateTopicForm } from "@/components/topics/create-topic-form";
import { PrefillTopicTitle } from "@/app/baslik/ac/prefill-topic-title";
import { requirePageSession } from "@/lib/auth/server-session";
import { parseProposedTopicTitle } from "@/modules/topics/validation/schemas";

export const metadata: Metadata = {
  title: "Başlık aç",
  description: "Yeni bir başlık ve ilk entry’nizi oluşturun.",
  robots: { index: false, follow: false },
};

/**
 * `?title=` yalnız formu ön doldurur. Geçerli başlık kırpılmaz: görünmez biçim
 * karakterleri yüzünden görüntü metni normalize başlıktan daha uzun olabilir.
 */
function prefillTitle(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  return parseProposedTopicTitle(value);
}

export default async function CreateTopicPage({
  searchParams,
}: {
  searchParams: Promise<{ title?: string }>;
}) {
  const [session, params] = await Promise.all([requirePageSession(), searchParams]);
  const initialTitle = prefillTitle(params.title);
  const canCreate = session.user.status === "ACTIVE" && session.user.writerApproved;
  return (
    <main id="ana-icerik" tabIndex={-1} className="page-main">
      <h1 className="title-page">Yeni başlık aç</h1>
      <p className="mt-3 text-muted">Başlığı ilk entry ile birlikte tek adımda oluşturun.</p>
      {canCreate ? (
        <div className="mt-8">
          <CreateTopicForm />
          {initialTitle ? <PrefillTopicTitle title={initialTitle} /> : null}
        </div>
      ) : session.user.status === "ACTIVE" ? (
        <p className="surface-card mt-6 p-6 text-muted">
          {writerIntakeOpen()
            ? "Yazar hesabınız admin onayı bekliyor. Onaydan sonra başlık açabilirsiniz."
            : WRITER_INTAKE_CLOSED_MESSAGE}
        </p>
      ) : (
        <p className="surface-card mt-6 p-6 text-destructive">
          Askıya alınmış hesapla içerik oluşturamazsınız.
        </p>
      )}
    </main>
  );
}

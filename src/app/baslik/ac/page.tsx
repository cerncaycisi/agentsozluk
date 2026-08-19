import type { Metadata } from "next";
import { CreateTopicForm } from "@/components/topics/create-topic-form";
import { PrefillTopicTitle } from "@/app/baslik/ac/prefill-topic-title";
import { requirePageSession } from "@/lib/auth/server-session";

export const metadata: Metadata = {
  title: "Başlık aç",
  description: "Yeni bir başlık ve ilk entry’nizi oluşturun.",
  robots: { index: false, follow: false },
};

/** Başlık alanının `maxLength` sınırı. */
const TITLE_MAX_LENGTH = 120;

/**
 * `?title=` yalnız formu ön doldurmak için okunur; boşlukları sadeleştirip
 * alanın kendi sınırına kırpar. Başka bir davranışı yoktur.
 */
function prefillTitle(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replaceAll(/\s+/gu, " ");
  if (normalized.length === 0) return null;
  return [...normalized].slice(0, TITLE_MAX_LENGTH).join("");
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
    <main id="ana-icerik" className="page-main">
      <h1 className="text-3xl font-black tracking-tight">Yeni başlık aç</h1>
      <p className="mt-3 text-muted">Başlığı ilk entry ile birlikte tek adımda oluşturun.</p>
      {canCreate ? (
        <div className="mt-7">
          <CreateTopicForm />
          {initialTitle ? <PrefillTopicTitle title={initialTitle} /> : null}
        </div>
      ) : session.user.status === "ACTIVE" ? (
        <p className="surface-card mt-7 p-6 text-muted">
          Yazar hesabınız admin onayı bekliyor. Onaydan sonra başlık açabilirsiniz.
        </p>
      ) : (
        <p className="surface-card mt-7 p-6 text-destructive">
          Askıya alınmış hesapla içerik oluşturamazsınız.
        </p>
      )}
    </main>
  );
}

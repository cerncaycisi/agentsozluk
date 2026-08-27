import Link from "next/link";
import { CreateTopicForm } from "@/components/topics/create-topic-form";
import { currentPageSession } from "@/lib/auth/server-session";
import { unopenedTopicUrl } from "@/lib/routing/public-urls";

/**
 * Henüz kimsenin yazmadığı başlığın sayfası. Başlık burada bir arama sonucu
 * değil, gerçek bir adres: yazabilen biri geldiğinde ilk entry doğrudan burada
 * yazılır ve başlık o entry ile doğar. Ayrı bir "başlık aç" sayfası yok.
 */
export async function UnopenedTopicView({ title }: { title: string }) {
  const session = await currentPageSession();
  const canWrite =
    session !== null && session.user.status === "ACTIVE" && session.user.writerApproved;
  return (
    <main id="ana-icerik" className="page-main">
      <h1 className="title-page">{title}</h1>
      <p className="surface-card mt-6 p-4 text-muted">
        Bu başlık henüz açılmamış.{" "}
        {canWrite
          ? "İlk entry’yi yazdığınızda başlık açılır."
          : "İlk entry yazıldığında başlık açılır."}
      </p>
      {canWrite ? (
        <div className="mt-8">
          <CreateTopicForm fixedTitle={title} />
        </div>
      ) : session === null ? (
        <p className="mt-6 text-muted">
          Başlığı açmak için{" "}
          <Link
            href={`/giris?next=${encodeURIComponent(unopenedTopicUrl(title))}`}
            className="link-strong inline font-semibold"
          >
            giriş yapın
          </Link>
          .
        </p>
      ) : session.user.status === "ACTIVE" ? (
        <p className="surface-card mt-6 p-6 text-muted">
          Yazar hesabınız admin onayı bekliyor. Onaydan sonra başlık açabilirsiniz.
        </p>
      ) : (
        <p className="surface-card mt-6 p-6 text-destructive">
          Askıya alınmış hesapla içerik oluşturamazsınız.
        </p>
      )}
    </main>
  );
}

import type { Metadata } from "next";
import { CreateTopicForm } from "@/components/topics/create-topic-form";
import { requirePageSession } from "@/lib/auth/server-session";

export const metadata: Metadata = {
  title: "Başlık aç",
  description: "Yeni bir başlık ve ilk entry’nizi oluşturun.",
  robots: { index: false, follow: false },
};

export default async function CreateTopicPage() {
  const session = await requirePageSession();
  return (
    <main id="ana-icerik" className="mx-auto max-w-[820px] px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight">Yeni başlık aç</h1>
      <p className="mt-3 text-muted">Başlığı ilk entry ile birlikte tek adımda oluşturun.</p>
      {session.user.status === "ACTIVE" ? (
        <div className="mt-7">
          <CreateTopicForm />
        </div>
      ) : (
        <p className="surface-card mt-7 p-6 text-destructive">
          Askıya alınmış hesapla içerik oluşturamazsınız.
        </p>
      )}
    </main>
  );
}

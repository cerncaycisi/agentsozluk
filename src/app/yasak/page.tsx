import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Erişim yok", robots: { index: false, follow: false } };

export default function ForbiddenPage() {
  return (
    <main
      id="ana-icerik"
      className="mx-auto grid min-h-[70vh] max-w-2xl place-items-center px-4 py-16"
    >
      <div className="surface-card w-full p-8 text-center sm:p-12">
        <p className="text-sm font-bold uppercase tracking-widest text-destructive">403</p>
        <h1 className="mt-3 text-3xl font-black">Bu alan için yetkiniz yok</h1>
        <p className="mt-4 text-muted">
          Hesabınız bu sayfayı veya işlemi görüntüleme yetkisine sahip değil.
        </p>
        <Link href="/" className="button-secondary mt-7">
          Ana sayfaya dön
        </Link>
      </div>
    </main>
  );
}

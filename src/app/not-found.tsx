import Link from "next/link";

export default function NotFound() {
  return (
    <main
      id="ana-icerik"
      className="mx-auto grid min-h-[70vh] max-w-2xl place-items-center px-4 py-16"
    >
      <div className="surface-card w-full p-8 text-center sm:p-12">
        <p className="eyebrow">404</p>
        <h1 className="title-page mt-3">Bu sayfa sözlükte yok</h1>
        <p className="mt-4 text-muted">
          Bağlantı değişmiş ya da aradığınız içerik kaldırılmış olabilir.
        </p>
        <Link href="/" className="button-primary mt-7">
          Ana sayfaya dön
        </Link>
      </div>
    </main>
  );
}

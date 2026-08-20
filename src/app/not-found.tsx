import Link from "next/link";
import { Search } from "lucide-react";

/**
 * Bir sözlükte olmayan adres, olmayan başlık demektir. O yüzden buradaki doğal
 * devam "ana sayfaya dön" değil, aramak: kullanıcı ne aradığını zaten biliyor.
 *
 * Arama alanı `HeaderSearchForm`'u paylaşmıyor; o bileşen site kabuğuna bağlı ve
 * burada kabuğun dışında, tek başına bir yüzey var. Form `method="get"` — JS
 * kapalıyken de çalışır.
 */
export default function NotFound() {
  return (
    <main
      id="ana-icerik"
      className="mx-auto grid min-h-[70vh] max-w-2xl place-items-center px-4 py-16"
    >
      <div className="w-full">
        <p className="eyebrow">404</p>
        <h1 className="title-page mt-3">Bu adreste bir başlık yok</h1>
        <p className="prose-measure mt-4 text-muted">
          Bağlantı değişmiş ya da içerik kaldırılmış olabilir. Ne aradığını biliyorsan buradan
          arayabilirsin.
        </p>
        <form action="/ara" method="get" role="search" className="mt-6 flex gap-2">
          <label htmlFor="not-found-search" className="sr-only">
            Başlık, entry veya yazar ara
          </label>
          <input
            id="not-found-search"
            name="q"
            type="search"
            maxLength={100}
            placeholder="Başlık, entry veya yazar ara"
            className="min-w-0 flex-1 rounded border field-border bg-page px-3 py-2"
          />
          {/* Form kontrolü, içerik satırı değil: `field-border` taşıyan arama
              kutusunun bitişiğinde duruyor, o yüzden kutulu varyant. `.icon-button`
              artık varsayılan olarak çerçevesiz. */}
          <button type="submit" className="icon-button icon-button-boxed bg-page" aria-label="Ara">
            <Search aria-hidden="true" size={18} />
          </button>
        </form>
        <p className="mt-6 text-small">
          Ya da{" "}
          <Link href="/" className="link-strong">
            ana sayfaya dön
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

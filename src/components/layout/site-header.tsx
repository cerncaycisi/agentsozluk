import Link from "next/link";
import { APP_NAME } from "@/config/app";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const navigation = [
  { href: "/gundem", label: "Gündem" },
  { href: "/son", label: "Son" },
  { href: "/yeni", label: "Yeni" },
  { href: "/debe", label: "DEBE" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b bg-surface/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-[1240px] items-center gap-5 px-4 sm:px-6">
        <Link href="/" className="shrink-0 text-lg font-black tracking-tight text-primary">
          {APP_NAME}
        </Link>
        <nav aria-label="Ana menü" className="hidden items-center gap-1 md:flex">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:bg-page hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <form action="/ara" role="search" className="ml-auto hidden max-w-xs flex-1 sm:block">
          <label htmlFor="header-search" className="sr-only">
            Sözlükte ara
          </label>
          <input
            id="header-search"
            name="q"
            type="search"
            minLength={2}
            maxLength={100}
            placeholder="Başlık, entry veya yazar ara"
            className="min-h-10 w-full rounded-xl border bg-page px-4 text-sm placeholder:text-muted"
          />
        </form>
        <ThemeToggle />
        <Link href="/giris" className="text-sm font-semibold text-primary hover:underline">
          Giriş
        </Link>
      </div>
    </header>
  );
}

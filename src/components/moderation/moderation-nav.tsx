import Link from "next/link";
import { moderationNavSections } from "@/config/navigation";

export function ModerationLayout({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main id="ana-icerik" className="mx-auto max-w-[820px] px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight">{title}</h1>
      <p className="mt-3 text-muted">{description}</p>
      <nav aria-label="Moderasyon menüsü" className="mt-6 space-y-3 border-b pb-4">
        {moderationNavSections.map((section) => (
          <div
            key={section.label}
            className="grid grid-cols-[5.25rem_minmax(0,1fr)] items-start gap-2 sm:grid-cols-[6rem_minmax(0,1fr)]"
          >
            <span className="px-1 py-2 text-xs font-black uppercase leading-tight tracking-wide text-muted">
              {section.label}
            </span>
            <div className="flex min-w-0 flex-wrap gap-1">
              {section.links.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex min-h-9 items-center rounded-lg px-2.5 py-2 text-sm font-semibold leading-tight hover:bg-surface hover:text-primary"
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="mt-7">{children}</div>
    </main>
  );
}

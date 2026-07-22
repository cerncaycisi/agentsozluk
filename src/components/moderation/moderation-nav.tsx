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
      <nav aria-label="Moderasyon menüsü" className="mt-6 space-y-2 border-b pb-3">
        {moderationNavSections.map((section) => (
          <div key={section.label} className="flex items-center gap-2 overflow-x-auto">
            <span className="w-24 shrink-0 px-1 text-xs font-black uppercase tracking-wide text-muted">
              {section.label}
            </span>
            {section.links.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-surface hover:text-primary"
              >
                {label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="mt-7">{children}</div>
    </main>
  );
}

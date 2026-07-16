import Link from "next/link";

const links = [
  ["/ayarlar", "Profil"],
  ["/ayarlar/guvenlik", "Güvenlik"],
  ["/ayarlar/oturumlar", "Oturumlar"],
  ["/ayarlar/engellenenler", "Engellenenler"],
] as const;

export function SettingsShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main id="ana-icerik" className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight">{title}</h1>
      <p className="mt-2 text-muted">{description}</p>
      <nav aria-label="Hesap ayarları" className="mt-7 flex gap-2 overflow-x-auto border-b pb-3">
        {links.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:bg-surface hover:text-primary"
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-7">{children}</div>
    </main>
  );
}

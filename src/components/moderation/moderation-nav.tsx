import Link from "next/link";

const links = [
  ["/moderasyon", "Genel bakış"],
  ["/moderasyon/raporlar", "Bildirimler"],
  ["/moderasyon/basliklar", "Başlıklar"],
  ["/moderasyon/kullanicilar", "Kullanıcılar"],
  ["/moderasyon/agentlar", "Agentlar"],
  ["/moderasyon/agent-icerikleri", "Agent içerikleri"],
  ["/moderasyon/agent-kapasite", "Kapasite"],
  ["/moderasyon/audit", "Audit"],
] as const;

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
      <nav aria-label="Moderasyon menüsü" className="mt-6 flex gap-2 overflow-x-auto border-b pb-3">
        {links.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-surface hover:text-primary"
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-7">{children}</div>
    </main>
  );
}

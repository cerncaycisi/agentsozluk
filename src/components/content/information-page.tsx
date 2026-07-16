export function InformationPage({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main id="ana-icerik" className="mx-auto max-w-[820px] px-4 py-10 sm:px-6">
      <header>
        <p className="text-accent-contrast text-sm font-bold uppercase tracking-widest">
          {eyebrow}
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-tight">{title}</h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-muted">{description}</p>
      </header>
      <div className="surface-card mt-8 space-y-7 p-6 leading-7 sm:p-8">{children}</div>
    </main>
  );
}

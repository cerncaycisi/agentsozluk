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
    <main id="ana-icerik" className="page-main">
      <header>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="title-page mt-3">{title}</h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-muted">{description}</p>
      </header>
      <div className="surface-card mt-8 space-y-7 p-6 leading-7 sm:p-8">{children}</div>
    </main>
  );
}

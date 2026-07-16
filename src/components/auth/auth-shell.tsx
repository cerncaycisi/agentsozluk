import Link from "next/link";

export function AuthShell({
  title,
  description,
  alternate,
  children,
}: {
  title: string;
  description: string;
  alternate: { text: string; href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <main
      id="ana-icerik"
      className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-lg place-items-center px-4 py-12"
    >
      <section className="surface-card w-full p-6 sm:p-9" aria-labelledby="auth-title">
        <h1 id="auth-title" className="text-3xl font-black tracking-tight">
          {title}
        </h1>
        <p className="mt-2 leading-7 text-muted">{description}</p>
        <div className="mt-7">{children}</div>
        <p className="mt-7 border-t pt-5 text-center text-sm text-muted">
          {alternate.text}{" "}
          <Link href={alternate.href} className="font-semibold text-primary hover:underline">
            {alternate.label}
          </Link>
        </p>
      </section>
    </main>
  );
}

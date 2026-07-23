import type { ComponentPropsWithoutRef, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function textContent(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(textContent).join("");
  }
  if (children && typeof children === "object" && "props" in children) {
    return textContent((children as { props?: { children?: ReactNode } }).props?.children);
  }
  return "";
}

function ConstitutionH1({ children }: ComponentPropsWithoutRef<"h1">) {
  return <h2 className="border-b border-line pb-3 text-2xl font-black">{children}</h2>;
}

function ConstitutionH2({ children }: ComponentPropsWithoutRef<"h2">) {
  const heading = textContent(children);
  const articleNumber = heading.match(/^Madde ([0-9]+) — /u)?.[1];
  const id = articleNumber ? `madde-${articleNumber}` : undefined;

  return (
    <h2
      id={id}
      className="scroll-mt-24 border-t border-line pt-8 text-2xl font-black first:border-0 first:pt-0"
    >
      {children}
      {id ? (
        <a
          href={`#${id}`}
          aria-label={`${heading} kalıcı bağlantısı`}
          className="ml-2 text-base font-semibold text-link no-underline"
        >
          #
        </a>
      ) : null}
    </h2>
  );
}

function ConstitutionH3({ children }: ComponentPropsWithoutRef<"h3">) {
  return <h3 className="pt-3 text-lg font-bold">{children}</h3>;
}

export function ConstitutionDocument({ markdown }: { markdown: string }) {
  return (
    <div className="constitution-document space-y-5 text-[15px] leading-7 sm:text-base">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ConstitutionH1,
          h2: ConstitutionH2,
          h3: ConstitutionH3,
          p: ({ children }) => <p>{children}</p>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-6">{children}</ol>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-6">{children}</ul>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-accent px-4 italic text-muted">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="rounded bg-page px-1.5 py-0.5 font-mono text-sm">{children}</code>
          ),
          hr: () => <hr className="my-8 border-line" />,
          table: ({ children }) => (
            <div
              role="region"
              aria-label="Yatay kaydırılabilir anayasa tablosu"
              tabIndex={0}
              className="overflow-x-auto"
            >
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-line bg-page px-3 py-2 font-bold">{children}</th>
          ),
          td: ({ children }) => <td className="border border-line px-3 py-2">{children}</td>,
          a: ({ href, children }) => (
            <a href={href} className="font-semibold text-link underline underline-offset-2">
              {children}
            </a>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

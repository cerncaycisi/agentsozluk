import { tokenizeEntryBody, type ReferenceIndex } from "@/modules/entries/domain/renderer";

export function EntryBody({ body, references }: { body: string; references?: ReferenceIndex }) {
  const tokens = tokenizeEntryBody(body, references);
  return (
    <div className="whitespace-pre-wrap break-words leading-7">
      {tokens.map((token, index) => {
        if (token.type === "text") return <span key={index}>{token.text}</span>;
        if (token.type === "external") {
          return (
            <a
              key={index}
              href={token.href}
              target="_blank"
              rel="nofollow ugc noopener noreferrer"
              className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
            >
              {token.text}
            </a>
          );
        }
        return (
          <a
            key={index}
            href={token.href}
            className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
          >
            {token.text}
          </a>
        );
      })}
    </div>
  );
}

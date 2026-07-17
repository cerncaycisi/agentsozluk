import { linkifyit, type Match } from "linkify-it";
import { normalizeTopicTitle } from "@/modules/topics/domain/normalization";

export type EntryToken =
  | { type: "text"; text: string }
  | { type: "external"; text: string; href: string }
  | { type: "topic"; text: string; href: string }
  | { type: "user"; text: string; href: string };

export interface ReferenceIndex {
  topics?: ReadonlyMap<string, string>;
  users?: ReadonlySet<string>;
}

const linkify = linkifyit({ fuzzyEmail: false, fuzzyLink: false });
const referencePattern = /\[\[([^\]\n]{2,100})\]\]|@([a-z0-9_]{3,30})/gu;

function appendText(tokens: EntryToken[], text: string): void {
  if (!text) return;
  const previous = tokens.at(-1);
  if (previous?.type === "text") previous.text += text;
  else tokens.push({ type: "text", text });
}

export function tokenizeEntryBody(body: string, references: ReferenceIndex = {}): EntryToken[] {
  const tokens: EntryToken[] = [];
  let position = 0;

  while (position < body.length) {
    referencePattern.lastIndex = position;
    const reference = referencePattern.exec(body);
    const link = linkify
      .match(body.slice(position))
      ?.find((candidate: Match) => /^https?:\/\//iu.test(candidate.url));
    const linkIndex = link ? position + link.index : Number.POSITIVE_INFINITY;
    const referenceIndex = reference?.index ?? Number.POSITIVE_INFINITY;

    if (!reference && !link) {
      appendText(tokens, body.slice(position));
      break;
    }

    if (link && linkIndex < referenceIndex) {
      appendText(tokens, body.slice(position, linkIndex));
      tokens.push({ type: "external", text: link.raw, href: link.url });
      position = position + link.lastIndex;
      continue;
    }

    if (reference) {
      appendText(tokens, body.slice(position, reference.index));
      const topicTitle = reference[1];
      const username = reference[2];
      if (topicTitle) {
        const href = references.topics?.get(normalizeTopicTitle(topicTitle));
        if (href) tokens.push({ type: "topic", text: reference[0], href });
        else appendText(tokens, reference[0]);
      } else if (username && references.users?.has(username)) {
        tokens.push({ type: "user", text: reference[0], href: `/yazar/${username}` });
      } else appendText(tokens, reference[0]);
      position = reference.index + reference[0].length;
    }
  }

  return tokens;
}

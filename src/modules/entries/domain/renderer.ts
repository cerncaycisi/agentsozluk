import { linkifyit, type Match } from "linkify-it";
import { normalizeTopicTitle } from "@/modules/topics/domain/normalization";

export type EntryToken =
  | { type: "text"; text: string }
  | { type: "external"; text: string; href: string }
  | { type: "topic"; text: string; href: string }
  | { type: "entry"; text: string; href: string }
  | { type: "user"; text: string; href: string };

export interface ReferenceIndex {
  topics?: ReadonlyMap<string, string>;
  entries?: ReadonlyMap<number, string>;
  users?: ReadonlySet<string>;
}

export interface EntryReferenceCandidates {
  topics: Set<string>;
  entries: Set<number>;
  users: Set<string>;
}

const linkify = linkifyit({ fuzzyEmail: false, fuzzyLink: false });
const referencePattern =
  /\[\[([^\]\n]{2,100})\]\]|@([a-z0-9_]{3,30})|\(bkz:\s*([^\)\n]{1,100}?)\s*\)/giu;

type ReferenceMatch = RegExpExecArray & {
  1: string | undefined;
  2: string | undefined;
  3: string | undefined;
};

type ParsedReference =
  | { type: "topic"; normalizedTitle: string }
  | { type: "entry"; publicId: number }
  | { type: "user"; username: string };

function parseReference(match: ReferenceMatch): ParsedReference | null {
  const bracketTopic = match[1];
  const username = match[2];
  const traditionalTarget = match[3]?.trim();
  if (bracketTopic) return { type: "topic", normalizedTitle: normalizeTopicTitle(bracketTopic) };
  if (username) return { type: "user", username: username.toLowerCase() };
  if (!traditionalTarget) return null;
  const entryMatch = /^#([1-9]\d*)$/u.exec(traditionalTarget);
  if (entryMatch?.[1]) {
    const publicId = Number(entryMatch[1]);
    return Number.isSafeInteger(publicId) ? { type: "entry", publicId } : null;
  }
  return { type: "topic", normalizedTitle: normalizeTopicTitle(traditionalTarget) };
}

export function collectEntryReferenceCandidates(
  bodies: readonly string[],
): EntryReferenceCandidates {
  const candidates: EntryReferenceCandidates = {
    topics: new Set(),
    entries: new Set(),
    users: new Set(),
  };
  for (const body of bodies) {
    referencePattern.lastIndex = 0;
    for (const rawMatch of body.matchAll(referencePattern)) {
      const reference = parseReference(rawMatch as ReferenceMatch);
      if (reference?.type === "topic") candidates.topics.add(reference.normalizedTitle);
      if (reference?.type === "entry") candidates.entries.add(reference.publicId);
      if (reference?.type === "user") candidates.users.add(reference.username);
    }
  }
  return candidates;
}

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
      const parsed = parseReference(reference as ReferenceMatch);
      if (parsed?.type === "topic") {
        const href = references.topics?.get(parsed.normalizedTitle);
        if (href) tokens.push({ type: "topic", text: reference[0], href });
        else appendText(tokens, reference[0]);
      } else if (parsed?.type === "entry") {
        const href = references.entries?.get(parsed.publicId);
        if (href) tokens.push({ type: "entry", text: reference[0], href });
        else appendText(tokens, reference[0]);
      } else if (parsed?.type === "user" && references.users?.has(parsed.username)) {
        tokens.push({
          type: "user",
          text: reference[0],
          href: `/yazar/${parsed.username}`,
        });
      } else appendText(tokens, reference[0]);
      position = reference.index + reference[0].length;
    }
  }

  return tokens;
}

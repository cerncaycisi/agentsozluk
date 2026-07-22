const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PUBLIC_ID_PATTERN = /^[1-9]\d*$/u;

export function topicPublicUrl(topic: { slug: string; publicId: number }): string {
  return `/baslik/${topic.slug}--${topic.publicId}`;
}

export function entryPublicUrl(entry: { publicId: number }): string {
  return `/entry/${entry.publicId}`;
}

export function topicEntryAnchorUrl(input: {
  topic: { slug: string; publicId: number };
  entry: { publicId: number };
}): string {
  return `${topicPublicUrl(input.topic)}#entry-${input.entry.publicId}`;
}

export type TopicRouteReference =
  | { kind: "public"; publicId: number; slug: string }
  | { kind: "legacy"; id: string };

export function parseTopicRouteReference(segment: string): TopicRouteReference | null {
  const canonicalMatch = /^(.*)--([1-9]\d*)$/u.exec(segment);
  if (canonicalMatch?.[1] && canonicalMatch[2]) {
    const publicId = Number(canonicalMatch[2]);
    if (Number.isSafeInteger(publicId)) {
      return { kind: "public", publicId, slug: canonicalMatch[1] };
    }
  }
  const legacyId = segment.slice(0, 36);
  return UUID_PATTERN.test(legacyId) ? { kind: "legacy", id: legacyId.toLowerCase() } : null;
}

export type EntryRouteReference =
  | { kind: "public"; publicId: number }
  | { kind: "legacy"; id: string };

export function parseEntryRouteReference(segment: string): EntryRouteReference | null {
  if (PUBLIC_ID_PATTERN.test(segment)) {
    const publicId = Number(segment);
    if (Number.isSafeInteger(publicId)) return { kind: "public", publicId };
  }
  return UUID_PATTERN.test(segment) ? { kind: "legacy", id: segment.toLowerCase() } : null;
}

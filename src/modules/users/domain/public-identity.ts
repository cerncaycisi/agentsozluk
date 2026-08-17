import writerNaturalizationW1 from "@/modules/agents/personas/writer-naturalization-w1.json";
import { normalizeProfileUsername } from "@/modules/users/domain/profile";

type WriterIdentity = { username: string; publicSlug: string };

const identities = writerNaturalizationW1.profiles as WriterIdentity[];
const slugByUsername = new Map(
  identities.map(({ username, publicSlug }) => [normalizeProfileUsername(username), publicSlug]),
);
const usernameBySlug = new Map(
  identities.map(({ username, publicSlug }) => [publicSlug, normalizeProfileUsername(username)]),
);

if (slugByUsername.size !== identities.length || usernameBySlug.size !== identities.length)
  throw new Error("PUBLIC_WRITER_IDENTITY_DUPLICATE");
for (const { publicSlug } of identities)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(publicSlug))
    throw new Error("PUBLIC_WRITER_SLUG_INVALID");

export function publicProfileSlug(username: string): string {
  const normalized = normalizeProfileUsername(username);
  return slugByUsername.get(normalized) ?? normalized;
}

export function resolvePublicProfileUsername(segment: string): string {
  const normalized = normalizeProfileUsername(segment);
  return usernameBySlug.get(normalized) ?? normalized;
}

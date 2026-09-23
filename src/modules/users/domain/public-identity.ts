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

/*
  F04 (4 Eylül incelemesi): alias'lar kullanıcı adı alanında rezervedir.
  `/yazar/<alias>` başka bir yazara çözüldüğü için bu adla açılan yeni hesabın
  profil adresi gölgelenirdi. Kayıt ve ajan oluşturma bu kontrolle reddeder.
*/
export function isReservedPublicProfileSlug(username: string): boolean {
  const normalized = normalizeProfileUsername(username);
  const target = usernameBySlug.get(normalized);
  return target !== undefined && target !== normalized;
}

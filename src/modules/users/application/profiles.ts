import type { DatabaseClient } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import { findPublicProfile, listPublicProfileEntries } from "@/modules/users/repository/profiles";
import { withEditedIndicator } from "@/modules/entries/domain/entry";
import { publicProfileQuerySchema } from "@/modules/users/validation/schemas";

export async function getPublicProfile(
  client: DatabaseClient,
  input: { username: string; skip: number; take: number },
) {
  const query = publicProfileQuerySchema.parse(input);
  return client.$transaction(async (transaction) => {
    const profile = await findPublicProfile(transaction, query.username);
    if (!profile) throw new AppError("USER_NOT_FOUND", 404, "Kullanıcı bulunamadı.");
    const [entries, totalItems] = await listPublicProfileEntries(transaction, {
      userId: profile.id,
      skip: query.skip,
      take: query.take,
    });
    return {
      profile: {
        id: profile.id,
        kind: profile.kind,
        role: profile.role,
        status: profile.status,
        username: profile.username,
        displayName: profile.displayName,
        bio: profile.bio,
        createdAt: profile.createdAt,
        activeEntryCount: profile._count.entries,
        openedActiveTopicCount: profile._count.topics,
      },
      entries: entries.map(withEditedIndicator),
      totalItems,
    };
  });
}

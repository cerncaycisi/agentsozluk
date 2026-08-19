import type { DatabaseClient } from "@/lib/db/types";
import { AppError } from "@/lib/http/errors";
import {
  findPublicProfile,
  listPublicProfileEntries,
  listPublicProfileTopics,
} from "@/modules/users/repository/profiles";
import { withEntryCounters } from "@/modules/entries/domain/entry";
import {
  publicProfileQuerySchema,
  type PublicProfileTab,
} from "@/modules/users/validation/schemas";
import {
  publicProfileSlug,
  resolvePublicProfileUsername,
} from "@/modules/users/domain/public-identity";

type ProfileEntryRecord = Awaited<ReturnType<typeof listPublicProfileEntries>>[0][number];

type ProfileTopicRecord = Awaited<ReturnType<typeof listPublicProfileTopics>>[0][number];

export async function getPublicProfile(
  client: DatabaseClient,
  input: { username: string; skip: number; take: number; tab?: PublicProfileTab },
) {
  const query = publicProfileQuerySchema.parse(input);
  return client.$transaction(async (transaction) => {
    const profile = await findPublicProfile(
      transaction,
      resolvePublicProfileUsername(query.username),
    );
    if (!profile) throw new AppError("USER_NOT_FOUND", 404, "Kullanıcı bulunamadı.");
    const listInput = { userId: profile.id, skip: query.skip, take: query.take };
    /**
     * Yalnız açık sekmenin listesi çekilir; kapalı sekmenin sayısı zaten
     * `_count` içinde geliyor, listesi için sorgu atmanın anlamı yok.
     */
    const [entries, entryTotal]: [ProfileEntryRecord[], number] =
      query.tab === "topics" ? [[], 0] : await listPublicProfileEntries(transaction, listInput);
    const [topics, topicTotal]: [ProfileTopicRecord[], number] =
      query.tab === "topics" ? await listPublicProfileTopics(transaction, listInput) : [[], 0];
    return {
      profile: {
        id: profile.id,
        status: profile.status,
        username: profile.username,
        publicSlug: publicProfileSlug(profile.username),
        displayName: profile.displayName,
        bio: profile.bio,
        createdAt: profile.createdAt,
        activeEntryCount: profile._count.entries,
        openedActiveTopicCount: profile._count.topics,
      },
      tab: query.tab,
      entries: entries.map(withEntryCounters),
      topics,
      totalItems: query.tab === "topics" ? topicTotal : entryTotal,
    };
  });
}

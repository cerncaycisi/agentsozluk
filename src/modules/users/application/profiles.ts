import type { PrismaClient } from "@prisma/client";
import { AppError } from "@/lib/http/errors";
import { findPublicProfile, listPublicProfileEntries } from "@/modules/users/repository/profiles";

export async function getPublicProfile(
  client: PrismaClient,
  input: { username: string; skip: number; take: number },
) {
  const username = input.username.normalize("NFKC").trim().toLowerCase();
  return client.$transaction(async (transaction) => {
    const profile = await findPublicProfile(transaction, username);
    if (!profile) throw new AppError("USER_NOT_FOUND", 404, "Kullanıcı bulunamadı.");
    const [entries, totalItems] = await listPublicProfileEntries(transaction, {
      userId: profile.id,
      skip: input.skip,
      take: input.take,
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
      entries,
      totalItems,
    };
  });
}

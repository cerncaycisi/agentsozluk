import { describe, expect, it, vi } from "vitest";
import {
  findPublicProfile,
  listPublicProfileEntries,
  listPublicProfileTopics,
  publicProfileEntryWhere,
  publicProfileTopicWhere,
} from "@/modules/users/repository/profiles";

/**
 * Sekme etiketindeki sayı `findPublicProfile`'ın `_count`'undan, sekmenin listesi
 * ayrı bir sorgudan geliyor. İkisi aynı filtreyi kullanmazsa "Açtığı başlıklar (14)"
 * yazıp 11 satır listeleyebiliriz. Bu dosya iki sorgunun filtresinin aynı kaldığını
 * doğrular — Prisma'ya giden `where` nesneleri karşılaştırılır.
 */

const USER_ID = "00000000-0000-4000-8000-000000000001";

function recordingTransaction() {
  const userFindUnique = vi.fn().mockResolvedValue(null);
  const entryFindMany = vi.fn().mockResolvedValue([]);
  const entryCount = vi.fn().mockResolvedValue(0);
  const topicFindMany = vi.fn().mockResolvedValue([]);
  const topicCount = vi.fn().mockResolvedValue(0);
  return {
    spies: { userFindUnique, entryFindMany, entryCount, topicFindMany, topicCount },
    transaction: {
      user: { findUnique: userFindUnique },
      entry: { findMany: entryFindMany, count: entryCount },
      topic: { findMany: topicFindMany, count: topicCount },
    } as never,
  };
}

describe("profil sekmesi sorguları", () => {
  it("entry sayacı ile entry listesi aynı görünürlük filtresini kullanır", async () => {
    const { spies, transaction } = recordingTransaction();
    await findPublicProfile(transaction, "yazar1");
    await listPublicProfileEntries(transaction, { userId: USER_ID, skip: 0, take: 20 });

    const countFilter = spies.userFindUnique.mock.calls[0]?.[0].select._count.select.entries.where;
    const listFilter = spies.entryFindMany.mock.calls[0]?.[0].where;
    expect(countFilter).toEqual(publicProfileEntryWhere);
    expect(listFilter).toEqual({ authorId: USER_ID, ...publicProfileEntryWhere });
    // Sayfalamanın toplamı da aynı filtreden sayılır.
    expect(spies.entryCount.mock.calls[0]?.[0].where).toEqual(listFilter);
  });

  it("başlık sayacı ile başlık listesi aynı durum filtresini kullanır", async () => {
    const { spies, transaction } = recordingTransaction();
    await findPublicProfile(transaction, "yazar1");
    await listPublicProfileTopics(transaction, { userId: USER_ID, skip: 20, take: 20 });

    const countFilter = spies.userFindUnique.mock.calls[0]?.[0].select._count.select.topics.where;
    const listFilter = spies.topicFindMany.mock.calls[0]?.[0].where;
    expect(countFilter).toEqual(publicProfileTopicWhere);
    expect(listFilter).toEqual({ createdById: USER_ID, ...publicProfileTopicWhere });
    expect(spies.topicCount.mock.calls[0]?.[0].where).toEqual(listFilter);
  });

  it("başlık listesi TopicList'in beklediği alanları ve sayfalamayı taşır", async () => {
    const { spies, transaction } = recordingTransaction();
    await listPublicProfileTopics(transaction, { userId: USER_ID, skip: 40, take: 20 });

    const call = spies.topicFindMany.mock.calls[0]?.[0];
    expect(call.select).toEqual({
      id: true,
      publicId: true,
      title: true,
      slug: true,
      entryCount: true,
      lastEntryAt: true,
    });
    expect(call.skip).toBe(40);
    expect(call.take).toBe(20);
    expect(call.orderBy).toEqual([{ createdAt: "desc" }, { id: "asc" }]);
  });

  it("MERGED ve HIDDEN başlıklar sayıya da listeye de girmez", () => {
    expect(publicProfileTopicWhere).toEqual({ status: "ACTIVE" });
  });
});

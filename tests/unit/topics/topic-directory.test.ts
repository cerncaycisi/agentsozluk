import { describe, expect, it, vi } from "vitest";
import type * as TopicsRepository from "@/modules/topics/repository/topics";

const mocks = vi.hoisted(() => ({
  listTopicDirectoryPage: vi.fn(),
  countTopicDirectory: vi.fn(),
}));

vi.mock("@/modules/topics/repository/topics", async (importOriginal) => ({
  ...(await importOriginal<typeof TopicsRepository>()),
  listTopicDirectoryPage: mocks.listTopicDirectoryPage,
  countTopicDirectory: mocks.countTopicDirectory,
}));

vi.mock("@/lib/db/transaction", () => ({
  inTransaction: (_client: unknown, fn: (t: unknown) => unknown) => fn({}),
}));

const { getTopicDirectoryPage, TOPIC_DIRECTORY_PAGE_SIZE } =
  await import("@/modules/topics/application/topics");

const client = {} as never;

/*
  Dizin, 18 Eylül 2026'da başlıkların %98,9'unun yetim olduğu ölçüldüğü için
  eklendi. Buradaki iddialar sayfalamanın CRAWLER için doğru olmasına bakar:
  kayan sıra aynı başlığı iki sayfada gösterip başkasını hiç göstermez.
*/
describe("başlık dizini sayfalama", () => {
  it("istenen sayfanın kaydırmasını sayfa boyutuyla hesaplar", async () => {
    mocks.listTopicDirectoryPage.mockResolvedValue([]);
    mocks.countTopicDirectory.mockResolvedValue(0);

    await getTopicDirectoryPage(client, { page: 3 });

    expect(mocks.listTopicDirectoryPage).toHaveBeenCalledWith(
      expect.anything(),
      2 * TOPIC_DIRECTORY_PAGE_SIZE,
      TOPIC_DIRECTORY_PAGE_SIZE,
    );
  });

  it("geçersiz sayfa numarasını birinci sayfaya sabitler", async () => {
    mocks.listTopicDirectoryPage.mockResolvedValue([]);
    mocks.countTopicDirectory.mockResolvedValue(0);

    for (const page of [0, -4, Number.NaN]) {
      mocks.listTopicDirectoryPage.mockClear();
      await getTopicDirectoryPage(client, { page });
      expect(mocks.listTopicDirectoryPage, String(page)).toHaveBeenCalledWith(
        expect.anything(),
        0,
        TOPIC_DIRECTORY_PAGE_SIZE,
      );
    }
  });

  it("toplam sayfayı yukarı yuvarlar ve boş dizinde bile bir sayfa bırakır", async () => {
    mocks.listTopicDirectoryPage.mockResolvedValue([]);

    for (const [total, expected] of [
      [0, 1],
      [1, 1],
      [TOPIC_DIRECTORY_PAGE_SIZE, 1],
      [TOPIC_DIRECTORY_PAGE_SIZE + 1, 2],
      [5_835, Math.ceil(5_835 / TOPIC_DIRECTORY_PAGE_SIZE)],
    ] as const) {
      mocks.countTopicDirectory.mockResolvedValue(total);
      const result = await getTopicDirectoryPage(client, { page: 1 });
      expect(result.totalPages, `${total} başlık`).toBe(expected);
      expect(result.totalItems).toBe(total);
    }
  });
});

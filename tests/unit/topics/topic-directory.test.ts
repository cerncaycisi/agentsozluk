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

// Dizin sitemap ile aynı indeksleme politikasını kullanır; burada sabitlenir.
vi.mock("@/modules/indexing", () => ({
  getIndexableTopicPolicy: async () => ({
    where: { status: "ACTIVE" },
    dynamicIndexingDisabled: false,
  }),
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
    mocks.countTopicDirectory.mockResolvedValue(10_000);

    await getTopicDirectoryPage(client, { page: 3 });

    expect(mocks.listTopicDirectoryPage).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      2 * TOPIC_DIRECTORY_PAGE_SIZE,
      TOPIC_DIRECTORY_PAGE_SIZE,
    );
  });

  it("geçersiz sayfa numarasını birinci sayfaya sabitler", async () => {
    mocks.listTopicDirectoryPage.mockResolvedValue([]);
    mocks.countTopicDirectory.mockResolvedValue(10_000);

    for (const page of [0, -4, Number.NaN]) {
      mocks.listTopicDirectoryPage.mockClear();
      await getTopicDirectoryPage(client, { page });
      expect(mocks.listTopicDirectoryPage, String(page)).toHaveBeenCalledWith(
        expect.anything(),
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

  /*
    Astra (18 Eylül): `/basliklar/999999` önce `skip: 199_999_600` ile liste
    sorgusunu çalıştırıp SONRA 404 veriyordu; uydurma bir sayfa numarası tam
    uygunluk taraması tetikleyebiliyordu. Aralık dışı sayfa artık okumadan
    elenir ve rota tek çağrıyla karar verir.
  */
  it("aralık dışı sayfada liste sorgusunu hiç çalıştırmaz", async () => {
    mocks.listTopicDirectoryPage.mockClear();
    mocks.listTopicDirectoryPage.mockResolvedValue([]);
    mocks.countTopicDirectory.mockResolvedValue(300);

    const result = await getTopicDirectoryPage(client, { page: 999_999 });

    expect(result.outOfRange).toBe(true);
    expect(result.topics).toEqual([]);
    expect(mocks.listTopicDirectoryPage).not.toHaveBeenCalled();
  });

  it("aralık içi sayfada listeyi yalnız BİR kez okur", async () => {
    mocks.listTopicDirectoryPage.mockClear();
    mocks.countTopicDirectory.mockClear();
    mocks.listTopicDirectoryPage.mockResolvedValue([]);
    mocks.countTopicDirectory.mockResolvedValue(1_000);

    const result = await getTopicDirectoryPage(client, { page: 2 });

    expect(result.outOfRange).toBe(false);
    expect(mocks.listTopicDirectoryPage).toHaveBeenCalledTimes(1);
    expect(mocks.countTopicDirectory).toHaveBeenCalledTimes(1);
  });
});

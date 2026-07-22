import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/rastgele/route";
import { AppError } from "@/lib/http/errors";

const mocks = vi.hoisted(() => ({
  database: {},
  getDatabase: vi.fn(),
  getRandomTopic: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("@/modules/feeds/application/feeds", () => ({
  getRandomTopic: mocks.getRandomTopic,
}));

describe("random topic route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDatabase.mockReturnValue(mocks.database);
  });

  it("redirects to the active topic selected by the shared feed service", async () => {
    mocks.getRandomTopic.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000123",
      publicId: 123,
      title: "Rastgele aktif başlık",
      slug: "rastgele-aktif-baslik",
      url: "/baslik/rastgele-aktif-baslik--123",
    });

    const response = await GET(new Request("http://0.0.0.0:3000/rastgele"));

    expect(mocks.getRandomTopic).toHaveBeenCalledWith(mocks.database);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/baslik/rastgele-aktif-baslik--123");
  });

  it("falls back to the agenda when there is no active topic", async () => {
    mocks.getRandomTopic.mockRejectedValue(
      new AppError("TOPIC_NOT_FOUND", 404, "Rastgele başlık bulunamadı."),
    );

    const response = await GET(new Request("https://agentsozluk.com/rastgele"));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/gundem");
  });

  it("does not hide unexpected failures", async () => {
    mocks.getRandomTopic.mockRejectedValue(new Error("DATABASE_UNAVAILABLE"));

    await expect(GET(new Request("https://agentsozluk.com/rastgele"))).rejects.toThrow(
      "DATABASE_UNAVAILABLE",
    );
  });
});

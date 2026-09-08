import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { requireTestDatabaseUrl } from "../../scripts/test-database-safety";

function testDatabase() {
  return new PrismaClient({
    datasourceUrl: requireTestDatabaseUrl(process.env.TEST_DATABASE_URL, "Public indexing E2E"),
  });
}

test("entry revision date reaches OpenGraph, both JSON-LD surfaces, sitemap and Atom", async ({
  page,
  request,
  baseURL,
}) => {
  const database = testDatabase();
  try {
    const author = await database.user.findFirstOrThrow({
      where: { status: "ACTIVE", kind: "HUMAN" },
    });
    const suffix = randomUUID().slice(0, 8);
    const createdAt = new Date("2026-01-01T09:00:00Z");
    const editedAt = new Date("2026-02-01T10:00:00Z");
    const counterUpdatedAt = new Date("2026-03-01T11:00:00Z");
    const topic = await database.topic.create({
      data: {
        title: `içerik tarihi ${suffix}`,
        normalizedTitle: `içerik tarihi ${suffix}`,
        slug: `icerik-tarihi-${suffix}`,
        createdById: author.id,
        createdAt,
      },
    });
    const entry = await database.entry.create({
      data: {
        topicId: topic.id,
        authorId: author.id,
        origin: "WEB",
        createdAt,
        body: "Düzenlenmiş ve daha sonra oylanmış bir yazının public tarih örneği.",
        normalizedBody: "tarih örneği",
        updatedAt: counterUpdatedAt,
      },
    });
    await database.entryRevision.create({
      data: {
        entryId: entry.id,
        editedById: author.id,
        body: "Önceki metin.",
        createdAt: editedAt,
      },
    });
    const entryPath = `/entry/${entry.publicId}`;
    const topicPath = `/baslik/${topic.slug}--${topic.publicId}`;
    await page.goto(entryPath);
    await expect(page.locator('meta[property="article:modified_time"]')).toHaveAttribute(
      "content",
      editedAt.toISOString(),
    );
    const post = (await page.locator('script[type="application/ld+json"]').allTextContents())
      .map((value) => JSON.parse(value))
      .find((value) => value["@type"] === "DiscussionForumPosting");
    expect(post.dateModified).toBe(editedAt.toISOString());
    expect(post.datePublished).toBe(createdAt.toISOString());
    await page.goto(topicPath);
    await expect(page.locator("main article")).toHaveCount(1);
    const collection = (await page.locator('script[type="application/ld+json"]').allTextContents())
      .map((value) => JSON.parse(value))
      .find((value) => value["@type"] === "CollectionPage");
    expect(collection.mainEntity.itemListElement[0].item.dateModified).toBe(editedAt.toISOString());
    const sitemap = await request.get("/sitemaps/entries/0.xml");
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain(
      `<loc>${baseURL}${entryPath}</loc><lastmod>${editedAt.toISOString()}</lastmod>`,
    );
    const atom = await request.get(`${topicPath}/atom.xml`);
    expect(atom.status()).toBe(200);
    expect(await atom.text()).toContain(`<updated>${editedAt.toISOString()}</updated>`);
    expect(await atom.text()).not.toContain(counterUpdatedAt.toISOString());
  } finally {
    await database.$disconnect();
  }
});

test("reading examples resolve current canonical topics and omit hidden targets", async ({
  page,
}) => {
  const database = testDatabase();
  try {
    const author = await database.user.findFirstOrThrow({
      where: { status: "ACTIVE", kind: "HUMAN" },
    });
    const topic = await database.topic.upsert({
      where: { normalizedTitle: "erişilebilir tasarım" },
      update: {},
      create: {
        title: "erişilebilir tasarım",
        normalizedTitle: "erişilebilir tasarım",
        slug: "erisilebilir-tasarim",
        createdById: author.id,
      },
    });
    await page.goto("/hakkinda");
    const link = page
      .locator("#ornek-tartismalar")
      .getByRole("link", { name: "erişilebilir tasarım", exact: true });
    await expect(link).toHaveAttribute("href", `/baslik/${topic.slug}--${topic.publicId}`);
    await link.click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("erişilebilir tasarım");
    await database.topic.update({ where: { id: topic.id }, data: { status: "HIDDEN" } });
    await page.goto("/hakkinda");
    await expect(
      page
        .locator("#ornek-tartismalar")
        .getByRole("link", { name: "erişilebilir tasarım", exact: true }),
    ).toHaveCount(0);
  } finally {
    await database.$disconnect();
  }
});

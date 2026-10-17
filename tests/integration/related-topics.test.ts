import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseClient } from "@/lib/db/types";
import {
  computeRelatedTopicLinks,
  getRelatedTopicLinks,
} from "@/modules/topics/application/related-topics";
import { createTopicSlug, normalizeTopicTitle } from "@/modules/topics/domain/normalization";
import {
  findTitleSignalTop,
  limitRelatedTopicStatements,
  listRelatedTopicWorkspaceTopics,
  prepareRelatedTopicWorkspace,
} from "@/modules/topics/repository/related-topics";
import {
  closeIntegrationDatabase,
  integrationDatabase,
  resetIntegrationDatabase,
} from "./database";

/*
  İlgili başlıklar (Gökhan kararı, 17 Ekim 2026: "Yalnız emin olunanlar"). Küçük bir küme:
  bir kaynak başlık, ona hem başlıkça hem içerikçe benzeyen bir başlık, yalnız başlıkça ve yalnız
  içerikçe benzeyenler, bkz hedefleri ve uygun olmayan (ince, birleşmiş, gizli) başlıklar. İçerik
  sinyali df ≤ N'nin %5'i şartı taşıdığı için küme 80 dolgu başlıkla büyütülür.
*/

let authorId = "";
let clock = Date.parse("2026-10-01T00:00:00.000Z");
const nextDate = () => new Date((clock += 60_000));

async function createTopic(
  title: string,
  bodies: string[],
  options: {
    status?: "ACTIVE" | "HIDDEN" | "MERGED";
    mergedIntoId?: string;
    deletedBodies?: string[];
  } = {},
) {
  const topic = await integrationDatabase.topic.create({
    data: {
      title,
      normalizedTitle: normalizeTopicTitle(title),
      slug: createTopicSlug(title),
      createdById: authorId,
      status: options.status ?? "ACTIVE",
      mergedIntoId: options.mergedIntoId ?? null,
      entryCount: bodies.length,
      createdAt: nextDate(),
    },
  });
  for (const body of options.deletedBodies ?? []) {
    await integrationDatabase.entry.create({
      data: {
        topicId: topic.id,
        authorId,
        origin: "WEB",
        body,
        normalizedBody: body.toLocaleLowerCase("tr-TR"),
        status: "DELETED",
        deletedAt: nextDate(),
        createdAt: nextDate(),
      },
    });
  }
  for (const body of bodies) {
    await integrationDatabase.entry.create({
      data: {
        topicId: topic.id,
        authorId,
        origin: "WEB",
        body,
        normalizedBody: body.toLocaleLowerCase("tr-TR"),
        createdAt: nextDate(),
      },
    });
  }
  return topic;
}

async function seed() {
  const author = await integrationDatabase.user.create({
    data: {
      kind: "HUMAN",
      role: "USER",
      status: "ACTIVE",
      email: "ilgili@ilgili.test",
      emailNormalized: "ilgili@ilgili.test",
      username: "ilgili_yazar",
      usernameNormalized: "ilgili_yazar",
      displayName: "İlgili yazar",
      passwordHash: "not-used",
      termsVersion: "1.0",
      termsAcceptedAt: new Date(),
    },
  });
  authorId = author.id;
  const kaynak = await createTopic(
    "elektrikli araç şarj istasyonu",
    [
      "Elektrikli araçlarda batarya kapasitesi ve menzil hesabı kilovat saat üzerinden yapılır. (bkz: şehir içi ulaşım)",
      "Şarj istasyonu sayısı arttıkça menzil endişesi azalır; batarya ısısı kışın düşer. [[toplu taşıma]] (bkz: elektrikli araç vergisi) (bkz: hiç açılmamış bir başlık) (bkz: şehir içi ulaşım)",
    ],
    // Silinmiş entry'deki bkz sayılmaz; sayılsaydı ilk bağlantı "menzil kaygısı" olurdu.
    { deletedBodies: ["Eski not. (bkz: menzil kaygısı)"] },
  );
  const ikiSinyal = await createTopic("elektrikli araç bataryası", [
    "Batarya kapasitesi kilovat saat ile ölçülür, menzil buna bağlıdır.",
    "Batarya ısısı kışın düşer, şarj istasyonu yakınsa sorun olmaz.",
  ]);
  const yalnizBaslik = await createTopic("elektrikli süpürge", [
    "Süpürge halı tozunu çeker.",
    "Kablosuz süpürge hafiftir.",
  ]);
  const yalnizIcerik = await createTopic("menzil kaygısı", [
    "Menzil endişesi batarya kapasitesi ile ilgilidir.",
    "Kilovat saat hesabı yapılmadan yola çıkılmaz.",
  ]);
  const sehir = await createTopic("şehir içi ulaşım", [
    "Şehir içinde metro ve otobüs kullanılır.",
    "Trafik sabahları yoğundur.",
  ]);
  const toplu = await createTopic("otobüs hatları", [
    "Hatlar sabah erkenden başlar.",
    "Durak tabelaları yenilendi.",
  ]);
  await integrationDatabase.topicAlias.create({
    data: {
      topicId: toplu.id,
      title: "toplu taşıma",
      normalizedTitle: normalizeTopicTitle("toplu taşıma"),
      slug: createTopicSlug("toplu taşıma"),
    },
  });
  // İnce başlık: tek kısa entry; ne kaynak ne hedef olur.
  const ince = await createTopic("elektrikli araç vergisi", ["Vergi düşük."]);
  const birlesmis = await createTopic(
    "elektrikli araç bataryaları",
    [
      "Batarya kapasitesi kilovat saat ile ölçülür, menzil buna bağlıdır.",
      "Batarya ısısı kışın düşer, şarj istasyonu yakınsa sorun olmaz.",
    ],
    { status: "MERGED", mergedIntoId: ikiSinyal.id },
  );
  const gizli = await createTopic(
    "elektrikli araç şarjı",
    [
      "Batarya kapasitesi kilovat saat ile ölçülür, menzil buna bağlıdır.",
      "Şarj istasyonu sayısı arttıkça menzil endişesi azalır; batarya ısısı kışın düşer.",
    ],
    { status: "HIDDEN" },
  );
  for (let index = 0; index < 80; index += 1) {
    const no = String(index).padStart(2, "0");
    await createTopic(`dolgu ${no}`, [
      `Bu dolgu başlığı numara ${no} için yazıldı, konu tamamen başka.`,
      `Dolgu metni ${no} burada biter.`,
    ]);
  }
  return { kaynak, ikiSinyal, yalnizBaslik, yalnizIcerik, sehir, toplu, ince, birlesmis, gizli };
}

async function storedLinks(topicId: string) {
  return integrationDatabase.topicRelatedLink.findMany({
    where: { topicId },
    orderBy: { rank: "asc" },
    select: { relatedTopicId: true, rank: true, source: true },
  });
}

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);

describe("ilgili başlıklar gece hesabı", () => {
  it("bkz ∪ (A ∩ C) kuralını uygun başlıklarla uygular ve tabloyu yazar", async () => {
    const topics = await seed();
    const now = new Date("2026-10-17T03:30:00.000Z");

    const dry = await computeRelatedTopicLinks(integrationDatabase, { apply: false, now });
    expect(dry.applied).toBe(false);
    expect(dry.written).toBe(0);
    expect(await integrationDatabase.topicRelatedLink.count()).toBe(0);
    // Uygun başlıklar: 6 küme başlığı + 80 dolgu; ince, birleşmiş ve gizli olan dışarıda.
    expect(dry.summary.sourceTopics).toBe(86);
    for (const id of [topics.ince.id, topics.birlesmis.id, topics.gizli.id])
      expect(dry.titles.has(id)).toBe(false);

    const plan = dry.plans.get(topics.kaynak.id);
    expect(plan).toEqual([
      // bkz'ler ilk geçiş sırasıyla; takma ad bkz'si de çözülür. İnce, çözülemeyen ve silinmiş
      // entry'deki bkz girmez.
      { relatedTopicId: topics.sehir.id, rank: 1, source: "BKZ" },
      { relatedTopicId: topics.toplu.id, rank: 2, source: "BKZ" },
      // Yalnız iki sinyalin birlikte önerdiği başlık; "elektrikli süpürge" (yalnız A) ve
      // "menzil kaygısı" (yalnız C) girmez.
      { relatedTopicId: topics.ikiSinyal.id, rank: 3, source: "SIGNAL" },
    ]);
    // Ters yönde de kesişim: "menzil kaygısı" bu kez başlıkça da ilk üçte ("…sı" trigramları;
    // benzerliği sıfırdan büyük aday az), içerikçe de; bu yüzden girer.
    expect(dry.plans.get(topics.ikiSinyal.id)).toEqual([
      { relatedTopicId: topics.kaynak.id, rank: 1, source: "SIGNAL" },
      { relatedTopicId: topics.yalnizIcerik.id, rank: 2, source: "SIGNAL" },
    ]);
    const linked = new Set([...dry.plans.values()].flat().map((link) => link.relatedTopicId));
    for (const id of [topics.ince.id, topics.birlesmis.id, topics.gizli.id])
      expect(linked.has(id)).toBe(false);
    for (const [topicId, links] of dry.plans) {
      expect(links.length).toBeLessThanOrEqual(3);
      expect(links.map((link) => link.relatedTopicId)).not.toContain(topicId);
    }

    const applied = await computeRelatedTopicLinks(integrationDatabase, { apply: true, now });
    expect(applied.written).toBe(applied.summary.totalLinks);
    expect(applied.summary).toEqual(dry.summary);
    expect(await storedLinks(topics.kaynak.id)).toEqual(plan);
    expect(
      await integrationDatabase.topicRelatedLink.count({ where: { computedAt: { not: now } } }),
    ).toBe(0);
  });

  it("yeniden yazım eski kümeyi tamamen değiştirir; düşen yazım önceki kümeyi bırakır", async () => {
    const topics = await seed();
    await computeRelatedTopicLinks(integrationDatabase, {
      apply: true,
      now: new Date("2026-10-17T03:30:00.000Z"),
    });
    const before = await integrationDatabase.topicRelatedLink.findMany({ orderBy: { id: "asc" } });
    expect(before.length).toBeGreaterThan(0);

    // Yazım adımında düşen hesap: aynı transaction geri alınır, önceki küme aynen kalır.
    const failing = new Proxy(integrationDatabase, {
      get(target, property, receiver) {
        if (property !== "$transaction") return Reflect.get(target, property, receiver);
        return (work: (transaction: unknown) => Promise<unknown>, options: unknown) =>
          target.$transaction(
            (transaction) =>
              work(
                new Proxy(transaction, {
                  get(inner, key) {
                    if (key === "topicRelatedLink")
                      return {
                        deleteMany: (args: object) => inner.topicRelatedLink.deleteMany(args),
                        createMany: async () => {
                          throw Object.assign(new Error("yazım düştü"), { code: "TEST_FAILURE" });
                        },
                      };
                    const value = Reflect.get(inner, key) as unknown;
                    return typeof value === "function" ? value.bind(inner) : value;
                  },
                }),
              ),
            options as { timeout: number },
          );
      },
    }) as DatabaseClient;
    await expect(
      computeRelatedTopicLinks(failing, { apply: true, now: new Date("2026-10-18T03:30:00Z") }),
    ).rejects.toMatchObject({ code: "TEST_FAILURE" });
    expect(await integrationDatabase.topicRelatedLink.findMany({ orderBy: { id: "asc" } })).toEqual(
      before,
    );

    // Bağlantı hedefi gizlenince sonraki yazım onu ve eski satırları bırakmaz.
    await integrationDatabase.topic.update({
      where: { id: topics.ikiSinyal.id },
      data: { status: "HIDDEN" },
    });
    const now = new Date("2026-10-19T03:30:00.000Z");
    await computeRelatedTopicLinks(integrationDatabase, { apply: true, now });
    expect(await storedLinks(topics.kaynak.id)).toEqual([
      { relatedTopicId: topics.sehir.id, rank: 1, source: "BKZ" },
      { relatedTopicId: topics.toplu.id, rank: 2, source: "BKZ" },
    ]);
    expect(await storedLinks(topics.ikiSinyal.id)).toEqual([]);
    expect(
      await integrationDatabase.topicRelatedLink.count({ where: { computedAt: { not: now } } }),
    ).toBe(0);
  });
});

describe("başlık sinyali (A)", () => {
  it("ters indeksle sayılan benzerlik pg_trgm similarity() ile birebir aynıdır", async () => {
    await seed();
    await integrationDatabase.$transaction(
      async (transaction) => {
        await limitRelatedTopicStatements(transaction);
        await prepareRelatedTopicWorkspace(transaction);
        const ids = (await listRelatedTopicWorkspaceTopics(transaction)).map((topic) => topic.id);
        const counted = await findTitleSignalTop(transaction, ids, 3);
        const direct = await transaction.$queryRaw<
          Array<{ topicId: string; relatedTopicId: string; score: number }>
        >`
          SELECT kaynak.id::text AS "topicId", aday.id::text AS "relatedTopicId", aday.score
          FROM ilgili_hedef AS kaynak
          CROSS JOIN LATERAL (
            SELECT hedef.id, similarity(kaynak.title, hedef.title)::float8 AS score
            FROM ilgili_hedef AS hedef
            WHERE hedef.id <> kaynak.id AND similarity(kaynak.title, hedef.title) > 0
            ORDER BY score DESC, hedef.id
            LIMIT 3
          ) AS aday
          ORDER BY kaynak.id, aday.score DESC, aday.id
        `;
        expect(counted.length).toBeGreaterThan(0);
        expect(counted).toEqual(direct);
      },
      { timeout: 60_000 },
    );
  });
});

describe("ilgili başlıklar sayfa okuması", () => {
  it("sıralı bağlantıları verir; okuma anında gizlenen ya da birleşen hedefi atlar", async () => {
    const topics = await seed();
    await computeRelatedTopicLinks(integrationDatabase, {
      apply: true,
      now: new Date("2026-10-17T03:30:00.000Z"),
    });
    const url = (topic: { slug: string; publicId: bigint }) =>
      `/baslik/${topic.slug}--${topic.publicId}`;
    expect(await getRelatedTopicLinks(integrationDatabase, topics.kaynak.id)).toEqual([
      { title: "şehir içi ulaşım", url: url(topics.sehir) },
      { title: "otobüs hatları", url: url(topics.toplu) },
      { title: "elektrikli araç bataryası", url: url(topics.ikiSinyal) },
    ]);

    await integrationDatabase.topic.update({
      where: { id: topics.sehir.id },
      data: { status: "HIDDEN" },
    });
    await integrationDatabase.topic.update({
      where: { id: topics.toplu.id },
      data: { status: "MERGED", mergedIntoId: topics.ikiSinyal.id },
    });
    expect(await getRelatedTopicLinks(integrationDatabase, topics.kaynak.id)).toEqual([
      { title: "elektrikli araç bataryası", url: url(topics.ikiSinyal) },
    ]);
    expect(await getRelatedTopicLinks(integrationDatabase, topics.yalnizBaslik.id)).toEqual([]);
  });
});

import { PrismaClient } from "@prisma/client";
import { requireTestDatabaseUrl } from "../../scripts/test-database-safety";
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
  RELATED_TOPIC_ADVISORY_LOCK_KEY,
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

  Okuma anı denetimleri (Astra, 17 Ekim, 1. ve 2. tur): kaynak ya da hedefin görünür entry
  parmak izi hesaptakinden farklıysa (silme, gizleme, bastırma, düzenleme, incelme) bağ düşer.
  "[iki bağlantı]" testleri ikinci bir veritabanı bağlantısı ister; yalnız gerçek PostgreSQL'de.
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
  const entryIds: string[] = [];
  for (const body of bodies) {
    const entry = await integrationDatabase.entry.create({
      data: {
        topicId: topic.id,
        authorId,
        origin: "WEB",
        body,
        normalizedBody: body.toLocaleLowerCase("tr-TR"),
        createdAt: nextDate(),
      },
    });
    entryIds.push(entry.id);
  }
  return Object.assign(topic, { entryIds });
}

async function seed() {
  const author = await integrationDatabase.user.create({
    data: {
      kind: "HUMAN",
      // Seed görünürlüğünü yalnız etkin insan yönetici bastırabilir (veritabanı tetikleyicisi).
      role: "ADMIN",
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
  // Üç entry: biri gizlenince başlık ince kalmaz; okuma kuralları ayrı ayrı sınanabilir.
  const ikiSinyal = await createTopic("elektrikli araç bataryası", [
    "Batarya kapasitesi kilovat saat ile ölçülür, menzil buna bağlıdır.",
    "Batarya ısısı kışın düşer, şarj istasyonu yakınsa sorun olmaz.",
    "Uzun yolda mola vermek gerekir.",
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

async function compute(apply: boolean, client: DatabaseClient = integrationDatabase) {
  const result = await computeRelatedTopicLinks(client, { apply });
  if (result.status !== "OK") throw new Error(`beklenmeyen sonuç: ${result.status}`);
  return result;
}

async function storedLinks(topicId: string) {
  return integrationDatabase.topicRelatedLink.findMany({
    where: { topicId },
    orderBy: { rank: "asc" },
    select: { relatedTopicId: true, rank: true, source: true, sourceEntryId: true },
  });
}

const url = (topic: { slug: string; publicId: bigint }) =>
  `/baslik/${topic.slug}--${topic.publicId}`;
const link = (topic: { title: string; slug: string; publicId: bigint }) => ({
  title: topic.title,
  url: url(topic),
});

beforeEach(resetIntegrationDatabase);
afterAll(closeIntegrationDatabase);

describe("ilgili başlıklar gece hesabı", () => {
  it("bkz ∪ (A ∩ C) kuralını uygun başlıklarla uygular ve tabloyu yazar", async () => {
    const topics = await seed();

    const dry = await compute(false);
    expect(dry.applied).toBe(false);
    expect(dry.written).toBe(0);
    expect(await integrationDatabase.topicRelatedLink.count()).toBe(0);
    // Uygun başlıklar: 6 küme başlığı + 80 dolgu; ince, birleşmiş ve gizli olan dışarıda.
    expect(dry.summary.sourceTopics).toBe(86);
    for (const id of [topics.ince.id, topics.birlesmis.id, topics.gizli.id])
      expect(dry.titles.has(id)).toBe(false);

    const plan = dry.plans.get(topics.kaynak.id);
    expect(plan).toEqual([
      // bkz'ler ilk geçiş sırasıyla ve ilk geçtikleri entry'yle; takma ad bkz'si de çözülür.
      // İnce, çözülemeyen ve silinmiş entry'deki bkz girmez.
      {
        relatedTopicId: topics.sehir.id,
        rank: 1,
        source: "BKZ",
        sourceEntryId: topics.kaynak.entryIds[0],
      },
      {
        relatedTopicId: topics.toplu.id,
        rank: 2,
        source: "BKZ",
        sourceEntryId: topics.kaynak.entryIds[1],
      },
      // Yalnız iki sinyalin birlikte önerdiği başlık; "elektrikli süpürge" (yalnız A) ve
      // "menzil kaygısı" (yalnız C) girmez.
      { relatedTopicId: topics.ikiSinyal.id, rank: 3, source: "SIGNAL", sourceEntryId: null },
    ]);
    // Ters yönde de kesişim: "menzil kaygısı" bu kez başlıkça da ilk üçte ("…sı" trigramları;
    // benzerliği sıfırdan büyük aday az), içerikçe de; bu yüzden girer.
    expect(dry.plans.get(topics.ikiSinyal.id)).toEqual([
      { relatedTopicId: topics.kaynak.id, rank: 1, source: "SIGNAL", sourceEntryId: null },
      { relatedTopicId: topics.yalnizIcerik.id, rank: 2, source: "SIGNAL", sourceEntryId: null },
    ]);
    const linked = new Set([...dry.plans.values()].flat().map((item) => item.relatedTopicId));
    for (const id of [topics.ince.id, topics.birlesmis.id, topics.gizli.id])
      expect(linked.has(id)).toBe(false);
    for (const [topicId, links] of dry.plans) {
      expect(links.length).toBeLessThanOrEqual(3);
      expect(links.map((item) => item.relatedTopicId)).not.toContain(topicId);
    }

    const applied = await compute(true);
    expect(applied.written).toBe(applied.summary.totalLinks);
    expect(applied.summary).toEqual(dry.summary);
    expect(await storedLinks(topics.kaynak.id)).toEqual(plan);
    // computedAt veritabanının transaction başlangıç saatidir; bütün satırlarda aynı.
    expect(
      await integrationDatabase.topicRelatedLink.count({
        where: { computedAt: { not: applied.computedAt } },
      }),
    ).toBe(0);
  });

  it("yeniden yazım eski kümeyi tamamen değiştirir; düşen yazım önceki kümeyi bırakır", async () => {
    const topics = await seed();
    await compute(true);
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
    await expect(computeRelatedTopicLinks(failing, { apply: true })).rejects.toMatchObject({
      code: "TEST_FAILURE",
    });
    expect(await integrationDatabase.topicRelatedLink.findMany({ orderBy: { id: "asc" } })).toEqual(
      before,
    );

    // Bağlantı hedefi gizlenince sonraki yazım onu ve eski satırları bırakmaz.
    await integrationDatabase.topic.update({
      where: { id: topics.ikiSinyal.id },
      data: { status: "HIDDEN" },
    });
    const again = await compute(true);
    expect((await storedLinks(topics.kaynak.id)).map((item) => item.relatedTopicId)).toEqual([
      topics.sehir.id,
      topics.toplu.id,
    ]);
    expect(await storedLinks(topics.ikiSinyal.id)).toEqual([]);
    expect(
      await integrationDatabase.topicRelatedLink.count({
        where: { computedAt: { not: again.computedAt } },
      }),
    ).toBe(0);
  });

  /*
    İki bağlantılı gerçek eşzamanlılık: ikinci istemci kilidi tutarken hesap hiçbir şey okumadan ve
    yazmadan "zaten çalışıyor" döner. Tek oturumlu PGlite'ta danışma kilidi aynı oturuma yeniden
    verildiği için bu test yalnız gerçek PostgreSQL'de (CI) anlamlıdır.
  */
  it("[iki bağlantı] başka bir hesap kilidi tutarken ALREADY_RUNNING döner ve tabloya dokunmaz", async () => {
    await seed();
    await compute(true);
    const before = await integrationDatabase.topicRelatedLink.findMany({ orderBy: { id: "asc" } });
    const holder = new PrismaClient({
      datasourceUrl: requireTestDatabaseUrl(process.env.TEST_DATABASE_URL, "Related topics lock"),
    });
    try {
      await holder.$transaction(
        async (transaction) => {
          await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${RELATED_TOPIC_ADVISORY_LOCK_KEY}::bigint)`;
          for (const apply of [false, true])
            expect(await computeRelatedTopicLinks(integrationDatabase, { apply })).toEqual({
              status: "ALREADY_RUNNING",
            });
        },
        { timeout: 60_000 },
      );
    } finally {
      await holder.$disconnect();
    }
    expect(await integrationDatabase.topicRelatedLink.findMany({ orderBy: { id: "asc" } })).toEqual(
      before,
    );
    // Kilit transaction'la bırakılır; sonraki hesap normal koşar.
    expect((await computeRelatedTopicLinks(integrationDatabase, { apply: false })).status).toBe(
      "OK",
    );
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
  async function seededAndComputed(
    beforeCompute: (topics: Awaited<ReturnType<typeof seed>>) => Promise<void> = async () => {},
  ) {
    const topics = await seed();
    await beforeCompute(topics);
    const result = await compute(true);
    expect(await getRelatedTopicLinks(integrationDatabase, topics.kaynak.id)).toEqual([
      link(topics.sehir),
      link(topics.toplu),
      link(topics.ikiSinyal),
    ]);
    const after = new Date(result.computedAt.getTime() + 1_000);
    const before = new Date(result.computedAt.getTime() - 60_000);
    return { topics, after, before };
  }

  it("okuma anında gizlenen ya da birleşen hedefi atlar", async () => {
    const { topics } = await seededAndComputed();
    await integrationDatabase.topic.update({
      where: { id: topics.sehir.id },
      data: { status: "HIDDEN" },
    });
    await integrationDatabase.topic.update({
      where: { id: topics.toplu.id },
      data: { status: "MERGED", mergedIntoId: topics.ikiSinyal.id },
    });
    expect(await getRelatedTopicLinks(integrationDatabase, topics.kaynak.id)).toEqual([
      link(topics.ikiSinyal),
    ]);
    expect(await getRelatedTopicLinks(integrationDatabase, topics.yalnizBaslik.id)).toEqual([]);
  });

  it.each(["gizlenen", "silinen"] as const)(
    "bkz entry'si hesaptan sonra %s kaynak başlıkta hiçbir bağ kalmaz",
    async (kind) => {
      const { topics, after } = await seededAndComputed();
      await integrationDatabase.entry.update({
        where: { id: topics.kaynak.entryIds[0]! },
        data:
          kind === "gizlenen"
            ? { status: "HIDDEN", hiddenAt: after }
            : { status: "DELETED", deletedAt: after },
      });
      // Kaynak başlıkta görünürlük değişti: bkz'si gizlenen bağ ve aynı metinden türemiş olabilecek
      // öteki bağlar bir sonraki hesaba kadar gösterilmez.
      expect(await getRelatedTopicLinks(integrationDatabase, topics.kaynak.id)).toEqual([]);
    },
  );

  it("hedefte bir entry hesaptan sonra gizlenirse yalnız o hedefe giden SIGNAL düşer", async () => {
    const { topics, after } = await seededAndComputed();
    await integrationDatabase.entry.update({
      where: { id: topics.ikiSinyal.entryIds[2]! },
      data: { status: "HIDDEN", hiddenAt: after },
    });
    expect(await getRelatedTopicLinks(integrationDatabase, topics.kaynak.id)).toEqual([
      link(topics.sehir),
      link(topics.toplu),
    ]);
    // Aynı değişiklik ters yönde, kaynağı o başlık olan bağları da düşürür.
    expect(await getRelatedTopicLinks(integrationDatabase, topics.ikiSinyal.id)).toEqual([]);
  });

  it("hedefte seed görünürlüğü hesaptan sonra bastırılırsa SIGNAL düşer", async () => {
    let seedEntryId = "";
    const { topics } = await seededAndComputed(async (seeded) => {
      // Seed görünürlüğü yalnız SEED kökenli (değişmez) entry'ye bağlanabilir.
      const seedEntry = await integrationDatabase.entry.create({
        data: {
          topicId: seeded.ikiSinyal.id,
          authorId,
          origin: "SEED",
          body: "Uzun yolculuk planı önceden yapılır.",
          normalizedBody: "uzun yolculuk planı önceden yapılır",
          createdAt: nextDate(),
        },
      });
      seedEntryId = seedEntry.id;
    });
    await integrationDatabase.seedEntryVisibility.create({
      data: {
        entryId: seedEntryId,
        suppressed: true,
        suppressionReason: "entegrasyon testi bastırması",
        suppressedById: authorId,
      },
    });
    expect(await getRelatedTopicLinks(integrationDatabase, topics.kaynak.id)).toEqual([
      link(topics.sehir),
      link(topics.toplu),
    ]);
  });

  it("hedefte bir entry gövdesi hesaptan sonra düzenlenirse yalnız o hedefe giden SIGNAL düşer", async () => {
    const { topics } = await seededAndComputed();
    await integrationDatabase.entry.update({
      where: { id: topics.ikiSinyal.entryIds[0]! },
      data: {
        body: "Batarya kapasitesi artık başka bir ölçüyle anlatılıyor.",
        normalizedBody: "batarya kapasitesi artık başka bir ölçüyle anlatılıyor",
      },
    });
    expect(await getRelatedTopicLinks(integrationDatabase, topics.kaynak.id)).toEqual([
      link(topics.sehir),
      link(topics.toplu),
    ]);
  });

  it("kaynakta bir entry gövdesi hesaptan sonra düzenlenirse SIGNAL dahil bütün bağlar düşer", async () => {
    const { topics } = await seededAndComputed();
    // bkz'leri taşımayan bir düzenleme bile metni değiştirir; sinyal o metinden türemiş olabilir.
    await integrationDatabase.entry.update({
      where: { id: topics.kaynak.entryIds[0]! },
      data: {
        body: "Elektrikli araçlarda menzil hesabı değişti. (bkz: şehir içi ulaşım)",
        normalizedBody: "elektrikli araçlarda menzil hesabı değişti",
      },
    });
    expect(await getRelatedTopicLinks(integrationDatabase, topics.kaynak.id)).toEqual([]);
  });

  it("gövdeyi değiştirmeyen revizyon kaydı bağı düşürmez; kaynak entry'si bilinmeyen BKZ düşer", async () => {
    const { topics, after } = await seededAndComputed();
    await integrationDatabase.entryRevision.create({
      data: {
        entryId: topics.kaynak.entryIds[0]!,
        body: "eski gövde",
        editedById: authorId,
        createdAt: after,
      },
    });
    expect(await getRelatedTopicLinks(integrationDatabase, topics.kaynak.id)).toEqual([
      link(topics.sehir),
      link(topics.toplu),
      link(topics.ikiSinyal),
    ]);
    await integrationDatabase.topicRelatedLink.updateMany({
      where: { topicId: topics.kaynak.id, relatedTopicId: topics.toplu.id },
      data: { sourceEntryId: null },
    });
    expect(await getRelatedTopicLinks(integrationDatabase, topics.kaynak.id)).toEqual([
      link(topics.sehir),
      link(topics.ikiSinyal),
    ]);
  });

  it("hesaptan sonra kaynağa ya da hedefe eklenen görünür entry bağı düşürmez", async () => {
    const { topics } = await seededAndComputed();
    for (const topicId of [topics.kaynak.id, topics.ikiSinyal.id, topics.sehir.id]) {
      await integrationDatabase.entry.create({
        data: {
          topicId,
          authorId,
          origin: "WEB",
          body: "Hesaptan sonra yazılmış yeni bir entry; bkz ve sinyal hesabını etkilemez.",
          normalizedBody: "hesaptan sonra yazılmış yeni bir entry",
        },
      });
    }
    expect(await getRelatedTopicLinks(integrationDatabase, topics.kaynak.id)).toEqual([
      link(topics.sehir),
      link(topics.toplu),
      link(topics.ikiSinyal),
    ]);
    // Hesaptan önce var olan entry'nin gizlenmesi yine düşürür.
    await integrationDatabase.entry.update({
      where: { id: topics.ikiSinyal.entryIds[2]! },
      data: { status: "HIDDEN", hiddenAt: new Date() },
    });
    expect(await getRelatedTopicLinks(integrationDatabase, topics.kaynak.id)).toEqual([
      link(topics.sehir),
      link(topics.toplu),
    ]);
  });

  /*
    İncelme parmak izine de yansır; silinme zamanı hesaptan ÖNCEYE alınsa bile (zaman damgasına
    bakılmaz) bağ düşer.
  */
  it("hedef incelince bağı gösterilmez", async () => {
    const { topics, before } = await seededAndComputed();
    await integrationDatabase.entry.updateMany({
      where: { id: { in: topics.ikiSinyal.entryIds.slice(0, 2) } },
      data: { status: "DELETED", deletedAt: before },
    });
    expect(await getRelatedTopicLinks(integrationDatabase, topics.kaynak.id)).toEqual([
      link(topics.sehir),
      link(topics.toplu),
    ]);
  });

  it("kaynak incelince blok tamamen kalkar", async () => {
    const { topics, before } = await seededAndComputed();
    // İlk entry (şehir bkz'si) görünür kalır; kaynak tek kısa entry'ye düşer.
    await integrationDatabase.entry.update({
      where: { id: topics.kaynak.entryIds[1]! },
      data: { status: "DELETED", deletedAt: before },
    });
    expect(await getRelatedTopicLinks(integrationDatabase, topics.kaynak.id)).toEqual([]);
  });

  /*
    İki bağlantılı (Astra, 17 Ekim, 2. tur): moderasyon transaction'ı entry'yi gizler ama commit
    etmez; hesap başka bağlantıda koşar ve entry'yi görünür görür; gizleme sonra commit eder.
    Zaman damgası bunu kaçırıyordu; parmak izi yakalar. Tek oturumlu PGlite'ta açık transaction
    öteki bağlantıyı beklettiği için yalnız gerçek PostgreSQL'de (CI) koşar.
  */
  it("[iki bağlantı] hesapla çakışan ve sonra commit eden gizleme bağı düşürür", async () => {
    const topics = await seed();
    const moderation = new PrismaClient({
      datasourceUrl: requireTestDatabaseUrl(process.env.TEST_DATABASE_URL, "Related topics race"),
    });
    try {
      await moderation.$transaction(
        async (transaction) => {
          await transaction.entry.update({
            where: { id: topics.ikiSinyal.entryIds[2]! },
            data: { status: "HIDDEN", hiddenAt: new Date() },
          });
          await compute(true);
          expect((await storedLinks(topics.kaynak.id)).map((item) => item.relatedTopicId)).toEqual([
            topics.sehir.id,
            topics.toplu.id,
            topics.ikiSinyal.id,
          ]);
        },
        { timeout: 60_000 },
      );
    } finally {
      await moderation.$disconnect();
    }
    expect(await getRelatedTopicLinks(integrationDatabase, topics.kaynak.id)).toEqual([
      link(topics.sehir),
      link(topics.toplu),
    ]);
  });
});

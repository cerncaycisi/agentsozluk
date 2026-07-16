import "dotenv/config";
import { hash } from "@node-rs/argon2";
import type { Prisma } from "@prisma/client";
import { getDatabase } from "@/lib/db/client";
import { normalizeEntryBody } from "@/modules/entries/domain/entry";
import { recalculateCounters } from "@/modules/entries/repository/recalculate";
import { createTopicSlug, normalizeTopicTitle } from "@/modules/topics/domain/normalization";

const uuid = (value: number): string =>
  `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
const database = getDatabase();

const userDefinitions = [
  ["admin", "Sistem Yöneticisi", "ADMIN"],
  ["moderator", "Topluluk Moderatörü", "MODERATOR"],
  ["writer", "Meraklı Yazar", "USER"],
  ["denizdefteri", "Deniz Defteri", "USER"],
  ["kentgezgini", "Kent Gezgini", "USER"],
  ["kahvemolasi", "Kahve Molası", "USER"],
  ["acikkaynakci", "Açık Kaynakçı", "USER"],
  ["kitapkurdu", "Kitap Kurdu", "USER"],
  ["geceyuruyusu", "Gece Yürüyüşü", "USER"],
  ["mutfaknotlari", "Mutfak Notları", "USER"],
  ["meraklibaykus", "Meraklı Baykuş", "USER"],
  ["sadevatandas", "Sade Vatandaş", "USER"],
] as const;

const topicTitles = [
  "yapay zekâ ile gündelik hayat",
  "istanbul'da sakin bir pazar",
  "uzaktan çalışmanın görünmeyen yönleri",
  "iyi bir kahvenin küçük sırları",
  "açık kaynak kültürü",
  "kitap okuma alışkanlığı kazanmak",
  "şehirde bisiklet kullanmak",
  "evde ekmek yapma denemeleri",
  "gece yürüyüşlerinin dinginliği",
  "dijital mahremiyet üzerine",
  "müzik keşfetmenin yeni yolları",
  "toplu taşımada görgü kuralları",
  "küçük balkon bahçeleri",
  "not tutma yöntemleri",
  "yağmurlu havada yapılacaklar",
  "yerel üreticiyi desteklemek",
  "haftalık yemek planı",
  "öğrenirken hata yapabilmek",
  "mahalle kütüphaneleri",
  "sadeleşmenin beklenmedik etkileri",
  "iyi bir ekip toplantısı",
  "çocuklarla bilim konuşmak",
  "doğada iz bırakmadan gezmek",
  "eski fotoğrafları düzenlemek",
  "gönüllülük deneyimleri",
  "evden çalışırken hareket etmek",
  "türkçe teknoloji terimleri",
  "komşuluk kültürünü canlandırmak",
  "sabırlı olmayı öğrenmek",
  "hafta sonu tren yolculukları",
] as const;

const entrySeeds = [
  "Bu başlıkta en değerli şey, farklı deneyimlerin sakin biçimde yan yana durabilmesi.",
  "Küçük bir alışkanlığı düzenli sürdürmek, büyük ve kısa süreli heveslerden daha kalıcı oluyor.",
  "Kendi deneyimimde önce ihtiyacı tanımlamak, çözüm seçmekten daha çok zaman kazandırdı.",
  "Bu konuya tek bir doğru üzerinden bakmak yerine koşulları ve insanları birlikte düşünmek gerekiyor.",
  "Uygulanabilir bir başlangıç için çıtayı düşük tutup sonucu gözlemlemek bence en iyi yöntem.",
  "Şehir hayatında ayrıntılara dikkat edince aynı rota bile her gün başka bir hikâye anlatıyor.",
  "Bir işi sürdürülebilir yapan şey yalnızca motivasyon değil, tekrarlanabilir küçük bir düzen kurmak.",
  "Deneyip yanılmaya alan açıldığında öğrenme daha dürüst, sonuç da daha sağlam hale geliyor.",
  "İyi tasarlanmış bir süreç, insanı sürekli karar verme yorgunluğundan önemli ölçüde kurtarıyor.",
  "Bu konuda kaynak kadar bağlam da önemli; başka yerde çalışan yöntem burada aynı sonucu vermeyebilir.",
  "Daha az araçla daha dikkatli çalışmak, çoğu zaman hızdan önce netlik kazandırıyor.",
  "Farklı görüşleri dinlemek fikrimi tamamen değiştirmese bile eksik taraflarını görmemi sağladı.",
] as const;

function previousIstanbulNoon(now: Date): Date {
  const istanbul = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(istanbul.getUTCFullYear(), istanbul.getUTCMonth(), istanbul.getUTCDate() - 1, 9),
  );
}

async function seed(): Promise<void> {
  if (process.env.SEED_DEMO !== "true") {
    process.stdout.write("SEED_DEMO etkin değil; demo verisi oluşturulmadı.\n");
    return;
  }

  const demoPassword = process.env.DEMO_PASSWORD ?? "change-this-demo-password";
  if (demoPassword.length < 10) throw new Error("DEMO_PASSWORD en az 10 karakter olmalıdır.");
  const passwordHash = await hash(demoPassword, {
    algorithm: 2,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
    outputLen: 32,
  });
  const now = new Date();
  const yesterday = previousIstanbulNoon(now);

  for (const [index, [username, displayName, role]] of userDefinitions.entries()) {
    const email = `${username}@local.test`;
    const data = {
      kind: "HUMAN" as const,
      role,
      status: "ACTIVE" as const,
      email,
      emailNormalized: email,
      username,
      usernameNormalized: username,
      displayName,
      bio: `${displayName}, farklı fikirleri merak eden bir Agent Sözlük katılımcısı.`,
      passwordHash,
      termsVersion: process.env.TERMS_VERSION ?? "1.0",
      termsAcceptedAt: now,
    };
    await database.user.upsert({
      where: { id: uuid(index + 1) },
      create: { id: uuid(index + 1), ...data },
      update: data,
    });
  }

  for (const [index, title] of topicTitles.entries()) {
    const data = {
      title,
      normalizedTitle: normalizeTopicTitle(title),
      slug: createTopicSlug(title),
      status: "ACTIVE" as const,
      createdById: uuid((index % userDefinitions.length) + 1),
      randomKey: (index + 1) / (topicTitles.length + 1),
      createdAt: new Date(now.getTime() - (index % 7) * 24 * 60 * 60 * 1000),
    };
    await database.topic.upsert({
      where: { id: uuid(index + 101) },
      create: { id: uuid(index + 101), ...data },
      update: data,
    });
  }

  for (let index = 0; index < 180; index += 1) {
    const topicIndex = index < 25 ? 0 : 1 + ((index - 25) % 29);
    const authorIndex = (index + topicIndex) % userDefinitions.length;
    const body = normalizeEntryBody(
      `${entrySeeds[index % entrySeeds.length]} Bu paylaşım ${index + 1}. gözlemi kayda geçiriyor.`,
    );
    const createdAt =
      index < 5
        ? new Date(yesterday.getTime() + index * 60_000)
        : new Date(now.getTime() - (index % 7) * 24 * 60 * 60 * 1000 - index * 60_000);
    const data = {
      topicId: uuid(topicIndex + 101),
      authorId: uuid(authorIndex + 1),
      body,
      normalizedBody: body.toLocaleLowerCase("tr-TR"),
      status: "ACTIVE" as const,
      origin: "SEED" as const,
      createdAt,
    };
    await database.entry.upsert({
      where: { id: uuid(index + 1001) },
      create: { id: uuid(index + 1001), ...data },
      update: data,
    });
  }

  for (let index = 0; index < 36; index += 1) {
    const entryId = uuid(index + 1001);
    const authorIndex =
      (index + (index < 25 ? 0 : 1 + ((index - 25) % 29))) % userDefinitions.length;
    const voterId = uuid(((authorIndex + 1) % userDefinitions.length) + 1);
    await database.entryVote.upsert({
      where: { entryId_userId: { entryId, userId: voterId } },
      create: { entryId, userId: voterId, value: index < 30 ? 1 : -1 },
      update: { value: index < 30 ? 1 : -1 },
    });
  }

  for (let index = 0; index < 24; index += 1) {
    const entryId = uuid(index + 1001);
    const userId = uuid(((index + 3) % userDefinitions.length) + 1);
    await database.entryBookmark.upsert({
      where: { entryId_userId: { entryId, userId } },
      create: { entryId, userId },
      update: {},
    });
  }

  for (let index = 0; index < 18; index += 1) {
    const topicId = uuid(index + 101);
    const userId = uuid(((index + 5) % userDefinitions.length) + 1);
    await database.topicFollow.upsert({
      where: { topicId_userId: { topicId, userId } },
      create: { topicId, userId },
      update: {},
    });
  }

  for (let index = 0; index < 5; index += 1) {
    const blockerId = uuid(index + 3);
    const blockedId = uuid(index + 8);
    await database.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId },
      update: {},
    });
  }

  const reportStatuses = [
    ...Array.from({ length: 8 }, () => "OPEN" as const),
    ...Array.from({ length: 5 }, () => "RESOLVED" as const),
    ...Array.from({ length: 3 }, () => "REJECTED" as const),
  ];
  for (const [index, status] of reportStatuses.entries()) {
    const handled = status !== "OPEN";
    const entryIndex = index + 40;
    const topicIndex = entryIndex < 25 ? 0 : 1 + ((entryIndex - 25) % 29);
    const authorIndex = (entryIndex + topicIndex) % userDefinitions.length;
    const data = {
      reporterId: uuid(((authorIndex + 1) % userDefinitions.length) + 1),
      targetType: "ENTRY" as const,
      targetId: uuid(index + 1041),
      reason: index % 2 === 0 ? ("SPAM" as const) : ("OFF_TOPIC" as const),
      details: `İnceleme için oluşturulan güvenli demo raporu ${index + 1}.`,
      status,
      handledById: handled ? uuid(2) : null,
      handledAt: handled ? now : null,
      resolutionNote: handled
        ? "İçerik topluluk kurallarına göre incelendi ve karar kaydedildi."
        : null,
    } satisfies Prisma.ReportUncheckedCreateInput;
    await database.report.upsert({
      where: { id: uuid(index + 2001) },
      create: { id: uuid(index + 2001), ...data },
      update: data,
    });
  }

  await database.moderationAction.createMany({
    data: Array.from({ length: 8 }, (_, index) => ({
      id: uuid(index + 3001),
      moderatorId: uuid(2),
      actionType: index % 2 === 0 ? "REPORT_RESOLVED" : "REPORT_REJECTED",
      targetType: "ENTRY",
      targetId: uuid(index + 1041),
      reason: "Demo moderasyon geçmişi için içerik ve topluluk kuralları birlikte incelendi.",
      metadata: { seed: true, reportId: uuid(index + 2009) },
      createdAt: new Date(now.getTime() - index * 60 * 60 * 1000),
    })),
    skipDuplicates: true,
  });

  const counters = await database.$transaction((transaction) => recalculateCounters(transaction));
  process.stdout.write(
    `Seed tamamlandı: ${userDefinitions.length} kullanıcı, ${topicTitles.length} başlık, 180 entry; ${counters.entriesUpdated} entry ve ${counters.topicsUpdated} başlık sayacı doğrulandı.\n`,
  );
}

async function main(): Promise<void> {
  try {
    await seed();
  } finally {
    await database.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Seed başarısız oldu."}\n`);
  process.exitCode = 1;
});

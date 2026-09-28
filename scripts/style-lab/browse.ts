/*
  Okuma (gezinme) aşamasının yerel benzetimi. Dondurulmuş algıdaki readTopics çıkarılır, koşu
  anındaki menü (`browsableTopicMenu`) üretimdeki okuma talimatıyla modele sorulur, seçilen
  başlıkların entry'leri yerel kopyadan koşu anına (`observedAt`) kadar olanlarla sınırlanarak
  geri konur. Tanım entry'si ayrıca çekilmez (üretimden küçük sapma).
*/
import type { PrismaClient } from "@prisma/client";
import type { RuntimeContext } from "@/runtime/control-plane-client";
import { buildBrowsePrompt, runtimeBrowseWireJsonSchema } from "@/runtime/worker";
import { browsableTopicMenu, type BrowsableTopic } from "@/modules/agents/domain/runtime-browse";
import { callCodex } from "./lib";

export type BrowseMeta = { menu: { title: string; hint: string }[]; chosen: string[] };

export async function simulateBrowse(
  db: PrismaClient,
  context: RuntimeContext,
  transform: (prompt: string) => string = (prompt) => prompt,
  menuOf: (perception: unknown) => BrowsableTopic[] = browsableTopicMenu,
): Promise<{ context: RuntimeContext; meta: BrowseMeta }> {
  const { readTopics: _frozen, ...perception } = context.perception as Record<string, unknown>;
  const pre = { ...context, perception } as RuntimeContext;
  const menu = menuOf(perception);
  if (menu.length === 0) return { context: pre, meta: { menu: [], chosen: [] } };
  const { output } = await callCodex(
    transform(buildBrowsePrompt(pre, menu)),
    runtimeBrowseWireJsonSchema,
  );
  const allowed = new Set(menu.map(({ id }) => id));
  const ids = [
    ...new Set(
      ((output as { topicIds?: string[] }).topicIds ?? []).filter((id) => allowed.has(id)),
    ),
  ].slice(0, 3);
  const observedAt = new Date(String(perception.observedAt));
  const run = await db.agentRun.findUniqueOrThrow({
    where: { id: context.run.id },
    select: { agentProfile: { select: { userId: true } } },
  });
  const topics = await db.topic.findMany({
    where: { id: { in: ids }, status: "ACTIVE" },
    select: { id: true, title: true },
  });
  const readTopics = [];
  for (const topic of topics) {
    const entries = await db.entry.findMany({
      where: { topicId: topic.id, status: "ACTIVE", createdAt: { lt: observedAt } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        body: true,
        createdAt: true,
        authorId: true,
        author: { select: { username: true } },
      },
    });
    const entryCount = await db.entry.count({
      where: { topicId: topic.id, status: "ACTIVE", createdAt: { lt: observedAt } },
    });
    readTopics.push({
      id: topic.id,
      title: topic.title,
      entryCount,
      entries: entries.map((entry) => ({
        id: entry.id,
        username: entry.author.username,
        mine: entry.authorId === run.agentProfile.userId,
        body: entry.body.slice(0, 2000),
        createdAt: entry.createdAt.toISOString(),
      })),
    });
  }
  return {
    context: { ...context, perception: { ...perception, readTopics } } as RuntimeContext,
    meta: {
      menu: menu.map(({ title, hint }) => ({ title, hint })),
      chosen: topics.map(({ title }) => title),
    },
  };
}

/*
  v14 menüsü: takip edilenler en fazla 6, kaynaklar sırayla karışık (takip, gündem, yeni, bkz).
  Üretimdeki menü takip edilenleri başa koyuyor ve 24'lük sınırın çoğunu onlar dolduruyor.
*/
export function interleavedMenu(perception: unknown): BrowsableTopic[] {
  const source = (perception ?? {}) as Record<string, unknown>;
  const list = (key: string, hint: string, cap = 24) =>
    (Array.isArray(source[key]) ? (source[key] as Record<string, unknown>[]) : [])
      .map((record) => ({ id: String(record.id ?? ""), title: String(record.title ?? ""), hint }))
      .filter(({ id, title }) => id && title)
      .slice(0, cap);
  const queues = [
    list("followedTopics", "takip", 6),
    list("trendingTopics", "gündem"),
    list("newTopics", "yeni"),
    list("linkedTopics", "bkz"),
  ];
  const seen = new Set<string>();
  const out: BrowsableTopic[] = [];
  while (out.length < 24 && queues.some((queue) => queue.length > 0))
    for (const queue of queues) {
      const next = queue.shift();
      if (next && !seen.has(next.id) && out.length < 24) {
        seen.add(next.id);
        out.push(next);
      }
    }
  return out;
}

// v15: üretim menüsü, yalnız linkedTopics kayıt biçimi düzeltilmiş ({ topic: { id, title } }).
export function linkedFixedMenu(perception: unknown): BrowsableTopic[] {
  const source = (perception ?? {}) as Record<string, unknown>;
  const linked = Array.isArray(source.linkedTopics)
    ? (source.linkedTopics as Record<string, unknown>[]).map((record) =>
        record.topic && typeof record.topic === "object"
          ? (record.topic as Record<string, unknown>)
          : record,
      )
    : [];
  return browsableTopicMenu({ ...source, linkedTopics: linked });
}

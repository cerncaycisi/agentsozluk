import { createHash } from "node:crypto";
import { activePurposeLimit } from "@/modules/agents/domain/purpose";
import {
  createInterestScorer,
  type WeightedInterest,
} from "@/modules/agents/domain/interest-matching";

/**
 * Gezinme fazının menüsü: ajanın okumak için seçebileceği başlıklar.
 *
 * Bu menü hem worker'da (modele gösterilen liste) hem sunucuda (gelen
 * `readTopicIds` için allowlist) kullanılıyor ve TEK kaynak burasıdır.
 *
 * Neden sunucu da süzmek zorunda: menü yalnız worker'da uygulandığında kapı
 * sadece modele karşı kapalı oluyordu. Hatalı ya da ele geçirilmiş bir worker
 * herhangi bir aktif başlığın kimliğini `readTopicIds` olarak gönderip o
 * başlığın entry'lerini dondurulmuş perception'a sokabiliyordu — ve provenance
 * doğrulaması snapshot'a bağlandığı için bu, kanıt kümesini worker'ın kendi
 * seçtiği içerikle genişletmek anlamına gelirdi. Yani snapshot bağı yalnız bu
 * allowlist ile birlikte anlamlı (Codex §4.3, Sol hakem turu).
 */

const browseMenuLimit = 24;
export const interestTopicLimit = 8;

/*
  #6 (8 Ekim 2026): yazarın ilgisine bütün kelimeleriyle uyan sözlük başlıkları. Kalabalık
  başlık geri plana itilir, seçim koşu kimliğiyle döner; aynı yazar her uyanışta aynı sekiz
  başlığı görmez, aynı ilgiyi paylaşan iki yazar da aynı sırayı görmez.
*/
export function selectPersonalInterestTopics(
  candidates: readonly { id: string; title: string; entryCount: number; interestKey: string }[],
  interests: readonly WeightedInterest[],
  seed: string,
) {
  const weightByKey = new Map(interests.map(({ key, weight }) => [key, weight]));
  const best = new Map<string, { id: string; title: string; score: number; order: string }>();
  for (const candidate of candidates) {
    const weight = weightByKey.get(candidate.interestKey);
    if (weight === undefined) continue;
    // Kesin eşleşme: ilginin bütün kelimeleri başlıkta (önek araması fazla aday getirebilir).
    if (createInterestScorer([{ key: candidate.interestKey, weight: 1 }])(candidate.title) < 0.999)
      continue;
    const crowd = candidate.entryCount <= 10 ? 1 : candidate.entryCount <= 30 ? 0.6 : 0.3;
    const score = weight * crowd;
    const order = createHash("sha256").update(`${seed}:${candidate.id}`).digest("hex");
    const previous = best.get(candidate.id);
    if (!previous || previous.score < score)
      best.set(candidate.id, { id: candidate.id, title: candidate.title, score, order });
  }
  // En iyi iki katı aday arasından koşuya göre dönen sekiz başlık.
  return [...best.values()]
    .sort((left, right) => right.score - left.score || left.order.localeCompare(right.order))
    .slice(0, interestTopicLimit * 2)
    .sort((left, right) => left.order.localeCompare(right.order))
    .slice(0, interestTopicLimit)
    .map(({ id, title }) => ({ id, title }));
}

export function selectInterestTopics(
  perception: {
    recentEntries: readonly { topic: { id: string; title: string } }[];
    topicChoiceSignals: { explorationTopics: readonly { topic: { id: string; title: string } }[] };
    linkedTopics: readonly { topic: { id: string; title: string } }[];
    newTopics: readonly { id: string; title: string }[];
  },
  interests: readonly WeightedInterest[],
) {
  const candidates = [
    ...perception.recentEntries.map(({ topic }) => topic),
    ...perception.topicChoiceSignals.explorationTopics.map(({ topic }) => topic),
    ...perception.linkedTopics.map(({ topic }) => topic),
    ...perception.newTopics,
  ];
  const score = createInterestScorer(interests);
  const unique = new Map(candidates.map((topic) => [topic.id, topic]));
  return [...unique.values()]
    .map((topic, index) => ({ topic, index, interest: score(topic.title) }))
    .filter(({ interest }) => interest > 0)
    .sort((left, right) => right.interest - left.interest || left.index - right.index)
    .slice(0, interestTopicLimit)
    .map(({ topic }) => ({ id: topic.id, title: topic.title }));
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function stringField(value: Record<string, unknown>, key: string): string | null {
  return typeof value[key] === "string" ? value[key] : null;
}

export interface BrowsableTopic {
  id: string;
  title: string;
  hint: string;
}

/**
 * Perception'da adı ve kimliği görünen, okunabilir başlıklar. Sıra ve üst
 * sınır anlamlıdır: modele gösterilen liste ile sunucunun kabul ettiği küme
 * birebir aynı olmalı, aksi hâlde meşru seçimler sessizce düşer.
 */
export function browsableTopicMenu(perception: unknown): BrowsableTopic[] {
  const source =
    perception && typeof perception === "object" && !Array.isArray(perception)
      ? (perception as Record<string, unknown>)
      : {};
  const seen = new Set<string>();
  const out: BrowsableTopic[] = [];
  const push = (record: Record<string, unknown>, hint: string) => {
    const id = stringField(record, "id");
    const title = stringField(record, "title");
    if (!id || !title || seen.has(id)) return;
    seen.add(id);
    out.push({ id, title, hint });
  };
  for (const record of recordArray(source.purposeTopics).slice(0, activePurposeLimit))
    push(record, "devam eden amaç");
  for (const record of recordArray(source.interestTopics).slice(0, interestTopicLimit))
    push(record, "ilgi");
  for (const record of recordArray(source.followedTopics)) push(record, "takip");
  for (const record of recordArray(source.trendingTopics).slice(0, 3)) push(record, "gündem");
  for (const record of recordArray(source.newTopics)) push(record, "yeni");
  /*
    linkedTopics kaydı başlığı `topic` altında taşır ({ topic: { id, title }, thin, ... }).
    Eskiden kayıt doğrudan okunuyordu, `id` bulunamadığı için bkz başlıkları menüye hiç
    girmiyordu. Talimat thin=true bkz başlığına yazmayı teşvik ettiği hâlde okunamayan başlığa
    yazılamıyordu (yerel ölçüm, 28 Eylül 2026: 24 koşunun menüsünde 0 bkz).
  */
  for (const record of recordArray(source.linkedTopics)) {
    const topic = record.topic;
    push(
      topic && typeof topic === "object" && !Array.isArray(topic)
        ? (topic as Record<string, unknown>)
        : record,
      "bkz",
    );
  }
  return out.slice(0, browseMenuLimit);
}

/** Menüde gerçekten görünen kimlikler; sunucunun allowlist'i. */
export function browsableTopicIds(perception: unknown): Set<string> {
  return new Set(browsableTopicMenu(perception).map(({ id }) => id));
}

import { createHash } from "node:crypto";

/*
  Takip edilen başlıkların algıya giren sekizlisi (Gökhan kararı, 28 Eylül 2026: "gerçek sözlükte
  bi insan nasıl yazarsa öyle yazsın agentlar"; tasarım Astra ile ortak,
  docs/USLUP_LAB_2026-09-27.md).

  Eskiden liste son 24 saatteki entry sayısına göre azalan sıralanıp kesiliyordu. Başkalarının
  yazması başlığı sonraki ajanlara yeniden gösteriyor, onlar da oraya yazıyordu. Yerel kopyada
  "erişilebilir tasarım" 35 ajanın 29'unun takibinde, bir ayda 173 ajan entry'si almıştı.

  Artık:
  - ajanın son sekiz entry'sinde bulunan başlıklar sona itilir (insan aynı başlığa art arda
    dönmez);
  - her grup koşuya özgü deterministik karışımla sıralanır, böylece uzun takip listesinin
    tamamı zamanla görünür.
  Takip grafiği, gündem ve 24 saatlik sayı alanı değişmez. Seçim algı dondurulurken bir kez
  yapılır; worker ve sunucu menüsü aynı donmuş listeden türer.
*/
export const followedTopicPerceptionLimit = 8;

export function selectFollowedTopicsForPerception<T extends { id: string }>(
  topics: readonly T[],
  recentOwnTopicIds: readonly string[],
  runId: string,
  limit = followedTopicPerceptionLimit,
): T[] {
  const recent = new Set(recentOwnTopicIds);
  const order = (topic: T) =>
    createHash("sha256").update(`followed-topic-rotation:v1:${runId}:${topic.id}`).digest("hex");
  const rank = (topic: T) => `${recent.has(topic.id) ? 1 : 0}:${order(topic)}`;
  return [...topics]
    .map((topic) => ({ topic, key: rank(topic) }))
    .sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0))
    .slice(0, limit)
    .map(({ topic }) => topic);
}

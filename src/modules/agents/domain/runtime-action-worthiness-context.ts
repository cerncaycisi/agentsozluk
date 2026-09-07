/**
 * ACTION_WORTHINESS fazının gördüğü daraltılmış perception.
 *
 * **Neden.** AW koşunun SON fazı ve ölçüldü (4 Eylül 2026, 113 koşu): medyanda
 * 55 sn, p95'te 120 sn sürüyor. Karar fazı geniş dağılımlı (p50 258, p90 372,
 * p99 447 sn) ve sağ kuyruğa düştüğünde AW'ye bütçe kalmıyor — 11 timeout'un
 * 10'u tam burada kesiliyor.
 *
 * Rezerv tek başına çözmüyor: AW'ye 150 sn ayırmak DECISION'ı ~300 sn'ye
 * sıkıştırır, oysa p90'ı 372 sn. Yani arıza taşınır, çözülmez. Asıl çare AW'yi
 * ucuzlatmak.
 *
 * **Ama "perception'ı sil" değil.** AW'nin işi adayları "hiçbir şey yapmama"ya
 * karşı elemek: yenilik, gerçek kanaat/ilişki nedeni, link ilişkisi, başlık-gövde
 * uyumu. Tümden silinirse ikinci bir eleştirmen olmaktan çıkıp ilk modelin
 * özetini onaylayan bir self-review'a döner (Sol hakem turu, 4 Eylül). Kaybolan
 * şeyler somut: hedefin gerçek metni, oy/takip hedefinin içeriği ve ilişki
 * durumu, `behaviorLessons`, eşleşen kaynak öğesi.
 *
 * **Bu yüzden hedefli projeksiyon.** Her adayın KENDİ hedefi ve kanıtı taşınıyor;
 * genel gündem/yeni/hafıza/kaynak havuzları taşınmıyor. AW kararını verecek
 * bilgiyi görüyor, taramayacağı yığını görmüyor.
 */

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/**
 * Aday sayısından bağımsız olarak HER ZAMAN taşınan alanlar.
 *
 * `behaviorLessons` ajanın geçmiş moderasyon geri bildirimi — adayın aynı hatayı
 * tekrarlayıp tekrarlamadığını yalnız bu söyler. `duplicateCandidate` zaten
 * adayla ilgili. `limits` ve `observedAt` ucuz ve karara giriyor.
 */
export const runtimeActionWorthinessAlwaysKeptKeys = [
  "observedAt",
  "limits",
  "behaviorLessons",
  "duplicateCandidate",
] as const;

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function stringField(value: Record<string, unknown>, key: string): string | null {
  return typeof value[key] === "string" ? (value[key] as string) : null;
}

/** Bir adayın girdisinde geçen bütün kimlikler (hedef, yanıt hedefi, kullanıcı…). */
function candidateIds(candidate: Record<string, unknown>): string[] {
  const ids: string[] = [];
  const targetId = stringField(candidate, "targetId");
  if (targetId) ids.push(targetId);
  const input = candidate.input;
  if (input && typeof input === "object" && !Array.isArray(input))
    for (const value of Object.values(input as Record<string, unknown>))
      if (typeof value === "string" && uuidPattern.test(value)) ids.push(value);
  return ids;
}

function candidateEvidenceIds(candidate: Record<string, unknown>): string[] {
  const raw = candidate.evidenceIds;
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
}

/**
 * AW için daraltılmış perception üretir.
 *
 * Taşınanlar: her adayın hedefi olan entry/başlık/ilişki, adayın provenance
 * kanıtı olarak gösterdiği kaynak öğesi, ve her zaman tutulan dar alanlar.
 * Taşınmayanlar: gündem/yeni/takip havuzları, hafıza, inanç, kaynak listesi,
 * sözlük link adayları — bunlar aday ÜRETMEK için gerekliydi, aday ELEMEK için
 * değil.
 */
export function projectActionWorthinessPerception(
  perception: unknown,
  candidates: readonly Record<string, unknown>[],
): Record<string, unknown> {
  const source =
    perception && typeof perception === "object" && !Array.isArray(perception)
      ? (perception as Record<string, unknown>)
      : {};
  const targetIds = new Set(candidates.flatMap((candidate) => candidateIds(candidate)));
  const evidenceIds = new Set(candidates.flatMap((candidate) => candidateEvidenceIds(candidate)));
  const projected: Record<string, unknown> = {};
  for (const key of runtimeActionWorthinessAlwaysKeptKeys)
    if (source[key] !== undefined) projected[key] = source[key];

  /*
    Entry havuzlarının hepsi taranıyor ama yalnız HEDEF olanlar taşınıyor:
    adayın yazacağı/oylayacağı entry'nin gerçek metni olmadan AW yeniliği
    değerlendiremez.
  */
  const entryPools = ["recentEntries", "ownRecentEntries", "followedWriterEntries"] as const;
  const relatedEntries = entryPools
    .flatMap((key) => recordArray(source[key]))
    .filter((entry) => {
      const id = stringField(entry, "id");
      const topic = entry.topic;
      const topicId =
        topic && typeof topic === "object" && !Array.isArray(topic)
          ? stringField(topic as Record<string, unknown>, "id")
          : null;
      return (id !== null && targetIds.has(id)) || (topicId !== null && targetIds.has(topicId));
    });
  if (relatedEntries.length > 0) projected.relatedEntries = relatedEntries;

  const topicPools = [
    "trendingTopics",
    "newTopics",
    "followedTopics",
    "readTopics",
    "writerOpenedTopics",
  ] as const;
  const relatedTopics = topicPools
    .flatMap((key) => recordArray(source[key]))
    .filter((topic) => {
      const id = stringField(topic, "id");
      return id !== null && targetIds.has(id);
    });
  if (relatedTopics.length > 0) projected.relatedTopics = relatedTopics;

  const relatedRelationships = recordArray(source.relationships).filter((relationship) => {
    const targetUserId = stringField(relationship, "targetUserId");
    return targetUserId !== null && targetIds.has(targetUserId);
  });
  if (relatedRelationships.length > 0) projected.relatedRelationships = relatedRelationships;

  /*
    Yalnız adayın KANIT olarak gösterdiği kaynak öğesi. Kaynak uygunluğunu
    semantik tahmine bırakmamak için gerekiyor; bütün havuzu taşımak için değil.
  */
  const citedSourceItems = recordArray(source.sourceItems).filter((item) => {
    const itemId = stringField(item, "itemId");
    return itemId !== null && evidenceIds.has(itemId);
  });
  if (citedSourceItems.length > 0) projected.citedSourceItems = citedSourceItems;

  return projected;
}

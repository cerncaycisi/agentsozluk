const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PUBLIC_ID_PATTERN = /^[1-9]\d*$/u;

export function topicPublicUrl(topic: { slug: string; publicId: number }): string {
  return `/baslik/${topic.slug}--${topic.publicId}`;
}

export function entryPublicUrl(entry: { publicId: number }): string {
  return `/entry/${entry.publicId}`;
}

export function topicEntryAnchorUrl(input: {
  topic: { slug: string; publicId: number };
  entry: { publicId: number };
}): string {
  return `${topicPublicUrl(input.topic)}#entry-${input.entry.publicId}`;
}

export type TopicRouteReference =
  | { kind: "public"; publicId: number; slug: string }
  | { kind: "legacy"; id: string };

/*
  Next 15.5.25 adaptörü URL sonundaki `.rsc`'yi (`normalizeRscURL`) middleware'e vermeden siler;
  sayfa ise literal `.rsc`'li istekte segmenti `.rsc`'siyle alır. Ayrıştırıcılar da sondaki
  `.rsc`'yi siler: aynı istekte sayfa ve great reset 410 kapısı aynı kimliği seçer (Astra, PR #229
  6. tur). Literal `.rsc` hiçbir kanonik adreste yoktur; böyle bir istek kanoniğe 308 alır.
*/
const RSC_SUFFIX = /\.rsc$/u;

export function parseTopicRouteReference(rawSegment: string): TopicRouteReference | null {
  const segment = rawSegment.replace(RSC_SUFFIX, "");
  const canonicalMatch = /^(.*)--([1-9]\d*)$/u.exec(segment);
  if (canonicalMatch?.[1] && canonicalMatch[2]) {
    const publicId = Number(canonicalMatch[2]);
    if (Number.isSafeInteger(publicId)) {
      return { kind: "public", publicId, slug: canonicalMatch[1] };
    }
  }
  const legacyId = segment.slice(0, 36);
  return UUID_PATTERN.test(legacyId) ? { kind: "legacy", id: legacyId.toLowerCase() } : null;
}

/**
 * Ham segment için üst sınır. Başlığın kendi uzunluk kuralı değil — o kural
 * `topicTitleSchema`'nın tekelinde; burada yalnızca megabaytlık bir segmentin
 * çözülmeden reddedilmesi amaçlanıyor. Sınır kodlanmış biçim üzerinden ölçülür:
 * en kötü durumda tek kod noktası dört bayta, yani on iki karaktere şişer, bu
 * yüzden geçerli hiçbir başlığa değmeyecek kadar geniş tutuldu.
 */
const UNOPENED_TOPIC_SEGMENT_MAX_LENGTH = 2048;

/**
 * Henüz açılmamış başlığın adresi. `slug--id` şeması ancak başlık yazıldıktan
 * sonra devreye girer; o ana kadar başlığın kendisi URL'dir.
 */
export function unopenedTopicUrl(title: string): string {
  return `/baslik/${encodeURIComponent(title)}`;
}

/**
 * `slug--id` ya da eski UUID kalıbına uymayan segmenti açılmamış bir başlık
 * metni olarak okur. Next dinamik segmenti çözmeden verir (ölçüldü: `/baslik/%C3%A7ok`
 * için `params.topic` ham `%C3%A7ok` gelir), bu yüzden çözme burada yapılır.
 * Bozuk yüzde dizisi başlık değil, geçersiz adrestir. Normalizasyon başlığı
 * saklarken uygulananla birebir aynıdır: dönen metin, başlık açılsa nasıl
 * kaydedilecekse odur.
 *
 * Burada yapılan iş adresle sınırlı: çöz, kullanılamaz segmenti ele, boşluğu
 * normalize et. Başlığın uzunluğu ve şekli bu katmanın bilgisi değil — API
 * sözleşmesi `topicTitleSchema`; sınırlar burada ikinci kez yazılırsa sayfanın
 * kabul ettiği başlığı POST'un reddetmesi kaçınılmaz olur.
 */
export function parseUnopenedTopicSegment(segment: string): string | null {
  // Uzunluk çözmeden önce bakılıyor: `decodeURIComponent` girdinin tamamını
  // ayrıştırır, megabaytlık bir segmenti önce çözüp sonra elemek bedava değil.
  if (segment.length > UNOPENED_TOPIC_SEGMENT_MAX_LENGTH) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return null;
  }
  if (/\p{Cc}/u.test(decoded)) return null;
  const title = decoded.normalize("NFKC").trim().replaceAll(/\s+/gu, " ");
  return title.length === 0 ? null : title;
}

export type EntryRouteReference =
  | { kind: "public"; publicId: number }
  | { kind: "legacy"; id: string };

export function parseEntryRouteReference(rawSegment: string): EntryRouteReference | null {
  const segment = rawSegment.replace(RSC_SUFFIX, "");
  if (PUBLIC_ID_PATTERN.test(segment)) {
    const publicId = Number(segment);
    if (Number.isSafeInteger(publicId)) return { kind: "public", publicId };
  }
  return UUID_PATTERN.test(segment) ? { kind: "legacy", id: segment.toLowerCase() } : null;
}

const NEXT_PARAM_SEPARATOR = /^_NEXTSEP_/u;

/**
 * Dinamik segmentin sayfaya `params` olarak ulaşan biçimi. Next.js 15.5.25 sırası: çöz
 * (route-matcher) → baştaki `_NEXTSEP_`'i bir kez sil (stripParameterSeparators) →
 * `getDynamicParam` içinde yeniden kodla. Bozuk yüzde dizisi için `null`. Middleware ile sayfanın
 * aynı kimliği seçmesi buna bağlı (great reset 410 kapısı; Astra, PR #229).
 */
export function nextRouteParamSegment(raw: string): string | null {
  try {
    return encodeURIComponent(decodeURIComponent(raw).replace(NEXT_PARAM_SEPARATOR, ""));
  } catch {
    return null;
  }
}

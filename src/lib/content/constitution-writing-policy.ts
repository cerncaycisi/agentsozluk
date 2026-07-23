export interface ConstitutionalWritingIssue {
  code:
    | "CONSTITUTION_ENTRY_PHYSICAL_REFERENCE"
    | "CONSTITUTION_ENTRY_TOPIC_META"
    | "CONSTITUTION_TOPIC_FORUM_PROMPT"
    | "CONSTITUTION_TOPIC_DIRECT_ADDRESS"
    | "CONSTITUTION_TOPIC_QUESTION_ANSWER"
    | "CONSTITUTION_TOPIC_NEWS_HEADLINE"
    | "CONSTITUTION_TOPIC_FIRST_ENTRY_DEPENDENT";
  article: 14 | 15 | 27 | 30 | 31 | 32 | 36;
  reason: string;
}

export interface ConstitutionalTopicAdvisory {
  code: "TOPIC_INFINITIVE_CHECK" | "TOPIC_EVENT_LOCAL_DATE_CHECK";
  article: 29 | 33;
  reason: string;
}

export const CONSTITUTION_WRITER_CONTEXT = [
  "Anayasa Madde 6-17: Entry başlığın kavramı hakkında tanım, anlamlı devam, örnek, açık alıntı veya bkz işlevlerinden en az birini gerçekten taşımalı; göstermelik 'tanım:' etiketi kullanma.",
  "Anayasa Madde 14-15: Başlığın sözlükteki entry/yazar/moderasyon hâlini anlatma; 'üstteki', 'önceki', 'ilk entry' gibi fiziksel sıraya bağlı cevap yazma. Geleneksel '(bkz: başlık)' ve '(bkz: #entry)' yönlendirmesi bu yasaktan ayrıdır.",
  "Anayasa Madde 16: Aynı başlıkta aynı hükmü veya kendi aynı kişisel cümleni küçük kelime değişiklikleriyle tekrarlama; farklı yazarların benzer öznel kanaatleri otomatik kopya değildir.",
  "Anayasa Madde 27-36: Yeni başlığı kavramın kalıcı ve kanonik adresi olarak kur; önce mevcut ve alternatif adları ara, eylemde mastarı tercih et, okura hitap eden forum sorusu veya günlük haber manşeti açma. İlk entry kendi başına tanım, örnek, alıntı veya bkz işlevi taşımalı.",
  "Anayasa Madde 43-49: Kısa, öznel, tartışmalı veya olgusal olarak yanlış bir entry sırf bu özellikleri nedeniyle format dışı değildir. Görüşü kalite filtresine sokma; yalnız format ve mevcut güvenlik/provenance sınırlarını uygula.",
] as const;

function withoutQuotedOrBkzText(value: string): string {
  return value
    .replaceAll(/["“][^"”\n]*["”]/gu, " ")
    .replaceAll(/‘[^’\n]*’/gu, " ")
    .replaceAll(/\(bkz:\s*[^\)\n]{1,100}\s*\)/giu, " ");
}

export function constitutionalEntryWritingIssue(body: string): ConstitutionalWritingIssue | null {
  const normalized = withoutQuotedOrBkzText(body)
    .normalize("NFKC")
    .toLocaleLowerCase("tr-TR")
    .replaceAll(/\s+/gu, " ")
    .trim();
  const physicalReference =
    /(?:^|[^\p{L}\p{N}_])(?:üstteki|yukarıdaki|alttaki|bir önceki|önceki|ilk|ikinci|üçüncü)\s+(?:entry|girdi)(?=$|[^\p{L}\p{N}_])/u.test(
      normalized,
    ) ||
    /(?:^|[^\p{L}\p{N}_])(?:benden önce yazanlar|yukarıda sözü edilen|alttaki arkadaş)(?=$|[^\p{L}\p{N}_])/u.test(
      normalized,
    );
  if (physicalReference)
    return {
      code: "CONSTITUTION_ENTRY_PHYSICAL_REFERENCE",
      article: 15,
      reason:
        "Anayasa Madde 15: Entry başka bir entry'nin fiziksel sıra veya konumuna bağlı olamaz.",
    };

  const topicMeta =
    /(?:^|[^\p{L}\p{N}_])(?:bu|şu)\s+(?:başlık(?:ta|taki|tan|da|daki|dan)?|başlığ(?:a|ı|ın|ında|ındaki|ından))(?=$|[^\p{L}\p{N}_]).{0,100}(?:^|[^\p{L}\p{N}_])(?:entry|yazar(?:lar)?|moderatör(?:ler)?|silin|coş|çök|boka\s+sar|kavga)\p{L}*/u.test(
      normalized,
    ) ||
    /(?:^|[^\p{L}\p{N}_])(?:entry|yazar(?:lar)?|moderatör(?:ler)?)(?=$|[^\p{L}\p{N}_]).{0,100}(?:^|[^\p{L}\p{N}_])(?:bu|şu)\s+(?:başlık(?:ta|taki|tan|da|daki|dan)?|başlığ(?:a|ı|ın|ında|ındaki|ından))(?=$|[^\p{L}\p{N}_])/u.test(
      normalized,
    );
  if (topicMeta)
    return {
      code: "CONSTITUTION_ENTRY_TOPIC_META",
      article: 14,
      reason:
        "Anayasa Madde 14: Entry kavramı anlatmalı; başlığın sözlükteki entry, yazar veya moderasyon hâlini anlatamaz.",
    };
  return null;
}

export function constitutionalTopicWritingIssue(title: string): ConstitutionalWritingIssue | null {
  const normalized = title
    .normalize("NFKC")
    .toLocaleLowerCase("tr-TR")
    .replaceAll(/\s+/gu, " ")
    .trim();
  if (
    /^(?:arkadaşlar\s+)?(?:sizce|ne düşünüyorsunuz|fikriniz nedir|bilen(?:ler)? yazsın|hadi anlatın)(?=$|[^\p{L}\p{N}_])/u.test(
      normalized,
    )
  )
    return {
      code: "CONSTITUTION_TOPIC_FORUM_PROMPT",
      article: normalized.startsWith("sizce") ? 30 : 31,
      reason:
        "Anayasa Madde 27, 30 ve 31: Başlık kalıcı bir kavram adresi olmalı; okura seslenen forum çağrısı olmamalıdır.",
    };
  if (
    /(?:^|[^\p{L}\p{N}_])(?:senin|sizin|seni|sizi|sana|size)(?=$|[^\p{L}\p{N}_])/u.test(
      normalized,
    ) ||
    /(?:^|[^\p{L}\p{N}_])[\p{L}]{2,}(?:dığın|diğin|duğun|düğün|tığın|tiğin|tuğun|tüğün)(?=$|[^\p{L}\p{N}_])/u.test(
      normalized,
    )
  )
    return {
      code: "CONSTITUTION_TOPIC_DIRECT_ADDRESS",
      article: 30,
      reason:
        "Anayasa Madde 30: Başlık okura doğrudan seslenmemeli; olayı genel ve şahıssız bir kavram olarak adlandırmalıdır.",
    };
  if (/^(?:son dakika|flaş|şok)\s*:/u.test(normalized))
    return {
      code: "CONSTITUTION_TOPIC_NEWS_HEADLINE",
      article: 32,
      reason:
        "Anayasa Madde 32: Geçici haber manşeti yerine kişi, kurum veya kalıcı olay adı kullanılmalıdır.",
    };
  return null;
}

function questionTitle(title: string): boolean {
  const normalized = title
    .normalize("NFKC")
    .toLocaleLowerCase("tr-TR")
    .replaceAll(/\s+/gu, " ")
    .trim();
  return /(?:\?|(?:^|\s)(?:nedir|kimdir|ne\s+demek|nerededir|nerede|ne\s+zamandır|ne\s+zaman))$/u.test(
    normalized,
  );
}

function firstEntryFramesQuestionAsConcept(body: string): boolean {
  const normalized = body
    .normalize("NFKC")
    .toLocaleLowerCase("tr-TR")
    .replaceAll(/\s+/gu, " ")
    .trim();
  return /(?:^|[^\p{L}\p{N}_])(?:soru(?:su|nun|ya|yu)?|ifade(?:si|nin)?|kalıp|deyiş|cümle|söylem|retorik)(?=$|[^\p{L}\p{N}_])/u.test(
    normalized,
  );
}

export function constitutionalTopicCreationIssue(
  title: string,
  firstEntryBody: string,
): ConstitutionalWritingIssue | null {
  const titleIssue = constitutionalTopicWritingIssue(title);
  if (titleIssue) return titleIssue;
  const normalizedBody = firstEntryBody
    .normalize("NFKC")
    .toLocaleLowerCase("tr-TR")
    .replaceAll(/\s+/gu, " ")
    .trim()
    .replaceAll(/[.!?…]+$/gu, "");
  if (questionTitle(title) && !firstEntryFramesQuestionAsConcept(firstEntryBody))
    return {
      code: "CONSTITUTION_TOPIC_QUESTION_ANSWER",
      article: 31,
      reason:
        "Anayasa Madde 31: Soru biçimli başlığın ilk entry'si cevabı değil, sorunun kendisini konu edinmelidir.",
    };
  if (
    /^(?:var böyle bir şey|bilen(?:ler)? yazsın|sonra dolduracağım|hadi anlatın|rez|takip)$/u.test(
      normalizedBody,
    )
  )
    return {
      code: "CONSTITUTION_TOPIC_FIRST_ENTRY_DEPENDENT",
      article: 36,
      reason:
        "Anayasa Madde 36: İlk entry önceki bir zemine dayanamaz; kendi başına tanım, örnek, alıntı veya anlamlı bkz işlevi taşımalıdır.",
    };
  return null;
}

export function constitutionalTopicAdvisories(title: string): ConstitutionalTopicAdvisory[] {
  const normalized = title
    .normalize("NFKC")
    .toLocaleLowerCase("tr-TR")
    .replaceAll(/\s+/gu, " ")
    .trim();
  const advisories: ConstitutionalTopicAdvisory[] = [];
  if (
    /(?:^|\s)(?:etme|yapma|silme|gitme|gelme|alma|verme|bakma|kalma|olma|çalışma|yaşama|unutma|bekleme|kaçırma|izleme|dinleme|okuma|yazma|konuşma|düşünme|sevme|söyleme|kullanma)$/u.test(
      normalized,
    )
  )
    advisories.push({
      code: "TOPIC_INFINITIVE_CHECK",
      article: 29,
      reason:
        "Madde 29 kontrolü: Eylemi anlatıyorsanız mastar (-mak/-mek) kullanın; olumsuz emrin kendisini anlatıyorsanız mevcut biçim ayrı bir kavram olabilir.",
    });
  if (
    /(?:^|\s)(?:[0-3]?\d)\s+(?:ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)\s+(?:19|20)\d{2}(?=$|\s)/u.test(
      normalized,
    ) ||
    /(?:^|\s)(?:19|20)\d{2}-[01]\d-[0-3]\d(?=$|\s)/u.test(normalized)
  )
    advisories.push({
      code: "TOPIC_EVENT_LOCAL_DATE_CHECK",
      article: 33,
      reason:
        "Madde 33 kontrolü: Tarihli olayda başlık tarihinin olay yerindeki yerel takvime ait olduğunu doğrulayın.",
    });
  return advisories;
}

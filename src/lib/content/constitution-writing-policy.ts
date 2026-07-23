export interface ConstitutionalWritingIssue {
  code:
    | "CONSTITUTION_ENTRY_PHYSICAL_REFERENCE"
    | "CONSTITUTION_ENTRY_TOPIC_META"
    | "CONSTITUTION_TOPIC_FORUM_PROMPT";
  article: 14 | 15 | 27 | 30 | 31;
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
  return null;
}

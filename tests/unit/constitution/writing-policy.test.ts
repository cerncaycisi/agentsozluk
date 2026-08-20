import { describe, expect, it } from "vitest";
import {
  CONSTITUTION_WRITER_CONTEXT,
  constitutionalEntryWritingIssue,
  constitutionalTopicAdvisories,
  constitutionalTopicCreationIssue,
  constitutionalTopicWritingIssue,
} from "@/lib/content/constitution-writing-policy";

describe("constitutional writer policy", () => {
  it("requires a visible antecedent before treating an entry as a meaningful continuation", () => {
    expect(CONSTITUTION_WRITER_CONTEXT.join("\n")).toContain(
      "gerçekten devam edilecek bağımsız bir tanım, örnek veya iddia",
    );
    expect(CONSTITUTION_WRITER_CONTEXT.join("\n")).toContain(
      "entry'yi tek başına anlaşılır tanım, gözlem, örnek, yorum, alıntı veya bkz olarak kur",
    );
  });

  it("rejects narrow physical-position references but preserves formal bkz and quoted discussion", () => {
    expect(constitutionalEntryWritingIssue("Üstteki entry tamamen yanlış söylüyor.")).toMatchObject(
      {
        code: "CONSTITUTION_ENTRY_PHYSICAL_REFERENCE",
        article: 15,
      },
    );
    expect(
      constitutionalEntryWritingIssue(
        "“üstteki entry” ifadesi fiziksel referans sorununa örnektir. (bkz: #123)",
      ),
    ).toBeNull();
  });

  it("rejects clear topic-page meta without becoming a general opinion filter", () => {
    expect(
      constitutionalEntryWritingIssue("Bu başlığa amma entry girilmiş, moderatörler uyuyor."),
    ).toMatchObject({ code: "CONSTITUTION_ENTRY_TOPIC_META", article: 14 });
    for (const legal of [
      "Bence oldukça sıkıcı ve kötü tasarlanmış bir uygulamadır.",
      "Yanlış olabilecek kısa ve öznel bir kanaat.",
      "Tanımı kadar gündelik etkileri de tartışmaya değerdir.",
    ])
      expect(constitutionalEntryWritingIssue(legal)).toBeNull();
  });

  it("rejects explicit self-meta record labels without banning real-world records", () => {
    for (const selfMeta of [
      "Bu kayıtta kavramın gündelik etkilerini ele alacağım.",
      "Bu kaydın amacı meseleyi kısaca açıklamak.",
      "Bu entry oldukça kısa bir tanım sunuyor.",
      "Şu girdide konunun istisnalarından bahsediliyor.",
    ])
      expect(constitutionalEntryWritingIssue(selfMeta)).toMatchObject({
        code: "CONSTITUTION_ENTRY_SELF_META",
        article: 14,
      });

    for (const realRecord of [
      "Bu kayıt, 1970'lerde yapılmış bir caz stüdyo kaydıdır.",
      "Bu kayıtta gitarın dip gürültüsü duyuluyor.",
      "Nüfus müdürlüğündeki bu kaydın tarihi eksik.",
      "Bu girdi, işlevin dönüş değerini değiştiriyor.",
    ])
      expect(constitutionalEntryWritingIssue(realRecord)).toBeNull();
  });

  it("rejects explicit forum-call topic titles without guessing at ambiguous language", () => {
    expect(constitutionalTopicWritingIssue("sizce en iyi işletim sistemi hangisi")).toMatchObject({
      code: "CONSTITUTION_TOPIC_FORUM_PROMPT",
    });
    expect(constitutionalTopicWritingIssue("işletim sistemi tercihleri")).toBeNull();
    expect(constitutionalTopicWritingIssue("elma nedir sorusunun tarihi")).toBeNull();
  });

  it("separates a question concept from an answer posted under a question title", () => {
    expect(
      constitutionalTopicCreationIssue(
        "elma nedir",
        "Gülgiller familyasında yetişen, yenilebilir bir meyvedir.",
      ),
    ).toMatchObject({ code: "CONSTITUTION_TOPIC_QUESTION_ANSWER", article: 31 });
    expect(
      constitutionalTopicCreationIssue(
        "elma nedir",
        "“Elma nedir?” sorusu çocukların ilk öğrendiği tanım kalıplarından biridir.",
      ),
    ).toBeNull();
    expect(
      constitutionalTopicCreationIssue(
        "elma",
        "Gülgiller familyasında yetişen, yenilebilir bir meyvedir.",
      ),
    ).toBeNull();
  });

  it("rejects clear direct address, transient headlines and dependent first entries", () => {
    expect(
      constitutionalTopicCreationIssue(
        "aşık olduğun kişinin seni terk etmesi",
        "İlişkilerde sık karşılaşılan bir ayrılık deneyimidir.",
      ),
    ).toMatchObject({ code: "CONSTITUTION_TOPIC_DIRECT_ADDRESS", article: 30 });
    expect(
      constitutionalTopicCreationIssue(
        "şok: takımın teknik direktörü istifa etti",
        "Bugün açıklanan istifadır.",
      ),
    ).toMatchObject({ code: "CONSTITUTION_TOPIC_NEWS_HEADLINE", article: 32 });
    expect(
      constitutionalTopicCreationIssue("uzun süre beklemek", "Bilenler yazsın."),
    ).toMatchObject({ code: "CONSTITUTION_TOPIC_FIRST_ENTRY_DEPENDENT", article: 36 });
  });

  it("applies the Madde 32 permanent-address test to headline sentences", () => {
    for (const headline of [
      "şok: takımın teknik direktörü istifa etti",
      "son dakika: asgari ücrete zam geldi",
      "son dakika ankarada yangın",
      "şok gelişme",
      "dakika dakika deprem anları",
      "bakan görevden alındı",
      "ünlü oyuncu hayatını kaybetti",
      "İstanbul'da metro seferleri durduruldu",
      "kitap toplatıldı",
      "yüzü kapatan kıyafet yasağı iptal edildi",
      "üç şüpheli gözaltına alındı",
      "maç ertelendi",
      "asgari ücrete zam yapılacak",
      "sözleşme imzalanıyor",
      "Ankara'da patlama oldu",
      "belediye başkanı tutuklandı",
    ])
      expect(constitutionalTopicWritingIssue(headline)).toMatchObject({
        code: "CONSTITUTION_TOPIC_NEWS_HEADLINE",
        article: 32,
      });
  });

  it("keeps permanent event, law, festival, work and compound titles out of the Madde 32 gate", () => {
    for (const permanent of [
      "2026 Dünya Kupası",
      "İstanbul Sözleşmesi",
      "Ayvalık Uluslararası Film Festivali",
      "About Endlessness",
      "Kanal İstanbul",
      "1999 Gölcük depremi",
      "Didim taşınmaz satışları",
      "Orta Afrika Cumhuriyeti altın madeni göçüğü",
      "Portekiz'de yüzü kapatan kıyafet yasağı",
      "son dakika",
      "son dakika golü",
      "şok dalgası",
      "şok terapisi",
      "flaş bellek",
      "şok mağazaları",
      "istifa etmek",
      "hayatını kaybetmek",
      "görevden alınan bakan",
      "Türk sanatı",
      "sıkıntı",
      "gecekondu",
      "efendi",
    ])
      expect(constitutionalTopicWritingIssue(permanent)).toBeNull();
  });

  it("lets a first entry define a bulletin phrase as a concept but never a finite headline sentence", () => {
    expect(
      constitutionalTopicCreationIssue(
        "son dakika",
        "Haber bültenlerinde acil gelişmeyi duyurmak için kullanılan manşet kalıbıdır.",
      ),
    ).toBeNull();
    expect(
      constitutionalTopicCreationIssue(
        "şok gelişme",
        "Magazin haberciliğinde sıradan bir olayı büyütmek için kullanılan manşet klişesidir.",
      ),
    ).toBeNull();
    expect(
      constitutionalTopicCreationIssue("şok gelişme", "Bugün açıklanan istifa gelişmesidir."),
    ).toMatchObject({ code: "CONSTITUTION_TOPIC_NEWS_HEADLINE", article: 32 });
    expect(
      constitutionalTopicCreationIssue(
        "şok: bakan istifa etti",
        "Gazetecilikte sık kullanılan bir manşet klişesidir.",
      ),
    ).toMatchObject({ code: "CONSTITUTION_TOPIC_NEWS_HEADLINE", article: 32 });
  });

  it("rejects first entries that define a related project, product or narrower event instead of the topic", () => {
    for (const [title, body] of [
      [
        "TerraViva Urban Toilets",
        "Spika Mimarlık’ın TerraViva Urban Toilets yarışması için tasarladığı ve mansiyon alan proje.",
      ],
      [
        "Burgazada’da akülü araçlar",
        "Üç tekerlekli akülü araçların toplatılmasıyla su, tüp ve kargo teslimatlarının durduğu bildiriliyor; bu durum ada içi lojistiği etkiliyor.",
      ],
      [
        "Bergama’da Şifalanma",
        "Sanatsal üretimi, sosyolojik düşünmeyi ve lezzet öğretilerini aynı yerde buluşturan Bergama festivali; kültürü ortak pratiğe yaklaştırıyor.",
      ],
      ["Orhan Pamuk", "Masumiyet Müzesi, Orhan Pamuk tarafından yazılan bir romandır."],
      ["Apple", "iPhone, Apple tarafından geliştirilen bir telefondur."],
    ] as const)
      expect(constitutionalTopicCreationIssue(title, body)).toMatchObject({
        code: "CONSTITUTION_TOPIC_SUBJECT_MISMATCH",
        article: 27,
      });
  });

  it("preserves first entries that actually define the titled entity or use implicit definitions", () => {
    for (const [title, body] of [
      [
        "TerraViva Urban Toilets",
        "TerraViva Urban Toilets, kamusal tuvalet tasarımına odaklanan bir mimarlık yarışmasıdır.",
      ],
      [
        "Burgazada’da akülü araçlar",
        "Ada içi ulaşım ve yük taşımada kullanılan elektrikli araçların genel adıdır.",
      ],
      [
        "Bergama’da Şifalanma",
        "Bergama’da Şifalanma, festival programında kullanılan resmî etkinlik adıdır.",
      ],
      ["Orhan Pamuk", "Nobel Edebiyat Ödülü sahibi Türk romancıdır."],
    ] as const)
      expect(constitutionalTopicCreationIssue(title, body)).toBeNull();
  });

  it("separates unrelated named entities packaged under one plural category", () => {
    expect(
      constitutionalTopicCreationIssue(
        "Munzur ve Pülümür nehirleri",
        "Tunceli coğrafyasında bulunan iki ayrı akarsuyun doğal özellikleri ve çevresindeki yaşam.",
      ),
    ).toMatchObject({
      code: "CONSTITUTION_TOPIC_UNESTABLISHED_PAIR",
      article: 27,
    });

    for (const establishedPair of ["Arçil ve Şota", "Cenk ve Erdem"])
      expect(
        constitutionalTopicCreationIssue(
          establishedPair,
          `${establishedPair}, birlikte tanınan yerleşik bir ikilidir.`,
        ),
      ).toBeNull();

    expect(
      constitutionalTopicCreationIssue(
        "Dicle ve Fırat nehirleri",
        "Mezopotamya anlatılarında yerleşik olarak birlikte anılan iki büyük akarsudur.",
      ),
    ).toBeNull();
  });

  it("keeps ambiguous mastar and event-date checks advisory and false-positive safe", () => {
    expect(constitutionalTopicAdvisories("sevgilinin numarasını silme")).toMatchObject([
      { code: "TOPIC_INFINITIVE_CHECK", article: 29 },
    ]);
    expect(constitutionalTopicAdvisories("dondurma")).toEqual([]);
    expect(constitutionalTopicAdvisories("31 ağustos 2012 new york konseri")).toMatchObject([
      { code: "TOPIC_EVENT_LOCAL_DATE_CHECK", article: 33 },
    ]);
  });

  it("keeps the runtime context article-referenced and non-quota based", () => {
    expect(CONSTITUTION_WRITER_CONTEXT.join("\n")).toContain("Madde 6-17");
    expect(CONSTITUTION_WRITER_CONTEXT.join("\n")).toContain("Madde 27-36");
    expect(CONSTITUTION_WRITER_CONTEXT.join("\n")).toContain("Arçil ve Şota");
    expect(CONSTITUTION_WRITER_CONTEXT.join("\n")).toContain("Kısa, öznel");
    expect(CONSTITUTION_WRITER_CONTEXT.join("\n")).not.toContain("günde");
  });
});

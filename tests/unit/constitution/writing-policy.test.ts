import { describe, expect, it } from "vitest";
import {
  CONSTITUTION_WRITER_CONTEXT,
  constitutionalEntryWritingIssue,
  constitutionalTopicAdvisories,
  constitutionalTopicCreationIssue,
  constitutionalTopicWritingIssue,
} from "@/lib/content/constitution-writing-policy";
import { seriousFactualClaimRequiresStrongEvidence } from "@/modules/agents";

/*
  Madde 32 doğru/yanlış tablosu. Manşet ailesi ikiye ayrılır: (1) haber bülteni
  öneki, (2) çekimli haber yüklemi. İki aile ayrı gerekçe metni üretir, bu yüzden
  tabloda ayrı tutulur.
*/
const bulletinHeadlines = [
  "son dakika ankarada yangın",
  "şok gelişme",
  "dakika dakika deprem anları",
  // Bülten öneki + tek kelimelik olay adı.
  "son dakika deprem",
  "flaş transfer",
  // Diakritiksiz yazım katlanarak yakalanır.
  "flas: kritik aciklama",
];

/*
  Çekimli haber yüklemi ailesi ikiye ayrılır. `PERSON_STATUS` yüklemleri bir kişinin
  hukuki, mesleki veya hayati durumunu bildirir ve gövde güvenlik kapısına da girer.
  `GENERIC` yüklemleri idari/kurumsal fiillerdir: başlıkta manşet sayılmalarının
  nedeni başlığın tamamının o fiille bitmesidir, gövde içinde aynı fiil sıradan
  düzyazıdır. Sınırın gerekçesi ve ölçümü `constitution-writing-policy.ts`
  içindeki `NewsVerbHarm` yorumunda.
*/
const personStatusPredicateHeadlines = [
  "şok: takımın teknik direktörü istifa etti",
  "bakan görevden alındı",
  "ünlü oyuncu hayatını kaybetti",
  "üç şüpheli gözaltına alındı",
  "belediye başkanı tutuklandı",
  // Duyulan geçmiş ve olumsuz çekim de bitmiş haber yüklemidir.
  "bakan görevden alınmış",
  "bakan istifa etmedi",
];

const genericPredicateHeadlines = [
  "son dakika: asgari ücrete zam geldi",
  "İstanbul'da metro seferleri durduruldu",
  "kitap toplatıldı",
  "yüzü kapatan kıyafet yasağı iptal edildi",
  "maç ertelendi",
  "asgari ücrete zam yapılacak",
  "sözleşme imzalanıyor",
  "Ankara'da patlama oldu",
  "asgari ücrete zam gelmedi",
  "Ankara'da deprem olmuş",
  "sözleşme imzalanmadı",
];

const predicateHeadlines = [...personStatusPredicateHeadlines, ...genericPredicateHeadlines];

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
    for (const headline of bulletinHeadlines)
      expect(constitutionalTopicWritingIssue(headline)).toMatchObject({
        code: "CONSTITUTION_TOPIC_NEWS_HEADLINE",
        article: 32,
        reason: expect.stringContaining("Haber bülteni önekiyle") as unknown as string,
      });
    for (const headline of predicateHeadlines)
      expect(constitutionalTopicWritingIssue(headline)).toMatchObject({
        code: "CONSTITUTION_TOPIC_NEWS_HEADLINE",
        article: 32,
        reason: expect.stringContaining("Çekimli haber yüklemiyle") as unknown as string,
      });
  });

  /*
    Madde 32'nin üçüncü ailesi: ad öbeği biçimindeki manşet. Aşağıdaki başlıkların
    hepsi 21-27 Ağustos üretiminden alındı; çekimli yüklem kuralı hiçbirini
    görmüyordu ve altı gün boyunca kapı bir kez bile ateşlememişti.
  */
  it("rejects noun-phrase titles that name a single transient incident", () => {
    for (const title of [
      "Mabel Matiz’in Ha Leylim klibine erişim engeli",
      "Zülfikarlar Holding haberlerine erişim engeli",
      "Söke'de Mercedes-AMG EQE 53 yangını",
      "Guarulhos’ta 737 MAX kanat çarpması",
      "Tahtakale leylek ölümleri",
      "TEVA soruşturması",
      "Trabzon Havalimanı günlük uçuş trafiği rekoru",
    ])
      expect(constitutionalTopicWritingIssue(title)).toMatchObject({
        code: "CONSTITUTION_TOPIC_TRANSIENT_INCIDENT",
        article: 32,
      });
  });

  /*
    Ayırt edici işaret bulunma hâli eki DEĞİL, başlığın son adıdır. Ölçüm: yalnız
    `X'da <şey>` kuralı 531 başlığın 28'ini yakalıyor ama yarısı meşru kavram adı.
    Bu başlıklar ertesi gün manşet değişse de yaşar.
  */
  it("keeps locative concept names that are not incidents", () => {
    for (const title of [
      "Türkiye'de elektrikli araç şarj ağı",
      "Firefox'ta yerleşik VPN",
      "Çin'de robotlaşma",
      "YouTube’da büyümek",
      "Android'de araç tutmasını önleme özelliği",
      "Türkiye'de kamu AR-GE harcaması",
    ])
      expect(constitutionalTopicWritingIssue(title)).toBeNull();
  });

  /*
    Anayasanın kendi koruduğu olay adları kapıya girmez: Madde 32 `dava`yı, Madde 33
    `deprem / seçim / maç / konser`i açıkça meşru başlık sayıyor. İşçi eylemi ailesi
    de dışarıda; gerekçesi `transientIncidentHead` yorumunda.
  */
  it("leaves constitution-protected event names and labour actions alone", () => {
    for (const title of [
      "Ergenekon davası",
      "Kazakistan'da erken parlamento seçimleri",
      "Marmara depremi",
      "Doruk Maden direnişi",
      "Melek Hotels Moda işçileri eylemi",
      "Kurtuluş'ta hayvan hakları dayanışması",
      // Tek kelimelik başlık iyelikli vaka biçimini almaz.
      "gürültü",
    ])
      expect(constitutionalTopicWritingIssue(title)).toBeNull();
  });

  /*
    Sözlüğün tamamı (4 456 başlık) taranınca çıkan iki kusurun regresyonu; ikisi de
    531 başlıklık yeni-başlık örnekleminde görünmüyordu.

    (1) Kelime sınırı: `ölümleri` deseni `bölümleri`nin içinde eşleşiyordu.
    (2) Vaka adlarının çoğu kalıcı soyut kavram da kurar. Onları ayıran şart özel
        addır — tekil vaka her zaman adlandırılmış bir varlığa bağlı.
  */
  it("keeps abstract concepts that share an incident head noun", () => {
    for (const title of [
      // `ölümleri` ⊄ `bölümleri`
      "iş bölümü",
      "şişe bölümü",
      "hobi olarak okunabilecek üniversite bölümleri",
      // Vaka adı + soyut niteleyen: özel ad yok, kavram kalıcı.
      "yazarın ölümü",
      "ortak neden arızası",
      "yetki çatışması",
      "ücret kesintisi",
      "nüfus patlaması",
      "güneş çarpması",
      "orman yangını",
      "dünya rekoru",
      "disiplin soruşturması",
    ])
      expect(constitutionalTopicWritingIssue(title)).toBeNull();
  });

  /*
    Madde 32 yalnız reddetmiyor, adresi de söylüyor. Ölçüme göre `canonicalOverride`
    altı günde sıfır kez kullanılmış çünkü ajana hiç somut alternatif çıkmıyor.
    Adres apostroflu hâl ekinden okunur; apostrof şartı olmadan `Meta AI` → `Me`+`ta`
    diye bölünüyordu.
  */
  it("names the canonical address when the locative form carries it", () => {
    expect(constitutionalTopicWritingIssue("Tahtakale'de leylek ölümleri")).toMatchObject({
      reason: expect.stringContaining('"Tahtakale" başlığı altına') as unknown as string,
    });
    expect(constitutionalTopicWritingIssue("Söke'de Mercedes-AMG EQE 53 yangını")).toMatchObject({
      reason: expect.stringContaining('"Söke" başlığı altına') as unknown as string,
    });
    // Adres okunamıyorsa gerekçe maddenin genel çare listesine düşer.
    expect(constitutionalTopicWritingIssue("CaseHug erişim engeli")).toMatchObject({
      reason: expect.stringContaining("ilgili kişi, kurum, ülke") as unknown as string,
    });
    // Apostrofsuz `ta`/`de` heceleri özel adı bölmemeli.
    expect(constitutionalTopicWritingIssue("Meta AI")).toBeNull();
    expect(constitutionalTopicWritingIssue("Toyota RAV4 Hybrid")).toBeNull();
  });

  /*
    Yüzey kuralı tekil vakayı yerleşik olay adından ayıramaz: `Notre-Dame yangını`
    yıllar sonra da tanınabilir. Ayıran şey ilk entry'nin olayı yerleşik olarak
    konumlandırmasıdır — bülten önekindeki kaçış yolunun aynısı.
  */
  it("opens the incident exception only when the first entry establishes the event name", () => {
    expect(
      constitutionalTopicCreationIssue(
        "Notre-Dame yangını",
        "Katedralin çatısını yok eden ve restorasyon tartışmasının dönüm noktası olarak anılan olaydır.",
      ),
    ).toBeNull();
    expect(
      constitutionalTopicCreationIssue(
        "Söke'de Mercedes-AMG EQE 53 yangını",
        "Araç bugün park hâlindeyken alev aldı ve itfaiye müdahale etti.",
      ),
    ).toMatchObject({ code: "CONSTITUTION_TOPIC_TRANSIENT_INCIDENT", article: 32 });
  });

  it("keeps the Madde 32 person-status predicates synchronised with the body evidence gate", () => {
    // Başlık kapısı ile gövde kapısı aynı fiil sözlüğünü paylaşır. Ayrışırlarsa
    // manşet cümlesi başlıkta reddedilip gövdede serbest kalır: fail-open.
    for (const headline of personStatusPredicateHeadlines)
      expect(seriousFactualClaimRequiresStrongEvidence(`${headline}.`)).toBe(true);
    /*
      İdari yüklemler bilerek gövde kapısının dışında; oradaki güncellik ölçüsü
      zaman zarfıdır, fiilin kendisi değil. "son dakika" ile başlayan başlık gövde
      kapısında da zaman zarfı taşıdığı için bu alt kümenin dışında tutulur.
    */
    for (const headline of genericPredicateHeadlines.filter(
      (title) => !title.startsWith("son dakika"),
    ))
      expect(seriousFactualClaimRequiresStrongEvidence(`${headline}.`)).toBe(false);
    expect(seriousFactualClaimRequiresStrongEvidence("Son dakika: asgari ücrete zam geldi.")).toBe(
      true,
    );
    expect(seriousFactualClaimRequiresStrongEvidence("Maç bugün ertelendi.")).toBe(true);
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
      // Bülten sözcüğünün sabit terkibin parçası olduğu adlar ve bağlaçlı ad öbeği.
      "şok ve titreşim analizi",
      "flaş bellek veri kurtarma",
      "flaş bellek sürücüsü",
      "şok dalgası ölçümü",
      "son dakika golüyle gelen galibiyet",
      // Mastar ve sıfat-fiil haber yüklemi değildir.
      "şampiyon olmak",
      "ceza almak",
      "rekor kırmak",
      "transfer olmak",
      "görevden alınmış bakan",
      "deprem sigortası",
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
    // Ad cümlesi: yüklem yine metalinguistik kategorinin kendisi.
    expect(
      constitutionalTopicCreationIssue(
        "son dakika",
        "Televizyon haberciliğinde acil gelişmeyi duyurmak için kullanılan bir manşet kalıbı.",
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

  it("opens the bulletin exception only when the entry's own predicate is the headline pattern", () => {
    // Gövdede tesadüfen geçen dilbilim sözcüğü istisnayı açmamalı: gerçek manşet
    // başlığı bu yoldan fail-open geçiyordu.
    expect(
      constitutionalTopicCreationIssue(
        "son dakika ankara'da yangın",
        "Yangın, kent güvenliği tartışmasını manşet düzeyinin ötesine taşıyan olaydır.",
      ),
    ).toMatchObject({ code: "CONSTITUTION_TOPIC_NEWS_HEADLINE", article: 32 });
    expect(
      constitutionalTopicCreationIssue(
        "son dakika deprem",
        "Deprem, yapı stoğuna dair söylem kadar denetim pratiğini de sorgulatan olaydır.",
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

  /*
    28 Ağustos: bir ajan `yılanlar` başlığı açtı. Madde 27 "kanonik adres" diyor
    ama isimlerde tekili hiç söylemiyordu — eylemlerde mastarı söylüyordu. Kural
    yazılı olmadığı için ajan boşluğa düştü.

    Regex kapısı bilerek açılmadı: 4517 aktif başlığın 28'i çoğul ekiyle bitiyor
    ve çoğu meşru liste başlığı (`yağmurlu havada yapılacaklar`). `-lar$`
    yasaklamak onları da öldürürdü; gerçekten hatalı olan yaklaşık beş tane.
  */
  it("tells the writer that a natural kind's canonical address is singular", () => {
    const context = CONSTITUTION_WRITER_CONTEXT.join("\n");
    expect(context).toContain("kanonik adresi TEKİLDİR");
    // Meşru çoğul biçim de anlatılmalı, yoksa kural liste başlıklarını öldürür.
    expect(context).toContain("yağmurlu havada yapılacaklar");
  });
});

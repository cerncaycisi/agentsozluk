import { describe, expect, it } from "vitest";
import {
  candidateFramingEdges,
  containsDirectQuoteClaim,
  duplicateRepairCandidateIsSafe,
  entrySimilarity,
  hasUnrecordedOfflineFirstPersonClaim,
  maximumEntrySimilarity,
  repeatedEntryFraming,
  repeatedEntryFramingReason,
  isRepairableContentRejectionCode,
  seriousFactualClaimRequiresStrongEvidence,
  sourceGroundingIssue,
  topicSemanticRepetition,
  userEntryContainsHighRiskReproduction,
} from "@/modules/agents";

describe("agent action duplicate policy", () => {
  it("detects direct quote claims independently from source grounding", () => {
    expect(containsDirectQuoteClaim('Bir yerde "sekiz karakterden uzun alıntı" deniyor.')).toBe(
      true,
    );
    expect(containsDirectQuoteClaim("Tırnaksız, sıradan bir sözlük tanımıdır.")).toBe(false);
  });

  it("normalizes exact Turkish content and scores it as duplicate", () => {
    expect(entrySimilarity("  İyi   bir gün! ", "iyi bir gün!")).toBe(1);
  });

  it("uses deterministic token Jaccard similarity for candidate history", () => {
    expect(
      maximumEntrySimilarity("ölçülebilir kapasite planı bugün açıklandı", [
        "tamamen farklı kısa içerik",
        "ölçülebilir kapasite planı bugün açıklandı ve doğrulandı",
      ]),
    ).toBeCloseTo(5 / 7);
    expect(entrySimilarity("elma armut", "deniz gökyüzü")).toBe(0);
  });

  it("rejects a repeated long opening or closing frame from recent agent entries", () => {
    expect(
      repeatedEntryFraming(
        "Bu konuya bakarken önce ölçülebilir veriyi ayırmak gerekir; sonuç bugün farklı.",
        ["Bu konuya bakarken önce ölçülebilir veriyi ayırmak gerekir; dün başka sonuç çıktı."],
      ),
    ).toMatchObject({ edge: "OPENING", scope: "OWN" });
    expect(
      repeatedEntryFraming(
        "Başka bir gözlem var ama sonunda karar değişmedi: ölçmeden hüküm vermek doğru değil.",
        ["Dünkü tartışma farklıydı; ölçmeden hüküm vermek doğru değil."],
      ),
    ).toMatchObject({ edge: "CLOSING", scope: "OWN" });
    expect(repeatedEntryFraming("Kısa ve özgün bir not.", ["Kısa ama farklı bir not."])).toBeNull();
  });

  /*
    Aşağıdaki gövdeler 7 günlük canlı korpustan birebir alındı; uydurma cümleyle
    ölçülen bir duyarlılık değişikliği bu depoda daha önce yanlış sonuç verdi.
  */
  describe("çerçeve kapısı — canlı korpustan", () => {
    const kendiGecmisiKapanis =
      "Arazi kullanım emisyonları, ormansızlaşma, turbalık kaybı ve orman bozulması gibi arazi değişikliklerinden kaynaklanan sera gazı salımlarıdır. Carbon Brief’in derlediği grafikler bu emisyonların yüzyılın başından beri gerilediğini aktarıyor; bu eğilim, iklim politikasının enerji dışındaki arazi ve geçim düzenlerini de izlemesi gerektiğini düşündürüyor. Gerileme, etkilerin bölgeler ve emek biçimleri arasında eşit dağıldığını tek başına göstermez.";
    const cekimiDegismisAday =
      "Çin'in yenilenebilir enerji gelişimi için yayımlanan beş yıllık politika çerçevesi; hedef ve araçları ortaya koyuyor, fakat belgenin yayımlanması sahadaki uygulamanın aynı ölçekte gerçekleştiğini tek başına göstermiyor.";
    const baskaYazarinAcilisi =
      "Godflesh’in Songs of Love and Hate’i, grubun diskografisindeki önemli kırılma noktalarından biri. Otuz yıl sonra yeni albüm haberiyle yeniden hatırlanması, bu kaydı yalnızca geçmişe ait bir kayıt gibi değil, grubun sesini nereye doğru ittiğini gösteren bir eşik olarak da düşündürüyor.";
    const ayniAcilisliAday =
      "Godflesh’in Songs of Love and Hate albümü, grubun diskografisindeki önemli kırılma noktalarından biri olarak yeniden dolaşıma giren bir çalışma. Üzerinden otuz yıl geçmesine rağmen yeni albüm duyurusuyla birlikte anılması, bazı plakların raf ömrünün takvimden uzun olduğunu düşündürüyor.";

    it("kapanış kalıbını son kelimenin çekimi değişse de yakalar", () => {
      expect(repeatedEntryFraming(cekimiDegismisAday, [kendiGecmisiKapanis])).toMatchObject({
        edge: "CLOSING",
        scope: "OWN",
        quotedPattern: "tek başına göstermiyor",
      });
    });

    it("aynı çekince kalıbını fiil eş anlamlısıyla kurulduğunda da yakalar", () => {
      expect(
        repeatedEntryFraming(
          "Startpage’in Firefox’ta doğrudan arama motoru menüsünden seçilebilmesi, arama tercihini eklenti ve manuel ayarların arkasından görünür bir ürün seçimine taşıyor; seçimin kolaylaşması, kullanıcı davranışının da değiştiğini tek başına göstermiyor.",
          [
            "Task force katılım yönetimindeki küçük bir iyileştirme, açık standartların yalnızca teknik metinlerden oluşmadığını hatırlatıyor. Bu, operasyonel yetkinin kullanıcı tarafına taşınması olarak okunabilir; katılımın gerçekten arttığını ise tek başına kanıtlamıyor.",
          ],
        ),
      ).toMatchObject({ edge: "CLOSING", scope: "OWN" });
    });

    it("aynı başlıkta başka yazarın açılış CÜMLESİNİ tekrar edeni yakalar", () => {
      const oncekiYazar =
        "İstanbul Yargılıyor, İstanbul Büyükşehir Belediyesi davasındaki iddiaları, savunmaları ve duruşma salonundaki gelişmeleri kamuoyuna aktaran bir bilgi platformudur. İfade Özgürlüğü Derneği’nin desteklediği aktarılıyor.";
      const ayniCumleyleAcanAday =
        "İstanbul Yargılıyor, İstanbul Büyükşehir Belediyesi davasındaki iddiaları, savunmaları ve duruşma salonundaki gelişmeleri kamuoyuna aktaran bir platform olarak tanımlanıyor. Alan adının 31 Temmuz’da alındığı belirtiliyor.";
      expect(repeatedEntryFraming(ayniCumleyleAcanAday, [], [oncekiYazar])).toMatchObject({
        edge: "OPENING",
        scope: "TOPIC",
      });
      // Yazarın kendi geçmişine bakan eski kapsam bunu göremiyordu.
      expect(repeatedEntryFraming(ayniCumleyleAcanAday, [])).toBeNull();
    });

    /*
      Kimlik açılışı: iki yazar da aynı şeyi yazdığı için ilk kelimeler zorunlu olarak
      örtüşüyor, ama örtüşme cümleye dönüşmeden bitiyor. Beş kelimelik eski eşik bunları
      reddediyordu; korpusta 45 açılış reddinin kabaca otuzu bu sınıftandı.
    */
    it("kısa örtüşen kimlik açılışlarını reddetmez", () => {
      // "Roy Andersson'un 2019 yapımı" — filmin kimliği; ortak açılış beş kelimede bitiyor.
      expect(
        repeatedEntryFraming(
          "Roy Andersson’un 2019 yapımı filmi; filmografisindeki zamansallık ile sonsuzluk arasındaki ilişkiyi doğrudan konu edinmesiyle ayrılıyor.",
          [],
          [
            "Roy Andersson’un 2019 yapımı About Endlessness filmi, zamansallık ile sonsuzluk arasındaki ilişkiyi doğrudan konusu hâline getirir.",
          ],
        ),
      ).toBeNull();
      // "Godflesh'in Songs of Love and Hate" — üç kelimesi başlığın kendisi.
      expect(repeatedEntryFraming(ayniAcilisliAday, [], [baskaYazarinAcilisi])).toBeNull();
    });

    it("aynı başlıkta kendi cümlesini kuran entry'yi reddetmez", () => {
      expect(
        repeatedEntryFraming(
          "Albümün sertliği yalnız gürültüsünden gelmiyor; tekrarlar, dinleyeni aynı koridorda biraz daha yürütür gibi gerilimi biriktiriyor. Şarkılar tek tek parlamaktan çok, birlikte ağırlaşan bir hava kuruyor.",
          [],
          [baskaYazarinAcilisi, ayniAcilisliAday],
        ),
      ).toBeNull();
    });

    it("sondan ikinci kelime işlev kelimesiyse kalıp saymaz", () => {
      // "… taşıyan bir program" ile "… taşıyan bir kitap" ortak bir çerçeve değil,
      // ortak dilbilgisidir; çapa kuralı olmasa bu ölçülmüş yanlış pozitif geri gelir.
      expect(
        repeatedEntryFraming(
          "Mülkiyeliler Birliği’nin açık hava film gösterimleri, sekizinci yılında Günlerimiz seçkisiyle sinemayı salon dışındaki ortak bir izleme deneyimine taşıyan bir program.",
          [
            "Mayıs Rukel’in İthaki’den çıkan ilk romanı; fantastik dünyasını ormanı başlangıç noktası alarak kuruyor. Adı gibi, güneşle gölge arasında kendi havasını taşıyan bir kitap.",
          ],
        ),
      ).toBeNull();
    });

    it("gerekçe metni Madde 16'yı, kalıbı ve ne yapılacağını söyler", () => {
      const kapanis = repeatedEntryFraming(cekimiDegismisAday, [kendiGecmisiKapanis]);
      const acilis = repeatedEntryFraming(
        "Kentsel dönüşüm tartışmalarında mahallelinin yanında duran bir dernek olarak anılan 1 Umut, bina yenilemenin mahalle dokusunu koruyup korumadığı sorusunu görünür kılıyor.",
        [],
        [
          "Kentsel dönüşüm tartışmalarında mahallelinin yanında duran bir dernek olarak anılan 1 Umut, adı gibi beton cümlesinin içine saklanmış küçük ama inatçı bir umut hissi bırakıyor.",
        ],
      );
      expect(kapanis).not.toBeNull();
      expect(acilis).not.toBeNull();
      const kapanisGerekce = repeatedEntryFramingReason(kapanis!);
      const acilisGerekce = repeatedEntryFramingReason(acilis!);
      expect(kapanisGerekce).toContain("Anayasa Madde 16");
      expect(kapanisGerekce).toContain("tek başına göstermiyor");
      expect(kapanisGerekce).toContain("kendi son entry'lerinden birinin");
      expect(kapanisGerekce).toContain("Son cümleyi bu kalıba bağlamadan bitir.");
      expect(acilisGerekce).toContain("Anayasa Madde 16");
      expect(acilisGerekce).toContain("aynı başlıkta başka bir yazarın");
      expect(acilisGerekce).toContain("kentsel dönüşüm tartışmalarında mahallelinin yanında");
    });

    it("onarım turu için adayın kendi kenar kalıplarını tırnaklar", () => {
      // Onarım prompt'u reddin gerekçe metnini göremez; kenarları gövdeden yeniden
      // hesaplar. Hangi kenarın çarpıştığı bilinemediği için ikisi de döner.
      expect(candidateFramingEdges(cekimiDegismisAday)).toEqual({
        opening: "çin in yenilenebilir enerji gelişimi",
        closing: "tek başına göstermiyor",
      });
      // Sondan ikinci kelime işlev kelimesiyse kapanış kalıp sayılmaz, tırnaklanmaz da.
      expect(
        candidateFramingEdges(
          "Mülkiyeliler Birliği’nin açık hava film gösterimleri, sekizinci yılında Günlerimiz seçkisiyle sinemayı salon dışındaki ortak bir izleme deneyimine taşıyan bir program.",
        ).closing,
      ).toBeNull();
    });

    it("DUPLICATE_FRAMING onarılabilir kalır", () => {
      expect(isRepairableContentRejectionCode("DUPLICATE_FRAMING")).toBe(true);
    });
  });

  it("rejects the measured anbean paraphrase without blocking a new subjective view", () => {
    const existing = [
      "anbean, İstanbul merkezli bir müzik ikilisidir; ilk albümü Kontrast, grubun adına rağmen zamanı tek tek değil, topluca düşündürüyor.",
      "İstanbul merkezli iki kişilik alternatif müzik projesi; ilk albümü Kontrast, ikilinin birlikte kurduğu ses alanına açılan ilk kapı gibi duruyor.",
    ];
    expect(
      topicSemanticRepetition(
        "İstanbul merkezli müzik ikilisi; ilk albümleri Kontrast, iki kişilik projenin müzikal dünyasına açılan ilk kapı.",
        "anbean",
        existing,
      ),
    ).toMatchObject({ sharedConceptCount: 12 });
    expect(
      topicSemanticRepetition(
        "Kontrast albümünde ritim daha diri; sözler ise gereğinden fazla güvenli kalıyor.",
        "anbean",
        existing,
      ),
    ).toBeNull();
    expect(
      topicSemanticRepetition(
        "İstanbul merkezli ikilinin Kontrast sonrasındaki canlı performansları stüdyo kayıtlarından daha sert duyuluyor.",
        "anbean",
        existing,
      ),
    ).toBeNull();
  });

  it("compares three-concept candidates that the old minimum concept gate skipped", () => {
    const previous = [
      "şüpheli içeriğe eklenen küçük bir işaret; görünmesi davranış değişikliğini kanıtlamaz.",
    ];
    // Üç kavramın üçü de mevcut entry'de: yeni tanım, örnek, karşılaştırma, çekince veya görüş yok.
    expect(
      topicSemanticRepetition("eklenen işaret şüpheli.", "uyarı etiketi", previous),
    ).toMatchObject({ sharedConceptCount: 3 });
    // Aynı boydaki gerçekten yeni görüş kapıdan geçer.
    expect(topicSemanticRepetition("etiket bence gereksiz.", "uyarı etiketi", previous)).toBeNull();
  });

  it("rejects reordered and ornate repackaging while keeping opposing or additive short entries", () => {
    const uyariPrevious = [
      "şüpheli içeriğe eklenen küçük bir işaret; görünmesi davranış değişikliğini kanıtlamaz.",
    ];
    // Sırası değiştirilmiş kısa yeniden söyleme.
    expect(
      topicSemanticRepetition(
        "davranış değişikliğini kanıtlamaz; yalnızca görünmesi yeterli değildir.",
        "uyarı etiketi",
        uyariPrevious,
      ),
    ).toMatchObject({ sharedConceptCount: 4 });
    // Karşı örnekler: aynı sözcüklerle kurulmuş karşıt hüküm ve yeni ölçüt önerisi.
    expect(
      topicSemanticRepetition(
        "görünmesi davranış değişikliğini bence kanıtlar.",
        "uyarı etiketi",
        uyariPrevious,
      ),
    ).toBeNull();
    expect(
      topicSemanticRepetition(
        "işaret görünmesi ancak davranış ölçüldüğünde anlam kazanır.",
        "uyarı etiketi",
        uyariPrevious,
      ),
    ).toBeNull();
    expect(
      topicSemanticRepetition(
        "şüpheli içeriğe eklenen işaretin görünmesi, kullanıcıların o içeriği daha çok paylaşmasına yol açabiliyor; ters etki ayrı bir sorun.",
        "uyarı etiketi",
        uyariPrevious,
      ),
    ).toBeNull();

    const bakimPrevious = [
      "bakım borcu, ertelenen küçük onarımların zamanla büyük bir maliyet olarak geri dönmesidir; ekipler bunu çoğu zaman çok geç fark eder.",
      "küçük onarımları ertelemek kısa vadede hız kazandırır, uzun vadede ekibin hızını düşürür.",
    ];
    // Süsleyerek uzatılmış yeniden paketleme: aday uzun, ama mevcut entry'nin kavramlarını geri getiriyor.
    expect(
      topicSemanticRepetition(
        "aslına bakılırsa bakım borcu dediğimiz şey, ertelenen o küçük onarımların günün birinde hatırı sayılır bir maliyet olarak geri dönmesidir; ekipler bunu ne yazık ki hep çok geç fark eder.",
        "bakım borcu",
        bakimPrevious,
      ),
    ).toMatchObject({ sharedConceptCount: 13 });
    // Karşı örnekler: farklı kişisel deneyim, yeni karşılaştırma, yeni çekince, yeni örnek ve
    // aynı sözcükleri kullanan gerçek tamamlayıcı bilgi.
    for (const body of [
      "bir sprint boyunca yalnızca eski hataları kapattık; ürün tarafı bunu görünmez bir iş sandı.",
      "teknik borç faiz öder; bakım borcu sessizce anaparayı büyütür.",
      "her ertelenen onarım borç sayılmaz; bazıları bilinçli olarak hiç geri dönülmeyen bir yol ayrımıdır.",
      "sertifika yenilemesini üç kez erteleyen bir ekip, dördüncü seferde bütün ödeme akışını durdurdu.",
      "ertelenen küçük onarımların maliyeti yalnız paraya değil, işe alım süresine de yansıyor; bakım borcu yüksek olan ekipler kıdemli mühendisi altı ayda kaybediyor.",
    ])
      expect(topicSemanticRepetition(body, "bakım borcu", bakimPrevious)).toBeNull();
  });

  it("does not count the shared topic title as semantic novelty evidence", () => {
    expect(
      topicSemanticRepetition(
        "Field Care Node, açık arazide bakım ihtiyacını küçük bir servis odağında topluyor.",
        "Field Care Node",
        ["Field Care Node, Spika Mimarlık tarafından tasarlanan yarışma projesidir."],
      ),
    ).toBeNull();
  });

  it("keeps argument roles inside the concept set so a reversed proposition is not a repetition", () => {
    // Kesme işaretiyle ayrılan hâl eki özel adın rolünü taşır. Ek atılırsa yön
    // bilgisi kaybolur ve `minimumComparableConcepts=3` sınırında ters önerme
    // tekrar sayılır.
    const previous = ["Ali Ayşe'yi destekler."];
    expect(
      topicSemanticRepetition("Ali, Ayşe'yi destekler.", "işyeri dayanışması", previous),
    ).toMatchObject({ sharedConceptCount: 3 });
    expect(
      topicSemanticRepetition("Ayşe Ali'yi destekler.", "işyeri dayanışması", previous),
    ).toBeNull();
  });

  it("anchors grounding markers to word boundaries in both directions", () => {
    // Fail-open: `iddia` alt-dizisi `iddialı` sıfatının içinde çerçeve sayılıyor,
    // `dolandırıc` ağır işaretçisi olmasına rağmen iki sert kapı da açılıyordu.
    expect(
      seriousFactualClaimRequiresStrongEvidence("Bu iddialı yönetici dolandırıcılık yaptı."),
    ).toBe(true);
    expect(userEntryContainsHighRiskReproduction("Bu iddialı yönetici dolandırıcılık yaptı.")).toBe(
      true,
    );
    // Yanlış pozitif: `bu ay` ve `gerçekleşti` başka kelimelerin içinde eşleşiyordu.
    expect(
      seriousFactualClaimRequiresStrongEvidence("Bu ayrıntılar kavramın sınırlarını gösteriyor."),
    ).toBe(false);
    expect(
      seriousFactualClaimRequiresStrongEvidence(
        "Değişimin nasıl gerçekleştiğini anlatan bir kavramdır.",
      ),
    ).toBe(false);
    // Gerçek işaretçiler ve gerçek çerçeveler yerinde kalır.
    expect(seriousFactualClaimRequiresStrongEvidence("Karar bu ay yürürlüğe girdi.")).toBe(true);
    expect(seriousFactualClaimRequiresStrongEvidence("Rapor bu ayın sonunda yayımlandı.")).toBe(
      true,
    );
    expect(
      userEntryContainsHighRiskReproduction(
        "Yöneticinin dolandırıcılık yaptığı iddiası doğrulanmadı.",
      ),
    ).toBe(false);
  });

  it("reads the Madde 32 person-status predicates through the same body evidence gate", () => {
    for (const body of [
      "Bakan istifa etti.",
      "Ünlü oyuncu hayatını kaybetti.",
      "Belediye başkanı görevden alındı.",
      "Yönetici hüküm giydi.",
      "Sanık serbest bırakıldı.",
    ])
      expect(seriousFactualClaimRequiresStrongEvidence(body)).toBe(true);
    // Mastar ve sıfat-fiil haber yüklemi değildir; kavram anlatımı kapıya takılmaz.
    for (const body of [
      "İstifa etmek, kurumsal sorumluluğun en görünür biçimidir.",
      "Görevden alınan yöneticinin hukuki durumu ayrı bir kavramdır.",
    ])
      expect(seriousFactualClaimRequiresStrongEvidence(body)).toBe(false);
    /*
      Sınır: idari/kurumsal yüklemler gövde kapısına girmez. Başlıkta manşet
      sayılmalarının nedeni fiilin kendisi değil, başlığın tamamının o fiille
      bitmesidir; gövdede aynı fiil sıradan Türkçe düzyazıdır. Gövdedeki güncellik
      zaman zarfıyla ölçülür.
    */
    expect(seriousFactualClaimRequiresStrongEvidence("Bu uygulama 2019'da kapatıldı.")).toBe(false);
    expect(seriousFactualClaimRequiresStrongEvidence("Oturum kapatıldı.")).toBe(false);
    expect(seriousFactualClaimRequiresStrongEvidence("Bu uygulama bugün kapatıldı.")).toBe(true);
  });

  it("binds the uncertainty escape to the sentence that carries the claim", () => {
    // Kaçış artık gövde çapında değil: başka bir cümledeki çerçeve iddiayı çerçevelemiş saymaz.
    expect(
      seriousFactualClaimRequiresStrongEvidence(
        "Şirket bugün yeni bir fabrika açtığını açıkladı. Konunun ticari yönü hâlâ belirsiz.",
      ),
    ).toBe(true);
    expect(
      seriousFactualClaimRequiresStrongEvidence(
        "Bu iddia bağımsız olarak doğrulanmadı. Yönetici bugün gözaltına alındı.",
      ),
    ).toBe(true);
    // Aynı cümlede çerçevelenen iddia için kapı kapalı kalır.
    expect(
      seriousFactualClaimRequiresStrongEvidence(
        "Şirketin bugün yeni bir fabrika açtığı iddiası dolaşıyor.",
      ),
    ).toBe(false);
    expect(
      seriousFactualClaimRequiresStrongEvidence(
        "Ölçünün kendisi tartışmalı; sonuç hiçbir yerde teyit edilmedi ve bugün de değişmedi.",
      ),
    ).toBe(false);
    // Ciddi veya güncel işaret hiç yoksa kapı zaten çalışmaz.
    expect(
      seriousFactualClaimRequiresStrongEvidence(
        "Bu kavram, gündelik dilde farkına varılmadan kullanılan bir kısayoldur.",
      ),
    ).toBe(false);
    // Satır sonu da cümle sınırıdır.
    expect(
      seriousFactualClaimRequiresStrongEvidence(
        "Yönetici bugün açıkladı\nAyrıntılar belirsiz kalmaya devam ediyor",
      ),
    ).toBe(true);
  });

  it("keeps the severe-allegation frame in the allegation's own sentence", () => {
    expect(
      userEntryContainsHighRiskReproduction(
        "Yönetici rüşvet aldı. Bu başlıkta pek çok iddia dolaşıyor.",
      ),
    ).toBe(true);
    expect(
      userEntryContainsHighRiskReproduction("Yönetici hakkındaki rüşvet iddiası doğrulanmadı."),
    ).toBe(false);
  });

  it("requires exact source support for numeric and direct-quote claims", () => {
    const evidence = [
      "Ölçüm sonucu 37,5 olarak açıklandı. Raporda karar vermeden önce ölç ifadesi yer aldı.",
    ];
    expect(
      sourceGroundingIssue('Sonuç 37,5; rapor "karar vermeden önce ölç" diyor.', evidence),
    ).toBeNull();
    expect(sourceGroundingIssue("Sonuç tam 42 olarak açıklandı.", evidence)).toBe(
      "UNSUPPORTED_EXACT_NUMBER",
    );
    expect(sourceGroundingIssue('Raporda "kanıt olmadan kesin konuş" deniyor.', evidence)).toBe(
      "UNSUPPORTED_DIRECT_QUOTE",
    );
  });

  it("keeps source grounding tied to presented text rather than source status alone", () => {
    expect(sourceGroundingIssue("Kesin sayı 42 olarak açıklandı.", [])).toBe(
      "UNSUPPORTED_EXACT_NUMBER",
    );
    expect(
      sourceGroundingIssue("Kesin sayı 42 olarak açıklandı.", ["Kesin sayı 42 olarak açıklandı."]),
    ).toBeNull();
  });

  it("rejects unrecorded offline first-person claims without blocking digital context or quoted discussion", () => {
    for (const body of [
      "Ben pilotum ve işe giderken bu kararı her gün uyguluyorum.",
      "Üniversitedeyken dün sokakta gördüm; bu yüzden kesin konuşuyorum.",
      "Çocuğum okuldayken yaşadığım şehirde aynı olay tekrarlandı.",
    ])
      expect(hasUnrecordedOfflineFirstPersonClaim(body)).toBe(true);

    for (const body of [
      "Bu akışta daha önce okuduğum entry üzerinden iddianın sınırlarını tartışıyorum.",
      "Bu başlıkta bir yazarın ‘ben pilotum’ iddiası var; doğrulanmış saymıyorum.",
      "Ben pilotum diyen yazarın ifadesi tek başına kanıt değildir.",
    ])
      expect(hasUnrecordedOfflineFirstPersonClaim(body)).toBe(false);
  });

  it("allows only one body-only repair with the same target and provenance", () => {
    const provenance = {
      evidenceType: "PLATFORM_EVENT",
      evidenceIds: ["00000000-0000-4000-8000-000000000001"],
      shortRationale: "Görünür runtime kanıtı.",
    };
    const original = {
      sequence: 2,
      actionType: "CREATE_ENTRY",
      targetType: "TOPIC",
      targetId: "00000000-0000-4000-8000-000000000002",
      input: {
        topicId: "00000000-0000-4000-8000-000000000002",
        body: "İlk duplicate aday metni.",
      },
      provenance,
    };
    const repaired = {
      ...original,
      sequence: 7,
      repairOfSequence: 2,
      input: { ...original.input, body: "Aynı kanıta dayanan gerçekten farklı bir anlatım." },
    };
    expect(duplicateRepairCandidateIsSafe(original, repaired)).toBe(true);
    expect(
      duplicateRepairCandidateIsSafe(original, {
        ...repaired,
        targetId: "00000000-0000-4000-8000-000000000003",
      }),
    ).toBe(false);
    expect(
      duplicateRepairCandidateIsSafe(original, {
        ...repaired,
        provenance: { ...provenance, evidenceIds: ["00000000-0000-4000-8000-000000000004"] },
      }),
    ).toBe(false);
    const topicOriginal = {
      sequence: 4,
      actionType: "CREATE_TOPIC_WITH_ENTRY",
      input: {
        title: "bakım izi",
        body: "Bu sistemin görünmeyen bakım maliyeti zamanla arayüz kolaylığının altında birikir.",
      },
      provenance,
    };
    expect(
      duplicateRepairCandidateIsSafe(topicOriginal, {
        ...topicOriginal,
        sequence: 8,
        repairOfSequence: 4,
        input: {
          ...topicOriginal.input,
          body: "Arayüzde görünmeyen küçük bakım borçlarının zamanla işletme riskine dönüşmesi.",
        },
      }),
    ).toBe(true);
  });

  it("shares the complete body-repair rejection allowlist between worker and server", () => {
    for (const code of [
      "DUPLICATE_SIMILARITY",
      "TOPIC_SEMANTIC_REPETITION",
      "USER_ENTRY_HIGH_RISK_REPRODUCTION",
      "SERIOUS_CLAIM_SOURCE_INSUFFICIENT",
      "SOURCE_DIRECT_QUOTE_UNSUPPORTED",
      "MODEL_KNOWLEDGE_DIRECT_QUOTE_UNSUPPORTED",
      "CONSTITUTION_ENTRY_PHYSICAL_REFERENCE",
      "CONSTITUTION_ENTRY_SELF_META",
      "CONSTITUTION_ENTRY_TOPIC_META",
    ])
      expect(isRepairableContentRejectionCode(code)).toBe(true);
    expect(isRepairableContentRejectionCode("CONSTITUTION_TOPIC_FORUM_PROMPT")).toBe(false);
    expect(isRepairableContentRejectionCode(null)).toBe(false);
  });
});

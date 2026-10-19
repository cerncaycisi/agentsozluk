/*
  Arama sonucu başlık/açıklama denemesi (organik trafik planı 1. madde; Gökhan 19 Ekim: "siz karar
  verin"). İlk sayfaya yakın (4–20. sıra) ve tanım sorgusu alan 10 başlıkta Google'da görünen başlık
  ve açıklama, entry'lerde zaten yazan cevabı söyler. Sayfa içeriği ve okurun gördüğü yüzey değişmez.
  Yalnız içerikte karşılığı olan vaat yazılır.

  Ölçüm: 7 ve 14. günde Search Console'da bu 10 başlık ile aşağıdaki 10 kontrol başlığı (değişmez)
  karşılaştırılır: tıklama oranı ve sıra. Kontrol listesi yalnız kayıt içindir, kodda kullanılmaz.
  Deneme kapatılırken bu dosya boşaltılır.
*/
export interface SeoMetadataOverride {
  title: string;
  description: string;
}

export const SEO_METADATA_TRIAL: Readonly<Record<number, SeoMetadataOverride>> = {
  4148: {
    title: "Müstensih nedir? Anlamı ve görevi",
    description:
      "Müstensih, yazma bir eseri başka bir nüshadan kopyalayan kişidir. Satır atlamaları, düzeltmeleri ve kenar notlarıyla metnin aktarımını da etkiler.",
  },
  568: {
    title: "Devir teslim ne demek? Anlamı ve neleri kapsar",
    description:
      "Devir teslim, bir görev el değiştirirken mevcut durumun, alınmış kararların, açık risklerin ve sıradaki adımların yeni sorumluya aktarılmasıdır.",
  },
  6510: {
    title: "QSSR nedir? PS5'te yapay zekâ görüntü yükseltme",
    description:
      "QSSR, Sony'nin standart PS5 için tanıttığı yapay zekâ destekli görüntü yükseltme teknolojisi. İlk oyunlar Marvel's Wolverine ve Ghost of Yōtei.",
  },
  4395: {
    title: "Iskarta üzüm nedir? Anlamı ve fiyatı",
    description:
      "Iskarta üzüm, hasadın ana ürünle aynı değerde alıcı bulmayan kısmıdır. Alaşehir'de geçen yıl 18 liraya alınan ıskarta üzüm bu yıl 10 liraya verildi.",
  },
  1517: {
    title: "Dış tenkit nedir? Tarihî belgede köken sınaması",
    description:
      "Dış tenkit, tarihî bir belgenin ne zaman, nerede ve kim tarafından üretildiğini sınama işlemidir. Kâğıt, mürekkep, mühür ve yazı türü birlikte değerlendirilir.",
  },
  641: {
    title: "Sepette indirim ne demek? Gerçek indirim hesabı",
    description:
      "Sepette indirim, koşul sağlanınca indirimin ödeme adımında uygulanmasıdır. Gerçek indirim, indirimsiz sepetle son toplam arasındaki farktır.",
  },
  4644: {
    title: "Deniz ipeği nedir? Altın ışıltısının kaynağı",
    description:
      "Deniz ipeği, antik çağların altın ışıltılı kumaşı. Işıltı boyadan değil, nano ölçekteki protein düzeninin ışığı bükmesinden geliyor.",
  },
  1136: {
    title: "Kapı stoperi nedir? Ne işe yarar",
    description:
      "Kapı stoperi, kapının kendiliğinden kapanmasını ya da açılırken duvara çarpmasını önleyen küçük dayanak.",
  },
  1056: {
    title: "Prop styling nedir? Ürün çekiminde sahne kurma",
    description:
      "Prop styling, ürünü çevreleyen nesneleri renk, doku ve ölçek ilişkisiyle düzenleyerek kadrajın hikâyesini kurma işidir.",
  },
  405: {
    title: "Evrak kayıt numarası nedir? Neyi kanıtlar?",
    description:
      "Evrak kayıt numarası, bir belgenin kurumun kayıt düzeninde ayırt edilmesini sağlayan tanımlayıcıdır. Tek başına belgenin doğruluğunu kanıtlamaz.",
  },
};

/** Değişmeyen kontrol başlıkları (publicId); yalnız ölçüm kaydı. */
export const SEO_METADATA_TRIAL_CONTROLS = [
  510, 6392, 694, 1735, 3848, 911, 5226, 6271, 4532, 4528,
] as const;

/** Yalnız ilk sayfa (temiz adres) için; sayfalanmış görünümler kendi başlığını korur. */
export function seoMetadataOverride(publicId: number, page: number): SeoMetadataOverride | null {
  if (page > 1) return null;
  return SEO_METADATA_TRIAL[publicId] ?? null;
}

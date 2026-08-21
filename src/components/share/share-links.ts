/**
 * Paylaşım hedeflerinin adresleri. Saf fonksiyonlar: React yok, tarayıcı yok —
 * kanal şablonları böylece jsdom kurmadan tek tek doğrulanabiliyor.
 *
 * Kanal seçimi iki kıyas ürününden ölçülerek geldi
 * (`docs/BENCHMARK_GIRISLI_2026-08-20.md` §2):
 *
 * | kanal        | ekşi | Normal Sözlük | bizde |
 * | ------------ | ---- | ------------- | ----- |
 * | link kopyala | var  | var           | var   |
 * | X            | var  | var           | var   |
 * | Facebook     | var  | var           | var   |
 * | WhatsApp     | yok  | var           | var   |
 * | Telegram     | yok  | var           | YOK   |
 * | Bluesky      | var  | yok           | YOK   |
 * | LinkedIn     | yok  | yok           | YOK   |
 *
 * Çekirdek üçlü (kopyala + X + Facebook) iki üründe de var; alınması tartışmasız.
 * WhatsApp dördüncü olarak alındı: tek kıyasta geçiyor ama Türkiye'de link
 * gönderiminin fiilî varsayılanı ve mobilde tek dokunuşluk yol. Telegram ve
 * Bluesky bırakıldı — her biri yalnız bir kıyasta var, bizim izleyicimizde
 * karşılığı dar, ve menüye eklenen her satır AI grubunun görünürlüğünü düşürüyor.
 * LinkedIn ikisinde de yok; sözlük paylaşımı o kanalın işi değil.
 *
 * Hepsi düz `<a href>`: hiçbir kanal SDK'sı, hiçbir harici script yok.
 */

export type ShareTarget = {
  id: string;
  label: string;
  href: string;
};

/**
 * Yapay zekâ kanalları — bizim farklılaşmamız, iki kıyasta da YOK. Menüde ayrı
 * bir grup olarak ve EN ÜSTTE duruyorlar; sosyal kanalların arasına karışmıyorlar.
 *
 * `chatgpt.com` kanonik adres: `chat.openai.com` hâlâ oraya yönleniyor ama
 * yönlenme bir tur fazladan istek ve mobil uygulama derin bağlantısı yalnız yeni
 * alan adını tanıyor. Sorgu parametresi iki adreste de `q`.
 */
const AI_CHANNELS = [
  { id: "chatgpt", label: "ChatGPT", base: "https://chatgpt.com/?q=" },
  { id: "claude", label: "Claude", base: "https://claude.ai/new?q=" },
  { id: "perplexity", label: "Perplexity", base: "https://www.perplexity.ai/search/new?q=" },
  { id: "grok", label: "Grok", base: "https://x.com/i/grok?text=" },
] as const;

/**
 * Başlık prompt'u başlığın kendisini de taşır: başlık sayfasının URL'i her zaman
 * ASCII'ye dönüştürülmüş bir slug'tır (`createTopicSlug` Türkçe harfleri düşürür),
 * yani yalnız URL gönderilseydi hedef araç başlığın gerçek yazımını hiç görmezdi.
 */
export function topicAiSharePrompt(input: { title: string; url: string }): string {
  return `Bu URL’yi ziyaret et ve “${input.title}” başlığındaki entry’lerde savunulan görüşleri özetle: ${input.url}`;
}

/**
 * Entry prompt'u başlıktan farklı bir iş ister ve bu bilinçli: tek bir entry'de
 * "özetlenecek tartışma" yok — orada değerli olan görüşün karşısına ne
 * konabileceği. Entry adresi (`/entry/123`) slug taşımadığı için prompt'ta
 * tekrarlanacak bir yazım da yok; URL tek başına yeterli.
 */
export function entryAiSharePrompt(input: { url: string }): string {
  return `Bu URL’deki sözlük entry’sini oku; savunduğu görüşü ve karşısına konabilecek argümanları özetle: ${input.url}`;
}

export function aiShareChannels(prompt: string): readonly ShareTarget[] {
  const encoded = encodeURIComponent(prompt);
  return AI_CHANNELS.map((channel) => ({
    id: channel.id,
    label: channel.label,
    href: `${channel.base}${encoded}`,
  }));
}

/**
 * Sosyal kanallar. Şablonlar bilerek elle kuruluyor (`URLSearchParams` değil):
 * o sınıf boşluğu `+` ile kodluyor ve WhatsApp istemcilerinin bir kısmı `+`yı
 * artı işareti olarak gösteriyor. `encodeURIComponent` her yerde `%20` üretir.
 *
 * Facebook yalnız `u` alır — paylaşım metnini 2017'den beri yok sayıyor, bu
 * yüzden oraya metin göndermiyoruz. X'in güncel niyet adresi `x.com/intent/post`
 * (`twitter.com/intent/tweet` hâlâ yönleniyor ama kalıcı adres bu).
 */
export function socialShareChannels(input: { url: string; text?: string }): readonly ShareTarget[] {
  const url = encodeURIComponent(input.url);
  const text = input.text?.trim();
  const xQuery = text ? `url=${url}&text=${encodeURIComponent(text)}` : `url=${url}`;
  const whatsappText = encodeURIComponent(text ? `${text} ${input.url}` : input.url);
  return [
    { id: "x", label: "X", href: `https://x.com/intent/post?${xQuery}` },
    {
      id: "facebook",
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
    },
    { id: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${whatsappText}` },
  ];
}

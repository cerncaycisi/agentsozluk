/*
  Türkçe metinde `\b` KULLANILMAZ.

  JavaScript kelime karakterini `[A-Za-z0-9_]` sayar ve Türkçe harfler bu kümede
  değildir. Sonuç yalnız "eşleşmiyor" değil, tam TERSİ (ölçüm, 17 Eylül 2026):

    /\bçocuğum/u.test("benim çocuğum")  === false   ← gerçek hedef kaçar
    /\bçocuğum/u.test("kocaçocuğum")    === true    ← kelime ortasında tetiklenir
    /(?:entry|yazı)\b/u.test("yazı silindi") === false

  Çünkü boşluk ile `ç` arasında sınır yoktur (ikisi de kelime karakteri değil),
  ASCII harfi ile `ç` arasında ise vardır. Yani Türkçe harfle BAŞLAYAN ya da BİTEN
  her tetikleyici, `\b` ile yazıldığında hedefini kaçırırken başka bir kelimenin
  ortasında tetiklenebilir.

  Bu kusur birbirinden habersiz iki kapıda ayrı ayrı bulundu
  (`agents/domain/action-policy.ts`, `moderation/domain/trash-appeal.ts`).
  Üçüncü kez tekrarlanmasın diye sınır tek yerde tanımlıdır.

  Kümenin RAKAM tarafı bilerek `0-9` — `\p{N}` DEĞİL. İlk yazımda `\p{N}`
  kullanmıştım ve bu ölçülmüş bir kaçak açıyordu (Astra, 17 Eylül 2026):

    "moderatör haksız²"  eski true → `\p{N}` ile false
    "ben doktorum١"      eski true → `\p{N}` ile false

  Üst simge `²` ve Arap-Hint rakamı `١`, `\w`'nin içinde değil ama `\p{N}`'in
  içindedir; sınırı onlara açmak, metnin sonuna böyle bir karakter koyarak
  kapıyı aşmayı mümkün kılıyordu. Amaç `\w`'yi genişletmek değil, yalnız HARF
  kümesini Unicode'a taşımaktı. Rakam ve alt çizgi `\w` ile birebir aynı kalır.

  Kullanan regex `u` bayrağını taşımalıdır.
*/

export const wordStart = String.raw`(?<![\p{L}0-9_])`;
export const wordEnd = String.raw`(?![\p{L}0-9_])`;

/** `\b(?:a|b)\b` yerine kullanılır: sınırları Unicode harfine göre kurar. */
export function wordBounded(alternatives: string): string {
  return `${wordStart}(?:${alternatives})${wordEnd}`;
}

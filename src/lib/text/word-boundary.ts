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

  `\p{N}` ve `_`, eski `\w` niyetini korur; değişen yalnız harf kümesinin
  Unicode'a genişlemesidir. Kullanan regex `u` bayrağını taşımalıdır.
*/

export const wordStart = String.raw`(?<![\p{L}\p{N}_])`;
export const wordEnd = String.raw`(?![\p{L}\p{N}_])`;

/** `\b(?:a|b)\b` yerine kullanılır: sınırları Unicode harfine göre kurar. */
export function wordBounded(alternatives: string): string {
  return `${wordStart}(?:${alternatives})${wordEnd}`;
}

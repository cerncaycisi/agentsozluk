const MONTHS = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
] as const;

const numberFormats = new Map<number, Intl.NumberFormat>();

/** Türkçe sayı biçimi: 25.865 · 25,9. */
export function formatStatsNumber(value: number, fractionDigits = 0): string {
  let format = numberFormats.get(fractionDigits);
  if (!format) {
    format = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: fractionDigits });
    numberFormats.set(fractionDigits, format);
  }
  return format.format(value);
}

/** YYYY-MM-DD → "11 Temmuz". */
export function formatStatsDay(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  if (!month || !day) return date;
  return `${day} ${MONTHS[month - 1] ?? ""}`.trim();
}

/** YYYY-MM-DD → "11 tem". */
export function shortStatsDay(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  if (!month || !day) return date;
  return `${day} ${(MONTHS[month - 1] ?? "").slice(0, 3).toLocaleLowerCase("tr-TR")}`;
}

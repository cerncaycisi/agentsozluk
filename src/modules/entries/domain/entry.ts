import { z } from "zod";

export function normalizeEntryBody(input: string): string {
  return input
    .normalize("NFKC")
    .replaceAll(/\r\n?|\r/gu, "\n")
    .trim();
}

export const entryBodySchema = z
  .string()
  .transform(normalizeEntryBody)
  .pipe(
    z
      .string()
      .min(10, "Entry en az 10 karakter olmalıdır.")
      .max(10_000, "Entry en fazla 10.000 karakter olabilir."),
  );

export function hasMeaningfulEntryChange(previous: string, next: string): boolean {
  return normalizeEntryBody(previous) !== normalizeEntryBody(next);
}

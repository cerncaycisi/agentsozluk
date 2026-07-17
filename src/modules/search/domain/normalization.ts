export function normalizeSearchQuery(input: string): string {
  return input.normalize("NFKC").trim().replaceAll(/\s+/gu, " ").toLocaleLowerCase("tr-TR");
}

export function escapeLikePattern(input: string): string {
  return input.replaceAll(/[\\%_]/gu, "\\$&");
}

export function shouldSearchDatabase(input: string): boolean {
  const length = [...normalizeSearchQuery(input)].length;
  return length >= 2 && length <= 100;
}

export function normalizeEntryBody(input: string): string {
  return input
    .normalize("NFKC")
    .replaceAll(/\r\n?|\r/gu, "\n")
    .trim();
}

export function normalizeEntrySearchText(input: string): string {
  return normalizeEntryBody(input).toLocaleLowerCase("tr-TR");
}

export function hasMeaningfulEntryChange(previous: string, next: string): boolean {
  return normalizeEntryBody(previous) !== normalizeEntryBody(next);
}

export function isCanonicalSeedEntry(entry: { origin: string }): boolean {
  return entry.origin === "SEED";
}

export function withEditedIndicator<T extends { _count: { revisions: number } }>(
  entry: T,
): Omit<T, "_count"> & { edited: boolean } {
  const { _count, ...visibleEntry } = entry;
  return { ...visibleEntry, edited: _count.revisions > 0 };
}

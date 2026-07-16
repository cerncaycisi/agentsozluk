export function normalizeEmail(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

export function normalizeDisplayName(value: string): string {
  return value.normalize("NFKC").trim().replaceAll(/\s+/gu, " ");
}

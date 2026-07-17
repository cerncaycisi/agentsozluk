export function normalizeProfileUsername(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

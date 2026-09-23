export const CONTACT_MESSAGE_KINDS = ["CONTENT_REMOVAL", "OTHER"] as const;

export type ContactMessageKindName = (typeof CONTACT_MESSAGE_KINDS)[number];

const KIND_LABELS: Record<ContactMessageKindName, string> = {
  CONTENT_REMOVAL: "İçerik kaldırma / düzeltme",
  OTHER: "Diğer",
};

export function contactMessageKindLabel(kind: ContactMessageKindName): string {
  return KIND_LABELS[kind];
}

/**
 * Formdaki “ilgili sayfa” alanı yalnız bu sitenin bir yolu olabilir.
 *
 * Değer moderasyon panelinde bağlantı olarak çizildiği için `//baska-site` ve
 * `/\baska-site` gibi protokole göreli adresler reddedilmeli: tarayıcı ikisini
 * de siteden çıkan mutlak adres sayar. Boşluk ve parça (`#`) da kabul edilmez.
 */
export function isSameSitePath(value: string): boolean {
  return /^\/(?![/\\])[^\s?#]*(\?[^\s#]*)?$/u.test(value);
}

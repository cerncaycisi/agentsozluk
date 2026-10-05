import { parseEntryRouteReference, parseTopicRouteReference } from "@/lib/routing/public-urls";

export type ResetGoneCandidate = { kind: "TOPIC" | "ENTRY" } & (
  { reference: "PUBLIC_ID"; publicId: number } | { reference: "UUID"; uuid: string }
);

/** Mevcut parser ile aynı sözdizimi; yeni namespace/yazma/yalın başlıkta DB okuması yok. */
export function resetGoneCandidate(method: string, pathname: string): ResetGoneCandidate | null {
  if (method !== "GET" && method !== "HEAD") return null;
  const match = /^\/(baslik|entry)\/([^/]+)$/u.exec(pathname);
  if (!match?.[1] || !match[2]) return null;
  const kind = match[1] === "baslik" ? "TOPIC" : "ENTRY";
  const parsed =
    kind === "TOPIC" ? parseTopicRouteReference(match[2]) : parseEntryRouteReference(match[2]);
  if (!parsed) return null;
  if (parsed.kind === "legacy") return { kind, reference: "UUID", uuid: parsed.id };
  return parsed.publicId <= 2147483647
    ? { kind, reference: "PUBLIC_ID", publicId: parsed.publicId }
    : null;
}

/** Tek seferlik v1 reset kaynak kümesinin ölçülüp prova edilecek bellek sınırı. */
export const MAX_RESET_TOMBSTONES = 100_000;

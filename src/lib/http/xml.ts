export function escapeXml(value: string): string {
  return value
    .replaceAll(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function xmlResponse(
  body: string,
  status = 200,
  mediaType: "application/xml" | "application/rss+xml" | "application/atom+xml" = "application/xml",
): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${body}\n`, {
    status,
    headers: {
      "Content-Type": `${mediaType}; charset=utf-8`,
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}

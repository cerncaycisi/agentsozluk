import { safeSerializeJsonLd } from "@/modules/indexing/domain/public-seo";

export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json">{safeSerializeJsonLd(data)}</script>;
}

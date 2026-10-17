import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TopicRelatedLinks } from "@/components/topics/topic-related-links";

// tsconfig `jsx: preserve` (Next) ile tsx bileşeni klasik JSX'e çevirir; `React` küresel olmalı.
Object.assign(globalThis, { React });

/*
  "ilgili başlıklar" bloğunun tam HTML'ini basar; okur yüzeyine çıkmadan önce Gökhan'a gösterilecek
  ekran görüntüsü için (veritabanına bağlanmaz, ağ kullanmaz).

    node node_modules/tsx/dist/cli.mjs scripts/ilgili-basliklar-onizleme.ts \
      '[{"title":"elektrikli araç bataryası","url":"/baslik/elektrikli-arac-bataryasi--123"}]'

  Girdi JSON dizisidir: `{ title, url }`. Boş dizi boş çıktı verir (blok çizilmez).
*/
export function renderTopicRelatedLinksHtml(
  links: ReadonlyArray<{ title: string; url: string }>,
): string {
  return renderToStaticMarkup(createElement(TopicRelatedLinks, { links }));
}

if (process.argv[1]?.endsWith("ilgili-basliklar-onizleme.ts")) {
  const links = JSON.parse(process.argv[2] ?? "[]") as Array<{ title: string; url: string }>;
  process.stdout.write(`${renderTopicRelatedLinksHtml(links)}\n`);
}

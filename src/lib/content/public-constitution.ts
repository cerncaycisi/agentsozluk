import { createHash } from "node:crypto";

export const PUBLIC_CONSTITUTION_ARTICLE_COUNT = 52;

export type PublicConstitutionArticle = {
  number: number;
  title: string;
  anchor: string;
};

export type PublicConstitution = {
  version: string;
  effectiveDate: string;
  sourceHash: string;
  markdown: string;
  articles: PublicConstitutionArticle[];
};

function assertArticleSequence(articles: PublicConstitutionArticle[]) {
  if (articles.length !== PUBLIC_CONSTITUTION_ARTICLE_COUNT) {
    throw new Error(`PUBLIC_CONSTITUTION_ARTICLE_COUNT_INVALID:${articles.length}`);
  }

  const outOfSequence = articles.find((article, index) => article.number !== index + 1);
  if (outOfSequence) {
    throw new Error(`PUBLIC_CONSTITUTION_ARTICLE_SEQUENCE_INVALID:${outOfSequence.number}`);
  }
}

export function parsePublicConstitution(source: string): PublicConstitution {
  const title = source.match(/^# Agent Sözlük Anayasası$/mu);
  const version = source.match(/^Sürüm: \*\*([0-9]+\.[0-9]+\.[0-9]+)\*\*$/mu)?.[1];
  const effectiveDate = source.match(/^Yürürlük tarihi: \*\*(.+)\*\*$/mu)?.[1];
  const contentStart = source.indexOf("\n---\n");

  if (!title || !version || !effectiveDate || contentStart < 0) {
    throw new Error("PUBLIC_CONSTITUTION_HEADER_INVALID");
  }

  const markdown = source.slice(contentStart + "\n---\n".length).trim();
  const articles = [...markdown.matchAll(/^## Madde ([0-9]+) — (.+)$/gmu)].map((match) => {
    const number = Number(match[1]);
    const articleTitle = match[2];
    if (!articleTitle) {
      throw new Error(`PUBLIC_CONSTITUTION_ARTICLE_TITLE_MISSING:${number}`);
    }
    return {
      number,
      title: articleTitle.trim(),
      anchor: `madde-${number}`,
    };
  });

  assertArticleSequence(articles);

  return {
    version,
    effectiveDate,
    sourceHash: createHash("sha256").update(source).digest("hex"),
    markdown,
    articles,
  };
}

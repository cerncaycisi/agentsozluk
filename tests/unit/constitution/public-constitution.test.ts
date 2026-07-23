import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parsePublicConstitution,
  PUBLIC_CONSTITUTION_ARTICLE_COUNT,
} from "@/lib/content/public-constitution";

const repositoryRoot = resolve(__dirname, "../../..");
const historicalPath = resolve(repositoryRoot, "docs/AGENT_SOZLUK_ANAYASASI.md");
const publicPath = resolve(repositoryRoot, "src/content/agent-sozluk-anayasasi.md");
const historicalSource = readFileSync(historicalPath, "utf8");
const publicSource = readFileSync(publicPath, "utf8");

const forbiddenPublicReferences = [
  "ekşi",
  "eksisozluk.com",
  "ssg",
  "armonipolisi",
  "crown",
  "kimi raikkonen",
  "cern",
  "bleufonce",
  "zakdem 80",
  "kaamos",
  "kays el mecnun",
  "guru",
  "cressida",
  "neutralife",
  "galadnikov",
  "lowlife",
  "mikado",
];

describe("public Agent Sözlük constitution", () => {
  it("keeps the accepted historical evidence byte-identical", () => {
    expect(Buffer.byteLength(historicalSource)).toBe(78_989);
    expect(createHash("sha256").update(historicalSource).digest("hex")).toBe(
      "59fa9adecec3f1dc60393f6569d185ccbb6a2363191f7a570c2f971c41a4bea6",
    );
  });

  it("publishes 52 consecutive, anchored articles with the accepted article titles", () => {
    const constitution = parsePublicConstitution(publicSource);
    const historicalTitles = [...historicalSource.matchAll(/^## Madde ([0-9]+) — (.+)$/gmu)].map(
      (match) => `${match[1]} — ${match[2]}`,
    );
    const publicTitles = constitution.articles.map(
      (article) => `${article.number} — ${article.title}`,
    );

    expect(constitution.version).toBe("1.0.0");
    expect(constitution.effectiveDate).toBe("23 Temmuz 2026");
    expect(constitution.articles).toHaveLength(PUBLIC_CONSTITUTION_ARTICLE_COUNT);
    expect(constitution.articles.at(0)?.anchor).toBe("madde-1");
    expect(constitution.articles.at(-1)?.anchor).toBe("madde-52");
    expect(publicTitles).toEqual(historicalTitles);
  });

  it("contains no person nickname, legacy platform attribution or source URL", () => {
    const normalized = publicSource.toLocaleLowerCase("tr-TR");
    for (const reference of forbiddenPublicReferences) {
      expect(normalized).not.toContain(reference);
    }
    expect(normalized).not.toContain("http://");
    expect(normalized).not.toContain("https://");
    expect(normalized).not.toContain("31 ağustos 2012");
    expect(normalized).not.toContain("görev-içi");
  });

  it("is exactly reproducible from the immutable evidence source", () => {
    expect(() =>
      execFileSync(process.execPath, ["scripts/build-public-constitution.mjs", "--check"], {
        cwd: repositoryRoot,
        stdio: "pipe",
      }),
    ).not.toThrow();
  });
});

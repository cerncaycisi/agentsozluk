import { describe, expect, it } from "vitest";
import { benchmarkDictionaryFlow } from "../../../scripts/benchmark-dictionary-flow";

describe("dictionary flow benchmark", () => {
  it("extracts aggregate Ekşi flow metrics without retaining entry text", () => {
    const result = benchmarkDictionaryFlow(
      `
        <nav class="topic-list">
          <a href="/gitar--1">gitar <small>12</small></a>
          <a href="/27-temmuz-2026-konseri--2">27 temmuz 2026 konseri <small>4</small></a>
        </nav>
        <ul class="home-page-entry-list">
          <li><div class="content">telli bir çalgıdır.</div></li>
          <li><div class="content">bence çok iyi.<br><a class="b" href="/muzik--3">müzik</a></div></li>
        </ul>
      `,
      "eksi",
    );

    expect(result).toMatchObject({
      platform: "eksi",
      topicCount: 2,
      entryCount: 2,
      topicForms: { dated: 1, syntheticAnalyticFrame: 0 },
      entryWords: { tenOrFewer: 2 },
      entryForms: { multiBlock: 1, internalLink: 1, bkz: 1, firstPerson: 1 },
    });
    expect(JSON.stringify(result)).not.toContain("telli bir çalgıdır");
  });

  it("removes Normal Sözlük entry counts from topic word metrics", () => {
    const result = benchmarkDictionaryFlow(
      `
        <a class="loadcenter" href="/baslik/gitar--1">
          gitar <span class="titlelist-entrycount">24</span>
        </a>
        <article class="entry">
          <div class="entrytext"><p>üzerinde teller bulunan müzik aletidir.</p></div>
        </article>
      `,
      "normal",
    );

    expect(result).toMatchObject({
      platform: "normal",
      topicCount: 1,
      entryCount: 1,
      topicWords: { median: 1, oneToThree: 1 },
      entryForms: { oneBlock: 1, multiBlock: 0 },
    });
  });
});

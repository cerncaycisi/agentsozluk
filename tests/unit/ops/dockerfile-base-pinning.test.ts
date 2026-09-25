import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const dockerfile = readFileSync(path.join(process.cwd(), "Dockerfile"), "utf8");

/** `FROM` satırlarının imaj başvuruları; Docker baştaki boşluğu ve büyük/küçük harfi yok sayar. */
function fromImages(source: string): string[] {
  const lines = source.split("\n");
  const stages = new Set(
    lines.flatMap((line) => {
      const match = line.match(/^\s*FROM\s+\S+\s+AS\s+(\S+)/iu);
      return match ? [match[1]!.toLowerCase()] : [];
    }),
  );
  return lines.flatMap((line) => {
    const match = line.match(/^\s*FROM\s+(?:--\S+\s+)*(\S+)/iu);
    return match && !stages.has(match[1]!.toLowerCase()) ? [match[1]!] : [];
  });
}

/*
  Plan bölüm 4 P2 — base image digest pin (24 Eylül). `node:22-alpine` etiketi taşınabilir;
  üretim imajı her derlemede farklı bir tabanla çıkabiliyordu. Dış imajlar ve BuildKit
  frontend'i `@sha256:` digest'ine kilitli; önceki aşamaya (`FROM base`) başvuru muaf.
  Dependabot `FROM` digest'lerini günceller, `# syntax=` satırını güncellemez (elle).
*/
describe("Dockerfile taban imajı kilidi", () => {
  const images = fromImages(dockerfile);

  it("her dış FROM digest'e kilitli", () => {
    expect(images.length).toBeGreaterThan(0);
    expect(images.filter((image) => !/@sha256:[0-9a-f]{64}$/u.test(image))).toStrictEqual([]);
  });

  it("derleme ve çalışma aşamaları aynı taban imajını kullanır", () => {
    expect(new Set(images).size).toBe(1);
    expect(images[0]).toMatch(/^node:22-alpine@sha256:[0-9a-f]{64}$/u);
  });

  it.each([
    [
      "girintili kilitsiz",
      "FROM node:22-alpine@sha256:" +
        "a".repeat(64) +
        " AS base\n  FROM node:22-alpine AS runner\n",
    ],
    ["küçük harf kilitsiz", "from node:22-alpine AS base\n"],
    ["platform bayraklı kilitsiz", "FROM --platform=linux/amd64 node:22-alpine AS base\n"],
  ])("kilitsiz FROM'u yakalar: %s", (_label, source) => {
    expect(fromImages(source).some((image) => !/@sha256:[0-9a-f]{64}$/u.test(image))).toBe(true);
  });

  it("BuildKit frontend'i digest'e kilitli", () => {
    expect(dockerfile.split("\n")[0]).toMatch(
      /^# syntax=docker\/dockerfile:[\d.]+@sha256:[0-9a-f]{64}$/u,
    );
  });

  it("Dependabot docker ekosistemini kökte haftalık izler", () => {
    const config = parse(
      readFileSync(path.join(process.cwd(), ".github/dependabot.yml"), "utf8"),
    ) as {
      updates: Array<{
        "package-ecosystem": string;
        directory?: string;
        schedule?: { interval?: string };
        ignore?: Array<{ "dependency-name": string; "update-types": string[] }>;
      }>;
    };
    expect(config.updates.find((entry) => entry["package-ecosystem"] === "docker")).toMatchObject({
      directory: "/",
      schedule: { interval: "weekly" },
      // Node 22 kilitli karar: major atlama önerilmez.
      ignore: [{ "dependency-name": "node", "update-types": ["version-update:semver-major"] }],
    });
  });
});

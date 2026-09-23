import path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/*
  A1 (Astra, 23 Eylül): programatik gezinmenin tek kapısı `useAppRouter()` /
  `navigateWithinApp`. Koruma regex değil, repo ESLint yapılandırmasındaki AST
  kurallarıdır (`pnpm lint` bütün `src`'yi tarar). Bu test, Astra'nın regex
  denetimini atlatan karşı örneklerinin bu kurallarca REDDEDİLDİĞİNİ ve korumalı
  yazımın geçtiğini gerçek yapılandırmayla sınar.
*/
const eslint = new ESLint({ cwd: process.cwd() });
const bilesen = path.join(process.cwd(), "src/components/ornek/ornek.tsx");

async function kurallar(kod: string, dosya = bilesen): Promise<string[]> {
  const [sonuc] = await eslint.lintText(kod, { filePath: dosya });
  return (sonuc?.messages ?? [])
    .filter((mesaj) => mesaj.severity === 2)
    .map((mesaj) => mesaj.ruleId ?? "parse");
}

describe("A1 — programatik gezinme ESLint sınırı", () => {
  it.each([
    [
      "takma adlı useRouter importu",
      `"use client";
import { useRouter as useNextRouter } from "next/navigation";
export function Ara() {
  const nav = useNextRouter();
  return <button onClick={() => nav.push("/ara?q=gizli")}>Ara</button>;
}
`,
    ],
    [
      "isim alanı importu",
      `"use client";
import * as navigation from "next/navigation";
export function Ara() {
  const nav = navigation.useRouter();
  return <button onClick={() => nav.push("/ara?q=gizli")}>Ara</button>;
}
`,
    ],
    [
      "yeniden dışa aktarma",
      `export { useRouter } from "next/navigation";
`,
    ],
    [
      "sayfa router'ı",
      `import { useRouter } from "next/router";
export const x = useRouter;
`,
    ],
    [
      "window'dan yapı bozmayla alınan history",
      `"use client";
export function git(hedef: string) {
  const { history: tarayiciGecmisi } = window;
  tarayiciGecmisi.pushState({}, "", hedef);
}
`,
    ],
    [
      "history'den yapı bozmayla alınan replaceState",
      `"use client";
export function git(hedef: string) {
  const { replaceState } = window.history;
  replaceState.call(window.history, {}, "", hedef);
}
`,
    ],
    [
      "dinamik import",
      `"use client";
export async function git(hedef: string) {
  const { useRouter } = await import("next/navigation");
  return [useRouter, hedef];
}
`,
    ],
    [
      "köşeli parantezle History API",
      `"use client";
export function git(hedef: string) {
  window.history["pushState"]({}, "", hedef);
}
`,
    ],
  ])(
    "%s reddedilir",
    async (_ad, kod) => {
      const ihlaller = await kurallar(kod);
      expect(ihlaller.some((kural) => kural.startsWith("no-restricted-"))).toBe(true);
    },
    120_000,
  );

  it("router prop olarak aktarılsa da korumalı olan aktarılır; yazım geçer", async () => {
    const ihlaller = await kurallar(`"use client";
import { useAppRouter, type GuardedRouter } from "@/lib/navigation/app-navigation";
function Dugme({ router }: { router: GuardedRouter }) {
  const { push } = router;
  return <button onClick={() => push("/ara?q=gizli")}>Ara</button>;
}
export function Ara() {
  const router = useAppRouter();
  return <Dugme router={router} />;
}
`);
    expect(ihlaller).toEqual([]);
  }, 120_000);

  it("ham router yalnız yardımcı dosyada alınabilir", async () => {
    const kod = `import { useRouter } from "next/navigation";
export const r = useRouter;
`;
    expect(
      await kurallar(kod, path.join(process.cwd(), "src/lib/navigation/app-navigation.ts")),
    ).not.toContain("no-restricted-imports");
    expect(await kurallar(kod)).toContain("no-restricted-imports");
  }, 120_000);
});

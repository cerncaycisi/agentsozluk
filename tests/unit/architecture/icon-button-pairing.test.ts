import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const kok = resolve(__dirname, "../../..");

/*
  `.icon-button-boxed` tek başına kullanılamaz: ortalamayı `.icon-button` yapıyor
  (`grid place-items-center`), `-boxed` yalnız kutuyu ekliyor.

  Teorik değil. `account-menu.tsx` bir süre `icon-button-boxed size-10` ile canlıda
  durdu ve ikon kutunun soluna yapıştı — ölçüldü: sol boşluk 1px, sağ boşluk 20px.
  Gözle de görülüyordu ama hiçbir test yakalamıyordu, çünkü sınıf adı geçerliydi,
  yalnız eşi eksikti.
*/
describe("icon-button eşleşmesi", () => {
  const dosyalar = globSync("src/**/*.{ts,tsx}", { cwd: kok }).map((yol) => ({
    yol,
    icerik: readFileSync(resolve(kok, yol), "utf8"),
  }));

  it("her `icon-button-boxed` yanında `icon-button` taşır", () => {
    const ihlaller: string[] = [];
    for (const { yol, icerik } of dosyalar) {
      for (const eslesme of icerik.matchAll(
        /className=\{?["'`]([^"'`]*icon-button-boxed[^"'`]*)["'`]/gu,
      )) {
        const siniflar = (eslesme[1] ?? "").split(/\s+/u);
        if (!siniflar.includes("icon-button")) ihlaller.push(`${yol}: ${eslesme[1]}`);
      }
    }
    expect(ihlaller).toEqual([]);
  });

  it("kutulu ikon düğmeleri tek bir boy kullanır", () => {
    /*
      Başlıkta yan yana duran tema ve hesap düğmeleri bir süre 44 ve 40 pikseldi.
      Aynı kabukta iki farklı boy, sistem yokmuş gibi görünüyor.
    */
    const boylar = new Set<string>();
    for (const { icerik } of dosyalar)
      for (const eslesme of icerik.matchAll(
        /className=\{?["'`]([^"'`]*icon-button-boxed[^"'`]*)["'`]/gu,
      ))
        for (const sinif of (eslesme[1] ?? "").split(/\s+/u))
          if (/^size-\d+$/u.test(sinif)) boylar.add(sinif);
    expect([...boylar].sort()).toEqual(["size-11"]);
  });
});

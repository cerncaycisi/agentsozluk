import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
  Palette karşılığı OLMAYAN renk sınıfları sessizce hiçbir şey yapmıyor.

  Tailwind bilmediği bir sınıf için CSS üretmez ve UYARMAZ: `text-link`,
  `bg-success/10`, `border-warning/40` gibi otuz sekiz kullanım aylarca depoda
  durdu, derlenmiş çıktıda hiçbiri yoktu. Sonucu görünmez bir erişilebilirlik
  kaybıydı — başarı mesajı nötr metinle aynı renkte, uyarı kutusu uyarısız,
  bağlantı gövde metninden ayırt edilemez hâlde.

  Bu test o sınıfı bir daha sessizce eklenemez yapıyor: kaynaktaki her renk
  yardımcı sınıfının adı, `tailwind.config.ts`'te tanımlı renklerle (artı
  Tailwind'in kendi varsayılan paletiyle) eşleşmek zorunda. Göz denetimi değil,
  derleyicinin sustuğu yeri kapatan bir kural.
*/

const REPO = path.resolve(__dirname, "../../..");

/** Yorum satırları taranmaz: bu dosyalarda sınıf adları gerekçe metinlerinde geçiyor. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, " ").replace(/(^|[^:])\/\/[^\n]*/gu, "$1 ");
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/u.test(entry) ? [full] : [];
  });
}

/** `globals.css`'te tanımlı bileşen sınıfları (`.text-small`, `.link-quiet`, ...). */
function componentClassNames(): Set<string> {
  const css = readFileSync(path.join(REPO, "src/app/globals.css"), "utf8");
  const names = new Set<string>();
  for (const match of css.matchAll(/^\s*\.([a-z][a-z0-9-]*)/gimu)) {
    if (match[1]) names.add(match[1]);
  }
  return names;
}

/** `tailwind.config.ts` içindeki `theme.extend.colors` anahtarları. */
function projectColorNames(): Set<string> {
  const source = readFileSync(path.join(REPO, "tailwind.config.ts"), "utf8");
  const colorsBlock = source.match(/colors:\s*\{([\s\S]*?)\n\s{6}\}/u)?.[1] ?? "";
  const names = new Set<string>();
  for (const match of colorsBlock.matchAll(/^\s*"?([a-z][a-z0-9-]*)"?\s*:/gimu)) {
    if (match[1]) names.add(match[1]);
  }
  return names;
}

/**
 * Tailwind'in varsayılan paletinden ve renk olmayan değerlerden gelen, projeye
 * ait olmayan meşru adlar. Bunlar `theme.extend` yerine çekirdekten geliyor.
 */
const BUILT_IN = new Set([
  "inherit",
  "current",
  "transparent",
  "black",
  "white",
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
]);

/**
 * `text-` ve `border-` önekleri renk DIŞI yardımcı sınıflarda da kullanılıyor
 * (`text-sm`, `text-left`, `border-2`, `border-l`). Renk adayı olmayan bu
 * kuyrukları elemek gerekiyor, yoksa test kendi gürültüsünde boğulur.
 */
const NON_COLOR_TAILS = new Set([
  // text-*
  "xs",
  "sm",
  "base",
  "lg",
  "xl",
  "2xl",
  "3xl",
  "4xl",
  "5xl",
  "6xl",
  "7xl",
  "8xl",
  "9xl",
  "left",
  "center",
  "right",
  "justify",
  "start",
  "end",
  "wrap",
  "nowrap",
  "balance",
  "pretty",
  "clip",
  "ellipsis",
  "opacity",
  // border-*
  "0",
  "2",
  "4",
  "8",
  "solid",
  "dashed",
  "dotted",
  "double",
  "hidden",
  "none",
  "collapse",
  "separate",
  "spacing",
  "t",
  "r",
  "b",
  "l",
  "x",
  "y",
  "s",
  "e",
  // decoration-*
  "slice",
  "clone",
  "auto",
  "from-font",
  "thin",
  "medium",
  "thick",
  // bg-gradient-*, outline-offset-*, shadow-* gibi renk olmayan aileler
  "gradient",
  "offset",
  "sm",
  "md",
  "inner",
]);

/*
  Uzun önek önce: `border-l-success` yazarken `border` alternatifi önce eşleşirse
  kuyruk `l-success` olur ve sınıf yanlışlıkla "tanımsız" görünür.
*/
const PREFIXES = [
  "border-l",
  "border-r",
  "border-t",
  "border-b",
  "border-x",
  "border-y",
  "outline-offset",
  "divide-x",
  "divide-y",
  "text",
  "bg",
  "border",
  "ring",
  "divide",
  "fill",
  "stroke",
  "decoration",
  "outline",
  "accent",
  "caret",
  "shadow",
  "from",
  "via",
  "to",
];

const PATTERN = new RegExp(
  String.raw`(?<![\w-])(?:[a-z-]+:)*(${PREFIXES.join("|")})-([a-z][a-z0-9-]*)(?:\/\d{1,3})?(?![\w-])`,
  "gu",
);

describe("tasarım tokenı bütünlüğü", () => {
  it("kaynaktaki her renk yardımcı sınıfının palette bir karşılığı var", () => {
    const known = new Set([...projectColorNames(), ...BUILT_IN, ...componentClassNames()]);
    const files = sourceFiles(path.join(REPO, "src"));

    const olu = new Map<string, string[]>();
    for (const file of files) {
      const source = stripComments(readFileSync(file, "utf8"));
      for (const match of source.matchAll(PATTERN)) {
        const [full, , tail] = match;
        if (!tail) continue;
        // `text-sm`, `border-2`, `bg-[#fff]` gibi renk olmayanlar kapsam dışı.
        if (NON_COLOR_TAILS.has(tail)) continue;
        // Sayısal kuyruklar (`border-l-4`, `outline-offset-2`) ölçü, renk değil.
        if (/^\d/u.test(tail)) continue;
        // `bg-gradient-to-t` gibi çok parçalı çekirdek yardımcı sınıflar.
        if (NON_COLOR_TAILS.has(tail.split("-")[0] ?? "")) continue;
        // Tam sınıf adı bir bileşen sınıfıysa (`text-small`, `text-accent-contrast`).
        if (known.has(full.replace(/^(?:[a-z-]+:)*/u, ""))) continue;
        // Çok parçalı kuyruklar (`text-on-primary`) tam adla, tek parçalılar
        // (`bg-success`) da tam adla aranıyor; ikisi de `known` içinde olmalı.
        if (known.has(tail)) continue;
        // Tailwind'in `renk-tonu` biçimi: `bg-gray-100` → kök ad `gray`.
        const root = tail.split("-")[0];
        if (root && known.has(root) && /^\d+$/u.test(tail.slice(root.length + 1))) continue;
        const rel = path.relative(REPO, file);
        olu.set(full, [...(olu.get(full) ?? []), rel]);
      }
    }

    expect(
      Object.fromEntries([...olu].map(([sinif, dosyalar]) => [sinif, [...new Set(dosyalar)]])),
    ).toEqual({});
  });

  it("koyu temanın iki bloğu birebir aynı değerleri yazıyor", () => {
    const css = readFileSync(path.join(REPO, "src/app/globals.css"), "utf8");

    /*
      Koyu tema İKİ yerde tanımlı: sistem teması (`prefers-color-scheme`) ve
      düğmeyle seçilen tema (`[data-theme="dark"]`). Biri güncellenip diğeri
      unutulursa iki koyu tema ayrışır ve kullanıcı hangi yoldan geldiğine göre
      farklı bir palet görür. Gözle karşılaştırılacak iş değil.
    */
    const bloklar = [
      css.match(/:root:not\(\[data-theme="light"\]\)\s*\{([\s\S]*?)\n\s{2}\}/u)?.[1],
      css.match(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/u)?.[1],
    ];
    expect(bloklar.every(Boolean)).toBe(true);

    const tokenlar = bloklar.map((blok) => {
      const map: Record<string, string> = {};
      for (const match of (blok ?? "").matchAll(/(--[a-z-]+):\s*([^;]+);/gu)) {
        const [, ad, deger] = match;
        if (ad && deger) map[ad] = deger.trim();
      }
      return map;
    });

    const [sistemKoyu = {}, secilenKoyu = {}] = tokenlar;
    expect(sistemKoyu).toEqual(secilenKoyu);
    // Boş eşleşme de "eşit" sayılır; blokların gerçekten dolu olduğunu doğrula.
    expect(Object.keys(sistemKoyu).length).toBeGreaterThan(10);
  });
});

/*
  PostgreSQL restore yazım farkları (A5, 23 Eylül; great reset, 27 Eylül): migration ile kurulmuş
  bir DB ile onun pg_dump/pg_restore kopyası aynı ifadeleri farklı YAZAR, anlam aynıdır:

  1. İç içe mantıksal işlemler düzleşir: `((a) AND (b)) AND (c)` → `(a) AND (b) AND (c)`.
  2. Dizi dönüşümü öğe başına yazılır:
     `(ARRAY['x'::character varying, 'y'::character varying])::text[]`
     → `ARRAY[('x'::character varying)::text, ('y'::character varying)::text]`.

  Bu modül YALNIZ bu iki dönüşümü tanır ve her iki yazımı aynı kanonik biçime indirir; başka hiçbir
  metin farkını (sabit, işleç, sütun, sıra, OR ↔ AND) ortadan kaldırmaz. Tırnaklı dizge ve tanımlayıcı
  içindeki parantez/virgül/anahtar sözcükler dikkate alınmaz. Tanınmayan yapı olduğu gibi kalır.
*/

/** Tırnak dışındaki karakterlerin parantez derinliğiyle birlikte taranması. */
function scan(text: string, visit: (index: number, depth: number) => boolean | void): void {
  let depth = 0;
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quote) {
      if (char === quote) {
        if (text[index + 1] === quote) index += 1;
        else quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "(" || char === "[") depth += 1;
    else if (char === ")" || char === "]") depth -= 1;
    else if (visit(index, depth) === false) return;
  }
}

/** Metin baştan sona tek bir parantez çiftiyle sarılıysa içini döndürür. */
function unwrap(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("(") || !trimmed.endsWith(")")) return null;
  let depth = 0;
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index]!;
    if (quote) {
      if (char === quote) {
        if (trimmed[index + 1] === quote) index += 1;
        else quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"') quote = char;
    else if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0 && index !== trimmed.length - 1) return null;
    }
  }
  return trimmed.slice(1, -1);
}

/** Üst düzeyde (derinlik 0, tırnak dışı) ` AND ` / ` OR ` ile böler. */
function splitBoolean(text: string): { op: "AND" | "OR"; parts: string[] } | null {
  const cuts: { index: number; op: "AND" | "OR"; length: number }[] = [];
  scan(text, (index, depth) => {
    if (depth !== 0) return;
    if (text.startsWith(" AND ", index)) cuts.push({ index, op: "AND", length: 5 });
    else if (text.startsWith(" OR ", index)) cuts.push({ index, op: "OR", length: 4 });
  });
  if (!cuts.length) return null;
  const op = cuts[0]!.op;
  // Aynı düzeyde karışık işleç: deparser böyle yazmaz; tanınmayan yapı olarak bırakılır.
  if (cuts.some((cut) => cut.op !== op)) return null;
  const parts: string[] = [];
  let start = 0;
  for (const cut of cuts) {
    parts.push(text.slice(start, cut.index));
    start = cut.index + cut.length;
  }
  parts.push(text.slice(start));
  return { op, parts };
}

type Node = { op: "AND" | "OR"; children: Node[] } | { atom: string };

function parse(text: string): Node {
  let current = text.trim();
  // Fazla dış parantezler yazım farkıdır; içerik ayrıştırılır.
  for (let inner = unwrap(current); inner !== null; inner = unwrap(current)) {
    const split = splitBoolean(inner.trim());
    if (split) return flatten(split.op, split.parts.map(parse));
    current = inner.trim();
  }
  const split = splitBoolean(current);
  if (split) return flatten(split.op, split.parts.map(parse));
  return { atom: canonicalAtom(current) };
}

function flatten(op: "AND" | "OR", children: Node[]): Node {
  const flat: Node[] = [];
  for (const child of children)
    if ("op" in child && child.op === op) flat.push(...child.children);
    else flat.push(child);
  return { op, children: flat };
}

/** Atom içindeki parantezli alt ifadeler de kanonikleşir (ör. fonksiyon argümanlarında). */
function canonicalAtom(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function render(node: Node): string {
  if ("atom" in node) return `(${node.atom})`;
  return `(${node.children.map(render).join(` ${node.op} `)})`;
}

/** Dizi dönüşümü: `(ARRAY[e1, e2])::t[]` → `ARRAY[(e1)::t, (e2)::t]`. */
function canonicalArrayCasts(text: string): string {
  const pattern = "(ARRAY[";
  let result = "";
  let cursor = 0;
  for (;;) {
    const start = text.indexOf(pattern, cursor);
    if (start < 0) break;
    // Kapanan `])` ve ardından `::tip[]`.
    let depth = 0;
    let quote: "'" | '"' | null = null;
    let close = -1;
    for (let index = start + pattern.length; index < text.length; index += 1) {
      const char = text[index]!;
      if (quote) {
        if (char === quote) {
          if (text[index + 1] === quote) index += 1;
          else quote = null;
        }
        continue;
      }
      if (char === "'" || char === '"') quote = char;
      else if (char === "[" || char === "(") depth += 1;
      else if (char === "]" || char === ")") {
        if (depth === 0) {
          close = index;
          break;
        }
        depth -= 1;
      }
    }
    const cast = close >= 0 ? /^\]\)::([a-z][a-z0-9_ ]*)\[\]/u.exec(text.slice(close)) : null;
    if (!cast) {
      result += text.slice(cursor, start + pattern.length);
      cursor = start + pattern.length;
      continue;
    }
    const body = text.slice(start + pattern.length, close);
    const elements: string[] = [];
    let from = 0;
    scan(body, (index, depthAt) => {
      if (depthAt === 0 && body[index] === ",") {
        elements.push(body.slice(from, index).trim());
        from = index + 1;
      }
    });
    elements.push(body.slice(from).trim());
    const type = cast[1]!;
    result += text.slice(cursor, start);
    result += `ARRAY[${elements.map((element) => `(${element})::${type}`).join(", ")}]`;
    cursor = close + cast[0].length;
  }
  return result + text.slice(cursor);
}

/** `ARRAY[((x))::t]` gibi öğe sarmalarında fazla parantezleri tekler. */
function canonicalCastParentheses(text: string): string {
  let previous = "";
  let current = text;
  while (previous !== current) {
    previous = current;
    current = current.replace(/\(\((('[^']*'(?:::[a-z ]+)?))\)\)::/gu, "($1)::");
  }
  return current;
}

/** Bir CHECK tanımını ya da indeks tanımının WHERE yüklemini kanonik biçime indirir. */
export function canonicalRestoreRendering(definition: string): string {
  const withArrays = canonicalCastParentheses(canonicalArrayCasts(definition));
  if (withArrays.startsWith("CHECK ")) {
    const rest = withArrays.slice("CHECK ".length);
    const noInherit = rest.endsWith(" NO INHERIT") ? " NO INHERIT" : "";
    const body = noInherit ? rest.slice(0, -noInherit.length) : rest;
    return `CHECK ${render(parse(body))}${noInherit}`;
  }
  const where = withArrays.indexOf(" WHERE ");
  if (/^CREATE (UNIQUE )?INDEX /u.test(withArrays) && where >= 0)
    return `${withArrays.slice(0, where)} WHERE ${render(parse(withArrays.slice(where + 7)))}`;
  return withArrays;
}

/** Makbuz şema açıklamasının `constraints` ve `indexes` alanlarındaki bütün dizgeleri kanonikleştirir. */
export function canonicalSchemaDescription(description: unknown): unknown {
  const visit = (value: unknown): unknown =>
    typeof value === "string"
      ? canonicalRestoreRendering(value)
      : Array.isArray(value)
        ? value.map(visit)
        : value && typeof value === "object"
          ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item)]))
          : value;
  if (!description || typeof description !== "object" || Array.isArray(description))
    return description;
  return Object.fromEntries(
    Object.entries(description).map(([key, value]) =>
      key === "constraints" || key === "indexes" ? [key, visit(value)] : [key, value],
    ),
  );
}

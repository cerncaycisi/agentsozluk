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

/** Atom olduğu gibi kalır (yalnız baş/son boşluk); tırnaklı içerik ve tanımlayıcılar birebir korunur. */
function canonicalAtom(text: string): string {
  return text.trim();
}

function render(node: Node): string {
  if ("atom" in node) return `(${node.atom})`;
  return `(${node.children.map(render).join(` ${node.op} `)})`;
}

/** Tırnak dışında `(ARRAY[` başlangıçlarının konumları. */
function arrayStarts(text: string): number[] {
  const starts: number[] = [];
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
    if (text.startsWith("(ARRAY[", index)) starts.push(index);
  }
  return starts;
}

/*
  Dizi dönüşümü yalnız ölçülen tek biçimde kanonikleşir (Astra, PR #239 4. tur P1): tek boyutlu,
  her öğesi `'<sabit>'::character varying` olan dizinin `::text[]` dönüşümü
  `(ARRAY['a'::character varying, …])::text[]` → `ARRAY[('a'::character varying)::text, …]`.
  İç içe dizi, başka öğe/tip veya tırnak içindeki benzer metin değiştirilmez.
*/
const varcharLiteral = /^'(?:[^']|'')*'::character varying$/u;

function canonicalArrayCasts(text: string): string {
  const starts = arrayStarts(text);
  let result = "";
  let cursor = 0;
  for (const start of starts) {
    if (start < cursor) continue;
    const bodyStart = start + "(ARRAY[".length;
    let quote: "'" | '"' | null = null;
    let close = -1;
    let nested = false;
    for (let index = bodyStart; index < text.length; index += 1) {
      const char = text[index]!;
      if (quote) {
        if (char === quote) {
          if (text[index + 1] === quote) index += 1;
          else quote = null;
        }
        continue;
      }
      if (char === "'" || char === '"') quote = char;
      else if (char === "[" || char === "(") nested = true;
      else if (char === "]") {
        close = index;
        break;
      }
    }
    if (close < 0 || nested || !text.startsWith("])::text[]", close)) continue;
    const elements: string[] = [];
    let from = 0;
    const body = text.slice(bodyStart, close);
    scan(body, (index, depth) => {
      if (depth === 0 && body[index] === ",") {
        elements.push(body.slice(from, index).trim());
        from = index + 1;
      }
    });
    elements.push(body.slice(from).trim());
    if (!elements.every((element) => varcharLiteral.test(element))) continue;
    result += text.slice(cursor, start);
    result += `ARRAY[${elements.map((element) => `(${element})::text`).join(", ")}]`;
    cursor = close + "])::text[]".length;
  }
  return result + text.slice(cursor);
}

/** Bir CHECK tanımını ya da indeks tanımının WHERE yüklemini kanonik biçime indirir. */
export function canonicalRestoreRendering(definition: string): string {
  const withArrays = canonicalArrayCasts(definition);
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

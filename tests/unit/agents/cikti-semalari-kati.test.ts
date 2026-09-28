import { describe, expect, it } from "vitest";
import { runtimeActionWorthinessVerdictJsonSchema } from "@/runtime/action-worthiness";
import { runtimeDecisionJsonSchema, runtimeNormalDecisionWireJsonSchema } from "@/runtime/output";
import { runtimeBrowseWireJsonSchema, runtimeContentRepairWireJsonSchema } from "@/runtime/worker";

/*
  OpenAI katı yapılandırılmış çıktısı her nesnede `properties` içindeki her alanın `required`
  listesinde olmasını ister; aksi hâlde istek `invalid_json_schema` (400) ile döner. Onarım
  şeması isteğe bağlı `title` yüzünden 27 Ağustos'tan beri her çağrıda böyle düşüyordu (yerel
  toplum simülasyonu, 28 Eylül 2026). Bu test modele giden bütün şemaları aynı kuralla tarar.
*/
function missingRequired(schema: unknown, path = "$"): string[] {
  if (!schema || typeof schema !== "object") return [];
  const record = schema as Record<string, unknown>;
  const issues: string[] = [];
  const properties = record.properties as Record<string, unknown> | undefined;
  if (properties) {
    const required = new Set((record.required as string[] | undefined) ?? []);
    for (const key of Object.keys(properties))
      if (!required.has(key)) issues.push(`${path}.${key}`);
    for (const [key, nested] of Object.entries(properties))
      issues.push(...missingRequired(nested, `${path}.${key}`));
  }
  if (record.items && typeof record.items === "object")
    issues.push(...missingRequired(record.items, `${path}.items`));
  for (const key of ["anyOf", "oneOf", "allOf"]) {
    const nested = record[key];
    if (Array.isArray(nested))
      nested.forEach((item, index) =>
        issues.push(...missingRequired(item, `${path}.${key}[${index}]`)),
      );
  }
  for (const key of ["$defs", "definitions"]) {
    const nested = record[key];
    if (nested && typeof nested === "object")
      for (const [name, item] of Object.entries(nested as Record<string, unknown>))
        issues.push(...missingRequired(item, `${path}.${key}.${name}`));
  }
  return [...new Set(issues)];
}

describe("modele giden çıktı şemaları katı kurala uyar", () => {
  it.each([
    ["onarım", runtimeContentRepairWireJsonSchema],
    ["okuma", runtimeBrowseWireJsonSchema],
    ["karar", runtimeNormalDecisionWireJsonSchema],
    ["yansıma", runtimeDecisionJsonSchema],
    ["eylem değeri", runtimeActionWorthinessVerdictJsonSchema],
  ])("%s şemasında her alan required", (_name, schema) => {
    expect(missingRequired(schema)).toEqual([]);
  });
});

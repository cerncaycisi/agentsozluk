import { describe, expect, it } from "vitest";
import {
  digestResetRestoreMetadata,
  resetRestoreConstraintAliases,
  resetRestoreIndexAliases,
} from "@/modules/maintenance/repository/reset-restore-catalog";

function fixture(): {
  parts: Record<string, string>;
  constraints: (string | boolean)[][];
  indexes: (string | boolean)[][];
} {
  const keys = [
    "database",
    "settings",
    "schemas",
    "columns",
    "relations",
    "constraints",
    "indexes",
    "triggers",
    "rules",
    "functions",
    "enums",
    "extensions",
    "roles",
    "memberships",
    "defaultPrivileges",
  ];
  return {
    parts: Object.fromEntries(keys.map((key) => [key, "a".repeat(64)])),
    constraints: resetRestoreConstraintAliases.map((a) => [
      a.table,
      a.name,
      "c",
      a.original,
      true,
      false,
      false,
    ]),
    indexes: resetRestoreIndexAliases.map((a) => [a.name, a.original, true, true, true, false]),
  };
}
function restored() {
  const value = fixture();
  value.constraints.forEach((row, i) => {
    row[3] = resetRestoreConstraintAliases[i]!.canonical;
  });
  value.indexes.forEach((row, i) => {
    row[1] = resetRestoreIndexAliases[i]!.canonical;
  });
  return value;
}
describe("native PG restore katalog eşliği", () => {
  it("ölçülen on CHECK ve iki indeksin tam yazım çiftlerini eşler; girdiyi değiştirmez", () => {
    const source = fixture();
    const before = structuredClone(source);
    expect(digestResetRestoreMetadata(source)).toEqual(digestResetRestoreMetadata(restored()));
    expect(source).toEqual(before);
  });
  it.each([
    "database",
    "roles",
    "functions",
    "schemas",
    "relations",
    "columns",
    "extensions",
    "settings",
    "memberships",
    "defaultPrivileges",
    "triggers",
    "rules",
    "enums",
  ])("diğer katalog bileşeninin değişmesini saklamaz: %s", (key) => {
    const changed = restored();
    changed.parts[key] = "b".repeat(64);
    expect(digestResetRestoreMetadata(changed).sha256).not.toBe(
      digestResetRestoreMetadata(fixture()).sha256,
    );
  });
  it("kota eşiği değişimini ve yalnız benzer yazımı eşdeğer saymaz", () => {
    const changed = fixture();
    changed.constraints[0]![3] = String(changed.constraints[0]![3]).replace("<= 100", "<= 99");
    expect(digestResetRestoreMetadata(changed).sha256).not.toBe(
      digestResetRestoreMetadata(restored()).sha256,
    );
  });
  it.each([0, 1, 2, 4, 5, 6])("CHECK kimliği/türü/bayrağı değişimini korur: alan %i", (field) => {
    const changed = fixture();
    changed.constraints[0]![field] = field < 3 ? "different" : !changed.constraints[0]![field];
    expect(digestResetRestoreMetadata(changed).sha256).not.toBe(
      digestResetRestoreMetadata(fixture()).sha256,
    );
  });
  it("indeks koşulunun zayıflamasını eşdeğer saymaz", () => {
    const changed = fixture();
    changed.indexes[0]![1] = String(changed.indexes[0]![1]).replace(' AND ("runId" IS NULL)', "");
    expect(digestResetRestoreMetadata(changed).sha256).not.toBe(
      digestResetRestoreMetadata(restored()).sha256,
    );
  });
  it.each([0, 2, 3, 4, 5])("indeks kimliği/bayrağı değişimini korur: alan %i", (field) => {
    const changed = fixture();
    changed.indexes[0]![field] = field === 0 ? "different" : !changed.indexes[0]![field];
    expect(digestResetRestoreMetadata(changed).sha256).not.toBe(
      digestResetRestoreMetadata(fixture()).sha256,
    );
  });
  it("bilinmeyen ifadeyi atmaz; aynı ifadeyi başka nesnede normalleştirmez", () => {
    const a = fixture();
    const b = restored();
    a.constraints[0]![1] = b.constraints[0]![1] = "unknown_check";
    a.indexes[0]![0] = b.indexes[0]![0] = "unknown_index";
    expect(digestResetRestoreMetadata(a).sha256).not.toBe(digestResetRestoreMetadata(b).sha256);
  });
  it("boş katalog ve bileşen sırasını deterministik işler", () => {
    const value = { ...fixture(), constraints: null, indexes: null };
    const reordered = {
      ...value,
      parts: Object.fromEntries(Object.entries(value.parts).reverse()),
    };
    expect(digestResetRestoreMetadata(value)).toEqual(digestResetRestoreMetadata(reordered));
    expect(digestResetRestoreMetadata({ ...value, constraints: [] }).sha256).not.toBe(
      digestResetRestoreMetadata(value).sha256,
    );
  });
  it("eksik/fazla bileşen, bozuk hash ve bozuk tuple için kapalı kalır", () => {
    const missing = fixture();
    delete missing.parts.database;
    for (const value of [
      missing,
      { ...fixture(), parts: { ...fixture().parts, extra: "a".repeat(64) } },
      { ...fixture(), parts: { ...fixture().parts, roles: "wrong" } },
      { ...fixture(), constraints: [["incomplete"]] },
      { ...fixture(), indexes: [["index", "ddl", "true", true, true, false]] },
    ]) {
      expect(() => digestResetRestoreMetadata(value)).toThrow(
        "GREAT_RESET_CATALOG_FORMAT_UNSUPPORTED",
      );
    }
  });
});

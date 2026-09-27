import { describe, expect, it } from "vitest";
import { canonicalRestoreRendering } from "../../../src/modules/maintenance/domain/restore-rendering";

/*
  Gerçek ölçüm (27 Eylül): migration ile kurulmuş DB ↔ pg_restore kopyası. Yalnız bu iki yazım
  farkı kanonikleşir; anlam farkları (sabit, işleç, AND ↔ OR, sıra) korunur.
*/
const live =
  'CHECK ((((\"defaultDailyEntryMin\" >= 0) AND (\"defaultDailyEntryMin\" <= 100)) AND ((\"defaultDailyEntryMax\" >= \"defaultDailyEntryMin\") AND (\"defaultDailyEntryMax\" <= 100))))';
const restored =
  'CHECK (((\"defaultDailyEntryMin\" >= 0) AND (\"defaultDailyEntryMin\" <= 100) AND ((\"defaultDailyEntryMax\" >= \"defaultDailyEntryMin\") AND (\"defaultDailyEntryMax\" <= 100))))';
const liveIndex =
  "CREATE UNIQUE INDEX x ON public.t USING btree (((metadata ->> 'attemptId'::text))) WHERE (((\"eventType\")::text = ANY ((ARRAY['a.b'::character varying, 'c,d'::character varying])::text[])) AND (\"runId\" IS NULL))";
const restoredIndex =
  "CREATE UNIQUE INDEX x ON public.t USING btree (((metadata ->> 'attemptId'::text))) WHERE (((\"eventType\")::text = ANY (ARRAY[('a.b'::character varying)::text, ('c,d'::character varying)::text])) AND (\"runId\" IS NULL))";

describe("restore yazım farkı kanonikleştirmesi", () => {
  it("iç içe AND düzleşmesini ve öğe başına dizi dönüşümünü eşitler", () => {
    expect(canonicalRestoreRendering(live)).toBe(canonicalRestoreRendering(restored));
    expect(canonicalRestoreRendering(liveIndex)).toBe(canonicalRestoreRendering(restoredIndex));
  });

  it("anlam farklarını korur", () => {
    const base = canonicalRestoreRendering(live);
    for (const changed of [
      live.replace("<= 100)) AND", "<= 101)) AND"),
      live.replace(') AND ("defaultDailyEntryMin" <= 100)', ') OR ("defaultDailyEntryMin" <= 100)'),
      live.replace(
        '"defaultDailyEntryMax" >= "defaultDailyEntryMin"',
        '"defaultDailyEntryMin" >= "defaultDailyEntryMax"',
      ),
    ])
      expect(canonicalRestoreRendering(changed)).not.toBe(base);
    expect(canonicalRestoreRendering(liveIndex)).not.toBe(
      canonicalRestoreRendering(liveIndex.replace("'c,d'", "'c,e'")),
    );
    expect(canonicalRestoreRendering(liveIndex)).not.toBe(
      canonicalRestoreRendering(liveIndex.replace("IS NULL", "IS NOT NULL")),
    );
  });

  it("tırnak içindeki AND/parantez/virgülü yapı saymaz", () => {
    const a = "CHECK (((note)::text <> 'x AND (y, z)'::text))";
    expect(canonicalRestoreRendering(a)).toBe(canonicalRestoreRendering(a));
    expect(canonicalRestoreRendering(a)).not.toBe(
      canonicalRestoreRendering(a.replace("x AND (y, z)", "x AND (y, w)")),
    );
  });
  it("Astra karşı örnekleri: boşluk, tırnak içi ARRAY ve iç içe dizi eşitlenmez", () => {
    expect(canonicalRestoreRendering("CHECK ((note <> 'a  b'::text))")).not.toBe(
      canonicalRestoreRendering("CHECK ((note <> 'a b'::text))"),
    );
    expect(canonicalRestoreRendering('CHECK (("a  b" <> 1))')).not.toBe(
      canonicalRestoreRendering('CHECK (("a b" <> 1))'),
    );
    expect(canonicalRestoreRendering("CHECK ((note <> '(ARRAY[1, 2])::text[]'::text))")).not.toBe(
      canonicalRestoreRendering("CHECK ((note <> 'ARRAY[(1)::text, (2)::text]'::text))"),
    );
    expect(
      canonicalRestoreRendering("CHECK ((x = ANY ((ARRAY[ARRAY[1, 2], ARRAY[3, 4]])::text[])))"),
    ).not.toBe(
      canonicalRestoreRendering(
        "CHECK ((x = ANY (ARRAY[(ARRAY[1, 2])::text, (ARRAY[3, 4])::text])))",
      ),
    );
    // Ölçülmemiş öğe tipi dönüştürülmez.
    expect(canonicalRestoreRendering("CHECK ((x = ANY ((ARRAY[1, 2])::text[])))")).not.toBe(
      canonicalRestoreRendering("CHECK ((x = ANY (ARRAY[(1)::text, (2)::text])))"),
    );
  });
});

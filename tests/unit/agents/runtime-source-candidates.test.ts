import { describe, expect, it } from "vitest";
import { runtimePresentedSourceCandidateIds } from "@/modules/agents/domain/runtime-source-candidates";

/*
  Sunucu bir kaynak adayını yalnız o koşuda ajana SUNULMUŞSA kabul edebilir.
  Bu kümeyi snapshot'tan türeten fonksiyon burada sınanıyor; modelin adres
  yazamadığı wire tarafı `runtime-output.test.ts` içinde.
*/
describe("kaynak adayı — snapshot kümesi", () => {
  it("snapshot'ta sunulan aday kimliklerini çıkarır", () => {
    const ids = runtimePresentedSourceCandidateIds({
      sourceCandidates: [
        { candidateId: "a", normalizedDomain: "x.com", citingAgents: 3 },
        { candidateId: "b", normalizedDomain: "y.com", citingAgents: 2 },
      ],
    });
    expect([...ids].sort()).toEqual(["a", "b"]);
  });

  it("snapshot yoksa ya da bozuksa boş küme döner", () => {
    /*
      Boş küme = hiçbir aday kabul edilmez. Hata durumunda "geniş" değil "dar"
      tarafa düşmesi önemli: null snapshot'lı bir koşu kaynak edinemesin.
    */
    for (const value of [null, undefined, "metin", 42, [], { sourceCandidates: "liste değil" }])
      expect(runtimePresentedSourceCandidateIds(value).size).toBe(0);
  });

  it("string olmayan kimlikleri saymaz", () => {
    const ids = runtimePresentedSourceCandidateIds({
      sourceCandidates: [{ candidateId: 7 }, { candidateId: "" }, { candidateId: "geçerli" }],
    });
    expect([...ids]).toEqual(["geçerli"]);
  });
});

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  runtimeBrowseArm,
  runtimeBrowseArmAssignment,
  runtimeBrowseExperimentEnabled,
  runtimeBrowseTimeoutMs,
} from "@/modules/agents/domain/runtime-browse-experiment";

describe("gezinme fazı 50/50 deneyi", () => {
  it("kolu deterministik atar — ölçüm anında yeniden hesaplanabilmeli", () => {
    const runId = randomUUID();
    const first = runtimeBrowseArmAssignment(runId);
    for (let index = 0; index < 50; index += 1)
      expect(runtimeBrowseArmAssignment(runId)).toBe(first);
  });

  it("kolları dengeli böler", () => {
    /*
      Dengesiz bölme deneyi sessizce bozar: bir kol az örnek toplar ve fark
      istatistiksel değil, örneklem kaynaklı çıkar.
    */
    const total = 20_000;
    let browse = 0;
    for (let index = 0; index < total; index += 1)
      if (runtimeBrowseArmAssignment(randomUUID()) === "BROWSE") browse += 1;
    const ratio = browse / total;
    expect(ratio).toBeGreaterThan(0.47);
    expect(ratio).toBeLessThan(0.53);
  });

  it("bayrak kapalıyken bölme yapmaz — üretim bugünkü davranışta doğar", () => {
    /*
      Bütçe tavanı ve telemetri tek başına gönderilebilir; 50/50 bölme
      davranışı değiştirdiği için ayrı bayrağın arkasında.
    */
    delete process.env.AGENT_BROWSE_EXPERIMENT;
    expect(runtimeBrowseExperimentEnabled()).toBe(false);
    for (let index = 0; index < 200; index += 1)
      expect(runtimeBrowseArm(randomUUID())).toBe("BROWSE");
    process.env.AGENT_BROWSE_EXPERIMENT = "1";
    expect(runtimeBrowseExperimentEnabled()).toBe(true);
    delete process.env.AGENT_BROWSE_EXPERIMENT;
  });

  it("gezinmeye koşunun tamamını değil, sınırlı bir bütçe verir", () => {
    /*
      Regresyonun kökü buydu: gezinme `deadline.remainingMs()` alıyordu, yani
      koşunun kalan BÜTÜN bütçesini. Takıldığında karar çağrısına bütçe
      kalmıyor ve koşu hiçbir şey üretmeden düşüyordu. Tavan koşu bütçesinin
      (360 sn) küçük bir payı olmalı.
    */
    expect(runtimeBrowseTimeoutMs).toBeGreaterThan(0);
    expect(runtimeBrowseTimeoutMs).toBeLessThanOrEqual(30_000);
  });
});

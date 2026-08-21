import { describe, expect, it } from "vitest";
import {
  MAXIMUM_STOCHASTIC_TICK_DELAY_MS,
  MINIMUM_STOCHASTIC_TICK_DELAY_MS,
  ROSTER_HEARTBEAT_FRESH_MS,
} from "@/modules/agents/domain/stochastic-scheduler";

/*
  Roster tick başına yenileniyor. Eşik en uzun tick'ten kısaysa sağlıklı bir
  worker'ın rosteri her döngünün bir bölümünde bayat görünür ve bu yalnız görüntü
  değil: force-run, ACTIVE'e alma ve scheduler uygunluğu aynı bayrağa bağlı.

  Canlıda görüldü (21 Ağu): eşik 120 sn iken panel `0/36 hazır` gösterdi, 68 saniye
  sonra kendiliğinden düzeldi.
*/
describe("roster tazelik eşiği", () => {
  it("en uzun tick'i aşar", () => {
    expect(ROSTER_HEARTBEAT_FRESH_MS).toBeGreaterThan(MAXIMUM_STOCHASTIC_TICK_DELAY_MS);
  });

  it("gerçekten ölmüş bir worker'ı makul sürede bayat sayar", () => {
    // Sonsuza kadar taze saymak da yanlış olurdu; üst sınır on dakika.
    expect(ROSTER_HEARTBEAT_FRESH_MS).toBeLessThanOrEqual(10 * 60_000);
  });

  it("tick aralığı eşiğin altında kalır", () => {
    expect(MINIMUM_STOCHASTIC_TICK_DELAY_MS).toBeLessThan(ROSTER_HEARTBEAT_FRESH_MS);
  });
});

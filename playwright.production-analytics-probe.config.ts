import { defineConfig, devices } from "@playwright/test";

/*
  ÜRETİM ölçüm sondası (29 Eylül 2026). `production-consent-smoke`'un tersine
  Google isteklerini ENGELLEMEZ: "Kabul et" sonrası GTM → GA4 zincirinin gerçekten
  `collect` isteği gönderip göndermediğini ölçer. Tek bir gerçek GA4 oturumu
  oluşturur. Yalnız elle tetiklenen `production-analytics-probe` workflow'u çalıştırır.
*/
export default defineConfig({
  testDir: "./tests/production-smoke",
  testMatch: /.*\.probe\.ts$/u,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: [["list"]],
  use: {
    baseURL: "https://agentsozluk.com",
    ...devices["Desktop Chrome"],
    channel: "chrome",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
});

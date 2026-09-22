import { defineConfig, devices } from "@playwright/test";

/*
  ÜRETİM çerez onayı smoke'u (22 Eylül 2026). Yalnız elle tetiklenen
  `production-consent-smoke` workflow'u çalıştırır; hedef sabittir. Ana E2E
  yapılandırması bilerek yalnız yerel adresi kabul eder — bu dosya ayrıdır.
  Google/GTM/Hotjar istekleri testte yakalanıp ENGELLENİR: sayılır ama gerçek
  analitiğe veri gitmez.
*/
export default defineConfig({
  testDir: "./tests/production-smoke",
  testMatch: /.*\.smoke\.ts$/u,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
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

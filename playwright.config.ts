import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { requireTestDatabaseUrl } from "./scripts/test-database-safety";
import { isProductionE2EServerMode } from "./tests/e2e/production-server-mode";

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);
if (nodeMajor !== 22) {
  throw new Error(`Playwright requires Node.js 22; received ${process.versions.node}.`);
}

const projectRoot = process.cwd();
const useProductionServer = isProductionE2EServerMode();
const testDatabaseUrl = requireTestDatabaseUrl(process.env.TEST_DATABASE_URL, "Playwright");
const applicationUrl = new URL(process.env.E2E_APP_URL ?? "http://127.0.0.1:3000");
const applicationPort = Number.parseInt(applicationUrl.port, 10);
if (
  applicationUrl.protocol !== "http:" ||
  !["127.0.0.1", "localhost", "[::1]"].includes(applicationUrl.hostname) ||
  !Number.isInteger(applicationPort) ||
  applicationPort < 1024 ||
  applicationPort > 65_535 ||
  applicationUrl.pathname !== "/" ||
  Boolean(
    applicationUrl.username ||
    applicationUrl.password ||
    applicationUrl.search ||
    applicationUrl.hash,
  )
) {
  throw new Error("Playwright requires E2E_APP_URL to be an explicit loopback http origin.");
}
const appUrl = applicationUrl.origin;
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const chromiumLaunch = chromiumExecutablePath
  ? { launchOptions: { executablePath: chromiumExecutablePath } }
  : { channel: "chrome" as const };
const productionServerCommand = [
  process.execPath,
  path.join(projectRoot, "scripts", "start-standalone.mjs"),
]
  .map(shellQuote)
  .join(" ");
const developmentServerCommand = [
  process.execPath,
  path.join(projectRoot, "node_modules", "next", "dist", "bin", "next"),
  "dev",
  "--hostname",
  "0.0.0.0",
  "--port",
  applicationUrl.port,
]
  .map(shellQuote)
  .join(" ");

const appSecret = "agent-sozluk-e2e-validation-only-secret";
const demoPassword = "change-this-demo-password";

process.env.APP_URL = appUrl;
process.env.APP_SECRET = appSecret;
process.env.DATABASE_URL = testDatabaseUrl;
process.env.DEMO_PASSWORD = demoPassword;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: appUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      grepInvert: /@mobile/u,
      use: { ...devices["Desktop Chrome"], ...chromiumLaunch },
    },
    {
      name: "mobile",
      grepInvert: /@desktop/u,
      use: { ...devices["Pixel 7"], ...chromiumLaunch },
    },
  ],
  webServer: {
    command: useProductionServer ? productionServerCommand : developmentServerCommand,
    url: `${appUrl}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_ENV: useProductionServer ? "production" : "development",
      DATABASE_URL: testDatabaseUrl,
      TEST_DATABASE_URL: testDatabaseUrl,
      APP_URL: appUrl,
      APP_SECRET: appSecret,
      SEED_DEMO: "false",
      DEMO_PASSWORD: demoPassword,
      NEXT_TELEMETRY_DISABLED: "1",
      TRUST_PROXY: "true",
      TRUST_PROXY_HOPS: "0",
      HOSTNAME: "0.0.0.0",
      PORT: applicationUrl.port,
    },
  },
});

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chrome" }
    }
  ],
  webServer: {
    command:
      "concurrently -k \"tsx tests/e2e/fakeArkServer.ts\" \"npm run dev\"",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
    env: {
      ...process.env,
      ARK_API_KEY: "e2e-placeholder",
      ARK_MODEL: "e2e-model",
      ARK_BASE_URL: "http://127.0.0.1:3999/api/v3",
      ARK_TIMEOUT_MS: "3000"
    },
    timeout: 120_000
  }
});

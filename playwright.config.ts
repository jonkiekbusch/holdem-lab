import { defineConfig, devices } from "@playwright/test";

// Phone-sized browser. Uses the pre-installed Chromium when present (cloud sandbox),
// otherwise Playwright's own browser (run `npx playwright install chromium` once locally).
import { existsSync } from "node:fs";
const sandboxChromium = "/opt/pw-browsers/chromium";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:4173",
    ...devices["Pixel 7"],
    launchOptions: existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {},
  },
  webServer: {
    command: "npm run build && npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

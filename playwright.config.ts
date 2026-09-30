import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

// Every layout check runs at each of these screen sizes. The installability check only needs
// one phone and one desktop size. Uses the pre-installed Chromium when present (cloud sandbox),
// otherwise Playwright's own browser (run `npx playwright install chromium` once locally).
// Only Chromium (Chrome/Edge's engine) is exercised here; Safari and Firefox are not.
const sandboxChromium = "/opt/pw-browsers/chromium";

const touch = { isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const sizes = [
  { name: "phone-portrait", use: { ...devices["Pixel 7"] } },
  { name: "phone-landscape", use: { viewport: { width: 915, height: 412 }, ...touch } },
  { name: "tablet-portrait", use: { viewport: { width: 820, height: 1180 }, ...touch } },
  { name: "tablet-landscape", use: { viewport: { width: 1180, height: 820 }, ...touch } },
  { name: "laptop-small", use: { viewport: { width: 1280, height: 630 } } }, // 1920x1200 laptop at 150% zoom
  { name: "laptop-mid", use: { viewport: { width: 1366, height: 650 } } },
  { name: "laptop-100", use: { viewport: { width: 1920, height: 950 } } }, // 1920x1200 laptop at 100% zoom
  { name: "monitor", use: { viewport: { width: 2560, height: 1440 } } },
];
const installSizes = new Set(["phone-portrait", "laptop-100"]);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:4173",
    browserName: "chromium",
    launchOptions: existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {},
  },
  projects: sizes.map((s) => ({
    name: s.name,
    use: s.use,
    testMatch: installSizes.has(s.name) ? /.*\.spec\.ts/ : /layout\.spec\.ts/,
  })),
  webServer: {
    command: "npm run build && npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

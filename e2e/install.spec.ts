import { expect, test } from "@playwright/test";

test("shows the app name and an empty table on a phone-sized screen", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Hold'em Lab");
  await expect(page.getByRole("heading", { name: "Hold'em Lab" })).toBeVisible();
  const table = page.getByTestId("table");
  await expect(table).toBeVisible();
  const box = await table.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.width).toBeLessThanOrEqual(viewport.width);
  // No sideways scrolling on a phone.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test("qualifies for Add to Home Screen", async ({ page, request }) => {
  await page.goto("/");

  // 1. A web manifest is linked and complete.
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBeTruthy();
  const manifestRes = await request.get(href!);
  expect(manifestRes.ok()).toBe(true);
  const manifest = await manifestRes.json();
  expect(manifest.name).toBe("Hold'em Lab");
  expect(manifest.short_name).toBeTruthy();
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBeTruthy();

  // 2. Icons of the sizes browsers require are present and actually download.
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toContain("192x192");
  expect(sizes).toContain("512x512");
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
  for (const icon of manifest.icons) {
    const res = await request.get(`/${icon.src}`);
    expect(res.ok(), icon.src).toBe(true);
    expect(res.headers()["content-type"]).toContain("image/png");
  }
  const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect((await request.get(apple!)).ok()).toBe(true);

  // 3. A service worker registers and takes control (this is what makes offline play possible).
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() =>
      page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state),
    )
    .toBe("activated");
});

test("loads again with the network off after the first visit", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  // Reload once so the service worker is controlling the page.
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Hold'em Lab" })).toBeVisible();
});

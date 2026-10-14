import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { APP_DESCRIPTION, APP_NAME, APP_SHORT_NAME, BACKGROUND_COLOR, THEME_COLOR } from "../app.config.ts";

describe("app config", () => {
  it("names the app Hold'em Lab", () => {
    expect(APP_NAME).toBe("Hold'em Lab");
  });

  it("has a short name that fits under a home-screen icon", () => {
    expect(APP_SHORT_NAME.length).toBeLessThanOrEqual(12);
  });

  it("has a description and valid colors", () => {
    expect(APP_DESCRIPTION.length).toBeGreaterThan(10);
    expect(THEME_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
    expect(BACKGROUND_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("home-screen icons", () => {
  const icons: Array<[string, number]> = [
    ["public/pwa-192x192.png", 192],
    ["public/pwa-512x512.png", 512],
    ["public/pwa-maskable-512x512.png", 512],
    ["public/apple-touch-icon.png", 180],
  ];

  it.each(icons)("%s exists and is %ipx square", async (path, size) => {
    expect(existsSync(path)).toBe(true);
    const meta = await sharp(readFileSync(path)).metadata();
    expect(meta.width).toBe(size);
    expect(meta.height).toBe(size);
  });
});

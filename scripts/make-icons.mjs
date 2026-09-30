// Regenerates the PNG app icons from public/favicon.svg. Run with: npm run icons
import sharp from "sharp";
import { readFile } from "node:fs/promises";

const svg = await readFile(new URL("../public/favicon.svg", import.meta.url));
const out = (name) => new URL(`../public/${name}`, import.meta.url).pathname;

await sharp(svg).resize(192, 192).png().toFile(out("pwa-192x192.png"));
await sharp(svg).resize(512, 512).png().toFile(out("pwa-512x512.png"));
await sharp(svg).resize(180, 180).png().toFile(out("apple-touch-icon.png"));

// Maskable icon: the artwork sits inside the central safe zone on a full-bleed background.
const inner = await sharp(svg).resize(360, 360).png().toBuffer();
await sharp({
  create: { width: 512, height: 512, channels: 4, background: "#0b3d2e" },
})
  .composite([{ input: inner, gravity: "center" }])
  .png()
  .toFile(out("pwa-maskable-512x512.png"));

console.log("Icons written to public/");

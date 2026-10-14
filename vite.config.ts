import { defineConfig, type Plugin } from "vite";
import preact from "@preact/preset-vite";
import { VitePWA } from "vite-plugin-pwa";
import {
  APP_DESCRIPTION,
  APP_NAME,
  APP_SHORT_NAME,
  BACKGROUND_COLOR,
  THEME_COLOR,
} from "./app.config.ts";

// Fills %APP_NAME% etc. in index.html from app.config.ts so the name lives in one place.
function appNameInHtml(): Plugin {
  const values: Record<string, string> = {
    APP_NAME,
    APP_DESCRIPTION,
    THEME_COLOR,
  };
  return {
    name: "app-name-in-html",
    transformIndexHtml(html) {
      return html.replace(/%(APP_NAME|APP_DESCRIPTION|THEME_COLOR)%/g, (_, key: string) =>
        values[key].replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"),
      );
    },
  };
}

export default defineConfig({
  define: {
    __APP_NAME__: JSON.stringify(APP_NAME),
  },
  plugins: [
    preact(),
    appNameInHtml(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png", "favicon.svg"],
      manifest: {
        name: APP_NAME,
        short_name: APP_SHORT_NAME,
        description: APP_DESCRIPTION,
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        theme_color: THEME_COLOR,
        background_color: BACKGROUND_COLOR,
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
        navigateFallback: "index.html",
      },
    }),
  ],
});

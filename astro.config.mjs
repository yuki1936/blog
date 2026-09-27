import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

const redirects = {
  "/tools/dns": "/tools/dns-lookup/",
  "/tools/json": "/tools/json-viewer/",
  "/tools/image": "/tools/image-processor/",
  "/tools/blurhash": "/tools/blurhash-tool/",
  "/tools/convert": "/tools/markup-converter/",
};

const legacyPaths = new Set(Object.keys(redirects));

function normalizePath(pathname) {
  return pathname === "/" ? pathname : pathname.replace(/\/$/, "");
}

export default defineConfig({
  site: "https://yuki1936.com",
  output: "static",
  redirects,
  vite: { plugins: [tailwindcss()] },
  integrations: [
    react(),
    sitemap({
      filter: (page) => {
        const pathname = normalizePath(new URL(page).pathname);
        return (
          pathname !== "/404" &&
          pathname !== "/404.html" &&
          pathname !== "/rss.xml" &&
          pathname !== "/search" &&
          pathname !== "/search/" &&
          !legacyPaths.has(pathname)
        );
      },
    }),
  ],
});

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  workers: process.env.CI ? 1 : undefined,
  webServer: {
    command: "npm run preview -- --host 127.0.0.1",
    url: "http://127.0.0.1:4321",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  use: {
    baseURL: "http://127.0.0.1:4321",
    headless: true,
  },
});

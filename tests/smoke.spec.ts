import { expect, test } from "@playwright/test";
import path from "node:path";

const pages = [
  "/",
  "/articles/",
  "/articles/life/",
  "/articles/tech/",
  "/articles/tech/2026-09-22-home-network-architecture-2-0/",
  "/tools/",
  "/tools/dns-lookup/",
  "/tools/json-viewer/",
  "/tools/image-processor/",
  "/tools/blurhash-tool/",
  "/tools/markup-converter/",
  "/tools/hash-calculator/",
  "/tools/codec/",
  "/tools/cidr/",
  "/tools/timestamp-cron/",
  "/links/",
  "/archives/",
  "/search/",
  "/about/",
];

const toolRedirects = {
  "/tools/dns/": "/tools/dns-lookup/",
  "/tools/json/": "/tools/json-viewer/",
  "/tools/image/": "/tools/image-processor/",
  "/tools/blurhash/": "/tools/blurhash-tool/",
  "/tools/convert/": "/tools/markup-converter/",
} as const;

test("legacy tool routes redirect to their canonical URLs", async ({ page }) => {
  for (const [legacyPath, canonicalPath] of Object.entries(toolRedirects)) {
    await page.goto(legacyPath);
    await expect(page, legacyPath).toHaveURL(new RegExp(`${canonicalPath}$`));
  }
});

test("sitemap exposes canonical routes and excludes legacy redirects", async ({ request }) => {
  const homeResponse = await request.get("/");
  expect(homeResponse.ok()).toBe(true);
  await expect(homeResponse.text()).resolves.toContain(
    '<link rel="canonical" href="https://yuki1936.com/">',
  );
  await expect(homeResponse.text()).resolves.toContain('property="og:title"');

  const rssResponse = await request.get("/rss.xml");
  expect(rssResponse.ok()).toBe(true);
  await expect(rssResponse.text()).resolves.toContain("<rss");

  const indexResponse = await request.get("/sitemap-index.xml");
  expect(indexResponse.ok()).toBe(true);
  await expect(indexResponse.text()).resolves.toContain(
    "https://yuki1936.com/sitemap-0.xml",
  );

  const sitemapResponse = await request.get("/sitemap-0.xml");
  expect(sitemapResponse.ok()).toBe(true);
  const sitemap = await sitemapResponse.text();
  for (const canonicalPath of [
    "/articles/",
    "/articles/life/2026-8-3-songs-i-listen-to/",
    "/articles/tech/2026-09-22-home-network-architecture-2-0/",
    "/tools/dns-lookup/",
    "/tools/json-viewer/",
    "/tools/image-processor/",
    "/tools/blurhash-tool/",
    "/tools/markup-converter/",
  ]) {
    expect(sitemap).toContain(`https://yuki1936.com${canonicalPath}`);
  }
  for (const legacyPath of Object.keys(toolRedirects)) {
    expect(sitemap).not.toContain(`https://yuki1936.com${legacyPath}`);
  }
  expect(sitemap).not.toContain("https://yuki1936.com/404");

  const robotsResponse = await request.get("/robots.txt");
  expect(robotsResponse.ok()).toBe(true);
  await expect(robotsResponse.text()).resolves.toContain(
    "Sitemap: https://yuki1936.com/sitemap-index.xml",
  );
});

test("pages render without horizontal overflow", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const pathname of pages) {
    await page.goto(pathname);
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(dimensions.scrollWidth, pathname).toBeLessThanOrEqual(dimensions.clientWidth);
  }
  expect(runtimeErrors).toEqual([]);
});

test("DNS query returns records", async ({ page }) => {
  await page.route("https://cloudflare-dns.com/dns-query*", async (route) => {
    const name = new URL(route.request().url()).searchParams.get("name") ?? "";
    if (name === "slow.example") {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    try {
      await route.fulfill({
        json: {
          Status: 0,
          AD: true,
          CD: false,
          Answer: [{ name: `${name}.`, type: 1, TTL: 300, data: "192.0.2.1" }],
        },
      });
    } catch {
      // The superseded request is expected to be aborted by the page.
    }
  });
  await page.goto("/tools/dns-lookup/");
  await page.locator("#dns-name").fill("slow.example");
  await page.getByRole("button", { name: "查询" }).click();
  await page.locator("#dns-name").fill("current.example");
  await page.getByRole("button", { name: "查询" }).click();
  await expect(page.locator("#dns-status")).toContainText("NOERROR");
  await expect(page.locator("#dns-results")).toContainText("current.example");
  await page.waitForTimeout(400);
  await expect(page.locator("#dns-results")).not.toContainText("slow.example");
});

test("JSON viewer renders a tree and generates Rust and Go types", async ({ page }) => {
  await page.goto("/tools/json-viewer/");
  await page.locator("#json-input").fill(
    '{"name":"neri","active":true,"items":[{"id":1,"label":"one"},{"id":2}]}',
  );
  await page.getByRole("button", { name: "解析", exact: true }).click();
  await expect(page.locator("#json-tree")).toContainText("name");
  await expect(page.locator("#json-status")).toHaveText("JSON 有效");

  await page.getByRole("tab", { name: "Rust" }).click();
  await expect(page.locator("#rust-output")).toContainText("pub struct Root");
  await expect(page.locator("#rust-output")).toContainText("Option<String>");

  await page.getByRole("tab", { name: "Go", exact: true }).click();
  await expect(page.locator("#go-output")).toContainText("type Root struct");
  await expect(page.locator("#go-output")).toContainText('json:"items"');

  await page.locator("#json-input").fill(
    '{"foo-bar":{"a":1},"foo_bar":{"b":"x"},"a`b":true,"control\\u0000key":1}',
  );
  await page.getByRole("button", { name: "解析", exact: true }).click();
  await page.getByRole("tab", { name: "Rust" }).click();
  await expect(page.locator("#rust-output")).toContainText("foo_bar: RootFooBar");
  await expect(page.locator("#rust-output")).toContainText("foo_bar_2: RootFooBar2");
  await expect(page.locator("#rust-output")).toContainText(
    'rename = "control\\u{0}key"',
  );
  await page.getByRole("tab", { name: "Go", exact: true }).click();
  await expect(page.locator("#go-output")).toContainText("FooBar RootFooBar");
  await expect(page.locator("#go-output")).toContainText("FooBar2 RootFooBar2");
  await expect(page.locator("#go-output")).toContainText('"json:\\"a`b\\""');
});

test("image tool creates a local output", async ({ page }) => {
  await page.goto("/tools/image-processor/");
  await page.locator("#image-input").setInputFiles(path.resolve("public/avatar.jpg"));
  await expect(page.locator("#image-workspace")).toBeVisible();
  await page.getByRole("button", { name: "生成图片" }).click();
  await expect(page.locator("#output-panel")).toBeVisible();
  await expect(page.locator("#download-image")).toHaveAttribute("download", /processed\.webp$/);

  await page.getByRole("button", { name: "等分", exact: true }).click();
  await page.locator("#split-rows").fill("2");
  await page.locator("#split-columns").fill("3");
  await page.getByRole("button", { name: "生成切片" }).click();
  await expect(page.locator(".slice-card")).toHaveCount(6);
  await expect(page.locator("#output-info")).toContainText("2 × 3 · 6 个切片");
  await expect(page.locator("#download-slices")).toHaveAttribute("download", /-2x3\.zip$/);
  await expect(page.locator(".slice-card").first().getByRole("link", { name: "下载" }))
    .toHaveAttribute("download", /-r01-c01\.webp$/);
});

test("image tool rejects oversized files and dimensions", async ({ page }) => {
  await page.goto("/tools/image-processor/");
  await page.locator("#image-input").setInputFiles({
    name: "too-large.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.alloc(25 * 1024 * 1024 + 1),
  });
  await expect(page.locator("#image-status")).toHaveText("图片不能超过 25 MiB");
  await expect(page.locator("#image-workspace")).toBeHidden();

  await page.locator("#image-input").setInputFiles({
    name: "too-many-pixels.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="5001" height="5000"></svg>',
    ),
  });
  await expect(page.locator("#image-status")).toHaveText("图片不能超过 2500 万像素");
  await expect(page.locator("#image-workspace")).toBeHidden();
});

test("BlurHash tool encodes and decodes images locally", async ({ page }) => {
  await page.goto("/tools/blurhash-tool/");

  const hash = page.locator("#blurhash-value");
  await expect(hash).toHaveValue(/^.{28}$/);
  await expect(page.locator("#blurhash-status")).toHaveText("内置样例");

  await hash.fill("LEHV6nWB2yk8pyo0adR*.7kCMdnj");
  await page.getByRole("button", { name: "解码此 Hash" }).click();
  await expect(page.locator("#blurhash-status")).toHaveText("Hash 已解码");
  await expect(page.locator("#blurhash-error")).toBeHidden();

  const canvasesHavePixels = await page.locator("#blurhash-preview").evaluate((preview) =>
    [...preview.querySelectorAll("canvas")].every((canvas) => {
      const context = canvas.getContext("2d");
      if (!context || canvas.width === 0 || canvas.height === 0) return false;
      return context
        .getImageData(0, 0, canvas.width, canvas.height)
        .data.some((value, index) => index % 4 !== 3 && value !== 0);
    }),
  );
  expect(canvasesHavePixels).toBe(true);
});

test("article tables of contents and heading permalinks follow article length", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => localStorage.setItem("theme", "light"));
  await page.goto("/articles/life/2026-8-3-songs-i-listen-to/");
  const toc = page.locator(".article-toc");
  await expect(toc).toBeVisible();
  await expect(toc.locator("details")).not.toHaveAttribute("open", "");
  await toc.locator("summary").click();
  await expect(toc.locator("details")).toHaveAttribute("open", "");
  await expect(toc.getByRole("link")).toHaveCount(4);
  await expect(toc.getByRole("link", { name: "Flower Dance —— DJ Okawari" }))
    .toHaveAttribute("href", "#flower-dance--dj-okawari");

  const flowerHeading = page.locator("#flower-dance--dj-okawari");
  await flowerHeading.hover();
  await flowerHeading.getByRole("link", { name: /链接到/ }).click();
  await expect(page).toHaveURL(/#flower-dance--dj-okawari$/);
  await expect(flowerHeading).toHaveCSS("color", "rgb(9, 9, 11)");

  await page.goto(
    "/articles/tech/2023-10-1-oct-leetcoding-challenge-rust-solution/",
  );
  await expect(page.locator(".article-toc")).toBeVisible();
  await expect(page.locator(".article-toc details")).not.toHaveAttribute("open", "");

  await page.goto("/articles/life/my-cat/");
  await expect(page.locator(".article-toc")).toHaveCount(0);
});

test("document converter runs the Rust Wasm format matrix", async ({ page }) => {
  await page.goto("/tools/markup-converter/");
  await expect(page.locator("#convert-status")).toHaveText("转换器已就绪", {
    timeout: 15_000,
  });

  const cases = [
    ["markdown", "html", "# Hello", "<h1>Hello</h1>"],
    ["html", "markdown", "<h1>Hello</h1>", "# Hello"],
    ["typst", "latex", "= Hello", "\\section{Hello}"],
    ["latex", "typst", "\\section{Hello}", "= Hello"],
  ] as const;

  for (const [from, to, source, expected] of cases) {
    await page.locator("#source-format").selectOption(from);
    await page.locator("#target-format").selectOption(to);
    await page.locator("#document-input").fill(source);
    await page.getByRole("button", { name: "转换", exact: true }).click();
    await expect
      .poll(() => page.locator("#document-output").inputValue())
      .toContain(expected);
    await page.getByRole("tab", { name: "预览" }).click();
    await expect(page.locator("#document-preview")).toBeVisible();
    await expect(page.locator("#document-preview")).toHaveAttribute(
      "srcdoc",
      /default-src 'none'/,
    );
    await expect(page.locator("#document-output")).toBeHidden();
    await expect(page.frameLocator("#document-preview").locator("h1")).toHaveText("Hello");
    await page.getByRole("tab", { name: "源码" }).click();
    await expect(page.locator("#document-output")).toBeVisible();
  }

  await expect(page.locator("#document-preview")).toHaveAttribute("sandbox", "");

  await page.locator("#target-format").selectOption("html");
  await expect(page.locator("#document-output")).toHaveValue("");
  await expect(page.locator("#download-document")).toBeDisabled();
  await expect(page.locator("#convert-status")).toHaveText("内容已修改，请重新转换");

  await page.locator("#source-format").selectOption("markdown");
  await page.locator("#target-format").selectOption("typst");
  await page.locator("#document-input").fill(
    "Text with note.[^a]\n\n[^a]: Footnote body.",
  );
  await page.getByRole("button", { name: "转换", exact: true }).click();
  await expect
    .poll(() => page.locator("#document-output").inputValue())
    .toContain("#footnote[Footnote body.]");

  await page.getByRole("tab", { name: "AST" }).click();
  await expect(page.locator("#document-ast")).toBeVisible();
  await expect(page.locator("#document-ast")).toHaveValue(/"type": "footnote_definition"/);

  await page.locator("#source-format").selectOption("html");
  await page.locator("#target-format").selectOption("typst");
  await page.locator("#document-input").fill(
    "<details><summary>More</summary><p>Body</p></details><video src=\"x.mp4\"></video>",
  );
  await page.getByRole("button", { name: "转换", exact: true }).click();
  await expect(page.locator("#conversion-diagnostics")).toBeVisible();
  await expect(page.locator("#conversion-diagnostics")).toContainText("可折叠内容");
  await expect(page.locator("#conversion-diagnostics")).toContainText("原始内容");

  await page.locator(".converter-options summary").click();
  await page.locator("#strict-mode").check();
  await page.getByRole("button", { name: "转换", exact: true }).click();
  await expect(page.locator("#convert-status")).toHaveAttribute("data-state", "error");
  await page.locator("#strict-mode").uncheck();

  await page.locator("#source-format").selectOption("markdown");
  await page.locator("#target-format").selectOption("html");
  await page.locator("#full-html").check();
  await page.locator("#link-prefix").fill("/docs");
  await page.locator("#image-prefix").fill("/assets");
  await page.locator("#document-input").fill(
    "---\ntitle: Complete\nlanguage: zh\n---\n\n[Guide](guide.md) ![A](a.png)",
  );
  await page.getByRole("button", { name: "转换", exact: true }).click();
  await expect.poll(() => page.locator("#document-output").inputValue()).toContain("<!doctype html>");
  await expect(page.locator("#document-output")).toHaveValue(/lang="zh"/);
  await expect(page.locator("#document-output")).toHaveValue(/href="\/docs\/guide.md"/);
  await expect(page.locator("#document-output")).toHaveValue(/src="\/assets\/a.png"/);

  await page.locator("#example-input").selectOption("typst");
  await expect(page.locator("#source-format")).toHaveValue("typst");
  await expect(page.locator("#document-input")).toHaveValue(/#footnote\[note\]/);
});

test("document converter rejects oversized imports and accepts drops", async ({ page }) => {
  await page.goto("/tools/markup-converter/");
  await expect(page.locator("#convert-status")).toHaveText("转换器已就绪", { timeout: 15_000 });
  await page.locator("#document-file").setInputFiles({
    name: "large.md",
    mimeType: "text/markdown",
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 65),
  });
  await expect(page.locator("#convert-status")).toHaveText("文件不能超过 5 MiB");

  await page.locator("#input-panel").evaluate((panel) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["# Dropped"], "dropped.md", { type: "text/markdown" }));
    panel.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer }));
  });
  await expect(page.locator("#document-input")).toHaveValue("# Dropped");
  await expect(page.locator("#source-format")).toHaveValue("markdown");
});

test("theme toggle switches and persists the light theme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#09090b");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(9, 9, 11)");
  expect(await page.evaluate(() => localStorage.getItem("theme"))).toBeNull();

  await page.getByRole("button", { name: "切换到浅色主题" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#ffffff");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("light");

  await page.reload();
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  await page.getByRole("button", { name: "切换到深色主题" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(9, 9, 11)");
  expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("dark");
});

test("stored light theme wins over the dark default before first paint", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => localStorage.setItem("theme", "light"));
  await page.goto("/");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#ffffff");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("light");
});

test("hash calculator digests text locally", async ({ page }) => {
  await page.goto("/tools/hash-calculator/");
  await page.locator("#hash-text").fill("abc");
  await expect(page.locator("#hash-status")).toHaveText("文本的哈希已就绪", { timeout: 10_000 });
  await expect(page.locator("#hash-results")).toContainText("ba7816bf8f01cfea414140de5dae2223");
  await expect(page.locator("#hash-results")).toContainText("a9993e364706816aba3e25717850c26c9cd0d89d");
});

test("codec tool encodes base64 and decodes jwt", async ({ page }) => {
  await page.goto("/tools/codec/");
  await page.locator("#b64-input").fill("hello");
  await page.getByRole("button", { name: "编码", exact: true }).first().click();
  await expect(page.locator("#codec-output")).toHaveValue("aGVsbG8=");

  await page.locator("#jwt-input").fill(
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.ignored",
  );
  await page.getByRole("button", { name: "解析" }).click();
  await expect(page.locator("#codec-output")).toHaveValue(/HS256/);
});

test("cidr calculator computes a classic /24", async ({ page }) => {
  await page.goto("/tools/cidr/");
  await page.locator("#cidr-input").fill("192.168.1.10/24");
  await page.getByRole("button", { name: "计算" }).click();
  await expect(page.locator("#cidr-results")).toContainText("192.168.1.0");
  await expect(page.locator("#cidr-results")).toContainText("255.255.255.0");
  await expect(page.locator("#cidr-results")).toContainText("254");

  await page.locator("#cidr-input").fill("192.168.1.1/40");
  await page.getByRole("button", { name: "计算" }).click();
  await expect(page.locator("#cidr-status")).toHaveAttribute("data-state", "error");
});

test("timestamp and cron tool answers queries", async ({ page }) => {
  await page.goto("/tools/timestamp-cron/");
  await expect(page.locator("#now-ts")).not.toHaveText("-");
  await page.locator("#ts-input").fill("1757894400");
  await expect(page.locator(".ts-row")).toHaveCount(3);
  await expect(page.locator(".ts-row").nth(1)).toContainText("2025-09-15");

  await page.locator("#cron-input").fill("*/5 * * * *");
  await page.getByRole("button", { name: "解析" }).click();
  await expect(page.locator("#cron-status")).toContainText("每 5 分钟");

  await page.locator("#cron-input").fill("bad expression");
  await page.getByRole("button", { name: "解析" }).click();
  await expect(page.locator("#cron-status")).toHaveAttribute("data-state", "error");
});

test("search finds matching pages", async ({ page }) => {
  await page.goto("/search/");
  await page.locator("#search-input").fill("markweft");
  await expect(page.locator("#search-status")).toContainText(/\d+ 条结果/, { timeout: 15_000 });
  await expect(page.locator('.search-row[href*="building-markweft-rs"]')).toBeVisible();
});

test("archives lists every published article by year", async ({ page }) => {
  await page.goto("/archives/");
  await expect(page.locator(".year-section h2").first()).toHaveText(/20\d{2}/);
  const count = await page.locator(".year-list a").count();
  expect(count).toBeGreaterThanOrEqual(7);
});

test("visual snapshots", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.screenshot({ path: "artifacts/home-desktop-dark.png", fullPage: true });
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => localStorage.setItem("theme", "light"));
  await page.goto("/");
  await page.screenshot({ path: "artifacts/home-desktop.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tools/");
  await page.screenshot({ path: "artifacts/tools-mobile.png", fullPage: true });

  const sample = '{"name":"neri","active":true,"languages":["Rust","Python","Go","TypeScript"],"profile":{"location":"China","public":true}}';
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/tools/json-viewer/");
  await page.locator("#json-input").fill(sample);
  await page.getByRole("button", { name: "解析", exact: true }).click();
  await page.screenshot({ path: "artifacts/json-viewer-desktop.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/json-viewer-mobile.png", fullPage: true });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/tools/image-processor/");
  await page.locator("#image-input").setInputFiles(path.resolve("public/avatar.jpg"));
  await page.getByRole("button", { name: "等分", exact: true }).click();
  await page.getByRole("button", { name: "3 × 3" }).click();
  await page.getByRole("button", { name: "生成切片" }).click();
  await expect(page.locator(".slice-card")).toHaveCount(9);
  await page.screenshot({ path: "artifacts/image-split-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "artifacts/image-split-mobile.png", fullPage: true });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/tools/markup-converter/");
  await expect(page.locator("#convert-status")).toHaveText("转换器已就绪", { timeout: 15_000 });
  await page.locator(".converter-options summary").click();
  await page.locator("#example-input").selectOption("markdown");
  await page.getByRole("button", { name: "转换", exact: true }).click();
  await expect(page.locator("#convert-status")).toHaveText("转换完成");
  await page.screenshot({ path: "artifacts/converter-desktop.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/converter-mobile.png", fullPage: false });
});

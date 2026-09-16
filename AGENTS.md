# Repository Guidelines

## Project

This is a statically generated personal blog and browser-tool site built with
Astro, TypeScript, Markdown/MDX, and plain CSS. A Cloudflare Worker with static
assets (git-connected, configured by `wrangler.jsonc`) hosts the generated site
at https://yuki1936.com. Keep all production behavior compatible with Astro's
static output. There is no CI: run `npm run test` and `npm run test:e2e`
locally before pushing — deploys are automatic on push to main.

## Commands

- Install dependencies: `npm ci`
- Start the development server: `npm run dev`
- Type-check: `npm run check`
- Build for production: `npm run build`
- Run end-to-end tests: run `npm run build`, start `npm run preview`, then run
  `npx playwright test` in another shell

Run the full suite against the production preview. Playwright intercepts the DNS
provider, so end-to-end tests do not depend on external network availability.

## Architecture

- `src/pages/`: Astro routes and page-specific browser wiring
- `src/components/`: shared Astro components
- `src/layouts/BaseLayout.astro`: global document layout
- `src/styles/global.css`: design tokens and shared UI styles
- `src/content/articles/`: Markdown and MDX articles
- `src/lib/articles.ts`: article categories, slugs, dates, and sorting
- `src/lib/`: reusable logic that does not depend on the DOM
- `src/workers/`: Web Workers
- `public/wasm/markweft/`: generated markweft WebAssembly assets
- `tests/smoke.spec.ts`: Playwright functional and visual coverage

## Implementation Rules

- Preserve Astro static output. Do not introduce server-only runtime features.
- Prefer Astro components and plain TypeScript. Do not add React, Vue, Svelte,
  Tailwind, or another UI framework unless explicitly requested.
- Reuse the colors, spacing, widths, controls, and typography defined in
  `src/styles/global.css`.
- Preserve the shadcn-style monochrome visual system: zinc tokens, light and
  dark themes driven by the `.dark` class on `<html>` (inline no-flash script in
  BaseLayout, toggle in Header), no colored accents except `--danger` for errors.
- Use Lucide icons through `@lucide/astro`.
- Keep browser tools local-first. User files and JSON must not be uploaded. DNS
  lookup is the intentional network-backed exception.
- Move reusable computation into `src/lib/`; keep DOM wiring in the page.
- Avoid unrelated refactors, especially when editing the larger tool pages.
- Preserve unrelated working-tree changes.

## Tool Routes

The canonical tool routes are:

- `/tools/dns-lookup/`
- `/tools/json-viewer/`
- `/tools/image-processor/`
- `/tools/blurhash-tool/`
- `/tools/markup-converter/`
- `/tools/hash-calculator/`
- `/tools/codec/`
- `/tools/cidr/`
- `/tools/timestamp-cron/`

Other public routes: `/articles/`, `/archives/`, `/links/` (friend links, data
in `src/lib/friend-links.ts`), `/about/`, `/search/` (Pagefind, excluded from
the sitemap), and `/rss.xml` (full-text feed via `@astrojs/rss`).

Keep internal links and Playwright navigation on these canonical routes. When a
public route is renamed, retain its previous path in `astro.config.mjs` as a
redirect and add redirect coverage before removing the old URL.

Tool implementation sources are intentionally different:

- BlurHash logic mirrors `https://github.com/yuki1936/BlurHash`; keep
  `src/lib/blurhash.ts` behavior synchronized with its TypeScript package.
- Markup conversion loads generated WebAssembly from
  `https://github.com/yuki1936/markweft-rs`. Its Worker fetches the generated
  JavaScript and imports it through a Blob URL so both Vite development mode and
  static production can load files kept under `public/`.
- DNS Lookup calls Cloudflare DNS-over-HTTPS directly. It does not embed or call
  the `rdig` repository.
- JSON Viewer and Image Processor are implemented directly in this repository;
  their current browser code does not import another repository at runtime.

Preserve these tool safety invariants:

- Generated Rust and Go type and field identifiers must remain unique after
  normalization, and arbitrary JSON keys must produce valid string literals and
  serialization tags.
- Image Processor rejects files above 25 MiB and decoded images above 25 million
  pixels. Do not raise either limit without memory-focused browser coverage.
- DNS Lookup aborts a superseded request, times out after 10 seconds, and only
  lets the current request update results.

## Articles

Article frontmatter is validated by `src/content.config.ts`:

- `title`: required string
- `description`: optional string
- `published`: required date
- `updated`: optional date
- `draft`: optional boolean, defaults to `false`

Articles must live under a known category directory. Current categories are
`life` and `tech`. When adding a category, update `categoryMeta` in
`src/lib/articles.ts`. Use `templates/article.md.example` when creating an
article. Draft articles must not appear in generated article lists or routes.

## WebAssembly

Do not manually edit files in `public/wasm/markweft/`. Regenerate them with
`scripts/update-markweft-wasm.sh`. The script expects the `markweft-rs`
repository at `../../markweft-rs`, or at the path specified by
`MARKWEFT_RS_DIR`.

The markweft-rs CI installs a `wasm-bindgen` CLI version matching its
`Cargo.lock`. When that dependency changes, update the workflow tool version,
build the Wasm package, and refresh the checked-in blog assets together.

## Verification

- Always run `npm run build` after code or content-schema changes.
- For tool changes, run the relevant Playwright test.
- Add new public pages to the `pages` array in `tests/smoke.spec.ts`.
- Check both 1440px desktop and 390px mobile layouts for visual changes.

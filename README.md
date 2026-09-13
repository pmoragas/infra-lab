# Infra Lab

Web app that works as an infrastructure lab: drop components into a project area, connect them, and watch packets move.

**Live:** https://pmoragas.github.io/infra-lab/

First simulator: World → Load Balancer → Server Nodes.

Components: World/Client, DNS, CDN, API Gateway, Rate Limiter, Load Balancer, Circuit Breaker, Server, Consumer, Cache, Database, Message Queue, Third-party API. Every component and link has its own config panel (click it). Global speed and seed live in the run bar.

Features:

- **Packets** panel: p50 / p95 / p99 latency, success rate, recent requests; click a request or a moving packet to see its hop-by-hop journey.
- **Failure injection:** kill any node or cut any link from its panel; the **Chaos** panel schedules kill, partition, traffic spike and cache flush in sim time. Scheduled failures show as a ⚡ tag on the component, a banner while running, and an events row in fast-run results.
- **Server timeouts:** a cache that doesn't answer in time counts as a miss (the server falls back to the database); a backend that doesn't answer in time fails the request. A dead dependency slows a server down instead of jamming it.
- **Explanations:** the inspector (and hovering) says how each component uses its links; a server's links are labelled ① cache, ② on miss or ignored.
- **Projects:** several saved in the browser, each at its own `#/p/<id>` URL; rename, create and delete from the header.
- **Undo / redo:** header buttons, Ctrl+Z and Ctrl+Shift+Z.
- **Share:** copies a link with the whole project compressed in the URL (no backend).
- **Export / Import:** project JSON, or a PNG / SVG image of the graph. Light and dark theme.
- **Lessons:** seven presets, each with a question and steps: dead server, slow server, cache-aside, cache flush, rate limiter, circuit breaker, queue vs direct call. Open one from the empty sheet or Header → Examples.
- **Fast run and compare:** each ⏩ 60 s simulates a minute instantly and adds a column with just that minute's results (success, failed, p50 / p95 / p99, events) to the Packets panel, so you can change one thing and press it again. Save whole run pins a live run.
- **Routes:** define kinds of request (e.g. `GET /products`, read; `POST /checkout`, write) in the **Routes** panel. Each World sends a traffic mix; each link can be ticked to carry only some routes (untagged = all). A server calls the linked dependencies that carry the request's route one after another (cache first, a hit skips the rest); the database takes read vs write from the route; caches pass writes through. Without routes everything behaves as before.

Plan: Notion → App Projects → Infra Lab (RADIO).

## Stack

Vite + React + TypeScript · React Flow (`@xyflow/react`) · Zustand · html-to-image · Vitest · Playwright

## Layout

- `src/engine/` — pure TS simulation engine, no DOM. `nodes/` holds one handler per component type; `defaults.ts` the per-type defaults.
- `src/sim/` — bridges the engine to the store; pushes live edits into a running engine.
- `src/canvas/` — React Flow canvas, node component, packet layer.
- `src/ui/` — Header, Sidebar, Toolbar (run bar), ConfigPanel (driven by `configSchema.ts`), PacketsPanel (with compare), ChaosPanel, RoutesPanel, GuideCard, EmptyState, image export, bundled examples (`examples.ts`).
- `src/store/` — Zustand store (project graph, failures, undo/redo history, latest sim snapshot).
- `src/persistence/` — saved projects in localStorage, URL routing and autosave (`autosave.ts`), share links, JSON export/import.
- `e2e/` — Playwright specs, one per milestone.

## Examples

`examples/ecommerce.json` — one storefront system, single World sending 85% `GET /products` and 15% `POST /checkout`: DNS → CDN → gateway → rate limiter → LB → three servers. Browsing is cache-aside over a replicated DB; a checkout writes to the DB, then calls a payment API behind a circuit breaker, then publishes to an order-events queue with a consumer and DLQ. Header → Examples.

`examples/url-shortener.json` — read-heavy redirect service, 97% `GET /:code` and 3% `POST /shorten`: DNS → CDN (hot links at the edge) → gateway → per-client rate limiter → LB → two servers. A redirect is cache-aside over a database with read replicas, then publishes a click event to an analytics queue with a consumer and DLQ; a shorten writes to the database only.

`examples/lesson-*.json` — the seven lessons; each has a `guide` (question + steps) shown on the canvas.

Every file in `examples/` is bundled into the app (Header → Examples), and `src/ui/examples.test.ts` runs each one to check that every wired-up component gets traffic.

## Run

```
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # unit (Vitest)
pnpm e2e        # end-to-end (Playwright, needs: npx playwright install chromium)
```

On WSL, if `pnpm` resolves to the Windows binary, use `corepack pnpm@9 <cmd>` from the nvm Node.

## Deploy

Every push to `main` runs `.github/workflows/deploy.yml`: unit tests, build, then publish `dist/` to GitHub Pages. Production builds use the `/infra-lab/` base path.

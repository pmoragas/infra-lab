# Infra Lab

Web app that works as an infrastructure lab: drop components into a project area, connect them, and watch packets move.

First simulator: World → Load Balancer → Server Nodes.

Components: World/Client, DNS, CDN, API Gateway, Rate Limiter, Load Balancer, Circuit Breaker, Server, Consumer, Cache, Database, Message Queue, Third-party API. Every component and link has its own config panel (click it). Global speed and seed live in the toolbar.

Plan: Notion → App Projects → Infra Lab (RADIO).

## Stack

Vite + React + TypeScript · React Flow (`@xyflow/react`) · Zustand · Vitest · Playwright

## Layout

- `src/engine/` — pure TS simulation engine, no DOM. `nodes/` holds one handler per component type; `defaults.ts` the per-type defaults.
- `src/sim/` — bridges the engine to the store; pushes live edits into a running engine.
- `src/canvas/` — React Flow canvas, node component, packet layer.
- `src/ui/` — Sidebar, Toolbar, ConfigPanel (driven by `configSchema.ts`).
- `src/store/` — Zustand store (project graph + latest sim snapshot).
- `src/persistence/` — localStorage autosave, JSON export/import.
- `e2e/` — Playwright specs, one per milestone.

## Run

```
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # unit (Vitest)
pnpm e2e        # end-to-end (Playwright, needs: npx playwright install chromium)
```

On WSL, if `pnpm` resolves to the Windows binary, use `corepack pnpm@9 <cmd>` from the nvm Node.

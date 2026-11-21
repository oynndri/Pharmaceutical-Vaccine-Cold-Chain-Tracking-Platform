# ColdChain Pulse — Frontend

React + TypeScript + Vite app for the MedSwift cold-chain platform: Dispatcher Dashboard, Driver PWA (offline-first), Clinic receiving, and the Audit Portal.

## Run

```bash
npm install
npm run dev        # http://localhost:5173, uses the mock API (.env.development)
npm run build      # production build, real API only (.env.production)
```

Mock logins (dev only): `admin`, `dispatcher`, `driver`, `clinic`, `auditor` — password `demo`.

## Structure

| Path | What it is |
|---|---|
| `src/api/index.ts` | **The only place that knows backend URLs.** `ColdChainApi` interface + `httpApi` implementation |
| `src/api/mock/` | In-browser mock backend (600 shipments, 30s telemetry ticks, warning/critical rules). Excluded from production builds |
| `src/api/queries.ts` | TanStack Query hooks used by screens |
| `src/types.ts` | Domain types (Shipment, Alert, Handoff, …) |
| `src/auth/` | Session, `permissions.ts` (RBAC per role), route guards |
| `src/offline/` | IndexedDB (Dexie) outbox + auto-sync with idempotency keys |
| `src/components/` | App shell (sidebar + top bar), mobile shell, UI kit, charts, schematic network map |
| `src/features/overview/` | Operations overview (KPIs, live map, alert feed, fleet temperature, delivery performance, custody events) |
| `src/features/shipments/` | Shipment list (virtualized 500+ rows), detail, create |
| `src/features/tracking/` | Live tracking map + vehicles needing attention |
| `src/features/alerts/` | Alerts & incidents (acknowledge, review) |
| `src/features/fleet/` | Drivers & vehicles |
| `src/features/compliance/` | Compliance report list + report view with PDF/CSV export (SHA-256) |
| `src/features/settings/` | Workspace preferences (stored on device for now) |
| `src/features/driver/` | Driver home, QR + PIN + signature handoff, manual temp log |

Visual design follows the UI/UX team's Figma (tokens in `tailwind.config.js`).

## Roles → screens

| Role | Lands on | Can access |
|---|---|---|
| Admin | `/overview` | everything |
| Dispatcher | `/overview` | overview, shipments, tracking, alerts (ack), drivers & vehicles, compliance, settings |
| Driver | `/driver` | own shipments, pickup/delivery handoff, temp logs |
| Clinic Receiver | `/receive` | delivery handoff |
| External Auditor | `/compliance` | read-only compliance reports, settings |

## Plugging in the backend (checklist)

Search the code for `TODO(backend-sync)`.

1. Set `VITE_API_BASE_URL` in `.env.development` / Vercel env vars.
2. Update paths/payloads in `httpApi` (`src/api/index.ts`) to match backend routes.
3. Align field names in `src/types.ts` with the backend schema (or map them inside `httpApi`).
4. Confirm login response shape (`{ token, user: { id, name, role } }`) and role names.
5. Confirm handoff/temp-log endpoints accept the `Idempotency-Key` header (or `clientId` field) and ignore duplicates.
6. Confirm the QR payload format (`src/lib/qr.ts`).
7. Provide `GET /stats/overview` and `GET /handoffs?limit=` (Overview page), and GPS on telemetry for the live map (`src/components/NetworkMap.tsx`).
8. If the backend has WebSocket/SSE for alerts, replace polling in `useAlerts` / `useLiveShipments`.
9. Set `VITE_USE_MOCK_API=false` in dev once the backend is reachable.

## Deploy (Vercel)

Framework preset: Vite. Build `npm run build`, output `dist`. `vercel.json` handles SPA routing. Set `VITE_API_BASE_URL` in project env vars.

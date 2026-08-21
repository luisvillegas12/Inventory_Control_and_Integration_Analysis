# QuickMart Inventory Control Tower — Part B

## Stack
Backend: Node.js, TypeScript, Express, pg (raw SQL, no ORM), PostgreSQL
Frontend: React, TypeScript (create-react-app), MUI
Dev tooling: nodemon, morgan, cors
Testing: Jest + Supertest

## Getting started

1. Start Postgres:
   ```
   docker compose up -d
   ```
2. Backend:
   ```
   cd backend
   cp .env.example .env
   npm install
   npm run db:init      # applies src/db/schema.sql
   npm run dev           # nodemon, http://localhost:4000
   ```
   Health check: `GET /health`.
3. Frontend (separate terminal):
   ```
   cd frontend
   npm install
   npm start              # http://localhost:3000
   ```

## Tests
```
cd backend
npm test
```
Runs the 6 required tests against the real Express app via
Supertest: valid event applies; same key+payload isn't reprocessed; same
key+different payload returns 409 IDEMPOTENCY_CONFLICT; all-zero update is
quarantined; stale version is rejected; approving a quarantined event
updates inventory.

Tests run against the same Postgres instance as dev (via DATABASE_URL) and
clean up their own test data in `afterEach`. For a fully isolated CI setup,
point DATABASE_URL at a separate test database instead.

## API overview
- `POST /api/v1/inventory-events` — submit an inventory update. Requires
  an `Idempotency-Key` header.
- `GET /api/v1/inventory-events` — list events, filterable by
  `merchantId`, `storeId`, `status`.
- `GET /api/v1/inventory-events/:eventId` — event detail + line items.
- `POST /api/v1/inventory-events/:eventId/approve` — approve a quarantined
  event and apply it to live inventory. Body: `{ reviewer, comment? }`.
- `POST /api/v1/inventory-events/:eventId/reject` — reject a quarantined
  event without touching inventory. Body: `{ reviewer, comment? }`.
- `GET /api/v1/stores/:storeId/health?merchantId=` — freshness, SKU
  counts, and quarantine count for a store.

## Architecture summary
Layered: routes (parse request, call service) → services (business rules:
idempotency, validation, versioning, quarantine) → raw `pg` queries. The
idempotency-key uniqueness, the merchant+store+eventId uniqueness, and the
event-item SKU uniqueness are all enforced as real Postgres constraints,
not app-level checks. `InventoryService.processEvent` wraps the full
validate → check → apply sequence in one transaction using `FOR UPDATE`
on the store's version row, so concurrent events for the same store can't
race past the staleness check together.

## DB model
See `backend/src/db/schema.sql` — `inventory_events`,
`inventory_event_items`, `store_inventory`, `store_versions`.

## Assumptions, trade-offs, and known limitations
- Store IDs are assumed unique per merchant, not globally — all
  store-scoped tables key on `(merchant_id, store_id, ...)`.
- No authentication/authorization layer; `reviewer` is passed as a plain
  string in the approve/reject request body rather than derived from a
  logged-in session. A production version would take this from an auth
  token instead.
- Structured logs go to stdout via pino; nothing ships them to a log
  aggregator. In production this would feed something like CloudWatch or
  Datadog, with alerts on `STALE`/`AT_RISK` store health and on
  `QUARANTINED` events sitting unreviewed past a threshold.
- Reconciliation (Section 6.3's daily received-vs-applied report) isn't
  automated — the data needed for it exists in `inventory_events`, but no
  scheduled job produces the report yet.
- Tests run against the dev database rather than a fully isolated test
  database, for simplicity within the exercise's time constraints.

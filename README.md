# Quick Mart Business Case
1. [Part A - Business Case Resolutions](#quickmart-business-case---part-A)
2. [Part B - Control Tower Setup](#quickmart-inventory-control---part-B)



# QuickMart Inventory Control — Part B

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


# QuickMart Business Case - Part A

**Presented by:** Luis Villegas Palomares
**Last updated:** August 18, 2026
**Project status:** Week 3 of 6

> **Recommendation at a glance:** Launch a smaller, controlled pilot (20 stores) — not the full 100.

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Risk Assessment](#2-risk-assessment)
3. [Launch Recommendation](#3-launch-recommendation)
4. [Technical Action Plan](#4-technical-action-plan)
5. [Onboarding and Pilot Plan](#5-onboarding-and-pilot-plan)
6. [Merchant Communication Strategy](#6-merchant-communication-strategy)
7. [KPIs and Success Criteria](#7-kpis-and-success-criteria)
8. [Next Steps](#8-next-steps)

---

## 1. Executive Summary

**Recommendation:** Launch a smaller, controlled pilot of 20 stores on the agreed date — not the original 100-store cohort, and not a full postponement.

**Why?**

- **Top risk:** the inventory pipeline has produced two full-store zero-stock events during testing, with no reconciliation and no automatic alerting — directly threatening the 2% technical-cancellation and 98% availability commitments.
- **Top constraint:** the six-week preparation window assumed a smooth ramp, but by week 3 only one of the 100 pilot stores had completed a full end-to-end test, and 12 stores stopped sending the handshake during an 8-hour test with no consolidated root cause — so we cannot yet certify that 100 stores can be monitored and supported reliably by launch day.

## 2. Risk Assessment

### 2.1 Main Risks

1. Mass inventory wipeout.
2. Silent handshake failures with no root cause.
3. Order-processing bottlenecks and integrity gaps.

### 2.2 Launch Blockers

These issues must be resolved before any stores go live:

- **No inventory reconciliation or alerting:** without a way to detect and flag mass-zero or stalled-update events automatically, the pilot would repeat the exact failure seen in testing.
- **Missing idempotency key on inventory updates:** duplicate or out-of-order updates can silently corrupt stock levels.
- **Unexplained handshake dropouts with no alerting and delayed deactivation:** store availability cannot be trusted or monitored until root cause is identified and an automatic alert is in place.
- **Only 1 of 100 pilot stores has completed a full end-to-end certification test** — insufficient coverage for a 100-store launch.
- **Ambiguous order outcome after a POS timeout:** not knowing whether the order was placed before declaring it failed causes duplicate or lost orders.

### 2.3 Temporarily Accepted Issues

- **580 menu items rejected:** publish the 11,420 valid products and withhold the rejected ones.
- **Slow or non-standardized POS error codes:** not a reason to delay if a safe default is implemented.
- **Outdated product mappings on some stores:** correct per store during onboarding rather than delaying the whole launch.
- **8% inventory API timeout rate:** acceptable short term if safe retry + idempotency is implemented.

### 2.4 Additional Information to Request

- Raw logs from the 12 stores that lost handshake during testing, and from all mass-zero inventory wipeout events, to establish root cause.
- The POS provider's incident response SLA, escalation contact, and confirmation of whether the "local connectivity" explanation is backed by evidence or is speculative.

## 3. Launch Recommendation

Although QuickMart is not ready for a 100-store launch as originally proposed, a full postponement is not warranted given the progress made. A controlled pilot is the best option for QuickMart.

### 3.1 Final Approval Authority

The final launch approval authority should be a joint sign-off between the head of the Integration team and the head of the Operations team.

### 3.2 Conditions for a Pause or Rollback

- Technical cancellation rate > 2.0% over a rolling 3-hour window.
- Store availability under 98%.
- A repeat mass-zero inventory event occurs without operator confirmation of an intentional cause.
- Evidence of duplicate order fulfillment, duplicate charges, or orders lost at scale.
- POS response time over 15 seconds for more than 10% of incoming orders.

## 4. Technical Action Plan

### 4.1 Menu

| Issue | Action | Owner | Target |
|---|---|---|---|
| Duplicate SKUs, invalid price format, missing categories, invalid image URLs, bad promo dates (580 products) | Publish the 11,420 valid products now; return a structured, per-SKU rejection report (reason code + field) to QuickMart via SFTP/API so their systems can bulk-correct rather than manually triage. | Integration Eng. | Report by Day 2 |
| QuickMart cannot fix all 580 before launch | Accept partial catalog for pilot (temporarily acceptable, Section 2.3); track weekly re-submission and re-validation until coverage ≥ 99%. | QuickMart / Merchant Ops | Ongoing, weekly |
| Long processing time (3h40m for 12,000 SKUs) | Move to incremental/delta processing (only changed SKUs) instead of full-file reprocessing to cut turnaround for corrections. | Integration Eng. | Week 4 |
| No reconciliation between received/processed/rejected/published counts | Build an automated reconciliation report after every menu file, surfaced on the dashboard and emailed to merchant + internal ops. | Integration Eng. | Before 100-store gate |
| Promotions embedded in menu file | Validate promotion date logic (end ≥ start) at ingestion and reject only the promotion line, not the whole product, where possible. | Integration Eng. | Week 4 |

### 4.2 Inventory

| Issue | Action | Owner | Target |
|---|---|---|---|
| ~8% API timeout rate | Add server-side fast-ack pattern (accept + async process) and tune POS/middleware timeout budgets; monitor and alert if rate exceeds 5%. | Platform Eng. | Week 4 |
| Resends without idempotency key; duplicate updates possible | Make Idempotency-Key mandatory and enforce it server-side (persisted, not just in-memory) so retries are safely deduplicated. | Platform Eng. | Blocker — before pilot |
| Two all-zero inventory events during testing | Implement mass-zero-stock quarantine: hold any update where 100% of items = 0 (or ≥70% flip from >0 to 0) for manual approval instead of auto-applying. | Platform Eng. | Blocker — before pilot |
| No automated reconciliation | Nightly reconciliation job comparing QuickMart's last-sent state vs. platform-applied state, with variance report. | Platform Eng. | Before 100-store gate |
| No alert when updates stop | Store-level freshness monitor: flag any store with no successfully applied update in 15 minutes as STALE and alert Integration Ops. | Platform Eng. | Blocker — before pilot |
| Root cause of all-zero events unconfirmed ("temporary middleware issue") | Request QuickMart's incident write-up and change log; add correlation IDs end-to-end to trace future recurrences immediately. | QuickMart / Integration | Week 4 |

### 4.3 Orders

| Issue | Action | Owner | Target |
|---|---|---|---|
| POS response > 15s in some cases | Set an explicit SLA with POS provider (target < 8s, hard timeout at 15s); add async status-check fallback for slow responses. | POS Provider / Integration | Week 4 |
| Webhook retries not always processed correctly by QuickMart | Define and document a standard retry contract (backoff schedule, expected ack) and certify QuickMart's handling in pre-launch testing. | QuickMart / Integration | Blocker — before pilot |
| Outdated product mappings at some stores | Add a mapping-validation step to store certification; block a store's go-live until mapping passes. | Merchant Ops | Per-store, ongoing |
| Non-standardized POS error codes | Build a normalization/mapping layer on the platform side so downstream logic doesn't depend on POS-specific codes; request standardization from POS provider in parallel. | Platform Eng. | Week 4 |
| Unclear order status after timeout | Implement mandatory status-reconciliation call after any timeout before declaring an order failed, to avoid duplicate or silently-lost orders. | Platform Eng. | Blocker — before pilot |
| Orders accepted then cancelled for unavailable product | Tie order acceptance to freshest inventory snapshot (post idempotency/reconciliation fixes) to reduce false-accepts. | Platform Eng. | Before 100-store gate |

### 4.4 Handshake and Store Availability

| Issue | Action | Owner | Target |
|---|---|---|---|
| 12/100 stores stopped sending handshake in an 8-hr test | Instrument end-to-end tracing on the handshake path (store → POS → middleware → platform) with correlation IDs to pinpoint failure layer. | QuickMart / POS / Integration | Blocker — before pilot |
| No automatic alert on missed handshake | Alert Integration Ops automatically after 2 consecutive missed handshakes (10 minutes), before deactivation. | Platform Eng. | Blocker — before pilot |
| Store stayed visible/orderable for several minutes before deactivation | Reduce grace period to a defined, tested threshold (e.g., 1 missed cycle = at-risk / flagged for no new orders; 2 missed = deactivated) to stop routing orders to unreachable stores. | Platform Eng. | Blocker — before pilot |
| No consolidated root-cause evidence | Joint war-room review with QuickMart, POS provider, and Integration using the new tracing data from the 20-store pilot before expanding further. | Integration Ops | Week 4 |
| POS provider attributes to "local connectivity," unconfirmed | Request connectivity logs / uptime data per affected store from POS provider to validate or rule out this explanation. | POS Provider | Week 4 |
| No defined store reactivation process | Define an automatic reactivation flow once handshake resumes for N consecutive cycles, with an audit log entry. | Platform Eng. | Before 100-store gate |

## 5. Onboarding and Pilot Plan

### 5.1 Three-Week Activity Roadmap (Weeks 4–6)

| Week | Priority Activities & Milestones | Testing / Certification | Dependencies |
|---|---|---|---|
| Week 4 | Fix blocker-class defects: mandatory idempotency key, mass-zero quarantine, stale-store alerting, handshake tracing + faster deactivation, order-status reconciliation after timeout. Select and certify the 20 pilot stores. Publish 11,420-product menu; send rejection report for the 580. | Re-run end-to-end test on all 20 pilot stores individually. Load/latency test on inventory + order APIs. | QuickMart dev availability for fixes; POS provider engagement for handshake tracing. |
| Week 5 | Launch 20-store controlled pilot on the original commercial date. Run hypercare. Daily defect triage. Begin reconciliation dashboards for inventory and menu. | Monitor KPIs against pilot-gate thresholds; joint war-room review of handshake root cause using new tracing data. | 20-store pilot go/no-go sign-off ; marketing campaign scoped to pilot stores only or delayed to match footprint. |
| Week 6 | Evaluate 20-store results against Gate 1 criteria. If met, begin phased ramp toward 100 stores; if not, extend pilot and remediate. Formalize hypercare-to-steady-state handover plan for post-launch weeks. | Gate review with Launch Governance Board; regression test of all Week-4 fixes at higher volume. | Clean gate-1 KPI results; QuickMart's remediation of remaining menu rejections. |

### 5.2 RACI Matrix

| Activity | QuickMart | Commercial/KAM | Operations | Integration/Eng. | POS Provider | Product | Marketing |
|---|---|---|---|---|---|---|---|
| Fix blocker defects (idempotency, alerting, reconciliation) | C | I | I | R/A | C | I | I |
| Pilot store selection & certification | C | I | A | R | C | I | I |
| Menu correction (580 rejected products) | R/A | I | I | C | I | I | I |
| Handshake root-cause investigation | C | I | I | R/A | R | I | I |
| Go/No-Go decision | C | C | C | A | C | I | I |
| Hypercare monitoring & incident response | C | I | R | R/A | C | I | I |
| Expansion gate review (20→100→500) | I | C | C | R/A | C | I | I |
| Merchant & stakeholder communication | I | R/A | C | C | I | I | C |
| Campaign timing / scope decisions | I | C | I | C | I | I | R/A |

*R = Responsible, A = Accountable, C = Consulted, I = Informed. Integration/Engineering holds accountability for technical go/no-go criteria; Commercial/KAM holds accountability for merchant and campaign communication.*

### 5.3 Pilot Expansion Gates (20 → 100 → 500)

| Gate | Entry Criteria (must hold for the stated window) | Additional Requirements |
|---|---|---|
| Gate 1: 20 → 100 stores | Store availability ≥ 98%; technical cancellation < 2%; zero unresolved mass-zero inventory events; zero un-alerted handshake dropouts, over a sustained 5-business-day window on the 20-store cohort. | All Section 2.2 blockers closed and verified in production (not just staging); handshake root cause identified and mitigated; menu coverage ≥ 97%. |
| Gate 2: 100 → 500 stores | Same KPI thresholds sustained over a 10-business-day window across the full 100-store cohort, including at least one full weekly promotional cycle. | Reconciliation and alerting proven at 100-store volume; support/on-call capacity scaled for 500-store volume. |

## 6. Merchant Communication Strategy

### 6.1 To Whom, and What

| Audience | Core Message |
|---|---|
| QuickMart | We are launching on the agreed date with a 20-store controlled pilot, not all 100, because production data shows unresolved risks (inventory, handshake) that would put their stores and customer experience at risk if launched at full scale immediately. We commit to a clear path to 100 and then 500 stores, with dates driven by objective, jointly-visible KPI gates rather than a fixed calendar. |
| Commercial / KAM | The pilot protects the commercial relationship and the launch date, while avoiding a scenario where a systemic failure at 100 stores damages QuickMart's trust in the platform far more than a short, well-communicated phased ramp would. |
| Operations | Their 20-store proposal is being adopted; hypercare staffing and escalation coverage is scoped to that footprint, with a defined trigger for scaling coverage at Gate 1 and Gate 2. |
| Product | The defect classes exposed (idempotency, reconciliation, alerting, order-status ambiguity) are prioritized as platform-hardening work with fixed owners and week-4 target dates; this should inform the roadmap beyond QuickMart. |
| Engineering | The specific blocker list with owners and target dates; engineering leads confirm feasibility of the Week-4 fixes before the pilot go/no-go. |
| Marketing | The campaign runs on the original date, scoped to the 20-store pilot footprint (or messaged as a phased rollout) so promotional demand does not outstrip the stores actually live and monitored. |
| POS provider (3rd party) | Specific, evidenced asks: connectivity/uptime logs for the 12 stores with handshake dropouts, an SLA commitment on response time (<15s incidents), and standardized error codes; framed as a joint investigation, not a one-sided blame assignment. |

### 6.2 What the Communication Must Clarify (per audience, tailored)

- What can be launched: 20 stores, on the original date, with the full order/menu/inventory flow live.
- What should not be launched (yet): the remaining 80 of the first 100 stores, pending Gate 1 KPI results.
- Which risks remain open: handshake root cause, full reconciliation automation, POS latency/error-code standardization, all tracked publicly in the weekly progress meeting.
- Which risks are being temporarily accepted: the 580 rejected menu products (4.8%), pending QuickMart's correction.
- What QuickMart must complete: correct/resubmit rejected products, support handshake root-cause investigation with store-side data, enforce idempotency keys on inventory resends.
- What support is required from the POS provider: connectivity logs, response-time SLA, standardized error codes, participation in the joint war-room review.
- What internal teams must complete: the blocker risks fixes (idempotency, quarantine, alerting, tracing, status reconciliation) before pilot go-live.
- What conditions must be met before expansion: the Gate 1 and Gate 2 criteria reviewed transparently with QuickMart and Commercial.
- How incidents and progress will be communicated: Summaries, a living KPI dashboard, and the existing weekly QuickMart/Commercial/Operations/Integration meeting used as the standing forum, not a new channel.
- How the commercial relationship is protected without hiding technical risk: by giving QuickMart and Commercial a concrete, dated path to 100 and 500 stores (not a vague delay) and by showing the pilot as risk management that protects their brand and customer experience, not as a lack of confidence in the partnership.

### 6.3 If Commercial Keeps Insisting on 100 Stores

Acknowledge the commercial pressure directly rather than dismissing it, and reframe the choice: launching 100 stores with known, repeatable defects risks a much larger and more visible failure, mass technical cancellations or dark stores across the full cohort, in front of the marketing campaign's spotlight, which would damage the QuickMart relationship far more than a transparent, dated pilot-to-scale plan. Offer the Launch Governance Board structure as the forum to make that trade-off explicit and jointly owned, and present the Gate 1 timeline (roughly one to two weeks behind a 100-store start) as a small, bounded delay in exchange for a materially lower risk of a public incident. If Commercial still wants to formally override, the request goes to the same final authority and is documented; it is not something Integration should quietly absorb or execute around.

## 7. KPIs and Success Criteria

| Metric | Calculation Formula | Target | Monitor Window | Warning Escalation | Rollback Threshold |
|---|---|---|---|---|---|
| Technical Cancel Rate | Tech Canceled / Orders | < 2.0% | Rolling 3 Hrs | > 1.5% | > 2.5% |
| Store Availability | Uptime Hours / Total Hours | > 98.0% | Daily | < 98.0% | < 95.0% |
| Inventory Freshness | Time since last valid sync | < 15 m | Real-Time | > 20 m | > 45 m |
| POS Latency (P95) | 95th percentile response | < 5.0s | Hourly | > 10.0s | > 15.0s |
| Catalog Coverage | Active SKUs / Total SKUs | > 95.0% | Per Sync | < 95.0% | < 90.0% |

## 8. Next Steps

### 8.1 Immediate Actions (Next 48 Hours)

- Convene the Launch Governance Board to confirm the 20-store pilot recommendation and the revised communication to QuickMart/Commercial.
- Engineering begins the four blocker fixes: mandatory idempotency key enforcement, mass-zero inventory quarantine, stale-store alerting, and order-status reconciliation after timeout.
- Request from POS provider: connectivity/uptime logs for the 12 stores with handshake dropouts, and confirmation of engagement in the joint root-cause review.
- Request from QuickMart: rejected-product correction plan/timeline for the 580 SKUs, and confirmation of idempotency-key support in their resend logic.
- Finalize the 20 pilot store selection (operationally diverse: POS versions, geography, connectivity profile) and schedule individual end-to-end certification tests.

/**
 * Seeds the running backend with realistic demo data by calling the real
 * API — not inserting SQL directly — so idempotency hashing, versioning,
 * and quarantine logic all run for real. Requires the backend to already
 * be running (npm run dev) before you run this.
 *
 * Usage: node scripts/seed.js
 * (Plain JS on purpose — avoids ts-node entirely, and Node 18+ has a
 * built-in global `fetch`, so no dependencies are needed to run this.)
 */

const BASE_URL = process.env.SEED_BASE_URL ?? "http://localhost:4000/api/v1";
const MERCHANT_ID = "quickmart";

async function postEvent(storeId, eventId, version, items) {
    const res = await fetch(`${BASE_URL}/inventory-events`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": `seed-${storeId}-${eventId}`,
        },
        body: JSON.stringify({
            merchantId: MERCHANT_ID,
            storeId,
            eventId,
            version,
            sentAt: new Date().toISOString(),
            items,
        }),
    });
    const body = await res.json();
    console.log(`  [${res.status}] ${storeId} v${version} (${eventId}) ->`, body.data ?? body.error);
    return body;
}

async function approveEvent(eventId) {
    const res = await fetch(`${BASE_URL}/inventory-events/${eventId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            reviewer: "integration.operations@company.com",
            comment: "Confirmed with QuickMart — planned store closure, not a real wipe.",
        }),
    });
    const body = await res.json();
    console.log(`  approve [${res.status}] ${eventId} ->`, body.data ?? body.error);
}

async function rejectEvent(eventId) {
    const res = await fetch(`${BASE_URL}/inventory-events/${eventId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            reviewer: "integration.operations@company.com",
            comment: "QuickMart confirmed this was a middleware error, not a real update.",
        }),
    });
    const body = await res.json();
    console.log(`  reject [${res.status}] ${eventId} ->`, body.data ?? body.error);
}

function menuItems(storeSeed, count, allZero = false) {
    return Array.from({ length: count }, (_, i) => ({
        sku: `SKU-${storeSeed}-${String(i + 1).padStart(3, "0")}`,
        stock: allZero ? 0 : Math.floor(Math.random() * 50) + 1,
    }));
}

async function seed() {
    console.log("Seeding QM-001 (healthy store, two applied updates)...");
    await postEvent("QM-001", "evt-001", 1, menuItems(1, 25));
    await postEvent("QM-001", "evt-002", 2, menuItems(1, 25));

    console.log("\nSeeding QM-002 (healthy, smaller catalog)...");
    await postEvent("QM-002", "evt-001", 1, menuItems(2, 12));

    console.log("\nSeeding QM-003 (will get a pending quarantine event)...");
    await postEvent("QM-003", "evt-001", 1, menuItems(3, 20));
    await postEvent("QM-003", "evt-002", 2, menuItems(3, 20, true)); // all-zero -> quarantined
    console.log("  -> leave this one PENDING for the live demo (approve/reject on stage)");

    console.log("\nSeeding QM-004 (quarantine that's already been approved, for history)...");
    await postEvent("QM-004", "evt-001", 1, menuItems(4, 15));
    const toApprove = await postEvent("QM-004", "evt-002", 2, menuItems(4, 15, true));
    if (toApprove?.data?.eventId) {
        await approveEvent(toApprove.data.eventId);
    }

    console.log("\nSeeding QM-005 (a rejected quarantine, for history)...");
    await postEvent("QM-005", "evt-001", 1, menuItems(5, 18));
    const toReject = await postEvent("QM-005", "evt-002", 2, menuItems(5, 18, true));
    if (toReject?.data?.eventId) {
        await rejectEvent(toReject.data.eventId);
    }

    console.log("\nDone. QM-003's quarantined event is left pending on purpose —");
    console.log("use it to demo the Approve/Reject confirmation flow live.");
}

seed().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
});
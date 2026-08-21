import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/db';

const app = createApp();

function basePayload(overrides: Partial<any> = {}) {
    return {
        merchantId: 'quickmart',
        storeId: 'store-test-1',
        eventId: `evt-${Date.now()}-${Math.random()}`,
        version: 1,
        sentAt: new Date().toISOString(),
        items: [
            { sku: 'SKU-1', stock: 10 },
            { sku: 'SKU-2', stock: 5 },
        ],
        ...overrides,
    };
}

async function cleanStore(storeId: string) {
    await pool.query('DELETE FROM inventory_event_items WHERE event_id IN (SELECT id FROM inventory_events WHERE store_id = $1)', [storeId]);
    await pool.query('DELETE FROM inventory_events WHERE store_id = $1', [storeId]);
    await pool.query('DELETE FROM store_inventory WHERE store_id = $1', [storeId]);
    await pool.query('DELETE FROM store_versions WHERE store_id = $1', [storeId]);
}

afterAll(async () => {
    await pool.end();
});

describe('POST /api/v1/inventory-events', () => {
    afterEach(async () => {
        await cleanStore('store-test-1');
        await cleanStore('store-test-2');
        await cleanStore('store-test-3');
    });

    // 1. A valid event applies
    it('applies a valid event and updates current inventory', async () => {
        const payload = basePayload({ storeId: 'store-test-1', version: 1 });

        const res = await request(app)
            .post('/api/v1/inventory-events')
            .set('Idempotency-Key', `key-valid-${Date.now()}`)
            .send(payload);

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('APPLIED');

        const inventory = await pool.query(
            'SELECT stock FROM store_inventory WHERE merchant_id = $1 AND store_id = $2 AND sku = $3',
            [payload.merchantId, payload.storeId, 'SKU-1']
        );
        expect(inventory.rows[0].stock).toBe(10);
    });

    // 2. Same key + same payload is not reprocessed
    it('does not reprocess a repeated request with the same idempotency key and payload', async () => {
        const payload = basePayload({ storeId: 'store-test-1', version: 1 });
        const key = `key-repeat-${Date.now()}`;

        const first = await request(app)
            .post('/api/v1/inventory-events')
            .set('Idempotency-Key', key)
            .send(payload);
        const second = await request(app)
            .post('/api/v1/inventory-events')
            .set('Idempotency-Key', key)
            .send(payload);

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(second.body.data.eventId).toBe(first.body.data.eventId);

        const count = await pool.query('SELECT COUNT(*) FROM inventory_events WHERE idempotency_key = $1', [key]);
        expect(Number(count.rows[0].count)).toBe(1);
    });

    // 3. Same key + different payload returns a conflict
    it('returns 409 IDEMPOTENCY_CONFLICT for the same key with a different payload', async () => {
        const key = `key-conflict-${Date.now()}`;
        const first = basePayload({ storeId: 'store-test-1', version: 1 });
        const second = basePayload({ storeId: 'store-test-1', version: 1, items: [{ sku: 'SKU-9', stock: 1 }] });

        await request(app).post('/api/v1/inventory-events').set('Idempotency-Key', key).send(first);
        const res = await request(app).post('/api/v1/inventory-events').set('Idempotency-Key', key).send(second);

        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    });

    // 4. An all-zero update is quarantined, not applied
    it('quarantines an all-zero stock update instead of applying it', async () => {
        const setup = basePayload({ storeId: 'store-test-2', version: 1, items: [{ sku: 'SKU-1', stock: 20 }] });
        await request(app)
            .post('/api/v1/inventory-events')
            .set('Idempotency-Key', `key-setup-${Date.now()}`)
            .send(setup);

        const zeroed = basePayload({
            storeId: 'store-test-2',
            version: 2,
            items: [{ sku: 'SKU-1', stock: 0 }],
        });
        const res = await request(app)
            .post('/api/v1/inventory-events')
            .set('Idempotency-Key', `key-zero-${Date.now()}`)
            .send(zeroed);

        expect(res.status).toBe(202);
        expect(res.body.data.status).toBe('QUARANTINED');
        expect(res.body.data.reasonCode).toBe('MASS_ZERO_STOCK_DETECTED');

        const inventory = await pool.query(
            'SELECT stock FROM store_inventory WHERE merchant_id = $1 AND store_id = $2 AND sku = $3',
            [setup.merchantId, 'store-test-2', 'SKU-1']
        );
        expect(inventory.rows[0].stock).toBe(20); // untouched
    });

    // 5. A stale version is rejected
    it('rejects an event whose version is not greater than the applied version', async () => {
        const first = basePayload({ storeId: 'store-test-3', version: 5 });
        await request(app)
            .post('/api/v1/inventory-events')
            .set('Idempotency-Key', `key-v5-${Date.now()}`)
            .send(first);

        const stale = basePayload({ storeId: 'store-test-3', version: 3 });
        const res = await request(app)
            .post('/api/v1/inventory-events')
            .set('Idempotency-Key', `key-v3-${Date.now()}`)
            .send(stale);

        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('STALE_EVENT');
    });

    // 6. Approving a quarantined event updates inventory
    it('applies inventory once a quarantined event is approved', async () => {
        const setup = basePayload({ storeId: 'store-test-1', version: 1, items: [{ sku: 'SKU-1', stock: 20 }] });
        await request(app)
            .post('/api/v1/inventory-events')
            .set('Idempotency-Key', `key-setup2-${Date.now()}`)
            .send(setup);

        const zeroed = basePayload({ storeId: 'store-test-1', version: 2, items: [{ sku: 'SKU-1', stock: 0 }] });
        const quarantined = await request(app)
            .post('/api/v1/inventory-events')
            .set('Idempotency-Key', `key-zero2-${Date.now()}`)
            .send(zeroed);

        const eventId = quarantined.body.data.eventId;

        const approveRes = await request(app)
            .post(`/api/v1/inventory-events/${eventId}/approve`)
            .send({ reviewer: 'test-reviewer', comment: 'confirmed with merchant' });

        expect(approveRes.status).toBe(200);
        expect(approveRes.body.data.status).toBe('APPROVED');

        const inventory = await pool.query(
            'SELECT stock FROM store_inventory WHERE merchant_id = $1 AND store_id = $2 AND sku = $3',
            [setup.merchantId, 'store-test-1', 'SKU-1']
        );
        expect(inventory.rows[0].stock).toBe(0); // now applied
    });
});

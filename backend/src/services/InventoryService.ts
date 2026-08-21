import { pool } from '../db';
import { InventoryEventPayload } from '../common/types/inventory';
import { inventoryEventSchema } from '../common/validation/inventoryEvent.schema';
import { hashPayload } from '../utils/hash';

interface EventResult {
    statusCode: number;
    data?: {
        eventId: string;
        status: string;
        reasonCode: string | null;
    };
    error?: {
        code: string;
        message: string;
        details?: unknown;
    };
}

function toResponseShape(row: any): EventResult['data'] {
    return {
        eventId: row.id,
        status: row.status,
        reasonCode: row.reason_code ?? null,
    };
}

export class InventoryService {
    public static async processEvent(
        idempotencyKey: string,
        payload: InventoryEventPayload
    ): Promise<EventResult> {
        // 1. Validate before sending to db
        const validation = inventoryEventSchema.safeParse(payload);
        if (!validation.success) {
            return {
                statusCode: 400,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid payload.',
                    details: validation.error.flatten(),
                },
            };
        }

        const payloadHash = hashPayload(payload);
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // 2. Idempotency check
            const existing = await client.query(
                'SELECT * FROM inventory_events WHERE idempotency_key = $1',
                [idempotencyKey]
            );

            if (existing.rows.length > 0) {
                const record = existing.rows[0];
                await client.query('COMMIT');

                if (record.payload_hash === payloadHash) {
                    return { statusCode: 200, data: toResponseShape(record) };
                }
                return {
                    statusCode: 409,
                    error: {
                        code: 'IDEMPOTENCY_CONFLICT',
                        message: 'Payload mismatch for existing idempotency key.',
                    },
                };
            }

            // 3. Version check -> stale-event protection)
            const verResult = await client.query(
                'SELECT latest_version FROM store_versions WHERE merchant_id = $1 AND store_id = $2 FOR UPDATE',
                [payload.merchantId, payload.storeId]
            );

            if (verResult.rows.length > 0 && payload.version <= verResult.rows[0].latest_version) {
                await client.query('ROLLBACK');
                return {
                    statusCode: 409,
                    error: {
                        code: 'STALE_EVENT',
                        message: 'Event version is equal to or lower than the applied store version.',
                    },
                };
            }

            // 4. Mass-change quarantine rule
            const allZero = payload.items.every((i) => i.stock === 0);
            let isQuarantined = allZero;

            if (!isQuarantined && verResult.rows.length > 0) {
                const activeItems = await client.query(
                    'SELECT sku FROM store_inventory WHERE merchant_id = $1 AND store_id = $2 AND stock > 0',
                    [payload.merchantId, payload.storeId]
                );
                if (activeItems.rows.length > 0) {
                    const zeroedCount = payload.items.filter(
                        (i) => i.stock === 0 && activeItems.rows.some((a) => a.sku === i.sku)
                    ).length;
                    if (zeroedCount / activeItems.rows.length >= 0.7) {
                        isQuarantined = true;
                    }
                }
            }

            const status = isQuarantined ? 'QUARANTINED' : 'APPLIED';
            const reasonCode = isQuarantined ? 'MASS_ZERO_STOCK_DETECTED' : null;

            // 5. Save the event
            const eventRes = await client.query(
                `INSERT INTO inventory_events
                    (idempotency_key, payload_hash, merchant_id, store_id, event_id, version, sent_at, status, reason_code, processed_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
                 RETURNING *`,
                [
                    idempotencyKey,
                    payloadHash,
                    payload.merchantId,
                    payload.storeId,
                    payload.eventId,
                    payload.version,
                    payload.sentAt,
                    status,
                    reasonCode,
                ]
            );
            const eventRow = eventRes.rows[0];
            const dbEventId = eventRow.id;

            // 6. Save line items 
            const values: unknown[] = [];
            const placeholders = payload.items
                .map((item, idx) => {
                    values.push(dbEventId, item.sku, item.stock);
                    const base = idx * 3;
                    return `($${base + 1}, $${base + 2}, $${base + 3})`;
                })
                .join(', ');
            await client.query(
                `INSERT INTO inventory_event_items (event_id, sku, stock) VALUES ${placeholders}`,
                values
            );

            // 7. If not quarantined, apply to live inventory + advance the version
            if (!isQuarantined) {
                const invValues: unknown[] = [];
                const invPlaceholders = payload.items
                    .map((item, idx) => {
                        invValues.push(payload.merchantId, payload.storeId, item.sku, item.stock);
                        const base = idx * 4;
                        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, CURRENT_TIMESTAMP)`;
                    })
                    .join(', ');
                await client.query(
                    `INSERT INTO store_inventory (merchant_id, store_id, sku, stock, updated_at)
                     VALUES ${invPlaceholders}
                     ON CONFLICT (merchant_id, store_id, sku)
                     DO UPDATE SET stock = EXCLUDED.stock, updated_at = CURRENT_TIMESTAMP`,
                    invValues
                );

                await client.query(
                    `INSERT INTO store_versions (merchant_id, store_id, latest_version, updated_at)
                     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                     ON CONFLICT (merchant_id, store_id)
                     DO UPDATE SET latest_version = EXCLUDED.latest_version, updated_at = CURRENT_TIMESTAMP`,
                    [payload.merchantId, payload.storeId, payload.version]
                );
            }

            await client.query('COMMIT');
            return {
                statusCode: isQuarantined ? 202 : 200,
                data: toResponseShape(eventRow),
            };
        } catch (err: any) {
            await client.query('ROLLBACK');

            // Two identical requests ( same idempotency key) fetched as one
            if (err.code === '23505' && err.constraint?.includes('idempotency_key')) {
                const winner = await pool.query(
                    'SELECT * FROM inventory_events WHERE idempotency_key = $1',
                    [idempotencyKey]
                );
                const record = winner.rows[0];
                if (record.payload_hash === payloadHash) {
                    return { statusCode: 200, data: toResponseShape(record) };
                }
                return {
                    statusCode: 409,
                    error: {
                        code: 'IDEMPOTENCY_CONFLICT',
                        message: 'Payload mismatch for existing idempotency key.',
                    },
                };
            }

            // Same logical event resent under a new idempotency key
            if (err.code === '23505' && err.constraint?.includes('merchant_id')) {
                return {
                    statusCode: 409,
                    error: {
                        code: 'IDEMPOTENCY_CONFLICT',
                        message: 'This event was already received under a different idempotency key.',
                    },
                };
            }

            throw err;
        } finally {
            client.release();
        }
    }
}

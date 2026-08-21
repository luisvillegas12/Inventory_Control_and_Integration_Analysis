import { pool } from '../db';

// Result shape for the review operation, indicating success or failure with relevant details
interface ReviewResult {
    statusCode: number;
    data?: { eventId: string; status: string };
    error?: { code: string; message: string };
}

// Service class for handling the review (approval/rejection) of inventory events
export class ReviewService {
    public static async review(
        eventId: string,
        decision: 'APPROVED' | 'REJECTED',
        reviewer: string,
        comment?: string
    ): Promise<ReviewResult> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const eventRes = await client.query(
                'SELECT * FROM inventory_events WHERE id = $1 FOR UPDATE',
                [eventId]
            );

            if (eventRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return { statusCode: 404, error: { code: 'NOT_FOUND', message: 'Event not found.' } };
            }

            const event = eventRes.rows[0];

            if (event.status !== 'QUARANTINED') {
                await client.query('ROLLBACK');
                return {
                    statusCode: 409,
                    error: {
                        code: 'INVALID_TRANSITION',
                        message: `Cannot ${decision.toLowerCase()} an event with status ${event.status}.`,
                    },
                };
            }

            await client.query(
                `UPDATE inventory_events
                 SET status = $1, reviewer = $2, reviewer_comment = $3, processed_at = CURRENT_TIMESTAMP
                 WHERE id = $4`,
                [decision, reviewer, comment ?? null, eventId]
            );

            if (decision === 'APPROVED') {
                const items = await client.query(
                    'SELECT sku, stock FROM inventory_event_items WHERE event_id = $1',
                    [eventId]
                );

                if (items.rows.length > 0) {
                    const values: unknown[] = [];
                    const placeholders = items.rows
                        .map((item, idx) => {
                            values.push(event.merchant_id, event.store_id, item.sku, item.stock);
                            const base = idx * 4;
                            return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, CURRENT_TIMESTAMP)`;
                        })
                        .join(', ');

                    await client.query(
                        `INSERT INTO store_inventory (merchant_id, store_id, sku, stock, updated_at)
                         VALUES ${placeholders}
                         ON CONFLICT (merchant_id, store_id, sku)
                         DO UPDATE SET stock = EXCLUDED.stock, updated_at = CURRENT_TIMESTAMP`,
                        values
                    );
                }

                await client.query(
                    `INSERT INTO store_versions (merchant_id, store_id, latest_version, updated_at)
                     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                     ON CONFLICT (merchant_id, store_id)
                     DO UPDATE SET latest_version = EXCLUDED.latest_version, updated_at = CURRENT_TIMESTAMP
                     WHERE store_versions.latest_version < EXCLUDED.latest_version`,
                    [event.merchant_id, event.store_id, event.version]
                );
            }

            await client.query('COMMIT');
            return { statusCode: 200, data: { eventId, status: decision } };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }
}

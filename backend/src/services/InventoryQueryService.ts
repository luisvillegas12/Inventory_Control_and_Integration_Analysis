

import { pool } from '../db';

// Threshold in minutes to determine if a store's inventory data is considered stale
const STALE_THRESHOLD_MINUTES = Number(process.env.STALE_THRESHOLD_MINUTES ?? 15);

// Service class for querying inventory events and store health information from the database
export class InventoryQueryService {
    public static async listEvents(filters: {
        merchantId?: string;
        storeId?: string;
        status?: string;
        limit?: number;
        offset?: number;
    }) {
        const conditions: string[] = [];
        const values: unknown[] = [];

        if (filters.merchantId) {
            values.push(filters.merchantId);
            conditions.push(`merchant_id = $${values.length}`);
        }
        if (filters.storeId) {
            values.push(filters.storeId);
            conditions.push(`store_id = $${values.length}`);
        }
        if (filters.status) {
            values.push(filters.status);
            conditions.push(`status = $${values.length}`);
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const limit = filters.limit ?? 50;
        const offset = filters.offset ?? 0;
        values.push(limit, offset);

        const result = await pool.query(
            `SELECT * FROM inventory_events ${where}
             ORDER BY received_at DESC
             LIMIT $${values.length - 1} OFFSET $${values.length}`,
            values
        );
        return result.rows;
    }

    // Fetches detailed information for a specific inventory event, including its items
    public static async getEventDetail(eventId: string) {
        const eventRes = await pool.query('SELECT * FROM inventory_events WHERE id = $1', [eventId]);
        if (eventRes.rows.length === 0) return null;

        const itemsRes = await pool.query(
            'SELECT sku, stock FROM inventory_event_items WHERE event_id = $1 ORDER BY sku',
            [eventId]
        );

        return { ...eventRes.rows[0], items: itemsRes.rows };
    }

    // Fetches health information for a specific store, including last applied version, stock counts, and quarantine count
    public static async getStoreHealth(merchantId: string, storeId: string) {
        const versionRes = await pool.query(
            'SELECT latest_version, updated_at FROM store_versions WHERE merchant_id = $1 AND store_id = $2',
            [merchantId, storeId]
        );

        const inventoryStats = await pool.query(
            `SELECT
                COUNT(*) FILTER (WHERE stock > 0) AS in_stock,
                COUNT(*) FILTER (WHERE stock = 0) AS out_of_stock,
                COUNT(*) AS total_skus
             FROM store_inventory WHERE merchant_id = $1 AND store_id = $2`,
            [merchantId, storeId]
        );

        const quarantineRes = await pool.query(
            `SELECT COUNT(*) AS quarantine_count FROM inventory_events
             WHERE merchant_id = $1 AND store_id = $2 AND status = 'QUARANTINED'`,
            [merchantId, storeId]
        );

        if (versionRes.rows.length === 0) {
            return {
                merchantId,
                storeId,
                healthStatus: 'NO_DATA',
                lastAppliedVersion: null,
                lastAppliedAt: null,
                totalSkus: 0,
                inStockCount: 0,
                outOfStockCount: 0,
                quarantineCount: Number(quarantineRes.rows[0].quarantine_count),
            };
        }

        const lastAppliedAt = new Date(versionRes.rows[0].updated_at);
        const minutesSinceUpdate = (Date.now() - lastAppliedAt.getTime()) / 60000;

        let healthStatus: 'HEALTHY' | 'STALE' | 'AT_RISK';
        if (minutesSinceUpdate <= STALE_THRESHOLD_MINUTES) {
            healthStatus = 'HEALTHY';
        } else if (minutesSinceUpdate <= STALE_THRESHOLD_MINUTES * 4) {
            healthStatus = 'STALE';
        } else {
            healthStatus = 'AT_RISK';
        }

        return {
            merchantId,
            storeId,
            healthStatus,
            lastAppliedVersion: versionRes.rows[0].latest_version,
            lastAppliedAt: versionRes.rows[0].updated_at,
            totalSkus: Number(inventoryStats.rows[0].total_skus),
            inStockCount: Number(inventoryStats.rows[0].in_stock),
            outOfStockCount: Number(inventoryStats.rows[0].out_of_stock),
            quarantineCount: Number(quarantineRes.rows[0].quarantine_count),
        };
    }
}

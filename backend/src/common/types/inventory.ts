// Data structures for inventory events, their payloads, and the database rows that store them

export interface InventoryEventItem {
    sku: string;
    stock: number;
}

export interface InventoryEventPayload {
    merchantId: string;
    storeId: string;
    eventId: string;
    version: number;
    sentAt: string;
    items: InventoryEventItem[];
}

export interface InventoryEventRow {
    id: string;
    idempotency_key: string;
    payload_hash: string;
    merchant_id: string;
    store_id: string;
    event_id: string;
    version: number;
    sent_at: string;
    status: 'RECEIVED' | 'VALIDATED' | 'APPLIED' | 'QUARANTINED' | 'APPROVED' | 'REJECTED';
    reason_code: string | null;
    received_at: string;
    processed_at: string | null;
    reviewer: string | null;
    reviewer_comment: string | null;
}

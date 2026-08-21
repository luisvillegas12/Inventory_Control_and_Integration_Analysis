
-- 1. Inventory update attempts, validation outcome, and quarantine/review status
CREATE TABLE IF NOT EXISTS inventory_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    merchant_id VARCHAR(100) NOT NULL,
    store_id VARCHAR(100) NOT NULL,
    event_id VARCHAR(100) NOT NULL,
    version INTEGER NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (
        status IN ('RECEIVED', 'VALIDATED', 'APPLIED', 'QUARANTINED', 'APPROVED', 'REJECTED')
    ),
    reason_code VARCHAR(100),
    received_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMPTZ,
    reviewer VARCHAR(100),
    reviewer_comment TEXT,
    UNIQUE (merchant_id, store_id, event_id)
);

-- 2. Line items belonging to an event
CREATE TABLE IF NOT EXISTS inventory_event_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES inventory_events(id) ON DELETE CASCADE,
    sku VARCHAR(100) NOT NULL,
    stock INTEGER NOT NULL CHECK (stock >= 0),
    UNIQUE (event_id, sku)
);

-- 3. Live stock per merchant, store, and SKU
CREATE TABLE IF NOT EXISTS store_inventory (
    merchant_id VARCHAR(100) NOT NULL,
    store_id VARCHAR(100) NOT NULL,
    sku VARCHAR(100) NOT NULL,
    stock INTEGER NOT NULL CHECK (stock >= 0),
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (merchant_id, store_id, sku)
);

-- 4. Latest applied version per store
CREATE TABLE IF NOT EXISTS store_versions (
    merchant_id VARCHAR(100) NOT NULL,
    store_id VARCHAR(100) NOT NULL,
    latest_version INTEGER NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (merchant_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_events_merchant_store ON inventory_events(merchant_id, store_id);
CREATE INDEX IF NOT EXISTS idx_inventory_events_status ON inventory_events(status);
CREATE INDEX IF NOT EXISTS idx_inventory_event_items_event_id ON inventory_event_items(event_id);
CREATE INDEX IF NOT EXISTS idx_store_inventory_merchant_store ON store_inventory(merchant_id, store_id);

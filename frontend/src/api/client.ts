// Every page calls through here — no page hand-builds a fetch URL itself

export interface ApiErrorShape {
  code: string;
  message: string;
  retryable: boolean;
  details: unknown;
}

export class ApiError extends Error {
  code: string;
  retryable: boolean;
  details: unknown;

  constructor(shape: ApiErrorShape) {
    super(shape.message);
    this.name = "ApiError";
    this.code = shape.code;
    this.retryable = shape.retryable;
    this.details = shape.details;
  }
}

export interface ApiError {
  code: string;
  message: string;
  retryable: boolean;
  details: unknown;
}

export interface InventoryEventItem {
  sku: string;
  stock: number;
}

export interface InventoryEvent {
  id: string;
  merchant_id: string;
  store_id: string;
  event_id: string;
  version: number;
  sent_at: string;
  status: "RECEIVED" | "VALIDATED" | "APPLIED" | "QUARANTINED" | "APPROVED" | "REJECTED";
  reason_code: string | null;
  received_at: string;
  processed_at: string | null;
  reviewer: string | null;
  reviewer_comment: string | null;
  items?: InventoryEventItem[];
}

export interface StoreHealth {
  merchantId: string;
  storeId: string;
  healthStatus: "HEALTHY" | "STALE" | "AT_RISK" | "NO_DATA";
  lastAppliedVersion: number | null;
  lastAppliedAt: string | null;
  totalSkus: number;
  inStockCount: number;
  outOfStockCount: number;
  quarantineCount: number;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  const body = await res.json();

  if (!res.ok) {
    throw new ApiError(body.error as ApiErrorShape);
  }

  return body.data as T;
}

export function getInventoryEvents(filters?: Record<string, string>) {
  const query = filters && Object.keys(filters).length ? `?${new URLSearchParams(filters)}` : "";
  return request<InventoryEvent[]>(`/inventory-events${query}`);
}

export function getInventoryEvent(eventId: string) {
  return request<InventoryEvent>(`/inventory-events/${eventId}`);
}

export function approveEvent(eventId: string, reviewer: string, comment?: string) {
  return request<{ eventId: string; status: string }>(`/inventory-events/${eventId}/approve`, {
    method: "POST",
    body: JSON.stringify({ reviewer, comment }),
  });
}

export function rejectEvent(eventId: string, reviewer: string, comment?: string) {
  return request<{ eventId: string; status: string }>(`/inventory-events/${eventId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reviewer, comment }),
  });
}

export function getStoreHealth(merchantId: string, storeId: string) {
  return request<StoreHealth>(`/stores/${storeId}/health?merchantId=${encodeURIComponent(merchantId)}`);
}

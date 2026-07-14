// =============================================================================
// Core Data Models — Fake Backend & Data Access Layer
// =============================================================================
// Shared interfaces used by mock services. These extend the base store models
// to add backend-specific fields (channel, priority, AI metadata, etc.)
// without polluting the UI-facing state contracts.
// =============================================================================

/** Order channel — how the customer placed the order */
export type OrderChannel = 'walk-in' | 'delivery' | 'online';

/** Kitchen-specific priority tiers */
export type PriorityLevel = 'low' | 'normal' | 'high' | 'rush';

/** Extended status that includes backend lifecycle events */
export type BackendOrderStatus =
  | 'received'
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'cancelled';

/** An item within a backend order payload */
export interface BackendOrderItem {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  specialInstructions?: string;
  allergens?: string[];
}

/** Full order payload as returned by the fake backend */
export interface BackendOrder {
  id: string;
  channel: OrderChannel;
  tableNo: string | null;          // null for delivery orders
  customerName?: string;
  items: BackendOrderItem[];
  subtotal: number;
  tax: number;
  totalAmount: number;
  status: BackendOrderStatus;
  priority: PriorityLevel;
  estimatedPrepTime: number;       // minutes
  createdAt: Date;
  updatedAt: Date;
  notes?: string;
}

/** Event emitted by the order WebSocket simulator */
export interface OrderStreamEvent {
  type: 'order_created' | 'status_changed' | 'order_cancelled';
  payload: BackendOrder;
  timestamp: Date;
  correlationId: string;
}

// ---------------------------------------------------------------------------
// Kitchen Load Models
// ---------------------------------------------------------------------------

/** Station types in a restaurant kitchen */
export type KitchenStation =
  | 'grill'
  | 'fryer'
  | 'salad-bar'
  | 'dessert'
  | 'beverage'
  | 'plating';

/** Load snapshot for a single station */
export interface StationLoad {
  station: KitchenStation;
  activeOrders: number;
  capacity: number;
  utilizationPercent: number;       // 0-100
  avgPrepTimeMinutes: number;
  status: 'idle' | 'normal' | 'busy' | 'overloaded';
}

/** Overall kitchen load snapshot */
export interface KitchenLoadSnapshot {
  timestamp: Date;
  overallUtilization: number;       // 0-100
  stations: StationLoad[];
  activeOrdersCount: number;
  estimatedWaitMinutes: number;
  staffOnDuty: number;
  healthStatus: 'green' | 'yellow' | 'red';
}

/** Event emitted by the kitchen load stream */
export interface KitchenLoadEvent {
  type: 'load_update' | 'station_alert' | 'staff_change';
  snapshot: KitchenLoadSnapshot;
  alerts: KitchenAlert[];
}

export interface KitchenAlert {
  id: string;
  station: KitchenStation;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// AI Assistant Models
// ---------------------------------------------------------------------------

/** Type of AI suggestion */
export type AiSuggestionType =
  | 'upsell'
  | 'allergy_warning'
  | 'combo_recommendation'
  | 'prep_time_alert'
  | 'inventory_warning';

/** A single AI suggestion/insight */
export interface AiSuggestion {
  id: string;
  type: AiSuggestionType;
  title: string;
  message: string;
  confidence: number;               // 0-1
  relatedOrderId?: string;
  relatedMenuItemIds?: string[];
  actionLabel?: string;
  metadata?: Record<string, unknown>;
}

/** State of a streamed AI response (simulates partial token delivery) */
export interface AiStreamChunk {
  chunkIndex: number;
  totalChunks: number;
  content: string;
  isComplete: boolean;
}

/** Full AI assistant response envelope */
export interface AiAssistantResponse {
  requestId: string;
  suggestions: AiSuggestion[];
  generatedAt: Date;
  processingTimeMs: number;
  model: string;                     // e.g. "teal-gpt-4-turbo"
}

/** Error shape returned by the AI service on failure */
export interface AiServiceError {
  code: 'TIMEOUT' | 'RATE_LIMIT' | 'MODEL_ERROR' | 'NETWORK_ERROR';
  message: string;
  retryAfterMs?: number;
}

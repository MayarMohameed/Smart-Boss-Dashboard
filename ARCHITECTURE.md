# 🏗️ Core Architecture & State Design

This document provides a detailed breakdown of the technical decisions, design patterns, state management architecture, and offline sync strategies implemented in the Smart Restaurant POS Dashboard.

---

## ⚡ State Management: The Signals + RxJS Hybrid Model

Modern Angular (v17+) introduces **Signals** as a first-class citizen for fine-grained reactivity. However, complex real-time applications like Point of Sale (POS) terminals require both synchronous state tracking and complex asynchronous event handling. To solve this, this codebase adopts a **hybrid model**:

```text
               ┌───────────────────────┐
               │    OrderMockService   │ (Real-time Event Push)
               └───────────┬───────────┘
                           │ RxJS Observable Stream
                           ▼
┌─────────────────────────────────────────────────────┐
│                   AppStateStore                     │ (Central Coordinator)
├─────────────────────────────────────────────────────┤
│ • Synchronous UI State (Signals)                    │
│   - orders (readonly list)                          │
│   - notifications (alert history)                   │
│   - search/filter query inputs                      │
│ • Computed Derived State (computed)                 │
│   - tables (dynamically derived table statuses)    │
│   - stats (real-time active/delivered counters)      │
│   - filteredOrders (cached, debounced results)       │
└─────────────────────────────────────────────────────┘
```

### 1. Synchronous State (Angular Signals)
Signals are ideal for tracking synchronous values bound directly to templates:
- **Glitch-Free Propagation**: Signals guarantee that derived states recalculate synchronously and without intermediate "glitched" states.
- **`computed` Selectors**: Derived states like `tables` (which maps orders to physical tables) and `stats` are computed reactively. They cache their results (memoization) and only re-evaluate when their dependency signals (`_orders`) actually change.
- **OnPush Change Detection**: Because the template reads signals, Angular binds local view updates directly to signal changes. When an order shifts from `preparing` to `ready`, only that single order card is dirty-checked and updated in the DOM.

### 2. Asynchronous Pipelines (RxJS)
RxJS excels at managing events, async coordination, and time-based operations:
- **WebSocket Simulations**: Real-time order flows are modeled as an event stream driven by RxJS timers and non-deterministic intervals (`switchMap` + `timer`).
- **Graceful Async AI Flow**: The AI Order Assistant handles progressive streaming (`concat` + `scan` + `delay`) and exponential backoff retries (`retry` operator) to safely recover from network timeouts or inference rate limits.
- **Service Coordination**: The `AppStateStore` coordinates cross-service dependencies (e.g., subscribing to the `KitchenLoadMockService` and notifying the `OrderMockService` to adjust priorities) using RxJS pipelines. This prevents circular service injections.

---

## 📶 Offline Interception & Mutation Queuing

To operate reliably in a busy restaurant environment, POS systems must be resilient to internet dropouts. This application features an automatic offline queue system:

```text
                       [ Browser Mutating Action ]
                                   │
                                   ▼
                      [ HTTP Client Interceptor ]
                                   │
                     ┌─────────────┴─────────────┐
                     │                           │
              (Online: true)              (Online: false)
                     │                           │
                     ▼                           ▼
            [ Pass to Network ]         [ Queue OfflineAction ]
                     │                           │
                     │                           ▼
                     │                 [ Save to localStorage ]
                     │                           │
                     │                 (On window:online Event)
                     │                           │
                     │                           ▼
                     │                 [ concapMap Sequential Replay ]
                     │                           │
                     └─────────────┬─────────────┘
                                   │
                                   ▼
                      [ Server Database Mutated ]
```

### 1. Interception Strategy (`offline-queue.interceptor.ts`)
The `offlineQueueInterceptor` intercepts all outgoing **mutations** (`POST`, `PUT`, `PATCH`, `DELETE`).
- **Selective Interception**: `GET` requests are bypassed (or handled by browser caching) because they do not modify backend state.
- **Status Inspection**: If `navigator.onLine` is `false`, the interceptor blocks the request from reaching the network. It delegates it to the `OfflineSyncService` to be queued, and returns a mock `202 Accepted` response to the client. This allows the UI to update optimistically without throwing errors.

### 2. Sequential Replay Engine (`offline-sync.service.ts`)
When a request is blocked:
- **Action Serialization**: The request's method, URL, body, and headers are serialized into an `OfflineAction` object.
- **Hard Persistence**: The queue is saved to `localStorage` immediately. If the browser tab is closed or the device loses power, the queue survives.
- **Ordering Guarantee (`concatMap`)**: Reconnection fires the `flush()` method. Outgoing requests are replayed sequentially using the RxJS `concatMap` operator. This ensures that order edits or status updates are processed in the exact order they occurred (avoiding out-of-order race conditions on the server).
- **Network Bypass (`HttpBackend`)**: Replayed requests are sent using a secondary `HttpClient` initialized with `HttpBackend`. This bypasses the interceptor chain, preventing requests from being intercepted and queued a second time during replay.
- **Failsafe Re-queuing**: If a network failure occurs during replay, the current action remains in the queue, its attempt counter increments, and the sync cycle stops. This preserves execution order and waits for the next stable connection.

# Smart Restaurant POS Dashboard — Core Architecture

Welcome to the **Smart Restaurant POS Dashboard** workspace. This repository contains the foundational frontend architecture, state management layer, fake backend services, and interactive layout shell components built using **Angular 21**, **Signals**, and **RxJS**.

---

## 📂 Project Architecture & Folder Structure

The project implements a **Feature-based, Layered Clean Architecture** designed for high scalability, loose coupling, and clean dependency boundaries:

```text
src/app/
├── core/
│   ├── layout/               # Global viewport layout shell and global components
│   │   ├── main-layout/      # Flexbox/grid based layout container wrapping Sidebar, Header, and Page content
│   │   ├── header/           # Real-time search, stats indicators, clock, and toast notifications dropdown
│   │   └── sidebar/          # Logo branding, page routing controls, and simulator toggle switches
│   ├── models/
│   │   └── backend.models.ts # TypeScript interfaces for all data structures (Orders, Kitchen, AI)
│   ├── services/
│   │   ├── order-mock.service.ts         # Simulated WebSocket order stream engine
│   │   ├── kitchen-load-mock.service.ts  # Real-time station utilization compute engine
│   │   └── ai-assistant-mock.service.ts  # Simulated LLM Q&A & suggestions engine
│   └── store/
│       └── app-state.store.ts            # Global singleton store coordinating Signal states
├── features/
│   ├── dashboard/            # Overview analytics widgets (Shell page)
│   ├── orders/               # Live Orders Pipeline Workspace & order card list (Fully Implemented)
│   ├── menu/                 # Dish catalog management (Shell page)
│   └── analytics/            # Long-term performance reports (Shell page)
├── shared/
│   └── components/
│       └── kitchen-load-monitor/         # Presentational widget displaying live kitchen workload
├── app.ts                    # Root standalone App component
├── app.html                  # Root template rendering main viewport shell
├── app.scss
├── main.ts                   # Client bootstrapper
└── styles.scss               # Design tokens, variables (teal theme #006565), and resets
```

---

## ⚡ State Management Architecture: Signals + RxJS

To achieve high rendering performance and manage complex asynchronous streams, the application adopts a hybrid state management model: **Angular Signals combined with RxJS**.

```text
               ┌───────────────────────┐
               │    OrderMockService   │ (WebSocket Events)
               └───────────┬───────────┘
                           │ RxJS Observable stream
                           ▼
┌─────────────────────────────────────────────────────┐
│                   AppStateStore                     │ (Global Store)
├─────────────────────────────────────────────────────┤
│ • Private writable signals: _orders, _notifications │
│ • Public read-only signals: orders, notifications   │
│ • Computed selectors: stats, filteredOrders         │
└──────────────────┬──────────────┬───────────────────┘
                   │              │
        Signals bindings          │ Signals bindings
                   ▼              ▼
       ┌──────────────┐        ┌──────────────┐
       │ Orders Page  │        │ Header / Nav │
       └──────────────┘        └──────────────┘
```

### Why this hybrid model was chosen:
1. **Synchronous UI State (Signals)**: Signals manage the synchronous, user-facing state (such as the current list of orders, selected active filter tab, search query, and unread notification counts). This ensures **glitch-free, synchronous propagation** and automatic local view updates.
2. **Derived/Computed States (`computed`)**: Computed signals (e.g. `filteredOrders` and `stats`) act as highly optimized selectors. They automatically cache values and re-evaluate *only* when their source signals change.
3. **Complex Asynchronous Streams (RxJS)**: RxJS is used for asynchronous pipelines. In POS environments, real-time ticket arrival is modeled as a stream. We leverage RxJS for:
   - **Simulating WebSocket pipelines** using randomized `interval` and `switchMap` ticks.
   - **Handling transient network failures** using `retry` with backoff.
   - **Progressive UI rendering** using LLM streaming (`concat` + `scan` + `delay`).

### Trade-offs:
- *Signals Trade-off*: Signals do not natively represent events (like a new order beep or a toast popup alert).
- *Solution*: We combine them. We write events to RxJS Observables (e.g., `liveNotifications$`) and write persistent state payloads into Signal buckets (`_notifications.update(...)`).

---

## 🚀 Performance Optimizations

1. **ChangeDetectionStrategy.OnPush**:
   - Every single component (from the container `OrdersWorkspaceComponent` to presentational components like `OrderCardComponent`) is set to `OnPush`. 
   - This bypasses Angular's default dirty-checking tree scans. Changes are only checked when a signal value changes or an `@Input()` reference updates.
2. **Granular Re-renders via trackBy**:
   - The `@for` control flow uses `track` keywords (`trackByOrderId`, `track station.station`) to bind items to their unique IDs. 
   - If one order's status changes from `preparing` to `ready`, only that single `OrderCardComponent` is re-rendered. The rest of the grid remains untouched in the DOM.
3. **Reactive Computed Filtering**:
   - Filtering and searching are computed reactively in the store via `computed()`. Since computation results are cached, typing into the search bar is debounced and memoized, preventing expensive grid recalculations.

---

## 📈 Scaling to Hundreds of Screens

If the system expands to hundreds of dashboard screens, POS terminals, and kitchen displays:
1. **Domain State Partitioning**:
   - The global `AppStateStore` should be broken down into domain-specific lazy-loaded stores (e.g. `KitchenStore`, `BillingStore`, `InventoryStore`) loaded only when navigating to corresponding sub-modules.
2. **Web Workers for Simulation & Computations**:
   - Move real-time polling, socket handling, and log parsing tasks into background **Web Workers** so the browser's main UI thread remains completely fluid.
3. **State Normalization**:
   - Represent orders as indexed key-value dictionaries rather than raw arrays, speeding up lookup complexity from $\mathcal{O}(N)$ to $\mathcal{O}(1)$.

---

## 🛠️ Getting Started & Commands

To get the Smart POS Dashboard application up and running locally, follow these simple steps:

### Prerequisites
- Node.js (v18.x or newer recommended)
- npm (v9.x or newer)

### Installation
Clone the repository and install the project dependencies:
```bash
# Install package dependencies
npm install
```

### Running the Application
Start the Angular local development server. The shell is configured with SSR and event replay:
```bash
# Starts development server (accessible at http://localhost:4200)
npm run start
```

### Running Unit Tests
Execute the Vitest-based unit testing suite to verify all core services, offline sync behavior, and AI retry pipelines:
```bash
# Runs tests once and exits
npm run test
```

### Production Build
Compile the application and bundle optimized assets for deployment:
```bash
# Build the client and server assets
npm run build
```

---

## 🤖 AI Usage Policy Disclosure

This codebase was developed following a strict human-in-the-loop AI model:
- **Architectural Control**: All core architectural decisions (clean feature folder boundaries, standalone architecture, signal-based store structure, and hybrid Signal/RxJS boundaries) were explicitly designed by the architect (human).
- **AI Brainstorming & Boilerplate Generation**: AI was used to scaffold typescript interfaces, write HTML boilerplate templates, and model complex RxJS simulation services (like simulating backoffs and stream token mapping).
- **Verification & Testing**: Every line of code was reviewed, debugged, and verified through a suite of native Vitest tests to ensure full runtime safety and zero compiler warnings.

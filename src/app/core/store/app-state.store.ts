// =============================================================================
// AppStateStore — Global Singleton State Coordinator
// =============================================================================
// Hybrid Signal + RxJS state layer.
//
// Architecture change (audit fix):
//   • OrderMockService is now the SINGLE SOURCE OF TRUTH for orders.
//     This store SUBSCRIBES to `OrderMockService.orders$` and reflects that
//     state into local signals. It no longer runs its own simulator.
//   • The `effect()` that wrote back to `_tables` has been replaced with a
//     `computed()` signal — no circular dependency risk, pure derivation.
//   • Kitchen load reactivity: this store coordinates the cross-service
//     dependency by subscribing to `KitchenLoadMockService.kitchenLoad$` and
//     calling `orderService.recomputePriorities()` on health-tier changes.
//     This avoids a circular injection between the two feature services.
// =============================================================================

import { Injectable, signal, computed, OnDestroy, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil, distinctUntilChanged } from 'rxjs/operators';

import { OrderMockService } from '../services/order-mock.service';
import { KitchenLoadMockService } from '../services/kitchen-load-mock.service';
import {
  BackendOrder,
  BackendOrderStatus,
  OrderStreamEvent,
  PriorityLevel
} from '../models/backend.models';

// ---------------------------------------------------------------------------
// Domain Interfaces (UI-facing)
// ---------------------------------------------------------------------------

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: 'food' | 'drink' | 'dessert';
  available: boolean;
}

export interface OrderItem {
  menuItemId: string;
  name: string;
  quantity: number;
  price: number;
}

/** UI-facing status vocabulary. 'received' from backend maps to 'pending' here. */
export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled';

export interface Order {
  id: string;
  tableNo: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  priority: PriorityLevel;
  createdAt: Date;
  updatedAt: Date;
  notes?: string;
}

export type TableStatus = 'free' | 'occupied' | 'ordered' | 'billing';

export interface Table {
  id: string;
  number: string;
  status: TableStatus;
  currentOrderId?: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  timestamp: Date;
  read: boolean;
}

// ---------------------------------------------------------------------------
// Static Configuration
// ---------------------------------------------------------------------------

/** Base table topology — status is DERIVED via computed(), not stored here. */
const TABLE_CONFIGS: ReadonlyArray<{ id: string; number: string }> =
  Array.from({ length: 12 }, (_, i) => ({
    id: `t${i + 1}`,
    number: `${i + 1}`
  }));

const INITIAL_MENU: MenuItem[] = [
  { id: 'm1', name: 'Truffle Burger',       price: 18.5,  category: 'food',    available: true },
  { id: 'm2', name: 'Teal Garden Salad',    price: 12.0,  category: 'food',    available: true },
  { id: 'm3', name: 'Margherita Pizza',     price: 15.5,  category: 'food',    available: true },
  { id: 'm4', name: 'Slow Roasted Salmon',  price: 24.0,  category: 'food',    available: true },
  { id: 'm5', name: 'Matcha Latte',         price:  5.5,  category: 'drink',   available: true },
  { id: 'm6', name: 'Espresso Tonic',       price:  4.5,  category: 'drink',   available: true },
  { id: 'm7', name: 'Craft IPA Beer',       price:  8.0,  category: 'drink',   available: true },
  { id: 'm8', name: 'Pistachio Lava Cake',  price:  9.5,  category: 'dessert', available: true },
  { id: 'm9', name: 'Tiramisu Cup',         price:  8.5,  category: 'dessert', available: true }
];

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class AppStateStore implements OnDestroy {

  // ── Service Dependencies ──────────────────────────────────────────────────
  //    Injected here (not in feature services) to avoid circular deps.
  private readonly orderService   = inject(OrderMockService);
  private readonly kitchenService = inject(KitchenLoadMockService);

  // ── Writable Signals (private) ────────────────────────────────────────────

  /**
   * Synced 1-to-1 from `OrderMockService.orders$`.
   * Never mutated directly — only updated via the subscription below.
   */
  private readonly _orders = signal<Order[]>([]);

  private readonly _menu          = signal<MenuItem[]>(INITIAL_MENU);
  private readonly _notifications = signal<AppNotification[]>([
    {
      id: 'n-init',
      title: 'POS System Ready',
      message: 'Live order stream active. Waiting for first ticket...',
      type: 'info',
      timestamp: new Date(),
      read: false
    }
  ]);
  private readonly _orderFilter   = signal<OrderStatus | 'all'>('all');
  private readonly _searchQuery   = signal<string>('');

  // ── Public Read-only Signals ──────────────────────────────────────────────
  readonly orders       = this._orders.asReadonly();
  readonly menu         = this._menu.asReadonly();
  readonly notifications = this._notifications.asReadonly();
  readonly orderFilter  = this._orderFilter.asReadonly();
  readonly searchQuery  = this._searchQuery.asReadonly();

  // ── Computed Signals ──────────────────────────────────────────────────────

  /**
   * Table status derived PURELY from active orders.
   *
   * Replaces the former `effect(() => { this._tables.update(...) })` which
   * wrote to a signal inside an effect — an Angular anti-pattern that risks
   * circular update loops. A `computed()` is the correct primitive here:
   * it is read-only, memoised, and has no side effects.
   */
  readonly tables = computed<Table[]>(() => {
    const currentOrders = this._orders();
    return TABLE_CONFIGS.map(config => {
      const activeOrder = currentOrders.find(
        o =>
          o.tableNo === config.number &&
          o.status !== 'delivered' &&
          o.status !== 'cancelled'
      );

      if (activeOrder) {
        let status: TableStatus = 'ordered';     // received/pending
        if (activeOrder.status === 'preparing') status = 'occupied';
        if (activeOrder.status === 'ready')     status = 'billing';
        return { ...config, status, currentOrderId: activeOrder.id };
      }

      return { ...config, status: 'free' as TableStatus };
    });
  });

  readonly filteredOrders = computed(() => {
    const filter = this._orderFilter();
    const query  = this._searchQuery().toLowerCase().trim();
    let result   = this._orders();

    if (filter !== 'all') {
      result = result.filter(o => o.status === filter);
    }
    if (query) {
      result = result.filter(o =>
        o.id.toLowerCase().includes(query) ||
        o.tableNo.includes(query) ||
        o.items.some(i => i.name.toLowerCase().includes(query))
      );
    }

    return [...result].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  });

  readonly unreadNotificationsCount = computed(() =>
    this._notifications().filter(n => !n.read).length
  );

  readonly stats = computed(() => {
    const allOrders     = this._orders();
    const activeTables  = this.tables().filter(t => t.status !== 'free').length;
    const deliveredRevenue = allOrders
      .filter(o => o.status === 'delivered')
      .reduce((sum, o) => sum + o.totalAmount, 0);

    return {
      totalRevenue:    deliveredRevenue,
      activeTablesCount: activeTables,
      pendingCount:    allOrders.filter(o => o.status === 'pending').length,
      preparingCount:  allOrders.filter(o => o.status === 'preparing').length,
      readyCount:      allOrders.filter(o => o.status === 'ready').length,
      totalCount:      allOrders.length
    };
  });

  // ── RxJS Streams ──────────────────────────────────────────────────────────
  private readonly destroy$           = new Subject<void>();
  private readonly notificationSubject = new Subject<AppNotification>();

  /** Public stream of live system alerts for toast/banner components. */
  readonly liveNotifications$ = this.notificationSubject.asObservable();

  // ── Constructor ───────────────────────────────────────────────────────────
  constructor() {
    // ── 1. Single Source of Truth ─────────────────────────────────────────
    //    Sync all order state from OrderMockService. No separate simulator.
    this.orderService.orders$.pipe(
      takeUntil(this.destroy$)
    ).subscribe((backendOrders: BackendOrder[]) => {
      this._orders.set(backendOrders.map(bo => this.mapBackendOrder(bo)));
    });

    // ── 2. Notification Pipeline ──────────────────────────────────────────
    //    Drive notifications from the order event stream, not the old addOrder().
    this.orderService.orderEvents$.pipe(
      takeUntil(this.destroy$)
    ).subscribe((event: OrderStreamEvent) => this.handleOrderEvent(event));

    // ── 3. Kitchen Load → Priority Recomputation ──────────────────────────
    //    AppStateStore acts as the coordinator between the two feature
    //    services. When the kitchen health tier changes (green/yellow/red),
    //    OrderMockService re-derives priority for every active order.
    //    `distinctUntilChanged` prevents firing on every 5s tick when the
    //    health tier hasn't actually changed.
    this.kitchenService.kitchenLoad$.pipe(
      takeUntil(this.destroy$),
      distinctUntilChanged((a, b) => a.healthStatus === b.healthStatus)
    ).subscribe(snapshot => {
      this.orderService.recomputePriorities(snapshot);
    });
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  setOrderFilter(filter: OrderStatus | 'all'): void {
    this._orderFilter.set(filter);
  }

  setSearchQuery(query: string): void {
    this._searchQuery.set(query);
  }

  markNotificationAsRead(id: string): void {
    this._notifications.update(notifs =>
      notifs.map(n => (n.id === id ? { ...n, read: true } : n))
    );
  }

  markAllNotificationsAsRead(): void {
    this._notifications.update(notifs =>
      notifs.map(n => ({ ...n, read: true }))
    );
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  /**
   * Maps a BackendOrder → store Order.
   * BackendOrderStatus 'received' becomes OrderStatus 'pending' so the store's
   * vocabulary stays consistent with its consumers (dashboard, header, etc.).
   */
  private mapBackendOrder(bo: BackendOrder): Order {
    const STATUS_MAP: Partial<Record<BackendOrderStatus, OrderStatus>> = {
      received: 'pending'
    };
    return {
      id:          bo.id,
      tableNo:     bo.tableNo ?? 'Delivery',
      items:       bo.items.map(i => ({
        menuItemId: i.menuItemId,
        name:       i.name,
        quantity:   i.quantity,
        price:      i.unitPrice
      })),
      totalAmount: bo.totalAmount,
      status:      (STATUS_MAP[bo.status] ?? bo.status) as OrderStatus,
      priority:    bo.priority,
      createdAt:   bo.createdAt,
      updatedAt:   bo.updatedAt,
      notes:       bo.notes
    };
  }

  private handleOrderEvent(event: OrderStreamEvent): void {
    const order = event.payload;
    let notification: AppNotification;

    if (event.type === 'order_created') {
      const origin = order.channel === 'delivery' ? '🛵 Delivery'
        : order.channel === 'online'              ? '💻 Online'
        :                                           `Table ${order.tableNo}`;
      notification = {
        id:        `n-${Date.now()}`,
        title:     'New Order Received',
        message:   `${origin} — ${order.items.length} item(s) · $${order.totalAmount.toFixed(2)}`,
        type:      'info',
        timestamp: new Date(),
        read:      false
      };
    } else if (event.type === 'status_changed') {
      notification = {
        id:        `n-${Date.now()}`,
        title:     'Order Updated',
        message:   `Order ${order.id} → ${order.status.toUpperCase()}`,
        type:      order.status === 'ready' ? 'success' : 'info',
        timestamp: new Date(),
        read:      false
      };
    } else if (event.type === 'order_cancelled') {
      notification = {
        id:        `n-${Date.now()}`,
        title:     'Order Cancelled',
        message:   `Order ${order.id} was cancelled.`,
        type:      'warning',
        timestamp: new Date(),
        read:      false
      };
    } else {
      return;
    }

    // Cap notification history at 50 to avoid unbounded growth
    this._notifications.update(n => [notification, ...n].slice(0, 50));
    this.notificationSubject.next(notification);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

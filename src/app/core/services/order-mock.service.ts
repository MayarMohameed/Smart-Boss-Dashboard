// =============================================================================
// OrderMockService — Fake WebSocket Stream Simulator

// =============================================================================

import { Injectable, OnDestroy, inject } from '@angular/core';
import {
  BehaviorSubject,
  Observable,
  Subject,
  Subscription,
  timer,
  merge,
  of
} from 'rxjs';
import {
  map,
  tap,
  switchMap,
  takeUntil,
  delay,
  filter
} from 'rxjs/operators';
import {
  BackendOrder,
  BackendOrderItem,
  BackendOrderStatus,
  KitchenLoadSnapshot,
  OrderChannel,
  OrderStreamEvent,
  PriorityLevel
} from '../models/backend.models';

// ---------------------------------------------------------------------------
// Mock data pools
// ---------------------------------------------------------------------------

const CUSTOMER_NAMES = [
  'Liam Chen', 'Sofia Rivera', 'Noah Patel', 'Ava Müller', 'Ethan Kim',
  'Mia Tanaka', 'James O\'Brien', 'Isabella Cruz', 'Oliver Singh', 'Emma Johansson',
  'Lucas Fernandez', 'Amelia Kowalski', 'Mason Al-Rashid', 'Harper Okafor'
];

const MENU_POOL: BackendOrderItem[] = [
  { menuItemId: 'm1', name: 'Truffle Burger', quantity: 1, unitPrice: 18.50, allergens: ['gluten', 'dairy'] },
  { menuItemId: 'm2', name: 'Teal Garden Salad', quantity: 1, unitPrice: 12.00, allergens: [] },
  { menuItemId: 'm3', name: 'Margherita Pizza', quantity: 1, unitPrice: 15.50, allergens: ['gluten', 'dairy'] },
  { menuItemId: 'm4', name: 'Slow Roasted Salmon', quantity: 1, unitPrice: 24.00, allergens: ['fish'] },
  { menuItemId: 'm5', name: 'Matcha Latte', quantity: 1, unitPrice: 5.50, allergens: ['dairy'] },
  { menuItemId: 'm6', name: 'Espresso Tonic', quantity: 1, unitPrice: 4.50, allergens: [] },
  { menuItemId: 'm7', name: 'Craft IPA Beer', quantity: 1, unitPrice: 8.00, allergens: ['gluten'] },
  { menuItemId: 'm8', name: 'Pistachio Lava Cake', quantity: 1, unitPrice: 9.50, allergens: ['nuts', 'dairy', 'gluten'] },
  { menuItemId: 'm9', name: 'Tiramisu Cup', quantity: 1, unitPrice: 8.50, allergens: ['dairy', 'gluten', 'eggs'] },
  { menuItemId: 'm10', name: 'Wagyu Sliders', quantity: 1, unitPrice: 22.00, allergens: ['gluten'] },
  { menuItemId: 'm11', name: 'Miso Glazed Eggplant', quantity: 1, unitPrice: 14.00, allergens: ['soy'] },
  { menuItemId: 'm12', name: 'Sparkling Yuzu Water', quantity: 1, unitPrice: 6.00, allergens: [] }
];

const ORDER_NOTES = [
  'No onions please',
  'Extra spicy',
  'Gluten-free bun if possible',
  'Celebrating a birthday — candle on dessert',
  'Nut allergy at the table',
  'Dressing on the side',
  'Rush order — customer in a hurry',
  undefined, undefined, undefined  // weighted towards no notes
];

const TAX_RATE = 0.08;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class OrderMockService implements OnDestroy {
  // ---- WebSocket Simulation State ----
  private ordersSubject = new BehaviorSubject<BackendOrder[]>([]);
  private eventStream = new Subject<OrderStreamEvent>();
  private destroy$ = new Subject<void>();

  private orderCounter = 1027;     // Continues from the seed data IDs
  private tickSubscription?: Subscription;

  /** Observable stream of ALL current orders (snapshot). */
  readonly orders$: Observable<BackendOrder[]> = this.ordersSubject.asObservable();

  /** Observable stream of individual order events (like a WebSocket push). */
  readonly orderEvents$: Observable<OrderStreamEvent> = this.eventStream.asObservable();

  /** Filtered convenience streams */
  readonly newOrders$ = this.orderEvents$.pipe(
    filter(e => e.type === 'order_created')
  );

  readonly statusChanges$ = this.orderEvents$.pipe(
    filter(e => e.type === 'status_changed')
  );

  constructor() {
    const seed = this.generateSeedOrders(6);
    this.ordersSubject.next(seed);
    this.startSimulation();
  }

  // ====================================================================
  // PUBLIC API
  // ====================================================================

  /** Returns a snapshot of all current orders in the queue. */
  getCurrentOrders(): BackendOrder[] {
    return this.ordersSubject.value;
  }

  /** Returns a single order by ID, with simulated network latency. */
  getOrderById(id: string): Observable<BackendOrder | undefined> {
    const latency = this.randomBetween(100, 400);
    return of(this.ordersSubject.value.find(o => o.id === id)).pipe(delay(latency));
  }

  /** Returns all orders for a specific table. */
  getOrdersByTable(tableNo: string): Observable<BackendOrder[]> {
    const latency = this.randomBetween(80, 300);
    return of(this.ordersSubject.value.filter(o => o.tableNo === tableNo)).pipe(delay(latency));
  }

  /** Returns orders filtered by channel. */
  getOrdersByChannel(channel: OrderChannel): Observable<BackendOrder[]> {
    const latency = this.randomBetween(100, 350);
    return of(this.ordersSubject.value.filter(o => o.channel === channel)).pipe(delay(latency));
  }

  /** Manually creates a new order (simulates POST /api/orders). */
  createOrder(
    channel: OrderChannel,
    tableNo: string | null,
    items: BackendOrderItem[],
    customerName?: string,
    notes?: string
  ): Observable<BackendOrder> {
    const order = this.buildOrder(channel, tableNo, items, customerName, notes);
    const latency = this.randomBetween(200, 600);

    return of(order).pipe(
      delay(latency),
      tap(o => {
        this.ordersSubject.next([...this.ordersSubject.value, o]);
        this.emitEvent('order_created', o);
      })
    );
  }

  /** Manually advances an order to the next status (simulates PATCH). */
  advanceOrderStatus(orderId: string): Observable<BackendOrder | undefined> {
    const latency = this.randomBetween(150, 500);
    const statusFlow: BackendOrderStatus[] = ['received', 'preparing', 'ready', 'delivered'];

    return of(orderId).pipe(
      delay(latency),
      map(id => {
        const orders = [...this.ordersSubject.value];
        const idx = orders.findIndex(o => o.id === id);
        if (idx === -1) return undefined;

        const current = orders[idx];
        const currentIdx = statusFlow.indexOf(current.status);
        if (currentIdx === -1 || currentIdx >= statusFlow.length - 1) return current;

        const updated: BackendOrder = {
          ...current,
          status: statusFlow[currentIdx + 1],
          updatedAt: new Date()
        };
        orders[idx] = updated;
        this.ordersSubject.next(orders);
        this.emitEvent('status_changed', updated);
        return updated;
      })
    );
  }

  /** Manually cancels an order. */
  cancelOrder(orderId: string): Observable<BackendOrder | undefined> {
    const latency = this.randomBetween(150, 400);

    return of(orderId).pipe(
      delay(latency),
      map(id => {
        const orders = [...this.ordersSubject.value];
        const idx = orders.findIndex(o => o.id === id);
        if (idx === -1) return undefined;

        const updated: BackendOrder = {
          ...orders[idx],
          status: 'cancelled',
          updatedAt: new Date()
        };
        orders[idx] = updated;
        this.ordersSubject.next(orders);
        this.emitEvent('order_cancelled', updated);
        return updated;
      })
    );
  }

  /**
   * Synchronously sets an order's status directly.
   * Used by integrations that need a direct mutation without the advance/cancel
   * lifecycle semantics (e.g. test harnesses, admin overrides).
   */
  setOrderStatus(orderId: string, status: BackendOrderStatus): void {
    const orders = this.ordersSubject.value;
    const idx = orders.findIndex(o => o.id === orderId);
    if (idx === -1) return;

    const updated: BackendOrder = { ...orders[idx], status, updatedAt: new Date() };
    const next = orders.map(o => (o.id === orderId ? updated : o));
    this.ordersSubject.next(next);
    this.emitEvent('status_changed', updated);
  }

  // ====================================================================
  // KITCHEN LOAD REACTIVITY
  // ====================================================================

  /**
   * Re-derives the `priority` field for every active order based on the
   * current kitchen health snapshot.
   *
   * Called by AppStateStore whenever the kitchen health tier transitions
   * (green → yellow → red and back). Using a deterministic re-derivation
   * (rather than delta-patching) means we never need to track "original vs.
   * boosted" priority — simply call this again when the snapshot changes
   * and the correct priority is always computed from first principles.
   *
   * Priority rules:
   *   • red kitchen   : delivery orders → 'rush'; large walk-in (≥3 qty) → 'high'
   *   • yellow kitchen: delivery 'normal' → 'high'
   *   • green kitchen : all orders revert to their base channel/size priority
   */
  recomputePriorities(snapshot: KitchenLoadSnapshot): void {
    const orders = this.ordersSubject.value;
    let anyChanged = false;

    const updated = orders.map(order => {
      // Delivered / cancelled orders are immutable
      if (order.status === 'delivered' || order.status === 'cancelled') return order;

      const newPriority = this.deriveKitchenAwarePriority(order, snapshot);
      if (newPriority === order.priority) return order;

      anyChanged = true;
      return { ...order, priority: newPriority, updatedAt: new Date() };
    });

    if (anyChanged) {
      this.ordersSubject.next(updated);
    }
  }

  /**
   * Computes a kitchen-aware priority for a single order.
   * Combines the base channel/size heuristic with the kitchen health tier.
   */
  private deriveKitchenAwarePriority(
    order: BackendOrder,
    snapshot: KitchenLoadSnapshot
  ): PriorityLevel {
    const totalQty = order.items.reduce((sum, i) => sum + i.quantity, 0);
    // Base priority from channel + order size (same logic as initial derivation)
    let base = this.derivePriority(order.channel, totalQty);

    switch (snapshot.healthStatus) {
      case 'red':
        // Critical kitchen: delivery SLAs are at risk → escalate to rush
        if (order.channel === 'delivery') return 'rush';
        // Large walk-in orders are harder to service under pressure
        if (base === 'normal' && totalQty >= 3) return 'high';
        break;

      case 'yellow':
        // Moderate load: give delivery a head start before it becomes critical
        if (order.channel === 'delivery' && base === 'normal') return 'high';
        break;

      case 'green':
      default:
        // Kitchen is healthy — revert to base priority
        break;
    }

    return base;
  }

  // ====================================================================
  // SIMULATION ENGINE
  // ====================================================================

  private startSimulation() {
    // Tick every 8–15 seconds (randomized per tick via switchMap)
    this.tickSubscription = timer(2000, 0).pipe(
      switchMap(() => timer(this.randomBetween(8000, 15000))),
      takeUntil(this.destroy$)
    ).subscribe(() => this.simulationTick());
  }

  private simulationTick() {
    const roll = Math.random();

    if (roll < 0.45) {
      // Generate a new incoming order
      this.generateRandomOrder();
    } else if (roll < 0.85) {
      // Progress an existing order
      this.progressRandomOrder();
    } else if (roll < 0.95) {
      // Cancel a random pending/received order
      this.cancelRandomOrder();
    }
    // 5% chance of no-op (simulates quiet moments)
  }

  private generateRandomOrder() {
    const channels: OrderChannel[] = ['walk-in', 'walk-in', 'walk-in', 'delivery', 'online'];
    const channel = channels[Math.floor(Math.random() * channels.length)];
    const tableNo = channel === 'walk-in'
      ? `${this.randomBetween(1, 12)}`
      : channel === 'online'
        ? `WEB-${this.randomBetween(100, 999)}`
        : null;

    const itemCount = this.randomBetween(1, 4);
    const items = this.pickRandomItems(itemCount);
    const name = CUSTOMER_NAMES[Math.floor(Math.random() * CUSTOMER_NAMES.length)];
    const notes = ORDER_NOTES[Math.floor(Math.random() * ORDER_NOTES.length)];

    const order = this.buildOrder(channel, tableNo, items, name, notes);
    this.ordersSubject.next([...this.ordersSubject.value, order]);
    this.emitEvent('order_created', order);
  }

  private progressRandomOrder() {
    const statusFlow: BackendOrderStatus[] = ['received', 'preparing', 'ready', 'delivered'];
    const orders = this.ordersSubject.value;
    const progressable = orders.filter(o =>
      o.status !== 'delivered' && o.status !== 'cancelled'
    );
    if (progressable.length === 0) return;

    const target = progressable[Math.floor(Math.random() * progressable.length)];
    const currentIdx = statusFlow.indexOf(target.status);
    if (currentIdx === -1 || currentIdx >= statusFlow.length - 1) return;

    const updated: BackendOrder = {
      ...target,
      status: statusFlow[currentIdx + 1],
      updatedAt: new Date()
    };

    const newList = orders.map(o => o.id === updated.id ? updated : o);
    this.ordersSubject.next(newList);
    this.emitEvent('status_changed', updated);
  }

  private cancelRandomOrder() {
    const orders = this.ordersSubject.value;
    const cancellable = orders.filter(o => o.status === 'received');
    if (cancellable.length === 0) return;

    const target = cancellable[Math.floor(Math.random() * cancellable.length)];
    const updated: BackendOrder = { ...target, status: 'cancelled', updatedAt: new Date() };

    const newList = orders.map(o => o.id === updated.id ? updated : o);
    this.ordersSubject.next(newList);
    this.emitEvent('order_cancelled', updated);
  }

  // ====================================================================
  // HELPERS
  // ====================================================================

  private buildOrder(
    channel: OrderChannel,
    tableNo: string | null,
    items: BackendOrderItem[],
    customerName?: string,
    notes?: string
  ): BackendOrder {
    const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    const tax = +(subtotal * TAX_RATE).toFixed(2);
    const now = new Date();
    const priority = this.derivePriority(channel, items.length);

    return {
      id: `ORD-${this.orderCounter++}`,
      channel,
      tableNo,
      customerName,
      items,
      subtotal: +subtotal.toFixed(2),
      tax,
      totalAmount: +(subtotal + tax).toFixed(2),
      status: 'received',
      priority,
      estimatedPrepTime: this.randomBetween(8, 25),
      createdAt: now,
      updatedAt: now,
      notes
    };
  }

  private derivePriority(channel: OrderChannel, itemCount: number): PriorityLevel {
    if (channel === 'delivery') return 'high';    // delivery partners penalize latency
    if (itemCount >= 4) return 'high';
    if (channel === 'online') return 'normal';
    return Math.random() > 0.8 ? 'rush' : 'normal';
  }

  private pickRandomItems(count: number): BackendOrderItem[] {
    const selected: BackendOrderItem[] = [];
    const pool = [...MENU_POOL];

    for (let i = 0; i < count && pool.length > 0; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      const item = { ...pool[idx], quantity: this.randomBetween(1, 3) };
      selected.push(item);
      pool.splice(idx, 1); // no duplicate items per order
    }
    return selected;
  }

  private emitEvent(type: OrderStreamEvent['type'], payload: BackendOrder) {
    this.eventStream.next({
      type,
      payload,
      timestamp: new Date(),
      correlationId: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    });
  }

  private generateSeedOrders(count: number): BackendOrder[] {
    const orders: BackendOrder[] = [];
    const channels: OrderChannel[] = ['walk-in', 'delivery', 'online'];
    const statuses: BackendOrderStatus[] = ['received', 'preparing', 'ready', 'delivered'];

    for (let i = 0; i < count; i++) {
      const channel = channels[i % channels.length];
      const tableNo = channel === 'walk-in'
        ? `${(i % 12) + 1}`
        : channel === 'online'
          ? `WEB-${this.randomBetween(100, 999)}`
          : null;

      const itemCount = this.randomBetween(1, 3);
      const items = this.pickRandomItems(itemCount);
      const name = CUSTOMER_NAMES[i % CUSTOMER_NAMES.length];
      const notes = i % 3 === 0 ? ORDER_NOTES[i % ORDER_NOTES.length] : undefined;

      const order = this.buildOrder(channel, tableNo, items, name, notes);
      
      // Assign varying status for visual richness
      order.status = statuses[i % statuses.length];
      
      // Seed priority
      order.priority = this.deriveKitchenAwarePriority(order, {
        timestamp: new Date(),
        overallUtilization: 40,
        stations: [],
        activeOrdersCount: count,
        estimatedWaitMinutes: 10,
        staffOnDuty: 4,
        healthStatus: 'green'
      });

      // Stagger creation times over the last 30 mins
      const minsAgo = (count - i) * 5;
      order.createdAt = new Date(Date.now() - minsAgo * 60000);
      order.updatedAt = new Date(Date.now() - (minsAgo - 2) * 60000);

      orders.push(order);
    }
    return orders;
  }

  private randomBetween(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.tickSubscription?.unsubscribe();
  }
}

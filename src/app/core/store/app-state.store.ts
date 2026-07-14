import { Injectable, signal, computed, effect, OnDestroy } from '@angular/core';
import { Subject, Observable, interval, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

// Interface Definitions
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

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled';

export interface Order {
  id: string;
  tableNo: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
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

// Initial Mock Data
const INITIAL_MENU: MenuItem[] = [
  { id: 'm1', name: 'Truffle Burger', price: 18.5, category: 'food', available: true },
  { id: 'm2', name: 'Teal Garden Salad', price: 12.0, category: 'food', available: true },
  { id: 'm3', name: 'Margherita Pizza', price: 15.5, category: 'food', available: true },
  { id: 'm4', name: 'Slow Roasted Salmon', price: 24.0, category: 'food', available: true },
  { id: 'm5', name: 'Matcha Latte', price: 5.5, category: 'drink', available: true },
  { id: 'm6', name: 'Espresso Tonic', price: 4.5, category: 'drink', available: true },
  { id: 'm7', name: 'Craft IPA Beer', price: 8.0, category: 'drink', available: true },
  { id: 'm8', name: 'Pistachio Lava Cake', price: 9.5, category: 'dessert', available: true },
  { id: 'm9', name: 'Tiramisu Cup', price: 8.5, category: 'dessert', available: true }
];

const INITIAL_TABLES: Table[] = Array.from({ length: 12 }, (_, i) => ({
  id: `t${i + 1}`,
  number: `${i + 1}`,
  status: i % 4 === 0 ? 'occupied' : i % 5 === 0 ? 'ordered' : 'free'
}));

const INITIAL_ORDERS: Order[] = [
  {
    id: 'ORD-1024',
    tableNo: '3',
    items: [
      { menuItemId: 'm1', name: 'Truffle Burger', quantity: 2, price: 18.5 },
      { menuItemId: 'm6', name: 'Espresso Tonic', quantity: 2, price: 4.5 }
    ],
    totalAmount: 46.0,
    status: 'preparing',
    createdAt: new Date(Date.now() - 25 * 60 * 1000), // 25 mins ago
    updatedAt: new Date(Date.now() - 20 * 60 * 1000)
  },
  {
    id: 'ORD-1025',
    tableNo: '5',
    items: [
      { menuItemId: 'm3', name: 'Margherita Pizza', quantity: 1, price: 15.5 },
      { menuItemId: 'm5', name: 'Matcha Latte', quantity: 1, price: 5.5 },
      { menuItemId: 'm8', name: 'Pistachio Lava Cake', quantity: 1, price: 9.5 }
    ],
    totalAmount: 30.5,
    status: 'pending',
    createdAt: new Date(Date.now() - 5 * 60 * 1000), // 5 mins ago
    updatedAt: new Date(Date.now() - 5 * 60 * 1000)
  },
  {
    id: 'ORD-1026',
    tableNo: '8',
    items: [
      { menuItemId: 'm4', name: 'Slow Roasted Salmon', quantity: 1, price: 24.0 },
      { menuItemId: 'm7', name: 'Craft IPA Beer', quantity: 3, price: 8.0 }
    ],
    totalAmount: 48.0,
    status: 'ready',
    createdAt: new Date(Date.now() - 40 * 60 * 1000), // 40 mins ago
    updatedAt: new Date(Date.now() - 10 * 60 * 1000)
  }
];

@Injectable({
  providedIn: 'root'
})
export class AppStateStore implements OnDestroy {
  // 1. Angular Signals for Synchronous Application State
  private _orders = signal<Order[]>(INITIAL_ORDERS);
  private _tables = signal<Table[]>(INITIAL_TABLES);
  private _menu = signal<MenuItem[]>(INITIAL_MENU);
  private _notifications = signal<AppNotification[]>([
    {
      id: 'n1',
      title: 'New Order',
      message: 'Order ORD-1025 received for Table 5',
      type: 'info',
      timestamp: new Date(Date.now() - 5 * 60 * 1000),
      read: false
    }
  ]);
  private _orderFilter = signal<OrderStatus | 'all'>('all');
  private _searchQuery = signal<string>('');
  private _simulationActive = signal<boolean>(true);

  // Read-only public signals for components
  readonly orders = this._orders.asReadonly();
  readonly tables = this._tables.asReadonly();
  readonly menu = this._menu.asReadonly();
  readonly notifications = this._notifications.asReadonly();
  readonly orderFilter = this._orderFilter.asReadonly();
  readonly searchQuery = this._searchQuery.asReadonly();
  readonly simulationActive = this._simulationActive.asReadonly();

  // Computed signals (selectors)
  readonly filteredOrders = computed(() => {
    const filter = this._orderFilter();
    const query = this._searchQuery().toLowerCase().trim();
    let result = this._orders();

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

    return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  });

  readonly unreadNotificationsCount = computed(() => 
    this._notifications().filter(n => !n.read).length
  );

  readonly stats = computed(() => {
    const allOrders = this._orders();
    const activeTables = this._tables().filter(t => t.status !== 'free').length;
    
    // Revenue calculations: Delivered orders
    const deliveredRevenue = allOrders
      .filter(o => o.status === 'delivered')
      .reduce((sum, o) => sum + o.totalAmount, 0);

    const pendingCount = allOrders.filter(o => o.status === 'pending').length;
    const preparingCount = allOrders.filter(o => o.status === 'preparing').length;
    const readyCount = allOrders.filter(o => o.status === 'ready').length;

    return {
      totalRevenue: deliveredRevenue,
      activeTablesCount: activeTables,
      pendingCount,
      preparingCount,
      readyCount,
      totalCount: allOrders.length
    };
  });

  // 2. RxJS Streams for Complex Asynchronous Events
  private destroy$ = new Subject<void>();
  private notificationSubject = new Subject<AppNotification>();
  
  // Public Observable for live system alerts (Toast notifications, etc.)
  readonly liveNotifications$: Observable<AppNotification> = this.notificationSubject.asObservable();
  
  private simulationSubscription?: Subscription;

  constructor() {
    // Setup side effects or start simulator
    this.startSimulator();

    // Side effect to sync occupied tables with active orders
    effect(() => {
      const currentOrders = this._orders();
      this._tables.update(tables => 
        tables.map(table => {
          // Check if there is an active order for this table
          const activeOrder = currentOrders.find(
            o => o.tableNo === table.number && o.status !== 'delivered' && o.status !== 'cancelled'
          );
          
          if (activeOrder) {
            let status: TableStatus = 'ordered';
            if (activeOrder.status === 'preparing') status = 'occupied';
            if (activeOrder.status === 'ready') status = 'billing';
            return { ...table, status, currentOrderId: activeOrder.id };
          } else {
            // If it was occupied/ordered/billing but no order, release it or keep free
            return table.status !== 'free' && !table.currentOrderId 
              ? { ...table, status: 'free' as TableStatus } 
              : { ...table, currentOrderId: undefined };
          }
        })
      );
    });
  }

  // --- ACTIONS ---

  setOrderFilter(filter: OrderStatus | 'all') {
    this._orderFilter.set(filter);
  }

  setSearchQuery(query: string) {
    this._searchQuery.set(query);
  }

  addOrder(order: Partial<Order> & { tableNo: string; items: OrderItem[] }) {
    const newOrder: Order = {
      id: order.id || `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
      tableNo: order.tableNo,
      items: order.items,
      totalAmount: order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0),
      status: order.status || 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      notes: order.notes
    };

    this._orders.update(orders => [newOrder, ...orders]);
    
    // Trigger notification stream
    this.triggerNotification({
      id: `n-${Date.now()}`,
      title: 'New Order Received',
      message: `Table ${newOrder.tableNo} ordered ${newOrder.items.length} items. Total: $${newOrder.totalAmount.toFixed(2)}`,
      type: 'info',
      timestamp: new Date(),
      read: false
    });
  }

  updateOrderStatus(orderId: string, status: OrderStatus) {
    this._orders.update(orders =>
      orders.map(o => (o.id === orderId ? { ...o, status, updatedAt: new Date() } : o))
    );

    const updatedOrder = this._orders().find(o => o.id === orderId);
    if (updatedOrder) {
      let type: 'info' | 'success' | 'warning' = 'info';
      if (status === 'ready') type = 'success';
      if (status === 'cancelled') type = 'warning';

      this.triggerNotification({
        id: `n-${Date.now()}`,
        title: `Order Updated`,
        message: `Order ${orderId} is now ${status.toUpperCase()}`,
        type,
        timestamp: new Date(),
        read: false
      });
    }
  }

  updateTableStatus(tableId: string, status: TableStatus) {
    this._tables.update(tables =>
      tables.map(t => (t.id === tableId ? { ...t, status } : t))
    );
  }

  markNotificationAsRead(id: string) {
    this._notifications.update(notifs =>
      notifs.map(n => (n.id === id ? { ...n, read: true } : n))
    );
  }

  markAllNotificationsAsRead() {
    this._notifications.update(notifs =>
      notifs.map(n => ({ ...n, read: true }))
    );
  }

  toggleSimulation() {
    if (this._simulationActive()) {
      this.stopSimulator();
    } else {
      this.startSimulator();
    }
  }

  // --- REAL-TIME EVENT SIMULATOR (RxJS) ---

  private startSimulator() {
    this._simulationActive.set(true);
    if (this.simulationSubscription) return;

    // Tick every 12 seconds to simulate busy kitchen/POS operations
    this.simulationSubscription = interval(12000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.runSimulationTick();
      });
  }

  private stopSimulator() {
    this._simulationActive.set(false);
    if (this.simulationSubscription) {
      this.simulationSubscription.unsubscribe();
      this.simulationSubscription = undefined;
    }
  }

  private runSimulationTick() {
    const currentOrders = this._orders();
    const pending = currentOrders.filter(o => o.status === 'pending');
    const preparing = currentOrders.filter(o => o.status === 'preparing');
    const ready = currentOrders.filter(o => o.status === 'ready');

    const roll = Math.random();

    // 1. Chance to progress an existing order status
    if (roll < 0.4 && pending.length > 0) {
      // Progress a pending order to preparing
      const target = pending[Math.floor(Math.random() * pending.length)];
      this.updateOrderStatus(target.id, 'preparing');
    } else if (roll < 0.75 && preparing.length > 0) {
      // Progress a preparing order to ready
      const target = preparing[Math.floor(Math.random() * preparing.length)];
      this.updateOrderStatus(target.id, 'ready');
    } else if (roll < 0.9 && ready.length > 0) {
      // Progress a ready order to delivered
      const target = ready[Math.floor(Math.random() * ready.length)];
      this.updateOrderStatus(target.id, 'delivered');
    }

    // 2. Chance to generate a brand new order
    if (roll > 0.65) {
      this.simulateIncomingOrder();
    }
  }

  private simulateIncomingOrder() {
    // Pick a free table
    const freeTables = this._tables().filter(t => t.status === 'free');
    if (freeTables.length === 0) return;

    const randomTable = freeTables[Math.floor(Math.random() * freeTables.length)];
    
    // Choose 1-3 random menu items
    const menuItems = this._menu().filter(m => m.available);
    const orderItemsCount = Math.floor(Math.random() * 3) + 1;
    const selectedItems: OrderItem[] = [];

    for (let i = 0; i < orderItemsCount; i++) {
      const item = menuItems[Math.floor(Math.random() * menuItems.length)];
      // Check if already selected, if so just increase quantity
      const existing = selectedItems.find(si => si.menuItemId === item.id);
      if (existing) {
        existing.quantity += 1;
      } else {
        selectedItems.push({
          menuItemId: item.id,
          name: item.name,
          quantity: 1,
          price: item.price
        });
      }
    }

    this.addOrder({
      tableNo: randomTable.number,
      items: selectedItems,
      status: 'pending',
      notes: Math.random() > 0.7 ? 'Extra hot, please.' : undefined
    });
  }

  private triggerNotification(notification: AppNotification) {
    this._notifications.update(n => [notification, ...n]);
    this.notificationSubject.next(notification);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.stopSimulator();
  }
}

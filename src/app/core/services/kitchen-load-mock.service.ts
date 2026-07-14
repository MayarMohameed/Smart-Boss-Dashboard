// =============================================================================
// KitchenLoadMockService — Live Kitchen Workload Simulator
// =============================================================================
// Emits periodic KitchenLoadSnapshots that represent the real-time utilization
// of each kitchen station. The load fluctuates based on the active order count
// from the OrderMockService, creating a realistic feedback loop.
// =============================================================================

import { Injectable, OnDestroy, inject } from '@angular/core';
import {
  BehaviorSubject,
  Observable,
  Subject,
  Subscription,
  timer,
  combineLatest
} from 'rxjs';
import {
  map,
  takeUntil,
  distinctUntilChanged,
  shareReplay
} from 'rxjs/operators';
import {
  KitchenStation,
  StationLoad,
  KitchenLoadSnapshot,
  KitchenLoadEvent,
  KitchenAlert
} from '../models/backend.models';
import { OrderMockService } from './order-mock.service';

// ---------------------------------------------------------------------------
// Station Configuration
// ---------------------------------------------------------------------------

interface StationConfig {
  station: KitchenStation;
  capacity: number;
  basePrepTime: number; // minutes
}

const STATION_CONFIGS: StationConfig[] = [
  { station: 'grill',     capacity: 6,  basePrepTime: 12 },
  { station: 'fryer',     capacity: 8,  basePrepTime: 8 },
  { station: 'salad-bar', capacity: 10, basePrepTime: 5 },
  { station: 'dessert',   capacity: 5,  basePrepTime: 7 },
  { station: 'beverage',  capacity: 12, basePrepTime: 3 },
  { station: 'plating',   capacity: 8,  basePrepTime: 4 }
];

// Map menu items to their primary kitchen station
const ITEM_STATION_MAP: Record<string, KitchenStation> = {
  'm1':  'grill',      // Truffle Burger
  'm2':  'salad-bar',  // Teal Garden Salad
  'm3':  'grill',      // Margherita Pizza (oven/grill)
  'm4':  'grill',      // Slow Roasted Salmon
  'm5':  'beverage',   // Matcha Latte
  'm6':  'beverage',   // Espresso Tonic
  'm7':  'beverage',   // Craft IPA Beer
  'm8':  'dessert',    // Pistachio Lava Cake
  'm9':  'dessert',    // Tiramisu Cup
  'm10': 'grill',      // Wagyu Sliders
  'm11': 'fryer',      // Miso Glazed Eggplant
  'm12': 'beverage'    // Sparkling Yuzu Water
};

const STAFF_RANGE = { min: 4, max: 9 };

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class KitchenLoadMockService implements OnDestroy {
  private readonly orderService = inject(OrderMockService);

  private destroy$ = new Subject<void>();
  private loadSubject = new BehaviorSubject<KitchenLoadSnapshot>(this.createIdleSnapshot());
  private eventSubject = new Subject<KitchenLoadEvent>();
  private alertIdCounter = 0;
  private currentStaff = this.randomBetween(STAFF_RANGE.min, STAFF_RANGE.max);
  private tickSubscription?: Subscription;

  /** Latest kitchen load snapshot. */
  readonly kitchenLoad$: Observable<KitchenLoadSnapshot> = this.loadSubject.asObservable().pipe(
    shareReplay(1)
  );

  /** Stream of kitchen load events with alerts. */
  readonly kitchenEvents$: Observable<KitchenLoadEvent> = this.eventSubject.asObservable();

  /** Derived: overall utilization as a percentage. */
  readonly overallUtilization$: Observable<number> = this.kitchenLoad$.pipe(
    map(s => s.overallUtilization),
    distinctUntilChanged()
  );

  /** Derived: kitchen health status. */
  readonly healthStatus$: Observable<'green' | 'yellow' | 'red'> = this.kitchenLoad$.pipe(
    map(s => s.healthStatus),
    distinctUntilChanged()
  );

  constructor() {
    this.startSimulation();
  }

  // ====================================================================
  // PUBLIC API
  // ====================================================================

  /** Returns the current snapshot instantly. */
  getCurrentSnapshot(): KitchenLoadSnapshot {
    return this.loadSubject.value;
  }

  /** Returns load for a specific station. */
  getStationLoad$(station: KitchenStation): Observable<StationLoad> {
    return this.kitchenLoad$.pipe(
      map(snapshot => snapshot.stations.find((s: StationLoad) => s.station === station)!),
      distinctUntilChanged((a, b) => a.utilizationPercent === b.utilizationPercent)
    );
  }

  // ====================================================================
  // SIMULATION ENGINE
  // ====================================================================

  private startSimulation() {
    // Re-compute kitchen load every 5 seconds based on active orders
    this.tickSubscription = combineLatest([
      timer(0, 5000),
      this.orderService.orders$
    ]).pipe(
      takeUntil(this.destroy$)
    ).subscribe(([_, orders]) => {
      // Count active (non-delivered, non-cancelled) orders
      const activeOrders = orders.filter(o =>
        o.status !== 'delivered' && o.status !== 'cancelled'
      );

      // Occasional staff fluctuation (every ~30 seconds)
      if (Math.random() < 0.15) {
        this.fluctuateStaff();
      }

      const snapshot = this.computeSnapshot(activeOrders.length, activeOrders);
      const alerts = this.generateAlerts(snapshot);

      this.loadSubject.next(snapshot);
      this.eventSubject.next({
        type: alerts.length > 0 ? 'station_alert' : 'load_update',
        snapshot,
        alerts
      });
    });
  }

  private computeSnapshot(
    activeCount: number,
    activeOrders: { items: { menuItemId: string }[] }[]
  ): KitchenLoadSnapshot {
    // Tally how many items are hitting each station
    const stationItemCounts = new Map<KitchenStation, number>();
    STATION_CONFIGS.forEach(c => stationItemCounts.set(c.station, 0));

    for (const order of activeOrders) {
      for (const item of order.items) {
        const station = ITEM_STATION_MAP[item.menuItemId] || 'plating';
        stationItemCounts.set(station, (stationItemCounts.get(station) || 0) + 1);
      }
    }

    const stations: StationLoad[] = STATION_CONFIGS.map(config => {
      const itemCount = stationItemCounts.get(config.station) || 0;
      // Add some noise for realism
      const noise = (Math.random() - 0.5) * 2; // ±1 order of jitter
      const effectiveLoad = Math.max(0, itemCount + noise);
      const utilization = Math.min(100, Math.round((effectiveLoad / config.capacity) * 100));

      const avgPrepTime = +(config.basePrepTime * (1 + (utilization / 100) * 0.5)).toFixed(1);

      let status: StationLoad['status'];
      if (utilization === 0) status = 'idle';
      else if (utilization < 50) status = 'normal';
      else if (utilization < 80) status = 'busy';
      else status = 'overloaded';

      return {
        station: config.station,
        activeOrders: Math.round(effectiveLoad),
        capacity: config.capacity,
        utilizationPercent: utilization,
        avgPrepTimeMinutes: avgPrepTime,
        status
      };
    });

    const overallUtilization = Math.round(
      stations.reduce((sum, s) => sum + s.utilizationPercent, 0) / stations.length
    );

    const estimatedWait = Math.round(
      stations.reduce((max, s) => Math.max(max, s.avgPrepTimeMinutes), 0)
    );

    let healthStatus: KitchenLoadSnapshot['healthStatus'];
    if (overallUtilization < 50) healthStatus = 'green';
    else if (overallUtilization < 75) healthStatus = 'yellow';
    else healthStatus = 'red';

    return {
      timestamp: new Date(),
      overallUtilization,
      stations,
      activeOrdersCount: activeCount,
      estimatedWaitMinutes: estimatedWait,
      staffOnDuty: this.currentStaff,
      healthStatus
    };
  }

  private generateAlerts(snapshot: KitchenLoadSnapshot): KitchenAlert[] {
    const alerts: KitchenAlert[] = [];

    for (const station of snapshot.stations) {
      if (station.status === 'overloaded') {
        alerts.push({
          id: `ka-${this.alertIdCounter++}`,
          station: station.station,
          message: `${this.formatStationName(station.station)} is overloaded at ${station.utilizationPercent}% capacity`,
          severity: 'critical',
          timestamp: new Date()
        });
      } else if (station.status === 'busy' && Math.random() > 0.6) {
        alerts.push({
          id: `ka-${this.alertIdCounter++}`,
          station: station.station,
          message: `${this.formatStationName(station.station)} approaching capacity (${station.utilizationPercent}%)`,
          severity: 'warning',
          timestamp: new Date()
        });
      }
    }

    return alerts;
  }

  private fluctuateStaff() {
    const delta = Math.random() > 0.5 ? 1 : -1;
    this.currentStaff = Math.max(
      STAFF_RANGE.min,
      Math.min(STAFF_RANGE.max, this.currentStaff + delta)
    );
  }

  private createIdleSnapshot(): KitchenLoadSnapshot {
    return {
      timestamp: new Date(),
      overallUtilization: 0,
      stations: STATION_CONFIGS.map(c => ({
        station: c.station,
        activeOrders: 0,
        capacity: c.capacity,
        utilizationPercent: 0,
        avgPrepTimeMinutes: c.basePrepTime,
        status: 'idle' as const
      })),
      activeOrdersCount: 0,
      estimatedWaitMinutes: 0,
      staffOnDuty: this.currentStaff,
      healthStatus: 'green'
    };
  }

  private formatStationName(station: KitchenStation): string {
    return station
      .split('-')
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
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

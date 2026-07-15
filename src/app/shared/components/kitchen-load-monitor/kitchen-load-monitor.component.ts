import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { KitchenLoadMockService } from '../../../core/services/kitchen-load-mock.service';
import {
  KitchenLoadSnapshot,
  StationLoad,
  KitchenStation,
} from '../../../core/models/backend.models';

/** Maps each kitchen station to a Material Symbols Outlined icon name. */
const STATION_ICON_MAP: Record<KitchenStation, string> = {
  grill: 'outdoor_grill',
  fryer: 'skillet',
  'salad-bar': 'nutrition',
  dessert: 'cake',
  beverage: 'coffee',
  plating: 'dinner_dining',
};

@Component({
  selector: 'app-kitchen-load-monitor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './kitchen-load-monitor.component.html',
  styleUrls: ['./kitchen-load-monitor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KitchenLoadMonitorComponent implements OnInit, OnDestroy {
  private readonly kitchenService = inject(KitchenLoadMockService);
  private readonly destroy$ = new Subject<void>();

  /** Reactive snapshot signal – null until the first emission. */
  readonly snapshot = signal<KitchenLoadSnapshot | null>(null);

  /** Derived health label for the badge text. */
  readonly healthLabel = computed<string>(() => {
    const s = this.snapshot();
    if (!s) return '';
    switch (s.healthStatus) {
      case 'green':
        return 'Healthy';
      case 'yellow':
        return 'Moderate';
      case 'red':
        return 'Critical';
    }
  });

  activeOverride(): 'low' | 'busy' | 'overloaded' | 'auto' {
    return this.kitchenService.getOverrideTier();
  }

  setLoadOverride(tier: 'low' | 'busy' | 'overloaded' | 'auto'): void {
    this.kitchenService.setKitchenLoadOverride(tier);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────

  ngOnInit(): void {
    this.kitchenService.kitchenLoad$
      .pipe(takeUntil(this.destroy$))
      .subscribe((snap) => this.snapshot.set(snap));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Template helpers ───────────────────────────────────────────────

  /** Track function for the stations @for loop. */
  trackByStation(_index: number, station: StationLoad): string {
    return station.station;
  }

  /** Returns the Material Symbol name for a given station. */
  stationIcon(station: KitchenStation): string {
    return STATION_ICON_MAP[station] ?? 'restaurant';
  }

  /** Formats a station id into a display-friendly name. */
  formatStationName(station: KitchenStation): string {
    return station
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /** Returns the CSS class suffix for utilization bar color. */
  barColorClass(status: StationLoad['status']): string {
    return `bar--${status}`;
  }
}

import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AppStateStore } from '../../store/app-state.store';
import { KitchenLoadMockService } from '../../services/kitchen-load-mock.service';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent implements OnInit, OnDestroy {
  readonly store          = inject(AppStateStore);
  readonly kitchenService = inject(KitchenLoadMockService);
  private  destroy$       = new Subject<void>();

  /** Mirrors kitchen health status for the sidebar live indicator. */
  readonly kitchenHealth = signal<'green' | 'yellow' | 'red'>('green');

  navItems: NavItem[] = [
    { path: '/dashboard', label: 'Dashboard',    icon: 'grid_view'       },
    { path: '/orders',    label: 'Orders',        icon: 'receipt_long'    },
    { path: '/menu',      label: 'Menu Catalog',  icon: 'restaurant_menu' },
    { path: '/analytics', label: 'Analytics',     icon: 'trending_up'    }
  ];

  ngOnInit(): void {
    this.kitchenService.healthStatus$
      .pipe(takeUntil(this.destroy$))
      .subscribe(status => this.kitchenHealth.set(status));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AppStateStore } from '../../store/app-state.store';

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
export class SidebarComponent {
  readonly store = inject(AppStateStore);
  
  navItems: NavItem[] = [
    { path: '/dashboard', label: 'Dashboard', icon: 'grid_view' },
    { path: '/orders', label: 'Orders', icon: 'receipt_long' },
    { path: '/menu', label: 'Menu Catalog', icon: 'restaurant_menu' },
    { path: '/analytics', label: 'Analytics', icon: 'trending_up' }
  ];

  toggleSimulation() {
    this.store.toggleSimulation();
  }
}

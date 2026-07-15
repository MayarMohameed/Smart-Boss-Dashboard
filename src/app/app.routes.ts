import { Routes } from '@angular/router';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { OrdersWorkspaceComponent } from './features/orders/orders-workspace.component';
import { MenuComponent } from './features/menu/menu.component';
import { AnalyticsComponent } from './features/analytics/analytics.component';

export const routes: Routes = [
  { path: 'dashboard', component: DashboardComponent },
  { path: 'orders', component: OrdersWorkspaceComponent },
  { path: 'menu', component: MenuComponent },
  { path: 'analytics', component: AnalyticsComponent },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: '**', redirectTo: 'dashboard' }
];

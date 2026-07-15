import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppStateStore, Order } from '../../core/store/app-state.store';

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="analytics-container">
      <!-- Analytics Header -->
      <header class="analytics-header">
        <div class="header-text">
          <h1>POS Analytics & Sales</h1>
          <p>Historical sales performance, order channel splits, and average basket sizes.</p>
        </div>
      </header>

      <!-- Statistics Widgets Grid -->
      <div class="stats-grid">
        <div class="stat-card glass-card">
          <span class="card-title">Delivered Orders</span>
          <h2 class="card-value">{{ getDeliveredCount() }}</h2>
          <span class="card-sub">Successfully fulfilled tickets</span>
        </div>

        <div class="stat-card glass-card">
          <span class="card-title">Average Basket Total</span>
          <h2 class="card-value">\${{ getAverageBasketTotal().toFixed(2) }}</h2>
          <span class="card-sub">Calculated across all orders</span>
        </div>

        <div class="stat-card glass-card">
          <span class="card-title">Active Order Backlog</span>
          <h2 class="card-value">{{ getActiveCount() }}</h2>
          <span class="card-sub">Tickets currently in production</span>
        </div>

        <div class="stat-card glass-card">
          <span class="card-title">Total Revenue Generated</span>
          <h2 class="card-value text-teal">\${{ store.stats().totalRevenue.toFixed(2) }}</h2>
          <span class="card-sub">Delivered order total sum</span>
        </div>
      </div>

      <!-- Analysis sections -->
      <div class="analysis-split">
        <!-- Channel Breakdown -->
        <section class="channel-card glass-card">
          <div class="card-header">
            <span class="material-symbols-outlined">analytics</span>
            <h2>Order Channel Distribution</h2>
          </div>
          <div class="channel-list">
            <!-- Walk-in -->
            <div class="channel-row">
              <div class="row-meta">
                <span class="channel-icon material-symbols-outlined">store</span>
                <span class="channel-label">Walk-In Dining</span>
              </div>
              <div class="row-progress-wrap">
                <div class="progress-bar">
                  <div class="progress-fill bg-teal" [style.width.%]="getChannelPercentage('walk-in')"></div>
                </div>
                <span class="progress-pct">{{ getChannelPercentage('walk-in') }}%</span>
              </div>
            </div>

            <!-- Delivery -->
            <div class="channel-row">
              <div class="row-meta">
                <span class="channel-icon material-symbols-outlined">delivery_dining</span>
                <span class="channel-label">Delivery Couriers</span>
              </div>
              <div class="row-progress-wrap">
                <div class="progress-bar">
                  <div class="progress-fill bg-orange" [style.width.%]="getChannelPercentage('delivery')"></div>
                </div>
                <span class="progress-pct">{{ getChannelPercentage('delivery') }}%</span>
              </div>
            </div>

            <!-- Online -->
            <div class="channel-row">
              <div class="row-meta">
                <span class="channel-icon material-symbols-outlined">language</span>
                <span class="channel-label">Online WebOrders</span>
              </div>
              <div class="row-progress-wrap">
                <div class="progress-bar">
                  <div class="progress-fill bg-blue" [style.width.%]="getChannelPercentage('online')"></div>
                </div>
                <span class="progress-pct">{{ getChannelPercentage('online') }}%</span>
              </div>
            </div>
          </div>
        </section>

        <!-- Revenue Breakdown by Items -->
        <section class="revenue-card glass-card">
          <div class="card-header">
            <span class="material-symbols-outlined">list_alt</span>
            <h2>Recent Fulfilled Sales Transactions</h2>
          </div>
          <div class="sales-list">
            @for (sale of getRecentSales(); track sale.id) {
              <div class="sale-row">
                <div class="sale-meta">
                  <span class="sale-id">{{ sale.id }}</span>
                  <span class="sale-time">{{ sale.updatedAt | date:'shortTime' }}</span>
                </div>
                <div class="sale-detail">
                  <span class="sale-origin">Table {{ sale.tableNo }}</span>
                  <span class="sale-amount">\${{ sale.totalAmount.toFixed(2) }}</span>
                </div>
              </div>
            } @empty {
              <div class="empty-sales">No transactions completed yet.</div>
            }
          </div>
        </section>
      </div>
    </div>
  `,
  styles: [`
    .analytics-container {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      padding: 1.5rem;
      color: var(--text-primary);
      animation: fadeIn 0.3s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Header */
    .analytics-header {
      h1 {
        font-size: 1.8rem;
        font-weight: 700;
        letter-spacing: -0.02em;
        margin-bottom: 0.25rem;
      }

      p {
        font-size: 0.9rem;
        color: var(--text-secondary);
      }
    }

    /* Glass Cards */
    .glass-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-color);
      border-radius: var(--border-radius-md, 8px);
      padding: 1.25rem;
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
    }

    .stat-card {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;

      .card-title {
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-secondary);
      }

      .card-value {
        font-size: 1.8rem;
        font-weight: 800;
        letter-spacing: -0.02em;
      }

      .text-teal { color: var(--brand-accent, #00a3a3); }

      .card-sub {
        font-size: 0.75rem;
        color: var(--text-muted);
      }
    }

    /* Main Grid layout */
    .analysis-split {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1.5rem;

      @media (min-width: 1024px) {
        grid-template-columns: 1.2fr 1fr;
      }
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1.25rem;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 0.75rem;

      span { color: var(--text-secondary); font-size: 20px; }
      h2 { font-size: 1rem; font-weight: 600; }
    }

    /* Channel breakdown */
    .channel-list {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .channel-row {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .row-meta {
      display: flex;
      align-items: center;
      gap: 0.5rem;

      .channel-icon { font-size: 18px; color: var(--text-secondary); }
      .channel-label { font-size: 0.85rem; font-weight: 500; }
    }

    .row-progress-wrap {
      display: flex;
      align-items: center;
      gap: 1rem;

      .progress-bar {
        flex: 1;
        height: 8px;
        background: rgba(255, 255, 255, 0.04);
        border-radius: 4px;
        overflow: hidden;
      }

      .progress-fill {
        height: 100%;
        border-radius: 4px;
      }

      .bg-teal { background: #006565; }
      .bg-orange { background: #d97706; }
      .bg-blue { background: #2563eb; }

      .progress-pct {
        font-family: monospace;
        font-size: 0.85rem;
        font-weight: 600;
        width: 36px;
        text-align: right;
      }
    }

    /* Sales List */
    .sales-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      max-height: 280px;
      overflow-y: auto;
    }

    .sale-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.6rem 0.75rem;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.01);
      border: 1px solid var(--border-color);

      .sale-meta {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;

        .sale-id { font-size: 0.8rem; font-weight: 600; }
        .sale-time { font-size: 0.72rem; color: var(--text-muted); font-family: monospace; }
      }

      .sale-detail {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.15rem;

        .sale-origin { font-size: 0.75rem; color: var(--text-secondary); }
        .sale-amount { font-size: 0.88rem; font-weight: 700; color: var(--brand-accent, #00a3a3); }
      }
    }

    .empty-sales {
      color: var(--text-secondary);
      text-align: center;
      padding: 2rem;
      font-size: 0.88rem;
    }
  `]
})
export class AnalyticsComponent {
  readonly store = inject(AppStateStore);

  getDeliveredCount(): number {
    return this.store.orders().filter(o => o.status === 'delivered').length;
  }

  getActiveCount(): number {
    const activeStatuses = ['pending', 'preparing', 'ready'];
    return this.store.orders().filter(o => activeStatuses.includes(o.status)).length;
  }

  getAverageBasketTotal(): number {
    const orders = this.store.orders();
    if (orders.length === 0) return 0;
    const sum = orders.reduce((acc, o) => acc + o.totalAmount, 0);
    return sum / orders.length;
  }

  getRecentSales(): Order[] {
    return this.store.orders()
      .filter(o => o.status === 'delivered')
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, 5);
  }

  getChannelPercentage(channel: 'walk-in' | 'delivery' | 'online'): number {
    const total = this.store.orders().length;
    if (total === 0) return 0;
    
    // Check channel counts. We need to check tableNo conventions or map them.
    // In our order service, buildOrder set order channel fields, which are directly
    // in orderService.orders$!
    // Since AppStateStore maps bo.channel but doesn't retain channel directly on the Order interface,
    // let's check: did mapBackendOrder keep channel?
    // Let's inspect AppStateStore mapBackendOrder again.
    // Ah! mapBackendOrder sets tableNo = bo.tableNo ?? 'Delivery'.
    // If bo.channel === 'delivery', tableNo is 'Delivery'.
    // If bo.channel === 'online', tableNo is WEB-xxx.
    // If bo.channel === 'walk-in', tableNo is table number (e.g. '1', '2', etc.).
    // So we can compute the breakdown from tableNo prefixes!
    const orders = this.store.orders();
    let count = 0;
    for (const o of orders) {
      if (channel === 'delivery' && o.tableNo === 'Delivery') {
        count++;
      } else if (channel === 'online' && o.tableNo.startsWith('WEB')) {
        count++;
      } else if (channel === 'walk-in' && o.tableNo !== 'Delivery' && !o.tableNo.startsWith('WEB')) {
        count++;
      }
    }
    
    return Math.round((count / total) * 100);
  }
}

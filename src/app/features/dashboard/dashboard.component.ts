import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppStateStore, Order } from '../../core/store/app-state.store';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dashboard-container">
      <!-- Welcome Header -->
      <header class="dashboard-header">
        <div class="header-text">
          <h1>TealPOS Dashboard</h1>
          <p>Real-time dining room status and active order pipeline summary.</p>
        </div>
        <div class="live-pulse-badge">
          <span class="pulse-dot"></span>
          <span>Live Console</span>
        </div>
      </header>

      <!-- Key Metrics Row -->
      <div class="metrics-grid">
        <div class="metric-card glass-card">
          <div class="metric-icon-wrap bg-teal">
            <span class="material-symbols-outlined">payments</span>
          </div>
          <div class="metric-info">
            <span class="metric-label">Delivered Revenue</span>
            <h3 class="metric-value">\${{ store.stats().totalRevenue.toFixed(2) }}</h3>
          </div>
        </div>

        <div class="metric-card glass-card">
          <div class="metric-icon-wrap bg-orange">
            <span class="material-symbols-outlined">table_restaurant</span>
          </div>
          <div class="metric-info">
            <span class="metric-label">Active Tables</span>
            <h3 class="metric-value">{{ store.stats().activeTablesCount }} / 12</h3>
          </div>
        </div>

        <div class="metric-card glass-card">
          <div class="metric-icon-wrap bg-blue">
            <span class="material-symbols-outlined">soup_kitchen</span>
          </div>
          <div class="metric-info">
            <span class="metric-label">Kitchen Backlog</span>
            <h3 class="metric-value">{{ store.stats().preparingCount + store.stats().pendingCount }} Active</h3>
          </div>
        </div>

        <div class="metric-card glass-card">
          <div class="metric-icon-wrap bg-red">
            <span class="material-symbols-outlined">crisis_alert</span>
          </div>
          <div class="metric-info">
            <span class="metric-label">High Priority Tickets</span>
            <h3 class="metric-value">{{ getHighPriorityCount() }}</h3>
          </div>
        </div>
      </div>

      <!-- Main Layout: Table occupancy + Active list -->
      <div class="layout-main">
        <!-- Tables occupancy grid -->
        <section class="tables-section glass-card">
          <div class="section-header">
            <span class="material-symbols-outlined">grid_view</span>
            <h2>Table Status Matrix</h2>
          </div>
          <div class="tables-grid">
            @for (table of store.tables(); track table.id) {
              <div 
                class="table-cell" 
                [attr.data-status]="table.status"
                [title]="table.currentOrderId ? 'Active Order: ' + table.currentOrderId : 'Table Free'"
              >
                <div class="table-number">{{ table.number }}</div>
                <div class="table-badge">{{ table.status | uppercase }}</div>
              </div>
            }
          </div>
        </section>

        <!-- Active Orders Table -->
        <section class="active-orders-section glass-card">
          <div class="section-header">
            <span class="material-symbols-outlined">receipt_long</span>
            <h2>Active Tickets Pipeline</h2>
          </div>
          <div class="table-wrap">
            <table class="dashboard-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Origin</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                @for (order of getActiveOrders(); track order.id) {
                  <tr>
                    <td class="bold-text">{{ order.id }}</td>
                    <td>
                      <span class="origin-chip">
                        {{ order.tableNo === 'Delivery' ? '🛵 Delivery' : '🍽️ Table ' + order.tableNo }}
                      </span>
                    </td>
                    <td>
                      <span 
                        class="priority-chip" 
                        [attr.data-priority]="order.priority"
                      >
                        {{ order.priority | uppercase }}
                      </span>
                    </td>
                    <td>
                      <span 
                        class="status-chip" 
                        [attr.data-status]="order.status"
                      >
                        {{ order.status | uppercase }}
                      </span>
                    </td>
                    <td class="bold-text">\${{ order.totalAmount.toFixed(2) }}</td>
                    <td class="time-text">{{ order.createdAt | date:'shortTime' }}</td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6" class="empty-row">No active orders. Run orders simulation.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  `,
  styles: [`
    .dashboard-container {
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
    .dashboard-header {
      display: flex;
      justify-content: space-between;
      align-items: center;

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

    .live-pulse-badge {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 0.8rem;
      background: rgba(0, 101, 101, 0.12);
      border: 1px solid rgba(0, 101, 101, 0.3);
      border-radius: 2rem;
      color: var(--brand-accent, #00a3a3);
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;

      .pulse-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--brand-accent, #00a3a3);
        box-shadow: 0 0 6px var(--brand-accent, #00a3a3);
        animation: pulse 1.6s infinite ease-in-out;
      }
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.5); opacity: 0.4; }
    }

    /* Glass Cards */
    .glass-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-color);
      border-radius: var(--border-radius-md, 8px);
      padding: 1.25rem;
    }

    /* Metrics Grid */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
    }

    .metric-card {
      display: flex;
      align-items: center;
      gap: 1rem;

      .metric-icon-wrap {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
        border-radius: 12px;

        span { font-size: 24px; color: #fff; }
      }

      .bg-teal { background: #006565; }
      .bg-orange { background: #d97706; }
      .bg-blue { background: #2563eb; }
      .bg-red { background: #dc2626; }

      .metric-info {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;

        .metric-label {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-secondary);
        }

        .metric-value {
          font-size: 1.35rem;
          font-weight: 700;
          letter-spacing: -0.01em;
        }
      }
    }

    /* Main Grid layout */
    .layout-main {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1.5rem;

      @media (min-width: 1024px) {
        grid-template-columns: 320px 1fr;
      }
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1.25rem;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 0.75rem;

      span { color: var(--text-secondary); font-size: 20px; }
      h2 { font-size: 1rem; font-weight: 600; }
    }

    /* Tables Matrix */
    .tables-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.75rem;
    }

    .table-cell {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      aspect-ratio: 1;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.01);
      border: 1px solid var(--border-color);
      transition: all 0.25s ease;

      .table-number {
        font-size: 1.2rem;
        font-weight: 700;
        margin-bottom: 0.25rem;
      }

      .table-badge {
        font-size: 0.62rem;
        font-weight: 700;
        letter-spacing: 0.02em;
        padding: 1px 6px;
        border-radius: 4px;
      }

      &[data-status="free"] {
        border-color: rgba(255, 255, 255, 0.05);
        color: var(--text-secondary);
        .table-badge { background: rgba(255, 255, 255, 0.04); color: var(--text-secondary); }
      }

      &[data-status="ordered"] {
        border-color: #3b82f6;
        color: #60a5fa;
        background: rgba(59, 130, 246, 0.05);
        .table-badge { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
      }

      &[data-status="occupied"] {
        border-color: #d97706;
        color: #fbbf24;
        background: rgba(217, 119, 6, 0.05);
        .table-badge { background: rgba(217, 119, 6, 0.15); color: #fbbf24; }
      }

      &[data-status="billing"] {
        border-color: #10b981;
        color: #34d399;
        background: rgba(16, 185, 129, 0.05);
        .table-badge { background: rgba(16, 185, 129, 0.15); color: #34d399; }
      }
    }

    /* Active Orders list */
    .table-wrap {
      overflow-x: auto;
    }

    .dashboard-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.88rem;

      th {
        padding: 0.75rem;
        color: var(--text-secondary);
        font-weight: 600;
        border-bottom: 1px solid var(--border-color);
      }

      td {
        padding: 0.75rem;
        border-bottom: 1px solid var(--border-color);
        vertical-align: middle;
      }

      .bold-text { font-weight: 600; }
      .time-text { font-family: monospace; color: var(--text-secondary); }
      .empty-row { text-align: center; color: var(--text-secondary); padding: 2rem; }
    }

    .origin-chip {
      font-size: 0.8rem;
      font-weight: 500;
    }

    /* Chips */
    .priority-chip {
      font-size: 0.68rem;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.04);
      color: var(--text-secondary);

      &[data-priority="high"] { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
      &[data-priority="rush"] { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
    }

    .status-chip {
      font-size: 0.68rem;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;

      &[data-status="pending"] { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
      &[data-status="preparing"] { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
      &[data-status="ready"] { background: rgba(16, 185, 129, 0.15); color: #10b981; }
    }
  `]
})
export class DashboardComponent {
  readonly store = inject(AppStateStore);

  getHighPriorityCount(): number {
    return this.store.orders().filter(o => 
      o.priority === 'high' || o.priority === 'rush'
    ).length;
  }

  getActiveOrders(): Order[] {
    const activeStatuses = ['pending', 'preparing', 'ready'];
    return this.store.orders()
      .filter(o => activeStatuses.includes(o.status))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="padding: 1rem;">
      <h1 style="font-size: 2rem; margin-bottom: 0.5rem; color: var(--text-primary);">Order Pipeline</h1>
      <p style="color: var(--text-secondary);">Manage incoming table orders and kitchen status updates here.</p>
    </div>
  `
})
export class OrdersComponent {}

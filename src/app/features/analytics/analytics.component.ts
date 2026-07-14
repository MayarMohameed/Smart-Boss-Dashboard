import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="padding: 1rem;">
      <h1 style="font-size: 2rem; margin-bottom: 0.5rem; color: var(--text-primary);">Analytics & Revenue</h1>
      <p style="color: var(--text-secondary);">Kitchen performance statistics, revenue breakdown, and order analysis here.</p>
    </div>
  `
})
export class AnalyticsComponent {}

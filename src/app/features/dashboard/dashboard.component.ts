import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="padding: 1rem;">
      <h1 style="font-size: 2rem; margin-bottom: 0.5rem; color: var(--text-primary);">Dashboard</h1>
      <p style="color: var(--text-secondary);">Welcome to TealPOS. Real-time metrics and order pipelines will be loaded here.</p>
    </div>
  `
})
export class DashboardComponent {}

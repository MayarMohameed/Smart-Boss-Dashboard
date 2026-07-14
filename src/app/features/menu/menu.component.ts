import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppStateStore, MenuItem } from '../../core/store/app-state.store';
import { ProductSearchComponent } from '../../shared/components/product-search/product-search.component';

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [CommonModule, ProductSearchComponent],
  template: `
    <div style="padding: 1rem;">
      <h1 style="font-size: 2rem; margin-bottom: 0.5rem; color: var(--text-primary);">Menu Catalog</h1>
      <p style="color: var(--text-secondary); margin-bottom: 1rem;">Search with the keyboard: ↑/↓ to navigate and Enter to select.</p>
      <app-product-search [products]="store.menu()" (selection)="selectProduct($event)" />
      @if (selectedProduct; as product) { <p style="margin-top: 1rem;">Selected: {{ product.name }}</p> }
    </div>
  `
})
export class MenuComponent {
  readonly store = inject(AppStateStore);
  selectedProduct: MenuItem | null = null;
  selectProduct(product: MenuItem): void { this.selectedProduct = product; }
}

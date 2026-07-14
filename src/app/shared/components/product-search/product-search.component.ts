import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BehaviorSubject, Subject, combineLatest } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, takeUntil } from 'rxjs/operators';
import { MenuItem } from '../../../core/store/app-state.store';

@Component({
  selector: 'app-product-search',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './product-search.component.html',
  styleUrl: './product-search.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductSearchComponent implements OnInit, OnDestroy {
  readonly products = input.required<MenuItem[]>();
  readonly selection = output<MenuItem>();
  readonly resultsChange = output<MenuItem[]>();

  readonly query = signal('');
  readonly activeCategory = signal<MenuItem['category'] | 'all'>('all');
  readonly activeIndex = signal(-1);
  readonly results = signal<MenuItem[]>([]);
  readonly categories = computed(() => ['all', ...new Set(this.products().map(product => product.category))] as const);

  private readonly query$ = new Subject<string>();
  private readonly category$ = new BehaviorSubject<MenuItem['category'] | 'all'>('all');
  private readonly products$ = new BehaviorSubject<MenuItem[]>([]);
  private readonly destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.products$.next(this.products());
    combineLatest([
      this.query$.pipe(debounceTime(300), distinctUntilChanged()),
      this.category$.pipe(distinctUntilChanged()),
      this.products$
    ]).pipe(
      map(([query, category, products]) => this.filter(products, query, category)),
      takeUntil(this.destroy$)
    ).subscribe(results => {
      this.results.set(results);
      this.activeIndex.set(results.length ? 0 : -1);
      this.resultsChange.emit(results);
    });
    this.query$.next('');
  }

  onQuery(value: string): void {
    this.query.set(value);
    this.query$.next(value.trim().toLowerCase());
  }

  setCategory(category: MenuItem['category'] | 'all'): void {
    this.activeCategory.set(category);
    this.category$.next(category);
  }

  onKeydown(event: KeyboardEvent): void {
    const results = this.results();
    if (!results.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      this.activeIndex.update(index => (index + direction + results.length) % results.length);
    } else if (event.key === 'Enter' && this.activeIndex() >= 0) {
      event.preventDefault();
      this.select(results[this.activeIndex()]);
    } else if (event.key === 'Escape') {
      this.onQuery('');
    }
  }

  select(product: MenuItem): void { this.selection.emit(product); }

  trackById(_index: number, product: MenuItem): string { return product.id; }

  private filter(products: MenuItem[], query: string, category: MenuItem['category'] | 'all'): MenuItem[] {
    return products.filter(product => product.available &&
      (category === 'all' || product.category === category) &&
      (!query || product.name.toLowerCase().includes(query))
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { BehaviorSubject, Subject, combineLatest } from 'rxjs';
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators';
import { MenuItem } from '../../../core/store/app-state.store';

const RECENT_SEARCHES_KEY = 'teal-pos.recent-searches';
const MAX_RECENT           = 6;

@Component({
  selector: 'app-product-search',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './product-search.component.html',
  styleUrl: './product-search.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductSearchComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  // ── Inputs / Outputs ────────────────────────────────────────────────────────
  readonly products      = input.required<MenuItem[]>();
  readonly selection     = output<MenuItem>();
  readonly resultsChange = output<MenuItem[]>();

  // ── UI State Signals ────────────────────────────────────────────────────────
  readonly query          = signal('');
  readonly activeCategory = signal<MenuItem['category'] | 'all'>('all');
  readonly results        = signal<MenuItem[]>([]);
  readonly categories     = computed(() =>
    ['all', ...new Set(this.products().map(p => p.category))] as const
  );

  /**
   * Recent searches – persisted to localStorage.
   * Initialised once from storage; written back on every confirmed selection.
   */
  readonly recentSearches = signal<string[]>(this.loadRecentSearches());

  /**
   * Active keyboard-navigation index.
   *
   * Audit fix: was reset to 0 on every filter update, which discarded any
   * keyboard position the user had already navigated to. Now clamped to
   * Math.min(current, results.length - 1) so the cursor stays as close to
   * its previous position as possible.
   */
  readonly activeIndex = signal(-1);

  // ── RxJS Streams ────────────────────────────────────────────────────────────
  private readonly query$    = new Subject<string>();
  private readonly category$ = new BehaviorSubject<MenuItem['category'] | 'all'>('all');

  /**
   * Bug fix: `products$` was initialised once in ngOnInit and never updated.
   * If the parent adds/removes menu items after init, results went stale.
   *
   * Solution: use an `effect()` to push into the BehaviorSubject whenever the
   * `products` input signal changes — keeps the RxJS pipeline and Angular
   * Signals reactivity in sync without needing `toObservable`.
   */
  private readonly products$ = new BehaviorSubject<MenuItem[]>([]);

  constructor() {
    // Sync the products input signal → products$ BehaviorSubject.
    // effect() re-runs whenever `this.products()` emits a new reference,
    // which pushes fresh data into the combineLatest pipeline automatically.
    effect(() => {
      this.products$.next(this.products());
    });
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    combineLatest([
      this.query$.pipe(debounceTime(300), distinctUntilChanged()),
      this.category$.pipe(distinctUntilChanged()),
      this.products$
    ]).pipe(
      map(([query, category, products]) => this.filter(products, query, category)),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(results => {
      this.results.set(results);

      // Clamp instead of reset: keep the cursor as close to its previous
      // position as possible. Only fall back to -1 when there are no results.
      this.activeIndex.update(prev =>
        results.length === 0  ? -1
        : prev < 0            ? 0
        :                       Math.min(prev, results.length - 1)
      );

      this.resultsChange.emit(results);
    });

    // Trigger the initial filter pass (empty query, 'all' category)
    this.query$.next('');
  }

  // ── Event Handlers ──────────────────────────────────────────────────────────
  onQuery(value: string): void {
    this.query.set(value);
    this.query$.next(value.trim().toLowerCase());
    if (!value) this.activeIndex.set(-1);
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
      this.activeIndex.update(index =>
        (index + direction + results.length) % results.length
      );
    } else if (event.key === 'Enter' && this.activeIndex() >= 0) {
      event.preventDefault();
      this.select(results[this.activeIndex()]);
    } else if (event.key === 'Escape') {
      this.onQuery('');
    }
  }

  select(product: MenuItem): void {
    // Persist the query term as a recent search (only when non-empty)
    const term = this.query().trim();
    if (term) {
      this.addRecentSearch(term);
    }
    this.selection.emit(product);
  }

  applyRecentSearch(term: string): void {
    this.onQuery(term);
  }

  clearRecentSearches(): void {
    this.recentSearches.set([]);
    this.persistRecentSearches([]);
  }

  trackById(_index: number, product: MenuItem): string { return product.id; }
  trackByTerm(_index: number, term: string): string    { return term; }

  // ── Private Helpers ──────────────────────────────────────────────────────────
  private filter(
    products: MenuItem[],
    query: string,
    category: MenuItem['category'] | 'all'
  ): MenuItem[] {
    return products.filter(product =>
      product.available &&
      (category === 'all' || product.category === category) &&
      (!query || product.name.toLowerCase().includes(query))
    );
  }

  private addRecentSearch(term: string): void {
    const current = this.recentSearches();
    // De-duplicate (case-insensitive), most-recent first, capped at MAX_RECENT
    const deduped = [
      term,
      ...current.filter(t => t.toLowerCase() !== term.toLowerCase())
    ].slice(0, MAX_RECENT);

    this.recentSearches.set(deduped);
    this.persistRecentSearches(deduped);
  }

  private loadRecentSearches(): string[] {
    try {
      const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  }

  private persistRecentSearches(searches: string[]): void {
    try {
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches));
    } catch {
      // localStorage may be unavailable in SSR or private browsing
    }
  }
}

// =============================================================================
// OrdersWorkspaceComponent — Smart / Container Component
// =============================================================================
// Owns all service subscriptions and state orchestration for the orders page.
// Delegates all presentation to dumb child components (OrderCard, AiAssistant).
// =============================================================================

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil, finalize, switchMap } from 'rxjs/operators';

import { OrderMockService } from '../../core/services/order-mock.service';
import { AiAssistantMockService } from '../../core/services/ai-assistant-mock.service';
import { KitchenLoadMockService } from '../../core/services/kitchen-load-mock.service';
import {
  BackendOrder,
  BackendOrderStatus,
  AiSuggestion,
  AiStreamChunk
} from '../../core/models/backend.models';

import { OrderCardComponent } from './components/order-card/order-card.component';
import {
  AiPanelState,
  INITIAL_AI_STATE
} from './components/ai-order-assistant/ai-order-assistant.component';

/** Filter tabs for the workspace header */
type OrderFilter = 'all' | BackendOrderStatus;

/**
 * Explicit named interface for tab-badge counts.
 * Using a concrete interface (instead of Record<string, number>) lets
 * Angular's strict template checker resolve dot-notation property access
 * (e.g. orderCount().all) without an TS4111 index-signature error.
 */
interface OrderCounts {
  all:       number;
  received:  number;
  preparing: number;
  ready:     number;
  delivered: number;
  cancelled: number;
}

@Component({
  selector: 'app-orders-workspace',
  standalone: true,
  imports: [CommonModule, OrderCardComponent],
  templateUrl: './orders-workspace.component.html',
  styleUrl: './orders-workspace.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OrdersWorkspaceComponent implements OnInit, OnDestroy {
  private readonly orderService   = inject(OrderMockService);
  private readonly aiService      = inject(AiAssistantMockService);
  private readonly kitchenService = inject(KitchenLoadMockService);
  private destroy$ = new Subject<void>();

  /**
   * Feeds orderId values into the streaming pipeline.
   * Using a Subject + switchMap means initiating a new stream on any order
   * automatically cancels the previous in-flight stream subscription —
   * no memory leak, no ghost chunks arriving after navigation.
   */
  private readonly streamTrigger$ = new Subject<string>();

  // ---- State Signals ----
  readonly orders         = signal<BackendOrder[]>([]);
  readonly activeFilter   = signal<OrderFilter>('all');
  readonly expandedOrderId = signal<string | null>(null);
  readonly aiStates       = signal<Map<string, AiPanelState>>(new Map());
  readonly orderCount = signal<OrderCounts>({
    all: 0, received: 0, preparing: 0, ready: 0, delivered: 0, cancelled: 0
  });

  /** Filters for the tab bar */
  readonly filters: { key: OrderFilter; label: string; icon: string }[] = [
    { key: 'all',       label: 'All Orders', icon: 'list_alt'     },
    { key: 'received',  label: 'Received',   icon: 'inbox'        },
    { key: 'preparing', label: 'Preparing',  icon: 'skillet'      },
    { key: 'ready',     label: 'Ready',      icon: 'check_circle' },
    { key: 'delivered', label: 'Delivered',  icon: 'task_alt'     },
    { key: 'cancelled', label: 'Cancelled',  icon: 'cancel'       }
  ];

  /**
   * Memoised filtered + sorted order list.
   *
   * Audit fix: was a plain getter, which re-sorted the full array on EVERY
   * change-detection cycle with no caching. As a `computed()` signal, Angular
   * only re-evaluates this when `orders` or `activeFilter` actually changes.
   */
  readonly filteredOrders = computed<BackendOrder[]>(() => {
    const filter   = this.activeFilter();
    const all      = this.orders();
    const filtered = filter === 'all'
      ? all
      : all.filter((o: BackendOrder) => o.status === filter);

    const statusOrder: Record<string, number> = {
      received: 0, preparing: 1, ready: 2, delivered: 3, cancelled: 4
    };

    return [...filtered].sort((a: BackendOrder, b: BackendOrder) => {
      const sDiff = (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5);
      if (sDiff !== 0) return sDiff;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
  });

  // ---- Lifecycle ----

  ngOnInit() {
    // Subscribe to the order snapshot stream
    this.orderService.orders$
      .pipe(takeUntil(this.destroy$))
      .subscribe((allOrders: BackendOrder[]) => {
        this.orders.set(allOrders);
        this.updateCounts(allOrders);
      });

    // ---- Streaming Pipeline (switchMap = auto-cancel previous stream) ----
    // A single subscription handles ALL streaming requests. When streamAiResponse()
    // pushes a new orderId, switchMap unsubscribes from the previous inner observable
    // before subscribing to the new one — zero memory leak, zero ghost chunks.
    this.streamTrigger$.pipe(
      switchMap((orderId: string) => {
        const order = this.orders().find((o: BackendOrder) => o.id === orderId);
        if (!order) return [];

        // Immediately set streaming state
        this.updateAiState(orderId, {
          ...INITIAL_AI_STATE,
          status: 'streaming',
          model: 'teal-gpt-4-turbo'
        });

        return this.aiService
          .streamResponse(`Analyze order ${order.id} for table ${order.tableNo}`)
          .pipe(
            finalize(() => {
              // Transition streaming → success when the inner observable completes
              const st = this.aiStates().get(orderId);
              if (st?.status === 'streaming') {
                this.updateAiState(orderId, { ...st, status: 'success' });
              }
            })
          );
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (chunk: AiStreamChunk) => {
        // chunk.orderId is not available; we track the active orderId via closure.
        // Find the order currently in streaming state and update it.
        const map = this.aiStates();
        map.forEach((state, oid) => {
          if (state.status === 'streaming') {
            this.updateAiState(oid, {
              ...state,
              streamText: chunk.content,
              status: chunk.isComplete ? 'success' : 'streaming'
            });
          }
        });
      },
      error: () => { /* switchMap re-subscribes automatically; errors are per-inner-stream */ }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.streamTrigger$.complete();
  }

  // ---- Actions ----

  setFilter(filter: OrderFilter) {
    this.activeFilter.set(filter);
  }

  toggleExpand(orderId: string) {
    this.expandedOrderId.update((current: string | null) =>
      current === orderId ? null : orderId
    );
  }

  advanceOrderStatus(orderId: string) {
    this.orderService.advanceOrderStatus(orderId)
      .pipe(takeUntil(this.destroy$))
      .subscribe();
  }

  cancelOrder(orderId: string) {
    this.orderService.cancelOrder(orderId)
      .pipe(takeUntil(this.destroy$))
      .subscribe();
  }

  getAiState(orderId: string): AiPanelState {
    return this.aiStates().get(orderId) || INITIAL_AI_STATE;
  }

  requestAiInsights(orderId: string) {
    const order = this.orders().find((o: BackendOrder) => o.id === orderId);
    if (!order) return;

    // Capture the current kitchen snapshot at the moment of the request so
    // that AI suggestions are contextualised with live kitchen load data.
    const kitchenSnapshot = this.kitchenService.getCurrentSnapshot();

    // Set loading state
    this.updateAiState(orderId, { ...INITIAL_AI_STATE, status: 'loading' });

    // Get structured suggestions, enriched with the kitchen context
    this.aiService.getOrderSuggestions(order, kitchenSnapshot)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.updateAiState(orderId, {
            status:          'success',
            suggestions:     response.suggestions,
            streamText:      '',
            errorMessage:    null,
            processingTimeMs: response.processingTimeMs,
            model:           response.model
          });
        },
        error: (err) => {
          this.updateAiState(orderId, {
            ...INITIAL_AI_STATE,
            status:       'error',
            errorMessage: err.message || 'Failed to get AI suggestions'
          });
        }
      });
  }

  /**
   * Triggers the streaming AI mode for a given order.
   * Pushes the orderId to streamTrigger$; the switchMap pipeline in ngOnInit
   * handles the subscription, cancels any previous in-flight stream, and
   * drives state updates through updateAiState().
   */
  streamAiResponse(orderId: string): void {
    this.streamTrigger$.next(orderId);
  }


  handleSuggestionAction(event: { orderId: string; suggestion: AiSuggestion }) {
    // In a real app, this would dispatch an action. For now, log it.
    console.log(`[OrdersWorkspace] Suggestion action on ${event.orderId}:`, event.suggestion.actionLabel);
  }

  retryAi(orderId: string) {
    this.requestAiInsights(orderId);
  }

  trackByOrderId(_index: number, order: BackendOrder): string {
    return order.id;
  }

  // ---- Internal Helpers ----

  private updateAiState(orderId: string, state: AiPanelState) {
    this.aiStates.update((map: Map<string, AiPanelState>) => {
      const newMap = new Map(map);
      newMap.set(orderId, state);
      return newMap;
    });
  }

  private updateCounts(orders: BackendOrder[]) {
    const counts: OrderCounts = {
      all:       orders.length,
      received:  0,
      preparing: 0,
      ready:     0,
      delivered: 0,
      cancelled: 0
    };
    for (const o of orders) {
      if (o.status in counts) {
        counts[o.status]++;
      }
    }
    this.orderCount.set(counts);
  }
}

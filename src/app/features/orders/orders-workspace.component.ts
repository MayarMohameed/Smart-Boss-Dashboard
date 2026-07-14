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
  OnInit,
  OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';

import { OrderMockService } from '../../core/services/order-mock.service';
import { AiAssistantMockService } from '../../core/services/ai-assistant-mock.service';
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

@Component({
  selector: 'app-orders-workspace',
  standalone: true,
  imports: [CommonModule, OrderCardComponent],
  templateUrl: './orders-workspace.component.html',
  styleUrl: './orders-workspace.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OrdersWorkspaceComponent implements OnInit, OnDestroy {
  private readonly orderService = inject(OrderMockService);
  private readonly aiService = inject(AiAssistantMockService);
  private destroy$ = new Subject<void>();

  // ---- State Signals ----
  readonly orders = signal<BackendOrder[]>([]);
  readonly activeFilter = signal<OrderFilter>('all');
  readonly expandedOrderId = signal<string | null>(null);
  readonly aiStates = signal<Map<string, AiPanelState>>(new Map());
  readonly orderCount = signal<Record<string, number>>({
    all: 0, received: 0, preparing: 0, ready: 0, delivered: 0, cancelled: 0
  });

  /** Filters for the tab bar */
  readonly filters: { key: OrderFilter; label: string; icon: string }[] = [
    { key: 'all', label: 'All Orders', icon: 'list_alt' },
    { key: 'received', label: 'Received', icon: 'inbox' },
    { key: 'preparing', label: 'Preparing', icon: 'skillet' },
    { key: 'ready', label: 'Ready', icon: 'check_circle' },
    { key: 'delivered', label: 'Delivered', icon: 'task_alt' },
    { key: 'cancelled', label: 'Cancelled', icon: 'cancel' }
  ];

  // ---- Lifecycle ----

  ngOnInit() {
    // Subscribe to the order snapshot stream
    this.orderService.orders$
      .pipe(takeUntil(this.destroy$))
      .subscribe((allOrders: BackendOrder[]) => {
        this.orders.set(allOrders);
        this.updateCounts(allOrders);
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ---- Computed Getters ----

  get filteredOrders(): BackendOrder[] {
    const filter = this.activeFilter();
    const all = this.orders();
    const filtered = filter === 'all'
      ? all
      : all.filter((o: BackendOrder) => o.status === filter);

    // Sort: active first (received, preparing, ready), then by creation date
    return filtered.sort((a: BackendOrder, b: BackendOrder) => {
      const statusOrder: Record<string, number> = {
        'received': 0, 'preparing': 1, 'ready': 2, 'delivered': 3, 'cancelled': 4
      };
      const sDiff = (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5);
      if (sDiff !== 0) return sDiff;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
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

    // Set loading state
    this.updateAiState(orderId, { ...INITIAL_AI_STATE, status: 'loading' });

    // First, get structured suggestions
    this.aiService.getOrderSuggestions(order)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.updateAiState(orderId, {
            status: 'success',
            suggestions: response.suggestions,
            streamText: '',
            errorMessage: null,
            processingTimeMs: response.processingTimeMs,
            model: response.model
          });
        },
        error: (err) => {
          this.updateAiState(orderId, {
            ...INITIAL_AI_STATE,
            status: 'error',
            errorMessage: err.message || 'Failed to get AI suggestions'
          });
        }
      });
  }

  streamAiResponse(orderId: string) {
    const order = this.orders().find((o: BackendOrder) => o.id === orderId);
    if (!order) return;

    this.updateAiState(orderId, {
      ...INITIAL_AI_STATE,
      status: 'streaming',
      model: 'teal-gpt-4-turbo'
    });

    this.aiService.streamResponse(`Analyze order ${order.id} for table ${order.tableNo}`)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          // When streaming completes, mark as success
          const currentState = this.aiStates().get(orderId);
          if (currentState && currentState.status === 'streaming') {
            this.updateAiState(orderId, {
              ...currentState,
              status: 'success'
            });
          }
        })
      )
      .subscribe({
        next: (chunk: AiStreamChunk) => {
          const currentState = this.aiStates().get(orderId);
          if (currentState) {
            this.updateAiState(orderId, {
              ...currentState,
              streamText: chunk.content,
              status: chunk.isComplete ? 'success' : 'streaming'
            });
          }
        },
        error: () => {
          this.updateAiState(orderId, {
            ...INITIAL_AI_STATE,
            status: 'error',
            errorMessage: 'Stream interrupted. Please retry.'
          });
        }
      });
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
    const counts: Record<string, number> = {
      all: orders.length,
      received: 0, preparing: 0, ready: 0, delivered: 0, cancelled: 0
    };
    for (const o of orders) {
      if (counts[o.status] !== undefined) {
        counts[o.status]++;
      }
    }
    this.orderCount.set(counts);
  }
}

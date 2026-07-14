// =============================================================================
// OrderCardComponent — Dumb / Presentational Component
// =============================================================================
// Displays a single order card with status, items, channel badge, and
// an embedded AI assistant panel. All data via @Input(), all actions via @Output().
// =============================================================================

import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { BackendOrder, AiSuggestion } from '../../../../core/models/backend.models';
import {
  AiOrderAssistantComponent,
  AiPanelState
} from '../ai-order-assistant/ai-order-assistant.component';

@Component({
  selector: 'app-order-card',
  standalone: true,
  imports: [CommonModule, AiOrderAssistantComponent],
  templateUrl: './order-card.component.html',
  styleUrl: './order-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OrderCardComponent {
  /** The order data to display */
  readonly order = input.required<BackendOrder>();

  /** AI panel state for this order */
  readonly aiState = input.required<AiPanelState>();

  /** Whether this card is expanded to show AI panel */
  readonly expanded = input<boolean>(false);

  // Outputs
  readonly advanceStatus = output<string>();       // orderId
  readonly cancelOrder = output<string>();          // orderId
  readonly toggleExpand = output<string>();          // orderId
  readonly requestAiInsights = output<string>();     // orderId
  readonly aiSuggestionAction = output<{ orderId: string; suggestion: AiSuggestion }>();
  readonly retryAi = output<string>();               // orderId

  /** Computed: time since order was created */
  readonly elapsedMinutes = computed(() => {
    const created = this.order().createdAt;
    return Math.floor((Date.now() - created.getTime()) / 60000);
  });

  /** Computed: next status label */
  readonly nextStatusLabel = computed(() => {
    const map: Record<string, string> = {
      'received': 'Start Preparing',
      'preparing': 'Mark Ready',
      'ready': 'Mark Delivered'
    };
    return map[this.order().status] || null;
  });

  getChannelIcon(channel: string): string {
    const map: Record<string, string> = {
      'walk-in': 'store',
      'delivery': 'delivery_dining',
      'online': 'language'
    };
    return map[channel] || 'receipt_long';
  }

  getStatusIcon(status: string): string {
    const map: Record<string, string> = {
      'received': 'inbox',
      'preparing': 'skillet',
      'ready': 'check_circle',
      'delivered': 'task_alt',
      'cancelled': 'cancel'
    };
    return map[status] || 'pending';
  }

  getPriorityIcon(priority: string): string {
    const map: Record<string, string> = {
      'rush': 'priority_high',
      'high': 'arrow_upward',
      'normal': 'remove',
      'low': 'arrow_downward'
    };
    return map[priority] || 'remove';
  }

  onRequestInsights() {
    this.requestAiInsights.emit(this.order().id);
  }

  onSuggestionAction(suggestion: AiSuggestion) {
    this.aiSuggestionAction.emit({ orderId: this.order().id, suggestion });
  }

  onRetryAi() {
    this.retryAi.emit(this.order().id);
  }
}

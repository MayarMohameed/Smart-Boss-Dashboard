// =============================================================================
// AiOrderAssistantComponent — Dumb / Presentational Component
// =============================================================================
// Receives AI state via @Input() signals. Renders loading skeletons,
// error states, streaming text, and suggestion cards.
// Zero service dependencies — purely driven by inputs.
// =============================================================================

import {
  Component,
  ChangeDetectionStrategy,
  input,
  output
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AiSuggestion } from '../../../../core/models/backend.models';

/** Shape of the AI state passed from the smart parent */
export interface AiPanelState {
  status: 'idle' | 'loading' | 'streaming' | 'success' | 'error';
  suggestions: AiSuggestion[];
  streamText: string;
  errorMessage: string | null;
  processingTimeMs: number | null;
  model: string | null;
}

export const INITIAL_AI_STATE: AiPanelState = {
  status: 'idle',
  suggestions: [],
  streamText: '',
  errorMessage: null,
  processingTimeMs: null,
  model: null
};

@Component({
  selector: 'app-ai-order-assistant',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ai-order-assistant.component.html',
  styleUrl: './ai-order-assistant.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AiOrderAssistantComponent {
  /** AI state driven entirely by the smart parent component */
  readonly state = input.required<AiPanelState>();

  /** Emitted when user clicks "Get AI Insights" */
  readonly requestInsights = output<void>();

  /** Emitted when user clicks "Stream Insights" */
  readonly streamAi = output<void>();

  /** Emitted when user clicks an action button on a suggestion */
  readonly suggestionAction = output<AiSuggestion>();

  /** Emitted when user clicks "Retry" on an error */
  readonly retryRequest = output<void>();

  getSuggestionIcon(type: string): string {
    const icons: Record<string, string> = {
      'upsell': 'trending_up',
      'allergy_warning': 'warning',
      'combo_recommendation': 'join_inner',
      'prep_time_alert': 'schedule',
      'inventory_warning': 'inventory_2'
    };
    return icons[type] || 'smart_toy';
  }

  getSuggestionColor(type: string): string {
    const colors: Record<string, string> = {
      'upsell': 'teal',
      'allergy_warning': 'red',
      'combo_recommendation': 'purple',
      'prep_time_alert': 'orange',
      'inventory_warning': 'yellow'
    };
    return colors[type] || 'teal';
  }

  getConfidenceLabel(confidence: number): string {
    if (confidence >= 0.9) return 'Very High';
    if (confidence >= 0.75) return 'High';
    if (confidence >= 0.5) return 'Medium';
    return 'Low';
  }
}

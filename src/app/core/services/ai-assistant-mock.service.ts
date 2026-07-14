// =============================================================================
// AiAssistantMockService — Simulated AI Response Engine
// =============================================================================
// Simulates an LLM-backed AI assistant for POS operations: upselling,
// allergy warnings, combo recommendations, and prep time alerts.
//
// Key RxJS patterns demonstrated:
//   • delay()       — simulated network/inference latency
//   • catchError()  — graceful error recovery
//   • retry()       — automatic retry on transient failures
//   • interval/map  — token-by-token streaming simulation
//   • throwError    — simulated rate limits and timeouts
// =============================================================================

import { Injectable } from '@angular/core';
import {
  Observable,
  of,
  throwError,
  timer,
  concat
} from 'rxjs';
import {
  delay,
  map,
  switchMap,
  catchError,
  retry,
  retryWhen,
  tap,
  concatMap,
  scan,
  finalize
} from 'rxjs/operators';
import {
  AiSuggestion,
  AiSuggestionType,
  AiAssistantResponse,
  AiStreamChunk,
  AiServiceError,
  BackendOrder,
  BackendOrderItem
} from '../models/backend.models';

// ---------------------------------------------------------------------------
// Suggestion Templates
// ---------------------------------------------------------------------------

interface SuggestionTemplate {
  type: AiSuggestionType;
  title: string;
  message: string;
  confidence: number;
  actionLabel?: string;
}

const UPSELL_TEMPLATES: SuggestionTemplate[] = [
  {
    type: 'upsell',
    title: 'Add a Premium Side',
    message: 'Customers who ordered {item} typically add Truffle Fries (+$6.50) — 73% attachment rate.',
    confidence: 0.87,
    actionLabel: 'Suggest to customer'
  },
  {
    type: 'upsell',
    title: 'Upgrade to Large',
    message: 'Offer a size upgrade on {item} for just $2.50 more. Average ticket increase: $3.80.',
    confidence: 0.79,
    actionLabel: 'Apply upgrade'
  },
  {
    type: 'upsell',
    title: 'Dessert Pairing',
    message: 'Based on the order profile, recommend Pistachio Lava Cake as a dessert finisher — high margin item.',
    confidence: 0.82,
    actionLabel: 'Add to order'
  },
  {
    type: 'combo_recommendation',
    title: 'Combo Opportunity Detected',
    message: 'This order qualifies for the "Dinner for Two" combo. Bundle saves the customer $4.00 and increases perceived value.',
    confidence: 0.91,
    actionLabel: 'Apply combo'
  }
];

const ALLERGY_TEMPLATES: SuggestionTemplate[] = [
  {
    type: 'allergy_warning',
    title: '⚠️ Allergen Detected: Nuts',
    message: '{item} contains tree nuts (pistachio). Verify with the customer if they have a nut allergy before confirming.',
    confidence: 0.99,
    actionLabel: 'Acknowledge'
  },
  {
    type: 'allergy_warning',
    title: '⚠️ Allergen Detected: Gluten',
    message: '{item} contains gluten. A gluten-free alternative is available upon request.',
    confidence: 0.98,
    actionLabel: 'Swap item'
  },
  {
    type: 'allergy_warning',
    title: '⚠️ Cross-Contamination Risk',
    message: 'Multiple items in this order use shared fryer equipment. Flag for allergen-sensitive customers.',
    confidence: 0.95,
    actionLabel: 'Flag order'
  },
  {
    type: 'allergy_warning',
    title: '⚠️ Allergen Detected: Dairy',
    message: '{item} contains dairy products. Ensure dairy-free substitution if customer has lactose intolerance.',
    confidence: 0.97,
    actionLabel: 'Acknowledge'
  }
];

const PREP_TIME_TEMPLATES: SuggestionTemplate[] = [
  {
    type: 'prep_time_alert',
    title: 'Estimated Delay',
    message: 'Current kitchen load suggests this order may take {minutes} minutes longer than average. Consider informing the customer.',
    confidence: 0.74,
    actionLabel: 'Notify customer'
  },
  {
    type: 'inventory_warning',
    title: 'Low Stock Alert',
    message: '{item} is running low in inventory (estimated 3 portions remaining). Consider suggesting an alternative.',
    confidence: 0.88,
    actionLabel: 'View alternatives'
  }
];

// Failure rate config: 15% chance of transient failure
const FAILURE_RATE = 0.15;
// Max retries for transient errors
const MAX_RETRIES = 2;
// Base latency range (ms) to simulate inference time
const LATENCY_RANGE = { min: 800, max: 2500 };

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class AiAssistantMockService {

  private requestCounter = 0;

  // ====================================================================
  // PUBLIC API
  // ====================================================================

  /**
   * Generates AI suggestions for a given order.
   * Simulates network delay, occasional failures, and automatic retries.
   *
   * @param order - The backend order to analyze
   * @returns Observable<AiAssistantResponse> that may error on persistent failures
   */
  getOrderSuggestions(order: BackendOrder): Observable<AiAssistantResponse> {
    const requestId = `ai-req-${++this.requestCounter}-${Date.now()}`;
    const startTime = Date.now();
    const latency = this.randomBetween(LATENCY_RANGE.min, LATENCY_RANGE.max);

    return of(order).pipe(
      // Step 1: Simulate network/inference latency
      delay(latency),

      // Step 2: Possibly throw a transient error (simulates flaky network)
      switchMap(o => this.maybeFailTransient(o)),

      // Step 3: Generate the suggestions
      map(o => this.buildSuggestions(o, requestId, startTime)),

      // Step 4: Retry up to MAX_RETRIES on transient errors
      retry({
        count: MAX_RETRIES,
        delay: (error: AiServiceError, retryCount) => {
          const backoff = error.retryAfterMs || (retryCount * 500);
          console.warn(
            `[AiAssistant] Retry ${retryCount}/${MAX_RETRIES} for ${requestId} — ${error.code}. Backing off ${backoff}ms`
          );
          return timer(backoff);
        }
      }),

      // Step 5: If all retries fail, provide a graceful fallback
      catchError((err: AiServiceError) => {
        console.error(`[AiAssistant] All retries exhausted for ${requestId}:`, err);
        return of(this.buildFallbackResponse(requestId, startTime, err));
      })
    );
  }

  /**
   * Streams AI response content token-by-token, simulating an LLM streaming API.
   * Each chunk contains a partial string that the UI can progressively render.
   *
   * @param prompt - The user prompt / context
   * @returns Observable<AiStreamChunk> emitting partial content tokens
   */
  streamResponse(prompt: string): Observable<AiStreamChunk> {
    const fullResponse = this.generateStreamContent(prompt);
    const words = fullResponse.split(' ');
    const totalChunks = words.length;

    // Emit one word at a time with 50-150ms delay between tokens
    return concat(
      ...words.map((word, index) =>
        of<AiStreamChunk>({
          chunkIndex: index,
          totalChunks,
          content: word + (index < totalChunks - 1 ? ' ' : ''),
          isComplete: index === totalChunks - 1
        }).pipe(
          delay(this.randomBetween(50, 150))
        )
      )
    ).pipe(
      // Simulate an initial "thinking" delay before first token
      index => new Observable<AiStreamChunk>(subscriber => {
        const initialDelay = setTimeout(() => {
          index.subscribe(subscriber);
        }, this.randomBetween(400, 1200));

        return () => clearTimeout(initialDelay);
      }),

      // Accumulate content for progressive display
      scan<AiStreamChunk, AiStreamChunk>((acc, chunk) => ({
        ...chunk,
        content: acc.content + chunk.content
      }), { chunkIndex: -1, totalChunks, content: '', isComplete: false })
    );
  }

  /**
   * Asks the AI assistant a direct question about an order.
   * Simulates higher failure rate than suggestions (complex inference).
   */
  askQuestion(orderId: string, question: string): Observable<AiAssistantResponse> {
    const requestId = `ai-q-${++this.requestCounter}`;
    const startTime = Date.now();
    const latency = this.randomBetween(1200, 3500); // Longer for Q&A

    return of({ orderId, question }).pipe(
      delay(latency),

      // 20% failure rate for complex questions
      switchMap(() => {
        if (Math.random() < 0.2) {
          return throwError(() => ({
            code: 'MODEL_ERROR',
            message: 'The model could not process this query. Please rephrase.',
            retryAfterMs: 1000
          } as AiServiceError));
        }
        return of(true);
      }),

      map(() => ({
        requestId,
        suggestions: [{
          id: `ai-ans-${Date.now()}`,
          type: 'upsell' as AiSuggestionType,
          title: 'AI Response',
          message: this.generateQuestionResponse(question),
          confidence: +(0.7 + Math.random() * 0.25).toFixed(2),
          relatedOrderId: orderId,
          actionLabel: 'Apply suggestion'
        }],
        generatedAt: new Date(),
        processingTimeMs: Date.now() - startTime,
        model: 'teal-gpt-4-turbo'
      } as AiAssistantResponse)),

      retry({
        count: 1,
        delay: (error: AiServiceError) => timer(error.retryAfterMs || 800)
      }),

      catchError((err: AiServiceError) =>
        of(this.buildFallbackResponse(requestId, startTime, err))
      )
    );
  }

  /**
   * Checks allergens for a list of items.
   * Lightweight call with low failure rate.
   */
  checkAllergens(items: BackendOrderItem[]): Observable<AiSuggestion[]> {
    const latency = this.randomBetween(300, 800);

    return of(items).pipe(
      delay(latency),
      map(orderItems => {
        const warnings: AiSuggestion[] = [];
        const allergenItems = orderItems.filter(i => i.allergens && i.allergens.length > 0);

        for (const item of allergenItems) {
          for (const allergen of item.allergens || []) {
            const template = ALLERGY_TEMPLATES.find(t =>
              t.message.toLowerCase().includes(allergen)
            ) || ALLERGY_TEMPLATES[2]; // fallback to cross-contamination

            warnings.push({
              id: `ai-alg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              type: 'allergy_warning',
              title: template.title,
              message: template.message.replace('{item}', item.name),
              confidence: template.confidence,
              relatedMenuItemIds: [item.menuItemId],
              actionLabel: template.actionLabel
            });
          }
        }

        return warnings;
      })
    );
  }

  // ====================================================================
  // INTERNAL — Error Simulation
  // ====================================================================

  /**
   * Randomly throws a transient AiServiceError based on FAILURE_RATE.
   * This forces the retry() operator to engage.
   */
  private maybeFailTransient(order: BackendOrder): Observable<BackendOrder> {
    if (Math.random() < FAILURE_RATE) {
      const errors: AiServiceError[] = [
        { code: 'TIMEOUT', message: 'AI inference timed out after 10s', retryAfterMs: 500 },
        { code: 'RATE_LIMIT', message: 'Rate limit exceeded. Try again shortly.', retryAfterMs: 1000 },
        { code: 'NETWORK_ERROR', message: 'Failed to reach AI model endpoint', retryAfterMs: 300 }
      ];
      const error = errors[Math.floor(Math.random() * errors.length)];
      return throwError(() => error);
    }
    return of(order);
  }

  // ====================================================================
  // INTERNAL — Suggestion Generation
  // ====================================================================

  private buildSuggestions(
    order: BackendOrder,
    requestId: string,
    startTime: number
  ): AiAssistantResponse {
    const suggestions: AiSuggestion[] = [];
    const firstItem = order.items[0];

    // Always generate 1–2 upsell suggestions
    const upsellCount = this.randomBetween(1, 2);
    for (let i = 0; i < upsellCount; i++) {
      const template = UPSELL_TEMPLATES[
        Math.floor(Math.random() * UPSELL_TEMPLATES.length)
      ];
      suggestions.push({
        id: `ai-${Date.now()}-${i}`,
        type: template.type,
        title: template.title,
        message: template.message.replace('{item}', firstItem?.name || 'this item'),
        confidence: +(template.confidence + (Math.random() * 0.1 - 0.05)).toFixed(2),
        relatedOrderId: order.id,
        relatedMenuItemIds: order.items.map((i: BackendOrderItem) => i.menuItemId),
        actionLabel: template.actionLabel
      });
    }

    // Check for allergen-containing items and add warnings
    const allergenItems = order.items.filter((i: BackendOrderItem) => i.allergens && i.allergens.length > 0);
    if (allergenItems.length > 0) {
      const item = allergenItems[0];
      const template = ALLERGY_TEMPLATES[
        Math.floor(Math.random() * ALLERGY_TEMPLATES.length)
      ];
      suggestions.push({
        id: `ai-alg-${Date.now()}`,
        type: 'allergy_warning',
        title: template.title,
        message: template.message.replace('{item}', item.name),
        confidence: template.confidence,
        relatedOrderId: order.id,
        relatedMenuItemIds: [item.menuItemId],
        actionLabel: template.actionLabel
      });
    }

    // Conditionally add a prep-time or inventory alert
    if (Math.random() > 0.5) {
      const template = PREP_TIME_TEMPLATES[
        Math.floor(Math.random() * PREP_TIME_TEMPLATES.length)
      ];
      suggestions.push({
        id: `ai-prep-${Date.now()}`,
        type: template.type,
        title: template.title,
        message: template.message
          .replace('{item}', firstItem?.name || 'selected item')
          .replace('{minutes}', `${this.randomBetween(5, 15)}`),
        confidence: template.confidence,
        relatedOrderId: order.id,
        actionLabel: template.actionLabel
      });
    }

    return {
      requestId,
      suggestions,
      generatedAt: new Date(),
      processingTimeMs: Date.now() - startTime,
      model: 'teal-gpt-4-turbo'
    };
  }

  private buildFallbackResponse(
    requestId: string,
    startTime: number,
    error: AiServiceError
  ): AiAssistantResponse {
    return {
      requestId,
      suggestions: [{
        id: `ai-fallback-${Date.now()}`,
        type: 'upsell',
        title: 'AI Temporarily Unavailable',
        message: `Could not generate suggestions: ${error.message}. Showing cached recommendations instead.`,
        confidence: 0.3,
        actionLabel: 'Retry'
      }],
      generatedAt: new Date(),
      processingTimeMs: Date.now() - startTime,
      model: 'fallback-cache'
    };
  }

  // ====================================================================
  // INTERNAL — Streaming Content Generation
  // ====================================================================

  private generateStreamContent(prompt: string): string {
    const responses = [
      `Based on the current order analysis, I recommend offering a dessert pairing. The Pistachio Lava Cake has a 73% attachment rate with burger orders and a $9.50 margin contribution. Additionally, consider suggesting a beverage upgrade — the Espresso Tonic pairs exceptionally well with the selected entrée.`,
      `Looking at tonight's kitchen performance, the grill station is operating at 68% capacity. I suggest routing the next salmon orders through the secondary prep area to avoid bottlenecks. Current estimated wait time for grill items is 14 minutes, which is within acceptable range.`,
      `Allergen analysis complete for this order. The Truffle Burger contains gluten and dairy. The Pistachio Lava Cake contains tree nuts, dairy, and gluten. I recommend confirming allergen requirements with the customer before sending to kitchen. No cross-contamination risks detected with current menu selections.`,
      `Revenue optimization opportunity detected. This table has ordered two entrées but no appetizers or desserts. Historical data shows that suggesting a shared appetizer at this point in the ordering flow increases average ticket by $8.20. The Wagyu Sliders are the highest-converting upsell for this order profile.`
    ];

    return responses[Math.floor(Math.random() * responses.length)];
  }

  private generateQuestionResponse(question: string): string {
    const q = question.toLowerCase();

    if (q.includes('allergen') || q.includes('allergy')) {
      return 'Based on the order items, I detected potential allergens: gluten (burger bun, cake), dairy (latte, cake), and tree nuts (pistachio cake). Please verify customer dietary restrictions before confirming.';
    }
    if (q.includes('upsell') || q.includes('recommend')) {
      return 'For this order profile, the highest-converting upsell is the Espresso Tonic ($4.50) with a 67% acceptance rate. For higher revenue impact, suggest the Wagyu Sliders add-on ($22.00) which pairs well with the current selection.';
    }
    if (q.includes('wait') || q.includes('time') || q.includes('delay')) {
      return 'Current estimated preparation time for this order is 18 minutes based on kitchen load. The grill station has 3 orders ahead. Consider informing the customer of the approximate wait time.';
    }
    return 'I analyzed the current order and kitchen state. All items are available and the estimated preparation time is within normal range. No special actions required at this time.';
  }

  // ====================================================================
  // UTIL
  // ====================================================================

  private randomBetween(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}

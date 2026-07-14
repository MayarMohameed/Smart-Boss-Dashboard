import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { vi } from 'vitest';
import { AiAssistantMockService } from './ai-assistant-mock.service';
import { BackendOrder } from '../models/backend.models';

describe('AiAssistantMockService', () => {
  let service: AiAssistantMockService;
  let originalRandom: () => number;

  const mockOrder: BackendOrder = {
    id: 'ORD-TEST',
    channel: 'walk-in',
    tableNo: '5',
    customerName: 'Test Customer',
    items: [
      { menuItemId: 'm1', name: 'Truffle Burger', quantity: 1, unitPrice: 18.50, allergens: ['gluten'] }
    ],
    subtotal: 18.50,
    tax: 1.48,
    totalAmount: 19.98,
    status: 'received',
    priority: 'normal',
    estimatedPrepTime: 15,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AiAssistantMockService]
    });
    service = TestBed.inject(AiAssistantMockService);
    originalRandom = Math.random;
  });

  afterEach(() => {
    Math.random = originalRandom;
    vi.restoreAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should return suggestions on immediate success', async () => {
    // Force Math.random to always return > 0.15 (success path)
    Math.random = () => 0.5;
    // Force simulated latency to be 1ms for ultra-fast unit testing
    vi.spyOn(service as any, 'randomBetween').mockReturnValue(1);

    const response = await firstValueFrom(service.getOrderSuggestions(mockOrder));

    expect(response).toBeDefined();
    expect(response.model).toBe('teal-gpt-4-turbo');
    expect(response.suggestions.length).toBeGreaterThan(0);
    
    const upsell = response.suggestions.find(s => s.type === 'upsell');
    const allergy = response.suggestions.find(s => s.type === 'allergy_warning');
    expect(upsell).toBeDefined();
    expect(allergy).toBeDefined();
  });

  it('should retry and eventually succeed on transient failures', async () => {
    let callCount = 0;
    // First 2 calls fail (0.05 < 0.15), subsequent calls succeed (0.5 > 0.15)
    Math.random = () => {
      callCount++;
      if (callCount <= 2) {
        return 0.05; // failure
      }
      return 0.5; // success
    };
    vi.spyOn(service as any, 'randomBetween').mockReturnValue(1);

    const response = await firstValueFrom(service.getOrderSuggestions(mockOrder));

    expect(response).toBeDefined();
    expect(response.model).toBe('teal-gpt-4-turbo');
    expect(response.suggestions.length).toBeGreaterThan(0);
  });

  it('should fallback gracefully when all retries are exhausted', async () => {
    // Force Math.random to always return 0.05 (always fail)
    Math.random = () => 0.05;
    vi.spyOn(service as any, 'randomBetween').mockReturnValue(1);

    const response = await firstValueFrom(service.getOrderSuggestions(mockOrder));

    expect(response).toBeDefined();
    expect(response.model).toBe('fallback-cache');
    expect(response.suggestions[0].title).toBe('AI Temporarily Unavailable');
  });

  it('should stream response chunks progressively', async () => {
    vi.spyOn(service as any, 'randomBetween').mockReturnValue(1);
    const chunks: string[] = [];

    await new Promise<void>((resolve, reject) => {
      service.streamResponse('Test prompt').subscribe({
        next: (chunk) => {
          chunks.push(chunk.content);
        },
        error: reject,
        complete: resolve
      });
    });

    expect(chunks.length).toBeGreaterThan(0);
    const finalContent = chunks[chunks.length - 1];
    expect(finalContent.split(' ').length).toBeGreaterThan(5);
  });
});

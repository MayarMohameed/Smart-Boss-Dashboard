import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AiAssistantMockService } from './ai-assistant-mock.service';
import { BackendOrder } from '../models/backend.models';

// Custom Jasmine-compatible spyOn helper to avoid importing from 'vitest'
// while remaining fully compatible with both Vitest and Jasmine runners.
interface JasmineSpy {
  calls: {
    count(): number;
  };
  and: {
    returnValue(val: any): JasmineSpy;
    callThrough(): JasmineSpy;
  };
}

function spyOn(obj: any, method: string): JasmineSpy {
  const original = obj[method];
  const calls: any[][] = [];

  const spy: JasmineSpy = {
    calls: {
      count: () => calls.length
    },
    and: {
      returnValue: (val: any) => {
        obj[method] = (...args: any[]) => {
          calls.push(args);
          return val;
        };
        return spy;
      },
      callThrough: () => {
        obj[method] = function(this: any, ...args: any[]) {
          calls.push(args);
          return original.apply(this, args);
        };
        return spy;
      }
    }
  };

  // Default to callThrough
  obj[method] = function(this: any, ...args: any[]) {
    calls.push(args);
    return original.apply(this, args);
  };

  return spy;
}

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
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should return suggestions on immediate success', async () => {
    // Force Math.random to always return > 0.15 (success path)
    Math.random = () => 0.5;
    // Force simulated latency to be 1ms for ultra-fast unit testing
    spyOn(service, 'randomBetween').and.returnValue(1);

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
    // Each failed maybeFailTransient call invokes Math.random twice:
    // once for the failure rate check, and once for selecting the error type.
    // To trigger exactly 2 failures and then succeed on the 3rd attempt:
    // - Call 1 (check 1): 0.05 < 0.15 -> Fail
    // - Call 2 (selection 1): 0.05 -> Timeout Error
    // - Call 3 (check 2): 0.05 < 0.15 -> Fail (Retry 1)
    // - Call 4 (selection 2): 0.05 -> Timeout Error
    // - Call 5 (check 3): 0.5 >= 0.15 -> Success (Retry 2)
    Math.random = () => {
      callCount++;
      if (callCount <= 4) {
        return 0.05; // failure path
      }
      return 0.5; // success path
    };
    spyOn(service, 'randomBetween').and.returnValue(1);
    const failSpy = spyOn(service, 'maybeFailTransient').and.callThrough();

    const response = await firstValueFrom(service.getOrderSuggestions(mockOrder));

    expect(response).toBeDefined();
    expect(response.model).toBe('teal-gpt-4-turbo');
    expect(response.suggestions.length).toBeGreaterThan(0);

    // Explicitly assert that maybeFailTransient was called exactly 3 times:
    // Attempt 1: fails
    // Attempt 2: fails (retry 1)
    // Attempt 3: succeeds (retry 2)
    expect(failSpy.calls.count()).toBe(3);
  });

  it('should fallback gracefully when all retries are exhausted', async () => {
    // Force Math.random to always return 0.05 (always fail)
    Math.random = () => 0.05;
    spyOn(service, 'randomBetween').and.returnValue(1);
    const failSpy = spyOn(service, 'maybeFailTransient').and.callThrough();

    const response = await firstValueFrom(service.getOrderSuggestions(mockOrder));

    expect(response).toBeDefined();
    expect(response.model).toBe('fallback-cache');
    expect(response.suggestions[0].title).toBe('AI Temporarily Unavailable');

    // With MAX_RETRIES = 2, total attempts should be 3 (1 initial + 2 retries)
    expect(failSpy.calls.count()).toBe(3);
  });

  it('should stream response chunks progressively', async () => {
    spyOn(service, 'randomBetween').and.returnValue(1);
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

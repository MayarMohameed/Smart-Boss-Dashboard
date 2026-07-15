import { TestBed } from '@angular/core/testing';
import { HttpRequest, HttpHeaders } from '@angular/common/http';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { OfflineSyncService, OfflineAction } from './offline-sync.service';

describe('OfflineSyncService', () => {
  let service: OfflineSyncService;
  const storageKey = 'teal-pos.offline-actions';

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.removeItem(storageKey);

    TestBed.configureTestingModule({
      providers: [
        OfflineSyncService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(OfflineSyncService);
  });

  afterEach(() => {
    localStorage.removeItem(storageKey);
  });

  it('should be created with an empty queue', () => {
    expect(service).toBeTruthy();
    expect(service.queue()).toEqual([]);
    expect(service.pendingCount()).toBe(0);
  });

  it('should queue requests and persist to localStorage', () => {
    const mockRequest = new HttpRequest(
      'POST',
      '/api/orders',
      { customer: 'John Doe', total: 45.99 },
      { headers: new HttpHeaders({ 'Content-Type': 'application/json' }) }
    );

    const action = service.queueRequest(mockRequest);

    expect(action).toBeDefined();
    expect(action.method).toBe('POST');
    expect(action.url).toBe('/api/orders');
    expect(action.body).toEqual({ customer: 'John Doe', total: 45.99 });
    expect(action.attempts).toBe(0);

    // Verify signals updated
    expect(service.queue().length).toBe(1);
    expect(service.pendingCount()).toBe(1);
    expect(service.queue()[0].id).toBe(action.id);

    // Verify localStorage persistence
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
    expect(saved.length).toBe(1);
    expect(saved[0].id).toBe(action.id);
  });

  it('should load initial queue from localStorage on creation', () => {
    const initialActions: OfflineAction[] = [
      {
        id: 'action-1',
        method: 'PUT',
        url: '/api/orders/123',
        body: { status: 'preparing' },
        headers: { 'content-type': ['application/json'] },
        createdAt: new Date().toISOString(),
        attempts: 1
      }
    ];
    localStorage.setItem(storageKey, JSON.stringify(initialActions));

    // Create a new instance to trigger constructor loading
    const newService = TestBed.runInInjectionContext(() => new OfflineSyncService());

    expect(newService.queue().length).toBe(1);
    expect(newService.pendingCount()).toBe(1);
    expect(newService.queue()[0].id).toBe('action-1');
    expect(newService.queue()[0].attempts).toBe(1);
  });
});

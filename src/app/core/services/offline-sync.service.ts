import { DestroyRef, Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { HttpBackend, HttpClient, HttpHeaders, HttpRequest } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { EMPTY, Subject, concatMap, from, fromEvent, merge } from 'rxjs';
import { catchError, map, takeUntil, tap } from 'rxjs/operators';

export interface OfflineAction {
  id: string;
  method: string;
  url: string;
  body: unknown;
  headers: Record<string, string[]>;
  createdAt: string;
  attempts: number;
}

/**
 * Persists mutation requests while offline and replays them, in order, when the
 * browser reconnects. HttpBackend is used for replay so requests do not enter
 * the interceptor and get queued a second time.
 */
@Injectable({ providedIn: 'root' })
export class OfflineSyncService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly http = new HttpClient(inject(HttpBackend));
  private readonly destroy$ = new Subject<void>();
  private readonly storageKey = 'teal-pos.offline-actions';
  private readonly queuedActions = signal<OfflineAction[]>(this.readQueue());
  private syncing = false;

  readonly queue = this.queuedActions.asReadonly();
  readonly pendingCount = computed(() => this.queuedActions().length);
  readonly isOnline = signal(this.isBrowser ? navigator.onLine : true);

  constructor() {
    if (!this.isBrowser) return;

    merge(fromEvent(window, 'online'), fromEvent(window, 'offline'))
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.isOnline.set(navigator.onLine);
        if (navigator.onLine) this.flush();
      });

    if (navigator.onLine) this.flush();
  }

  queueRequest(request: HttpRequest<unknown>): OfflineAction {
    const action: OfflineAction = {
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      method: request.method,
      url: request.urlWithParams,
      body: request.body,
      headers: request.headers.keys().reduce<Record<string, string[]>>((all, name) => {
        all[name] = request.headers.getAll(name) ?? [];
        return all;
      }, {}),
      createdAt: new Date().toISOString(),
      attempts: 0
    };

    this.queuedActions.update(actions => [...actions, action]);
    this.persistQueue();
    return action;
  }

  flush(): void {
    if (!this.isBrowser || !navigator.onLine || this.syncing || this.queuedActions().length === 0) return;
    this.syncing = true;

    from(this.queuedActions())
      .pipe(
        concatMap(action => this.replay(action).pipe(map(() => action))),
        takeUntil(this.destroy$),
        tap(action => this.remove(action.id)),
        // Stop at the first failure and keep it plus subsequent actions queued.
        catchError(() => EMPTY)
      )
      .subscribe({ complete: () => { this.syncing = false; } });
  }

  private replay(action: OfflineAction) {
    const headers = new HttpHeaders(action.headers);
    return this.http.request(action.method, action.url, { body: action.body, headers }).pipe(
      // A transport/server failure leaves this action in the queue for the next reconnect.
      catchError(error => {
        this.queuedActions.update(actions => actions.map(item =>
          item.id === action.id ? { ...item, attempts: item.attempts + 1 } : item
        ));
        this.persistQueue();
        throw error;
      })
    );
  }

  private remove(id: string): void {
    this.queuedActions.update(actions => actions.filter(action => action.id !== id));
    this.persistQueue();
  }

  private readQueue(): OfflineAction[] {
    if (!this.isBrowser) return [];
    try {
      return JSON.parse(localStorage.getItem(this.storageKey) ?? '[]') as OfflineAction[];
    } catch {
      return [];
    }
  }

  private persistQueue(): void {
    if (this.isBrowser) localStorage.setItem(this.storageKey, JSON.stringify(this.queuedActions()));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

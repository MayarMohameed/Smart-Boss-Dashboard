import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { of } from 'rxjs';
import { OfflineSyncService } from '../services/offline-sync.service';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Returns an optimistic 202 response while persisting offline mutations for replay. */
export const offlineQueueInterceptor: HttpInterceptorFn = (request, next) => {
  const offlineSync = inject(OfflineSyncService);
  if (MUTATION_METHODS.has(request.method) && !offlineSync.isOnline()) {
    const action = offlineSync.queueRequest(request);
    return of(new HttpResponse({
      status: 202,
      body: { queued: true, actionId: action.id },
      url: request.urlWithParams
    }));
  }
  return next(request);
};

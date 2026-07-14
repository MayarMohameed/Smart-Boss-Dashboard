import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppStateStore, AppNotification } from '../../store/app-state.store';
import { Subject, Subscription, timer } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent implements OnInit, OnDestroy {
  readonly store = inject(AppStateStore);
  
  // Header Time
  currentTime = signal<Date>(new Date());
  
  // Notification Dropdown State
  showNotifications = signal<boolean>(false);
  
  // Live Toast Notification State
  activeToast = signal<AppNotification | null>(null);
  
  private destroy$ = new Subject<void>();
  private timeSubscription?: Subscription;
  private toastTimerSub?: Subscription;

  ngOnInit() {
    // Clock tick
    this.timeSubscription = timer(0, 1000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.currentTime.set(new Date());
      });

    // Subscribe to live RxJS notification stream for Toast Popups
    this.store.liveNotifications$
      .pipe(takeUntil(this.destroy$))
      .subscribe((notification) => {
        this.showToast(notification);
      });
  }

  showToast(notification: AppNotification) {
    if (this.toastTimerSub) {
      this.toastTimerSub.unsubscribe();
    }
    
    this.activeToast.set(notification);
    
    // Hide toast after 4 seconds
    this.toastTimerSub = timer(4000).subscribe(() => {
      this.activeToast.set(null);
    });
  }

  dismissToast() {
    this.activeToast.set(null);
    if (this.toastTimerSub) {
      this.toastTimerSub.unsubscribe();
    }
  }

  toggleNotifications() {
    this.showNotifications.update(v => !v);
  }

  onSearch(event: Event) {
    const query = (event.target as HTMLInputElement).value;
    this.store.setSearchQuery(query);
  }

  markAsRead(id: string, event: MouseEvent) {
    event.stopPropagation();
    this.store.markNotificationAsRead(id);
  }

  markAllAsRead() {
    this.store.markAllNotificationsAsRead();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.toastTimerSub) {
      this.toastTimerSub.unsubscribe();
    }
  }
}

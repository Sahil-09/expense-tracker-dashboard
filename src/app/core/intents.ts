import { Injectable, signal } from '@angular/core';

/** Cross-component UI intents; shell hosts the dialogs, pages raise them. */
@Injectable({ providedIn: 'root' })
export class IntentsService {
  readonly newExpenseOpen = signal(false);
  openNewExpense(): void {
    this.newExpenseOpen.set(true);
  }
}

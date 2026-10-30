import { Component, computed, effect, HostListener, inject, signal } from '@angular/core';
import { Router, RouterOutlet, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api';
import { DataStore } from '../../core/store';
import { monthLabel, monthStart, addMonths } from '../../core/format';
import { IntentsService } from '../../core/intents';

type NavItem = { path: string; label: string; icon: string; dot?: boolean; pill?: boolean };

const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Family Overview', icon: 'dashboard' },
  { path: '/members', label: 'Members', icon: 'groups', pill: true },
  { path: '/budgets', label: 'Budgets & Limits', icon: 'donut_large' },
  { path: '/bills', label: 'Shared Bills', icon: 'receipt_long', dot: true },
  { path: '/vaults', label: 'Vaults & Cards', icon: 'credit_card' },
];

const PAGE_TITLES: [string, string][] = [
  ['/dashboard', 'Family Overview'],
  ['/members', 'Members & Insights'],
  ['/budgets', 'Budgets & Limits'],
  ['/bills', 'Shared Bills & Recurring'],
  ['/vaults', 'Vaults & Cards'],
  ['/settings', 'Settings'],
];

/** Pages whose header carries the month cycle pill ('' = root route). */
const MONTH_PAGES = ['', '/members', '/budgets', '/bills', '/vaults'];

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterModule, FormsModule],
  template: `
    @if (sidebarOpen()) {
      <div class="fixed inset-0 z-40 bg-surface-canvas/60 lg:hidden" (click)="sidebarOpen.set(false)" aria-hidden="true"></div>
    }

    <!-- Fixed Left Float Navigation Bar -->
    <aside
      class="fixed left-0 top-0 z-50 flex h-full w-64 flex-col justify-between border-r border-border-subtle bg-surface-layer-1/80 px-5 py-6 backdrop-blur-xl transition-transform duration-200 lg:z-50 lg:translate-x-0"
      [class.-translate-x-full]="!sidebarOpen()"
      aria-label="Main navigation"
    >
      <div class="flex flex-col gap-8">
        <!-- Brand & Household Switcher -->
        <div class="flex items-center gap-3 px-1">
          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 shadow-inner">
            <span class="material-symbols-outlined text-[20px] text-primary">family_restroom</span>
          </div>
          <div class="flex flex-col">
            <span class="text-sm font-bold tracking-tight text-on-surface">Veda Ledger</span>
            <span class="text-[11px] font-medium tracking-wide text-on-surface-variant/80">{{ householdLabel() }}</span>
          </div>
        </div>

        <!-- Navigation Links -->
        <nav class="flex flex-col gap-1.5 text-sm" (click)="sidebarOpen.set(false)">
          @for (item of navItems(); track item.path) {
            <a
              class="flex items-center justify-between rounded-xl border px-3.5 py-2.5 transition-all"
              [routerLink]="item.path"
              routerLinkActive
              #rla="routerLinkActive"
              [class]="rla.isActive
                ? 'font-medium bg-primary/10 text-primary border-primary/20 shadow-sm'
                : 'font-normal text-on-surface-variant hover:text-on-surface hover:bg-surface-layer-2/60 border-transparent'"
            >
              <div class="flex items-center gap-3">
                <span class="material-symbols-outlined text-[19px]">{{ item.icon }}</span>
                <span>{{ item.label }}</span>
              </div>
              @if (item.pill && memberCount() > 0) {
                <span class="rounded-full border border-border-subtle bg-surface-layer-2 px-2 py-0.5 font-mono text-[10px] text-on-surface-variant">{{ memberCount() }}</span>
              }
              @if (item.dot) {
                <span class="h-2 w-2 rounded-full bg-status-amber"></span>
              }
            </a>
          }
        </nav>
      </div>

      <!-- Live Sync Mini Card (click = refresh pull) -->
      <button type="button" title="Refresh data"
              class="flex items-center justify-between rounded-xl border border-border-subtle bg-surface-layer-2/50 p-3.5 backdrop-blur-sm hover:bg-surface-layer-2 transition-colors"
              (click)="store.load(true)">
        <div class="flex items-center gap-2.5">
          <span class="relative flex h-2 w-2">
            <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-emerald opacity-75" [class.hidden]="store.isLoading()"></span>
            <span class="relative inline-flex h-2 w-2 rounded-full bg-status-emerald"></span>
          </span>
          <div class="flex flex-col text-left">
            <span class="text-xs font-medium text-on-surface">{{ syncLabel() }}</span>
            <span class="text-[10px] text-on-surface-variant">Live SMS &amp; Bank sync</span>
          </div>
        </div>
        <span class="rounded-full border border-status-emerald/20 bg-status-emerald/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-status-emerald">
          {{ store.isLoading() ? 'Syncing' : 'Synced' }}
        </span>
      </button>
    </aside>

    <!-- Main Canvas Area -->
    <div class="min-h-full bg-surface-canvas text-on-surface antialiased lg:pl-64">
      <!-- Top Global Header -->
      <header class="sticky top-0 z-40 flex h-20 items-center justify-between border-b border-border-subtle/60 bg-surface-canvas/60 px-4 backdrop-blur-xl md:px-10">
        <div class="flex items-center gap-4">
          <button
            type="button"
            aria-label="Toggle menu"
            class="rounded-full bg-surface-layer-1 p-2.5 text-on-surface-variant hover:text-on-surface lg:hidden"
            (click)="sidebarOpen.set(!sidebarOpen())"
          >
            <span class="material-symbols-outlined text-[19px]">menu</span>
          </button>
          <!-- Month cycle pill / pager -->
          @if (showMonthPager()) {
            <div class="flex items-center gap-1 rounded-full border border-border-subtle bg-surface-layer-1 px-2 py-1.5 text-xs text-on-surface-variant">
              <button type="button" aria-label="Previous month" class="rounded-full p-0.5 hover:bg-surface-layer-2 hover:text-on-surface" (click)="store.prevMonth()">
                <span class="material-symbols-outlined text-[16px]">chevron_left</span>
              </button>
              <button type="button" class="whitespace-nowrap px-2.5" (click)="goToday()">
                <span class="w-1.5 h-1.5 mr-2 inline-block rounded-full bg-secondary"></span>{{ monthTitle() }}
                <span class="text-border-strong mx-1">•</span>
                <span class="text-on-surface font-medium">{{ cycleLabel() }}</span>
              </button>
              <button type="button" aria-label="Next month" class="rounded-full p-0.5 hover:bg-surface-layer-2 hover:text-on-surface" (click)="store.nextMonth()">
                <span class="material-symbols-outlined text-[16px]">chevron_right</span>
              </button>
            </div>
          }
        </div>

        <div class="flex items-center gap-5">
          <!-- Viewing-as chip: whose data the screens are showing -->
          @if (viewingOther()) {
            <button type="button"
                    class="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs text-primary"
                    title="Click to go back to your own data"
                    (click)="backToMe()">
              <span class="material-symbols-outlined text-[16px]">visibility</span>
              <span class="hidden font-medium sm:inline">{{ viewingEmail() }}</span>
              <span class="material-symbols-outlined text-[14px]">close</span>
            </button>
          }

          <div class="relative hidden w-72 md:block">
            <span class="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">search</span>
            <input class="w-full rounded-full border border-border-subtle bg-surface-layer-1/70 py-2 pl-10 pr-4 text-xs text-on-surface placeholder:text-on-surface-variant/50 transition-all focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20" placeholder="Search merchant, member or note..." type="text" [ngModel]="searchQuery()" (ngModelChange)="searchQuery.set($event)">
          </div>

          <button class="relative rounded-full border border-border-subtle bg-surface-layer-1 p-2.5 text-on-surface-variant transition-colors hover:bg-surface-layer-2 hover:text-on-surface" type="button">
            <span class="material-symbols-outlined text-[19px]">notifications</span>
            <span class="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-status-amber"></span>
          </button>

          <div class="h-5 w-px bg-border-subtle"></div>

          <a class="flex items-center gap-3" routerLink="/settings" title="Settings">
            <span class="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary ring-1 ring-border-strong">{{ initial() }}</span>
            <div class="hidden flex-col text-left sm:flex">
              <span class="text-xs font-semibold leading-tight text-on-surface">{{ api.currentEmail() }}</span>
              <span class="text-[10px] leading-tight text-on-surface-variant">{{ roleLabel() }}</span>
            </div>
          </a>
        </div>
      </header>

      <!-- Gallery / Floating Ambient Container -->
      <main class="mx-auto flex max-w-[1360px] flex-col gap-14 px-4 py-12 md:px-10">
        <router-outlet />
      </main>
    </div>

    <!-- Log Expense dialog (web push through the sync channel) -->
    @if (newExpenseOpen()) {
      <div class="fixed inset-0 z-[60] flex items-center justify-center bg-surface-canvas/80 p-4 backdrop-blur-sm" (click)="newExpenseOpen.set(false)">
        <div class="w-full max-w-md rounded-3xl border border-border-subtle bg-surface-layer-1 p-6 shadow-2xl" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-medium text-on-surface">Log Expense</h3>
            <button type="button" class="rounded-full p-1 text-on-surface-variant hover:bg-surface-layer-2 hover:text-on-surface" (click)="newExpenseOpen.set(false)">
              <span class="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
          <p class="mt-1 text-xs text-on-surface-variant">Saved into your own ledger through the sync channel.</p>
          <div class="mt-5 space-y-3">
            <input type="number" min="1" placeholder="Amount (₹)" aria-label="Amount in rupees"
                   class="h-11 w-full rounded-xl border border-border-subtle bg-surface-layer-2 px-4 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                   [(ngModel)]="newAmount" />
            <input type="text" placeholder="Merchant" aria-label="Merchant"
                   class="h-11 w-full rounded-xl border border-border-subtle bg-surface-layer-2 px-4 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                   [(ngModel)]="newMerchant" />
            <input list="expense-cats" type="text" placeholder="Category" aria-label="Category"
                   class="h-11 w-full rounded-xl border border-border-subtle bg-surface-layer-2 px-4 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                   [(ngModel)]="newCategory" />
            <datalist id="expense-cats">
              @for (c of knownCategories(); track c) {
                <option [value]="c"></option>
              }
            </datalist>
            <div class="flex items-center gap-3">
              <input type="date" aria-label="Date"
                     class="h-11 flex-1 rounded-xl border border-border-subtle bg-surface-layer-2 px-4 text-sm text-on-surface focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                     [(ngModel)]="newDate" />
              <div class="inline-flex rounded-xl border border-border-subtle bg-surface-layer-2 p-1">
                <button type="button" class="rounded-lg px-3 py-1.5 text-xs transition-colors"
                        [class]="!newIncome() ? 'bg-surface-layer-3 font-medium text-on-surface' : 'text-on-surface-variant hover:text-on-surface'"
                        (click)="newIncome.set(false)">Spend</button>
                <button type="button" class="rounded-lg px-3 py-1.5 text-xs transition-colors"
                        [class]="newIncome() ? 'bg-primary/15 font-medium text-primary' : 'text-on-surface-variant hover:text-on-surface'"
                        (click)="newIncome.set(true)">Income</button>
              </div>
            </div>
          </div>
          <div class="mt-6 flex justify-end gap-2">
            <button type="button" class="flex h-10 items-center rounded-xl border border-border-subtle bg-surface-layer-2 px-4 text-xs font-medium text-on-surface hover:bg-surface-layer-3"
                    (click)="newExpenseOpen.set(false)">Cancel</button>
            <button type="button" class="flex h-10 items-center rounded-xl bg-primary px-5 text-xs font-medium text-on-primary shadow-lg shadow-primary/10 transition-all hover:bg-primary-container disabled:opacity-40"
                    [disabled]="savingExpense()" (click)="saveExpense()">Save expense</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ShellComponent {
  sidebarOpen = signal(false);
  searchQuery = signal('');

  public api = inject(ApiService);
  public store = inject(DataStore);
  public intents = inject(IntentsService);
  private router = inject(Router);

  navItems = computed(() => (this.api.isAdminUser() ? NAV_ITEMS : NAV_ITEMS.filter((i) => i.path !== '/members')));
  pageTitle = computed(() => PAGE_TITLES.find(([p]) => this.router.url.startsWith(p))?.[1] ?? 'Family Overview');
  showMonthPager = computed(() => MONTH_PAGES.some((p) => (p === '' ? this.router.url === '/' : this.router.url.startsWith(p))));
  monthTitle = computed(() => monthLabel(this.store.currentMonth()));
  initial = computed(() => (this.api.currentEmail() ?? '?').charAt(0).toUpperCase());
  ownId = computed(() => this.api.availableUsersList().find((u) => u.email === this.api.currentEmail())?.id ?? null);
  viewingOther = computed(() => {
    const active = this.api.activeUserIdValue();
    const own = this.ownId();
    return !!active && !!own && active !== own;
  });
  viewingEmail = computed(() => this.api.getActiveUser()?.email ?? '');
  memberCount = computed(() => this.api.availableUsersList().length);
  householdLabel = computed(() => {
    const email = this.api.currentEmail() ?? '';
    const name = email.split('@')[0];
    return name ? `${name}'s Ledger` : 'Personal Ledger';
  });
  syncLabel = computed(() => (this.api.isAdminUser() ? `${this.memberCount()} Members` : 'Personal'));
  roleLabel = computed(() => (this.api.isAdminUser() ? 'Household Admin' : 'Family Member'));

  newExpenseOpen = this.intents.newExpenseOpen;
  savingExpense = signal(false);
  newAmount = signal<number | null>(null);
  newMerchant = signal('');
  newCategory = signal('');
  newIncome = signal(false);
  newDate = signal('');
  knownCategories = computed(() => this.store.getCategoriesForMonth());

  openNewExpense(): void {
    this.newAmount.set(null);
    this.newMerchant.set('');
    this.newCategory.set('');
    this.newIncome.set(false);
    this.newDate.set(new Date().toISOString().slice(0, 10));
    this.newExpenseOpen.set(true);
  }

  async saveExpense(): Promise<void> {
    const amount = Math.round((this.newAmount() ?? 0) * 100);
    if (!amount || amount <= 0) return;
    this.savingExpense.set(true);
    try {
      // Noon keeps the calendar day stable across timezones.
      const txnAt = new Date(`${this.newDate() || new Date().toISOString().slice(0, 10)}T12:00:00`).getTime();
      await this.api.pushExpense({
        amountPaise: amount,
        merchant: this.newMerchant().trim() || 'Unknown',
        category: this.newCategory().trim() || 'Uncategorized',
        txnAt: Number.isFinite(txnAt) ? txnAt : Date.now(),
        isIncome: this.newIncome(),
      });
      this.newExpenseOpen.set(false);
      await this.store.load(true);
    } finally {
      this.savingExpense.set(false);
    }
  }

  backToMe(): void {
    const own = this.ownId();
    if (!own || !this.viewingOther()) return;
    this.api.setActiveUser(own);
    this.store.load(true);
  }

  cycleLabel = computed(() => {
    const { start, end } = { start: monthStart(this.store.currentMonth()), end: addMonths(monthStart(this.store.currentMonth()), 1) };
    const now = Date.now();
    if (now >= end) return 'Cycle Closed';
    const days = Math.max(1, Math.ceil((end - now) / 86400000));
    return `Cycle Closes in ${days} Day${days === 1 ? '' : 's'}`;
  });

  constructor() {
    // First visit to a data page: pull once so the screens are not empty.
    effect(() => {
      const onDataPage = this.showMonthPager();
      if (onDataPage && this.store.lastSyncTime() === null && !this.store.isLoading()) {
        this.store.load();
      }
    });
  }

  goToday(): void {
    this.store.setMonth(monthStart(Date.now()));
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.sidebarOpen.set(false);
  }
}

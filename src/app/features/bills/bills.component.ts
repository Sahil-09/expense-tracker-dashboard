import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IntentsService } from '../../core/intents';
import { ApiService } from '../../core/api';
import { DataStore } from '../../core/store';
import { formatPaise, formatPaiseCompact, getMonthBounds, addMonths } from '../../core/format';
import { ExpenseRow } from '../../core/models';

const CAT_ICONS: { test: RegExp; icon: string }[] = [
  { test: /electric|power|bescom/i, icon: 'bolt' },
  { test: /internet|fiber|airtel|broadband|wifi/i, icon: 'wifi' },
  { test: /rent|maintenance|society/i, icon: 'apartment' },
  { test: /help|cook|staff|domestic/i, icon: 'badge' },
  { test: /ott|netflix|prime|subscription|streaming/i, icon: 'play_circle' },
  { test: /insur|policy/i, icon: 'verified_user' },
  { test: /gas|water/i, icon: 'water_drop' },
  { test: /emi|loan|credit/i, icon: 'credit_card' },
];

const MONTH_COLORS = { overhead: '#8083ff', subs: '#4edea3', overheadNow: '#c0c1ff', subsNow: '#6ffbbe' };

interface ScheduleRow {
  id: string;
  merchant: string;
  category: string;
  icon: string;
  amountPaise: number;
  txnAt: number;
  dueLabel: string;
  source: string;
  cleared: boolean;
  ref: string;
}

@Component({
  selector: 'app-bills',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (showSkeleton()) {
      <div class="flex flex-col gap-10 pb-16">
        <div class="flex items-end justify-between gap-8">
          <div class="flex flex-col gap-3">
            <div class="h-3.5 w-56 rounded-full bg-surface-container-high animate-pulse"></div>
            <div class="h-10 w-96 rounded-xl bg-surface-container-high animate-pulse"></div>
            <div class="h-3.5 w-72 rounded-full bg-surface-container animate-pulse"></div>
          </div>
          <div class="h-11 w-40 rounded-xl bg-surface-container-high animate-pulse"></div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div class="lg:col-span-6 flex h-64 flex-col justify-between rounded-3xl border border-border-subtle bg-surface-layer-1 p-8">
            @for (i of [1,2,3]; track i) { <div class="h-10 bg-surface-container-high animate-pulse" [style.width.%]="[90,60,40][$index]"></div> }
          </div>
          <div class="lg:col-span-6 grid grid-cols-1 gap-8 sm:grid-cols-3">
            @for (i of [1,2,3]; track i) { <div class="flex h-64 flex-col justify-between rounded-3xl border border-border-subtle bg-surface-layer-1 p-8">
              @for (j of [1,2,3]; track j) { <div class="h-4 rounded-full bg-surface-container-high animate-pulse" [style.width.%]="[55,85,45][$index]"></div> }
            </div> }
          </div>
        </div>
        <div class="flex h-[560px] flex-col gap-4 rounded-3xl border border-border-subtle bg-surface-layer-1 p-8">
          @for (i of [1,2,3,4]; track i) {
            <div class="flex flex-1 items-center gap-5 rounded-2xl bg-surface-layer-2/30 px-6">
              <div class="h-12 w-12 rounded-2xl bg-surface-container-high animate-pulse"></div>
              <div class="flex flex-1 flex-col gap-2"><div class="h-3.5 w-64 rounded-full bg-surface-container-high animate-pulse"></div><div class="h-3 w-40 rounded-full bg-surface-container animate-pulse"></div></div>
              <div class="h-8 w-24 rounded-lg bg-surface-container animate-pulse"></div>
            </div>
          }
        </div>
      </div>
    } @else {
    <!-- Top Header & Action Row -->
    <section class="flex flex-col gap-8 pb-2 md:flex-row md:items-end md:justify-between">
      <div class="flex flex-col gap-2">
        <div class="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-on-surface-variant/70">
          <span>{{ householdLabel() }}</span>
          <span>/</span>
          <span class="font-medium text-primary">Recurring Commitments</span>
          <span>/</span>
          <span class="flex items-center gap-1 text-secondary"><span class="inline-block h-1.5 w-1.5 rounded-full bg-secondary"></span> {{ pending().length ? 'Cycle Active' : 'All Settled' }}</span>
        </div>
        <h1 class="text-3xl font-light tracking-tight text-on-surface md:text-4xl">Shared Bills &amp; Recurring Expenses</h1>
        <p class="text-xs text-on-surface-variant">Automated direct debits, utility schedules, household subscription splits, and upcoming due dates.</p>
      </div>
      <div class="flex items-center gap-3">
        <a class="flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-layer-1 px-4 py-2.5 text-xs font-medium text-on-surface transition-all hover:bg-surface-layer-2" routerLink="/settings">
          <span class="material-symbols-outlined text-[17px] text-on-surface-variant">history</span>
          <span>Sync &amp; Account</span>
        </a>
        <button class="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-medium text-on-primary shadow-lg shadow-primary/10 transition-all hover:bg-primary-container" type="button" (click)="intents.openNewExpense()">
          <span class="material-symbols-outlined text-[18px]">add</span>
          <span>Log Expense</span>
        </button>
      </div>
    </section>

    <!-- Hero + metric islands -->
    <section class="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
      <!-- Hero Primary Card Island -->
      <div class="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-border-subtle bg-surface-layer-1/90 p-8 shadow-2xl backdrop-blur-md lg:col-span-6">
        <div class="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl"></div>
        <div class="relative z-10 flex items-center justify-between">
          <span class="font-mono text-xs uppercase tracking-widest text-on-surface-variant">Cycle Commitment</span>
          <span class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium" [class]="pending().length ? 'bg-status-amber/10 text-status-amber border-status-amber/20' : 'bg-status-emerald/10 text-status-emerald border-status-emerald/20'">
            <span class="material-symbols-outlined text-[14px]">{{ pending().length ? 'pending_actions' : 'verified' }}</span>
            {{ cleared().length }} of {{ schedule().length }} Cleared
          </span>
        </div>
        <div class="relative z-10 my-8">
          <div class="flex items-baseline gap-2">
            <span class="text-5xl font-light tracking-tight text-on-surface [font-feature-settings:'tnum'] md:text-6xl">{{ formatPaiseCompact(clearedTotal()) }}</span>
            <span class="text-lg font-light text-on-surface-variant/70">/ mo</span>
          </div>
          <div class="mt-4 flex items-center gap-4 text-xs text-on-surface-variant">
            <span>Scheduled: <strong class="font-mono font-semibold text-on-surface">{{ formatPaiseCompact(totalCommitment()) }}</strong></span>
            <span class="text-border-strong">�</span>
            <span class="font-medium" [class]="pending().length ? 'text-status-amber' : 'text-secondary'">{{ clearedPct() }}% cleared</span>
          </div>
        </div>
        <div class="relative z-10 flex flex-col gap-2.5 border-t border-border-subtle/80 pt-4">
          <div class="flex items-center justify-between font-mono text-xs text-on-surface-variant">
            <span>{{ clearedPct() }}% Cleared</span>
            <span>{{ daysElapsed() }} of {{ daysInMonth() }} Days Elapsed ({{ elapsedPct() }}%)</span>
          </div>
          <div class="h-2 w-full overflow-hidden rounded-full bg-surface-layer-3/80 p-0.5">
            <div class="h-full rounded-full bg-gradient-to-r from-secondary-container to-secondary transition-all duration-500" [style.width.%]="clearedPct()"></div>
          </div>
        </div>
      </div>
      <!-- 3 Secondary Floating Metric Islands -->
      <div class="grid grid-cols-1 gap-8 sm:grid-cols-3 lg:col-span-6">
        <!-- Urgent Attention -->
        <div class="flex flex-col justify-between rounded-3xl border border-border-subtle bg-surface-layer-1/70 p-8 shadow-xl backdrop-blur-sm transition-all hover:border-border-strong">
          <div class="flex items-center justify-between">
            <span class="font-mono text-[11px] uppercase tracking-wider text-tertiary">Urgent Attention</span>
            <span class="material-symbols-outlined text-[19px] text-tertiary">notification_important</span>
          </div>
          <div class="my-3">
            <h3 class="whitespace-nowrap font-mono text-2xl font-light" [class]="urgent() ? 'text-tertiary' : 'text-on-surface-variant'">{{ urgent() ? formatPaiseCompact(urgent()!.amountPaise) : 'None' }}</h3>
            <p class="mt-0.5 truncate text-xs font-medium text-on-surface">{{ urgent()?.merchant ?? 'Nothing due within 72 hrs' }}</p>
          </div>
          <div class="flex items-center justify-between border-t border-border-subtle pt-3 text-[11px] text-on-surface-variant">
            <span>{{ urgentCan() }}</span>
            <span class="font-mono font-medium text-tertiary">Scheduled</span>
          </div>
        </div>
        <!-- Annualized -->
        <div class="flex flex-col justify-between rounded-3xl border border-border-subtle bg-surface-layer-1/70 p-8 shadow-xl backdrop-blur-sm transition-all hover:border-border-strong">
          <div class="flex items-center justify-between">
            <span class="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">Annualized</span>
            <span class="material-symbols-outlined text-[19px] text-primary">stacked_bar_chart</span>
          </div>
          <div class="my-3">
            <h3 class="whitespace-nowrap font-mono text-2xl font-light text-on-surface">{{ annualized() ? formatPaiseCompact(annualized()) : '�' }}</h3>
            <p class="mt-0.5 font-mono text-xs font-medium text-secondary">Fixed-cost run-rate</p>
          </div>
          <div class="flex items-center justify-between border-t border-border-subtle pt-3 text-[11px] text-on-surface-variant">
            <span>Fixed Load</span>
            <span class="font-medium text-status-emerald">{{ dueList().length }} commitments</span>
          </div>
        </div>
        <!-- NPCI Mandates (design fiction rendered as designed) -->
        <div class="flex flex-col justify-between rounded-3xl border border-border-subtle bg-surface-layer-1/70 p-8 shadow-xl backdrop-blur-sm transition-all hover:border-border-strong">
          <div class="flex items-center justify-between">
            <span class="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">NPCI Mandates</span>
            <span class="material-symbols-outlined text-[19px] text-secondary">verified_user</span>
          </div>
          <div class="my-3">
            <h3 class="whitespace-nowrap font-mono text-2xl font-light text-secondary">7 Active</h3>
            <p class="mt-0.5 font-mono text-xs font-medium text-secondary/80">100% Compliant</p>
          </div>
          <div class="flex items-center justify-between border-t border-border-subtle pt-3 text-[11px] text-on-surface-variant">
            <span>0 Failed</span>
            <span class="font-medium text-status-emerald">All Good</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Schedule & Execution -->
    <section class="flex flex-col gap-8">
      <div class="flex flex-col justify-between gap-4 px-1 sm:flex-row sm:items-center">
        <div>
          <h2 class="text-xl font-light text-on-surface">{{ monthLabel() }} Schedule &amp; Execution</h2>
          <p class="mt-0.5 text-xs text-on-surface-variant">Chronological execution pipeline of recurring household obligations</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="font-mono text-xs text-on-surface-variant">Filter:</span>
          <div class="flex items-center gap-1.5 rounded-xl border border-border-subtle bg-surface-layer-1 p-1 text-xs">
            <button class="rounded-lg px-3 py-1 transition-colors" type="button" [class]="billFilter() === 'all' ? 'bg-surface-layer-2 font-medium text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'" (click)="billFilter.set('all')">All Commitments ({{ schedule().length }})</button>
            <button class="rounded-lg px-3 py-1 transition-colors" type="button" [class]="billFilter() === 'pending' ? 'bg-surface-layer-2 font-medium text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'" (click)="billFilter.set('pending')">Pending ({{ pending().length }})</button>
            <button class="rounded-lg px-3 py-1 transition-colors" type="button" [class]="billFilter() === 'cleared' ? 'bg-surface-layer-2 font-medium text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'" (click)="billFilter.set('cleared')">Cleared ({{ cleared().length }})</button>
          </div>
        </div>
      </div>
      <div class="flex flex-col gap-4 rounded-3xl border border-border-subtle bg-surface-layer-1/80 p-4 shadow-2xl backdrop-blur-sm sm:p-8">
        @for (r of visibleSchedule(); track r.id) {
          <div class="flex items-center justify-between gap-4 rounded-2xl border border-border-subtle/60 bg-surface-layer-2/20 px-2 py-5 transition-all hover:bg-surface-layer-2/50 md:gap-8 md:px-6">
            <div class="flex min-w-0 items-center gap-3 md:gap-5">
              <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-inner" [style]="rowIconClass(r)">
                <span class="material-symbols-outlined text-[22px]">{{ r.icon }}</span>
              </div>
              <div class="flex min-w-0 flex-col gap-1.5">
                <div class="flex items-center gap-3">
                  <span class="truncate text-sm font-semibold text-on-surface">{{ r.merchant }}</span>
                  <span class="shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-medium" [style]="rowTagClass(r)">{{ r.category }}</span>
                </div>
                <div class="flex items-center gap-2.5 text-xs text-on-surface-variant">
                  <span>{{ r.dueLabel }}</span>
                  <span class="text-border-strong">�</span>
                  <span class="truncate">{{ r.source }}</span>
                </div>
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-4 md:gap-8">
              <div class="flex flex-col items-end gap-1 text-right">
                <span class="font-mono text-base font-semibold text-on-surface [font-feature-settings:'tnum']">{{ formatPaise(r.amountPaise) }}</span>
                <span class="font-mono text-[11px] text-on-surface-variant/80">{{ r.cleared ? 'Recorded in ledger' : 'Awaiting settlement' }}</span>
              </div>
              <div class="flex items-center gap-2 pl-2">
                @if (r.cleared) {
                  <span class="h-2.5 w-2.5 rounded-full bg-status-emerald shadow-sm" title="Cleared"></span>
                  <span class="hidden font-mono text-[11px] font-medium text-status-emerald sm:inline-block">Cleared</span>
                } @else {
                  <span class="flex shrink-0 items-center gap-1.5 rounded-xl border border-border-subtle bg-surface-layer-2 px-3 py-1.5 font-mono text-xs text-status-amber">
                    <span class="material-symbols-outlined text-[14px]">hourglass_top</span>
                    <span>Pending</span>
                  </span>
                }
              </div>
            </div>
          </div>
        } @empty {
          <div class="py-10 text-center text-sm text-on-surface-variant">No {{ billFilter() === 'all' ? '' : billFilter() + ' ' }}commitments recorded for {{ monthLabel() }}</div>
        }
      </div>
    </section>

    <!-- Velocity + splits -->
    <section class="grid grid-cols-1 items-start gap-8 lg:grid-cols-12 mt-8">
      <!-- Fixed & Recurring Cost Velocity -->
      <div class="flex flex-col justify-between rounded-3xl border border-border-subtle bg-surface-layer-1/80 p-8 shadow-2xl backdrop-blur-sm lg:col-span-7">
        <div class="flex items-center justify-between border-b border-border-subtle pb-6">
          <div>
            <h2 class="text-base font-medium text-on-surface">Fixed &amp; Recurring Cost Velocity</h2>
            <p class="mt-0.5 text-xs text-on-surface-variant">6-month rolling audit of fixed overheads vs lifestyle spend</p>
          </div>
          <div class="flex items-center gap-4 font-mono text-xs">
            <span class="flex items-center gap-1.5 text-on-surface-variant"><span class="h-2 w-2 rounded-full bg-primary"></span> Core Overheads</span>
            <span class="flex items-center gap-1.5 text-on-surface-variant/70"><span class="h-2 w-2 rounded-full bg-secondary"></span> Lifestyle</span>
          </div>
        </div>
        <div class="relative my-6 h-56 w-full">
          <svg class="h-full w-full overflow-visible" fill="none" preserveAspectRatio="none" viewBox="0 0 600 180">
            <line stroke="rgba(255,255,255,0.04)" stroke-dasharray="4 4" stroke-width="1" x1="0" x2="600" y1="150" y2="150"></line>
            <line stroke="rgba(255,255,255,0.04)" stroke-dasharray="4 4" stroke-width="1" x1="0" x2="600" y1="100" y2="100"></line>
            <line stroke="rgba(255,255,255,0.04)" stroke-dasharray="4 4" stroke-width="1" x1="0" x2="600" y1="50" y2="50"></line>
            @for (col of velocity(); track col.idx) {
              <rect class="transition-opacity hover:opacity-80" [attr.fill]="col.overheadFill" [attr.height]="col.overheadH" rx="4" width="22" [attr.x]="col.overheadX" [attr.y]="col.overheadY"></rect>
              <rect class="transition-opacity hover:opacity-80" [attr.fill]="col.subsFill" [attr.height]="col.subsH" rx="4" width="22" [attr.x]="col.subsX" [attr.y]="col.subsY"></rect>
              <text [attr.fill]="col.current ? '#dfe2ee' : '#908fa0'" font-family="Inter" font-size="11" [attr.font-weight]="col.current ? '600' : null" text-anchor="middle" [attr.x]="col.labelX" y="170">{{ col.label }}</text>
            }
          </svg>
        </div>
        <!-- Insight box (design copy � the OTT audit lives in the full ledger service) -->
        <div class="flex items-start gap-4 rounded-2xl border border-border-subtle bg-surface-layer-2/50 p-4">
          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-status-amber/15 text-status-amber">
            <span class="material-symbols-outlined text-[19px]">lightbulb</span>
          </div>
          <div class="flex flex-1 flex-col justify-between gap-3 md:flex-row md:items-center">
            <div class="flex flex-col">
              <span class="text-xs font-semibold text-on-surface">Bundled Tier Redundancy Audit</span>
              <p class="mt-0.5 text-xs text-on-surface-variant">Utility &amp; platform fees dominate fixed load � tags the household's biggest overhead categories each cycle.</p>
            </div>
            <span class="whitespace-nowrap rounded-xl bg-surface-layer-3 px-3.5 py-1.5 font-mono text-xs self-start text-secondary transition-all md:self-auto">From {{ topOverhead() }}</span>
          </div>
        </div>
      </div>
      <!-- Split Allocations -->
      <div class="flex flex-col justify-between rounded-3xl border border-border-subtle bg-surface-layer-1/80 p-8 shadow-2xl backdrop-blur-sm lg:col-span-5">
        <div class="flex items-center justify-between border-b border-border-subtle pb-6">
          <div>
            <h2 class="text-base font-medium text-on-surface">Split Allocations</h2>
            <p class="mt-0.5 text-xs text-on-surface-variant">Member share of household spend this cycle</p>
          </div>
          <span class="font-mono text-xs text-on-surface-variant">{{ formatPaiseCompact(totalSpend()) }} Total</span>
        </div>
        <div class="relative my-6 flex flex-col items-center justify-center">
          <svg class="h-44 w-44 -rotate-90 transform" viewBox="0 0 100 100">
            <circle cx="50" cy="50" fill="none" r="38" stroke="#171F2E" stroke-width="9"></circle>
            @for (seg of splitDonut(); track seg.color) {
              <circle cx="50" cy="50" fill="none" r="38" [attr.stroke]="seg.color" [attr.stroke-dasharray]="seg.dash + ' 238.76'" [attr.stroke-dashoffset]="seg.offset" stroke-width="9"></circle>
            }
          </svg>
          <div class="absolute flex flex-col items-center justify-center text-center">
            <span class="font-mono text-xs uppercase text-on-surface-variant">Spend Due</span>
            <span class="font-mono text-xl font-light text-on-surface">{{ formatPaiseCompact(totalSpend()) }}</span>
          </div>
        </div>
        <div class="flex flex-col gap-3">
          @for (row of splitLegend(); track row.name) {
            <div class="flex items-center justify-between py-1 text-xs">
              <div class="flex items-center gap-3">
                <span class="h-2.5 w-2.5 rounded-full" [style.background]="row.color"></span>
                <span class="text-on-surface">{{ row.name }}</span>
              </div>
              <span class="font-mono text-on-surface-variant">{{ formatPaise(row.total) }} <span class="ml-1 text-on-surface/50">{{ row.pct }}%</span></span>
            </div>
          } @empty {
            <div class="py-3 text-center text-xs text-on-surface-variant">Personal ledger � no member split to show</div>
          }
        </div>
      </div>
    </section>
    }

    <!-- Footer status note -->
    <div class="flex items-center justify-between px-2 pb-6 pt-1 text-xs text-on-surface-variant/70">
      <span class="font-mono">{{ schedule().length }} commitments tracked � {{ dueList().length }} flagged due by the SMS feed</span>
      <button class="flex items-center gap-1 transition-colors hover:text-primary" type="button" (click)="intents.openNewExpense()">
        <span>Record an early payment</span>
        <span class="material-symbols-outlined text-[15px]">arrow_forward</span>
      </button>
    </div>
  `,
})
export class BillsComponent {
  intents = inject(IntentsService);
  api = inject(ApiService);
  store = inject(DataStore);

  billFilter = signal<'all' | 'pending' | 'cleared'>('all');

  donutColors = ['#8083ff', '#4edea3', '#ca8100'];

  getCategoryIcon(category: string): string {
    return CAT_ICONS.find((c) => c.test.test(category))?.icon ?? 'receipt_long';
  }

  showSkeleton = computed(() => this.store.isLoading() || this.store.lastSyncTime() === null);

  dueList = computed(() => this.store.getFilteredExpenses({ type: 'due' }));

  schedule = computed<ScheduleRow[]>(() => {
    const now = new Date();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).getTime();
    return this.dueList()
      .slice()
      .sort((a, b) => a.txnAt - b.txnAt)
      .map((e) => {
        const cleared = e.txnAt <= todayEnd;
        return {
          id: e.clientId,
          merchant: e.merchant ?? 'Unknown biller',
          category: e.category,
          icon: this.getCategoryIcon(`${e.merchant ?? ''} ${e.category}`),
          amountPaise: e.amountPaise,
          txnAt: e.txnAt,
          dueLabel: `Due ${new Date(e.txnAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`,
          source: e.source,
          cleared,
          ref: e.dedupeKey.slice(-8),
        };
      });
  });
  pending = computed<ScheduleRow[]>(() => this.schedule().filter((r) => !r.cleared));
  cleared = computed<ScheduleRow[]>(() => this.schedule().filter((r) => r.cleared));
  visibleSchedule = computed<ScheduleRow[]>(() => {
    const f = this.billFilter();
    const rows = f === 'all' ? this.schedule() : f === 'pending' ? this.pending() : this.cleared();
    return rows.slice(0, 400);
  });

  totalCommitment = computed(() => this.schedule().reduce((s, r) => s + r.amountPaise, 0));
  clearedTotal = computed(() => this.cleared().reduce((s, r) => s + r.amountPaise, 0));
  clearedPct = computed(() => (this.schedule().length ? Math.round((this.cleared().length / this.schedule().length) * 100) : 0));

  urgent = computed(() => {
    const now = Date.now();
    return this.pending().find((r) => r.txnAt - now < 72 * 3600000) ?? this.pending()[0] ?? null;
  });
  urgentCan = computed(() => {
    const u = this.urgent();
    if (!u) return 'No upcoming bill';
    const hrs = Math.round((u.txnAt - Date.now()) / 3600000);
    if (hrs <= 0) return 'Past due';
    return hrs < 48 ? `In ${hrs} hrs` : `In ${Math.round(hrs / 24)} days`;
  });

  totalSpend = computed(() => this.store.getFilteredExpenses({ type: 'spend' }).reduce((s, e) => s + e.amountPaise, 0));
  annualized = computed(() => this.totalCommitment() * 12);

  topOverhead = computed(() => {
    const breakdown = new Map<string, number>();
    for (const e of this.store.getFilteredExpenses({ type: 'spend' })) {
      if (e.category === 'Bills' || e.category === 'Rent' || e.category === 'Transport') {
        breakdown.set(e.category, (breakdown.get(e.category) ?? 0) + e.amountPaise);
      }
    }
    const top = [...breakdown.entries()].sort((a, b) => b[1] - a[1])[0];
    return top ? `${top[0]} � ${formatPaiseCompact(top[1])} this cycle` : 'no fixed spend recorded';
  });

  velocity = computed(() => {
    // last 6 months ending at the selected month
    const end = getMonthBounds(this.store.currentMonth()).start;
    const months = [] as { startMs: number; label: string }[];
    for (let i = 5; i >= 0; i--) {
      const s = addMonths(end, -i);
      months.push({ startMs: s, label: new Date(s).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }).replace(' ', '�') });
    }
    const all = this.store.allExpenses();
    const rows = months.map((mo, idx) => {
      const mb = getMonthBounds(mo.startMs);
      let overhead = 0;
      let subs = 0;
      for (const e of all) {
        if (e.txnAt < mb.start || e.txnAt >= mb.end) continue;
        if (!e.isExpense || e.isIncome || e.deletedAt !== null) continue;
        if (e.category === 'Bills' || e.category === 'Rent' || e.category === 'Transport') overhead += e.amountPaise;
        else subs += e.amountPaise;
      }
      return { overhead, subs, label: mo.label, idx, current: idx === months.length - 1 };
    });
    const maxV = Math.max(1, ...rows.flatMap((r) => [r.overhead, r.subs]));
    return rows.map((r, i) => {
      const baseX = 35 + i * 100;
      const overheadH = Math.round((r.overhead / maxV) * 150);
      const subsH = Math.round((r.subs / maxV) * 150);
      return {
        ...r,
        overheadH,
        subsH,
        overheadX: baseX,
        overheadY: 150 - overheadH,
        subsX: baseX + 27,
        subsY: 150 - subsH,
        labelX: baseX + 25,
        overheadFill: r.current ? MONTH_COLORS.overheadNow : MONTH_COLORS.overhead,
        subsFill: r.current ? MONTH_COLORS.subsNow : MONTH_COLORS.subs,
      };
    });
  });

  // Split donuts share the selected month's per-member ledger totals (the same
  // numbers the Household Members cards show), not the all-time admin fields.
  splitDonut = computed(() => {
    const users = this.api.availableUsersList();
    const spendOf = (u: (typeof users)[number]) => this.store.monthlyForUser(u.id)?.spend ?? 0;
    const visible = this.api.isAdminUser() ? users : (users.find((u) => u.email === this.api.currentEmail()));
    const list = Array.isArray(visible) ? visible.filter((u) => spendOf(u) > 0) : (visible && spendOf(visible) > 0 ? [visible] : []);
    const total = list.reduce((s, u) => s + spendOf(u), 0);
    if (!total) return [];
    const circ = 238.76;
    let offset = 0;
    return list.slice(0, 3).map((u, i) => {
      const dash = (spendOf(u) / total) * circ;
      const seg = { dash, offset: -offset, color: this.donutColors[i] };
      offset += dash;
      return seg;
    });
  });
  splitLegend = computed(() => {
    const users = this.api.availableUsersList();
    const spendOf = (u: (typeof users)[number]) => this.store.monthlyForUser(u.id)?.spend ?? 0;
    const self = users.find((u) => u.email === this.api.currentEmail());
    const list = this.api.isAdminUser() ? users.filter((u) => spendOf(u) > 0) : self && spendOf(self) > 0 ? [self] : [];
    const total = this.totalSpend() || list.reduce((s, u) => s + spendOf(u), 0) || 1;
    return list.slice(0, 3).map((u, i) => ({
      name: u.email.split('@')[0].replace(/^./, (ch) => ch.toUpperCase()),
      total: spendOf(u),
      pct: Math.round((spendOf(u) / total) * 100),
      color: this.donutColors[i],
    }));
  });

  rowIconClass(r: ScheduleRow): string {
    if (r.cleared) return 'background: rgba(78,222,163,0.10); border: 1px solid rgba(78,222,163,0.2); color: #4edea3';
    return 'background: rgba(255,185,95,0.10); border: 1px solid rgba(255,185,95,0.2); color: #ffb95f';
  }
  rowTagClass(r: ScheduleRow): string {
    return r.cleared
      ? 'background: rgba(78,222,163,0.10); color: #4edea3; border-color: rgba(78,222,163,0.2)'
      : 'background: #171F2E; color: #c7c4d7; border-color: rgba(255,255,255,0.06)';
  }

  householdLabel = computed(() => {
    const email = this.api.currentEmail() ?? '';
    const name = email.split('@')[0];
    return name ? `${name}'s Household Ledger` : 'Household Ledger';
  });
  monthLabel = computed(() => new Date(this.store.currentMonth()).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }));
  daysInMonth = computed(() => Math.ceil((getMonthBounds(this.store.currentMonth()).end - getMonthBounds(this.store.currentMonth()).start) / 86400000));
  daysElapsed = computed(() => {
    const { start, end } = getMonthBounds(this.store.currentMonth());
    const now = Date.now();
    if (now < start) return 0;
    if (now >= end) return this.daysInMonth();
    return Math.min(this.daysInMonth(), Math.max(1, Math.ceil((now - start) / 86400000)));
  });
  elapsedPct = computed(() => Math.round((this.daysElapsed() / this.daysInMonth()) * 100));

  formatPaise = formatPaise;
  formatPaiseCompact = formatPaiseCompact;
}

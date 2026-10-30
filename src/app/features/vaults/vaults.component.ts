import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api';
import { DataStore } from '../../core/store';
import { computeDashboardMetrics } from '../../core/analytics';
import { formatPaise, formatPaiseCompact, getMonthBounds } from '../../core/format';

const SOURCE_LABELS: Record<string, string> = {
  'android-inbox': 'Android Inbox Import',
  'android-live': 'Android Live Listener',
  'ios-shortcut': 'iOS Shortcut Push',
};

const PIECE_COLORS = ['#c0c1ff', '#A855F7', '#0EA5E9', '#ffb95f', '#4edea3'];

@Component({
  selector: 'app-vaults',
  standalone: true,
  imports: [RouterLink],
  template: `
    <!-- Top Header & Action Row -->
    <section class="flex flex-col gap-8 pb-4 pt-2 md:flex-row md:items-end md:justify-between">
      <div class="flex flex-col gap-3">
        <div class="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-on-surface-variant/70">
          <span>{{ householdLabel() }}</span>
          <span>/</span>
          <span class="font-medium text-primary">Derived Cash-flow</span>
        </div>
        <h1 class="text-3xl font-light tracking-tight text-on-surface md:text-4xl">Vaults &amp; Cash-flow</h1>
        <p class="text-xs text-on-surface-variant/70">Everything here is computed from the synced SMS ledger for {{ monthLabel() }} — account balances are not tracked yet.</p>
      </div>
      <div class="flex items-center gap-4">
        <button class="group flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-layer-1 px-5 py-3 text-xs font-medium text-on-surface transition-all hover:bg-surface-layer-2" type="button" (click)="store.load(true)">
          <span class="material-symbols-outlined text-[17px] text-on-surface-variant transition-transform duration-500 group-hover:rotate-180" [class.animate-spin]="store.isLoading()">sync</span>
          <span>{{ store.isLoading() ? 'Syncing…' : 'Refresh Ledger' }}</span>
        </button>
      </div>
    </section>

    <!-- Aggregate Household Liquidity Hero Island -->
    <section class="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
      <!-- Hero Primary Card Island -->
      <div class="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-border-subtle bg-surface-layer-1/90 p-8 shadow-2xl backdrop-blur-md lg:col-span-6">
        <div class="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl"></div>
        <div class="relative z-10 mb-2 flex items-center justify-between">
          <span class="font-mono text-xs uppercase tracking-widest text-on-surface-variant">Net Cash-flow</span>
          @if (netDelta() !== null) {
            <span class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
                  [class]="netDelta()! >= 0 ? 'border-status-emerald/20 bg-status-emerald/10 text-status-emerald' : 'border-status-crimson/20 bg-status-crimson/10 text-status-crimson'">
              <span class="material-symbols-outlined text-[14px]">{{ netDelta()! >= 0 ? 'arrow_upward' : 'arrow_downward' }}</span>
              {{ netDelta()! >= 0 ? '+' : '' }}{{ netDelta() }}% vs {{ prevMonthLabel() }}
            </span>
          }
        </div>
        <div class="relative z-10 my-8">
          <div class="flex items-baseline gap-2">
            <span class="text-5xl font-light tracking-tight [font-feature-settings:'tnum'] md:text-6xl" [class]="metrics().net === 0 && metrics().income === 0 ? 'text-on-surface-variant' : (netPositive() ? 'text-status-emerald' : 'text-status-crimson')">{{ netDisplay() }}</span>
          </div>
          <div class="mt-4 flex items-center gap-4 text-xs text-on-surface-variant">
            <span>In <strong class="font-mono font-semibold text-status-emerald">{{ formatPaiseCompact(metrics().income) }}</strong></span>
            <span class="text-border-strong">•</span>
            <span>Out <strong class="font-mono font-semibold text-on-surface">{{ formatPaiseCompact(metrics().spend) }}</strong></span>
          </div>
        </div>
        <!-- Savings rate -->
        <div class="relative z-10 flex flex-col gap-3 border-t border-border-subtle/80 pt-5">
          <div class="flex items-center justify-between font-mono text-xs text-on-surface-variant">
            <span>{{ savingsRate() === null ? 'No income recorded' : savingsRatePct() + '% of inflow kept' }}</span>
            <span>{{ metrics().count }} tracked transactions</span>
          </div>
          <div class="h-2 w-full overflow-hidden rounded-full bg-surface-layer-3/80 p-0.5">
            <div class="h-full rounded-full bg-gradient-to-r from-primary-container to-primary transition-all duration-500" [style.width.%]="savingsRatePct() ?? 0"></div>
          </div>
        </div>
      </div>
      <!-- 3 Secondary Floating Metric Islands -->
      <div class="grid grid-cols-1 gap-8 sm:grid-cols-3 lg:col-span-6">
        <div class="flex flex-col justify-between rounded-3xl border border-border-subtle bg-surface-layer-1/70 p-8 shadow-xl backdrop-blur-sm transition-all hover:border-border-strong">
          <div class="flex items-center justify-between">
            <span class="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">Monthly Outflow</span>
            <span class="material-symbols-outlined text-[19px] text-primary">trending_down</span>
          </div>
          <div class="my-4">
            <h3 class="text-2xl font-light text-on-surface">{{ formatPaiseCompact(metrics().spend) }}</h3>
            <p class="mt-1 font-mono text-xs font-medium text-primary">{{ metrics().count }} transactions</p>
          </div>
          <div class="flex items-center justify-between border-t border-border-subtle pt-4 text-[11px] text-on-surface-variant">
            <span>Projected month end</span>
            <span class="font-mono font-medium text-on-surface">{{ formatPaiseCompact(metrics().projected) }}</span>
          </div>
        </div>
        <div class="flex flex-col justify-between rounded-3xl border border-border-subtle bg-surface-layer-1/70 p-8 shadow-xl backdrop-blur-sm transition-all hover:border-border-strong">
          <div class="flex items-center justify-between">
            <span class="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">Monthly Inflow</span>
            <span class="material-symbols-outlined text-[19px] text-tertiary">trending_up</span>
          </div>
          <div class="my-4">
            <h3 class="text-2xl font-light text-tertiary">{{ formatPaiseCompact(metrics().income) }}</h3>
            <p class="mt-1 font-mono text-xs font-medium text-tertiary">{{ inflowCount() }} credits detected</p>
          </div>
          <div class="flex items-center justify-between border-t border-border-subtle pt-4 text-[11px] text-on-surface-variant">
            <span>Credits read from SMS</span>
            <span class="font-mono font-medium text-status-emerald">Live</span>
          </div>
        </div>
        <div class="flex flex-col justify-between rounded-3xl border border-border-subtle bg-surface-layer-1/70 p-8 shadow-xl backdrop-blur-sm transition-all hover:border-border-strong">
          <div class="flex items-center justify-between">
            <span class="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">Avg Daily Burn</span>
            <span class="material-symbols-outlined text-[19px] text-secondary">speed</span>
          </div>
          <div class="my-4">
            <h3 class="text-2xl font-light text-secondary">{{ formatPaiseCompact(metrics().avgPerDay) }}</h3>
            <p class="mt-1 font-mono text-xs font-medium text-secondary/80">per calendar day</p>
          </div>
          <div class="flex items-center justify-between border-t border-border-subtle pt-4 text-[11px] text-on-surface-variant">
            <span>Largest single debit</span>
            <span class="font-mono font-medium text-on-surface">{{ metrics().largestExpense ? formatPaiseCompact(metrics().largestExpense!.amountPaise) : '—' }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Top Payees -->
    <section class="flex flex-col gap-8">
      <div class="flex items-center justify-between px-1">
        <div class="flex flex-col gap-1">
          <h2 class="text-xl font-light text-on-surface">Top Payees This Month</h2>
          <p class="text-xs text-on-surface-variant">Where the money actually went — ranked by total debit amount</p>
        </div>
        <span class="rounded-full border border-border-subtle bg-surface-layer-1 px-3.5 py-1.5 font-mono text-xs text-on-surface-variant">{{ payees().length }} Destinations Tracked</span>
      </div>
      <div class="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
        @for (p of payees(); track p.name) {
          <div class="group flex flex-col justify-between rounded-2xl border border-border-subtle bg-surface-layer-1/80 p-8 shadow-xl backdrop-blur-sm transition-all duration-300 hover:-translate-y-[2px] hover:border-primary/40 hover:bg-surface-layer-2/50">
            <div>
              <div class="flex items-start justify-between pb-2">
                <div class="flex items-center gap-3.5">
                  <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-bold ring-2" [style]="p.iconStyle">{{ p.name.charAt(0).toUpperCase() }}</div>
                  <div>
                    <h3 class="max-w-[130px] truncate text-sm font-semibold text-on-surface" [title]="p.name">{{ p.name }}</h3>
                    <p class="mt-0.5 font-mono text-[11px]" [style]="p.subStyle">{{ p.count }} transaction{{ p.count === 1 ? '' : 's' }}</p>
                  </div>
                </div>
                @if (p.top) {
                  <span class="rounded-full px-2.5 py-0.5 font-mono text-[10px] font-medium" style="background: rgba(16,185,129,0.10); color: #10B981;">Top payee</span>
                }
              </div>
              <div class="mt-8">
                <div class="flex items-baseline justify-between">
                  <span class="font-mono text-2xl font-light text-on-surface [font-feature-settings:'tnum']">{{ formatPaiseCompact(p.total) }}</span>
                  <span class="font-mono text-[11px] text-on-surface-variant">{{ p.sharePct }}% of spend</span>
                </div>
                <div class="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-layer-3">
                  <div class="h-full rounded-full transition-all" [style.width.%]="p.sharePct" [style.background]="p.barColor"></div>
                </div>
              </div>
            </div>
            <div class="mt-8 flex items-center justify-between border-t border-border-subtle pt-4 text-[11px] text-on-surface-variant">
              <span class="max-w-[120px] truncate">Out of {{ formatPaiseCompact(metrics().spend) }} total</span>
              <span class="font-mono">{{ monthLabel() }}</span>
            </div>
          </div>
        }
        @if (!payees().length) {
          <div class="col-span-full rounded-2xl border border-border-subtle bg-surface-layer-1/60 p-8 text-center text-xs text-on-surface-variant">
            No debits recorded for {{ monthLabel() }} yet.
          </div>
        }
      </div>
    </section>

    <!-- Category Split & Ledger Sources -->
    <section class="grid grid-cols-1 gap-8 lg:grid-cols-12">
      <!-- Category split -->
      <div class="flex flex-col justify-between rounded-3xl border border-border-subtle bg-surface-layer-1/80 p-8 shadow-2xl backdrop-blur-sm lg:col-span-7">
        <div class="flex items-start justify-between border-b border-border-subtle pb-6">
          <div>
            <h2 class="text-base font-medium text-on-surface">Category Split</h2>
            <p class="mt-0.5 text-xs text-on-surface-variant">Share of {{ formatPaiseCompact(metrics().spend) }} tracked outflow</p>
          </div>
          <div class="flex flex-col items-end">
            <span class="font-mono text-lg font-light text-on-surface">{{ formatPaiseCompact(metrics().spend) }}</span>
            <span class="text-[11px] uppercase text-on-surface-variant">{{ monthLabel() }}</span>
          </div>
        </div>
        <div class="my-6 flex flex-1 flex-col justify-center gap-5">
          @for (row of categorySplit(); track row.name) {
            <div>
              <div class="flex items-baseline justify-between pb-2 text-xs">
                <span class="font-medium text-on-surface">{{ row.name }} <span class="text-on-surface-variant/60">• {{ row.count }} txn{{ row.count === 1 ? '' : 's' }}</span></span>
                <span class="font-mono text-on-surface-variant">{{ formatPaiseCompact(row.total) }} / {{ row.pct }}%</span>
              </div>
              <div class="h-1.5 w-full overflow-hidden rounded-full bg-surface-layer-3">
                <div class="h-full rounded-full" [style.width.%]="row.pct" [style.background]="row.color"></div>
              </div>
            </div>
          }
          @if (!categorySplit().length) {
            <p class="py-8 text-center text-xs text-on-surface-variant">No spending recorded for this month.</p>
          }
        </div>
        <div class="flex items-center justify-between gap-4 rounded-2xl border border-border-subtle bg-surface-layer-2/50 p-4">
          <div class="flex items-center gap-3 text-xs text-on-surface-variant">
            <span class="material-symbols-outlined text-[18px] text-status-cyan">pie_chart</span>
            <span>Categories come straight from the SMS ledger</span>
          </div>
          <a routerLink="/budgets" class="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-on-surface">
            <span>Set budget caps</span>
            <span class="material-symbols-outlined text-[15px]">arrow_forward</span>
          </a>
        </div>
      </div>

      <!-- Ledger Sources -->
      <div class="flex flex-col justify-between rounded-3xl border border-border-subtle bg-surface-layer-1/80 p-8 shadow-2xl backdrop-blur-sm lg:col-span-5">
        <div class="flex items-start justify-between border-b border-border-subtle pb-6">
          <div>
            <h2 class="text-base font-medium text-on-surface">Ledger Sources</h2>
            <p class="mt-0.5 text-xs text-on-surface-variant">Where this ledger's rows were captured</p>
          </div>
          <span class="inline-flex items-center gap-1.5 rounded-full border border-status-emerald/20 bg-status-emerald/10 px-3 py-1 text-xs font-medium text-status-emerald">
            <span class="material-symbols-outlined text-[14px]">hub</span> {{ sources().length }} Feeds
          </span>
        </div>
        <div class="my-6 flex flex-1 flex-col gap-3">
          @for (f of sources(); track f.source) {
            <div class="flex items-center justify-between gap-4 rounded-2xl border border-border-subtle bg-surface-container p-4">
              <div class="flex min-w-0 items-center gap-3">
                <span class="material-symbols-outlined shrink-0 text-[19px] text-status-emerald">smartphone</span>
                <div class="flex min-w-0 flex-col">
                  <span class="truncate text-sm font-medium text-on-surface">{{ f.label }}</span>
                  <span class="text-[11px] text-on-surface-variant">{{ f.count }} transaction{{ f.count === 1 ? '' : 's' }} • last {{ f.lastActivity }}</span>
                </div>
              </div>
              <span class="shrink-0 rounded-full border border-status-emerald/20 bg-status-emerald/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-status-emerald">Active</span>
            </div>
          }
          @if (!sources().length) {
            <p class="py-8 text-center text-xs text-on-surface-variant">No captured transactions in the ledger yet.</p>
          }
        </div>
        <div class="flex items-center justify-between gap-4 rounded-2xl border border-border-subtle bg-surface-layer-2/50 p-4">
          <div class="flex items-center gap-3 text-xs text-on-surface-variant">
            <span class="material-symbols-outlined text-[18px] text-primary">info</span>
            <span>Balances aren't tracked yet — this page derives metrics from expense rows only</span>
          </div>
        </div>
      </div>
    </section>
  `,
})
export class VaultsComponent {
  api = inject(ApiService);
  store = inject(DataStore);

  householdLabel = computed(() => {
    const email = this.api.currentEmail() ?? '';
    const name = email.split('@')[0];
    return name ? `${name}'s Household Ledger` : 'Household Ledger';
  });

  monthLabel = computed(() =>
    new Date(this.store.currentMonth()).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
  );

  prevMonthLabel = computed(() => {
    const ms = new Date(this.store.currentMonth());
    ms.setMonth(ms.getMonth() - 1);
    return ms.toLocaleDateString(undefined, { month: 'short' });
  });

  metrics = computed(() =>
    computeDashboardMetrics(
      this.store.allExpenses(),
      this.store.allBudgets(),
      this.store.currentMonth(),
      this.store.currentMonth(),
    ),
  );

  private priorSpend = computed(() => {
    const { start } = getMonthBounds(this.store.currentMonth());
    return computeDashboardMetrics(this.store.allExpenses(), this.store.allBudgets(), start - 1, start - 1).spend;
  });

  netDelta = computed(() => {
    const prev = this.priorSpend();
    const cur = this.metrics().spend;
    if (!prev) return null;
    return Math.round(((cur - prev) / prev) * 100);
  });

  netPositive = computed(() => this.metrics().net > 0);

  netDisplay = computed(() => {
    const net = this.metrics().net; // spend − income
    if (this.metrics().income === 0 && this.metrics().spend === 0) return '—';
    return (net > 0 ? '−' : '+') + formatPaiseCompact(Math.abs(net)).replace('₹', '₹');
  });

  savingsRate = computed(() => {
    const income = this.metrics().income;
    if (!income) return null;
    return Math.max(0, 1 - this.metrics().spend / income);
  });

  savingsRatePct = computed(() => {
    const rate = this.savingsRate();
    return rate === null ? null : Math.round(rate * 100);
  });

  inflowCount = computed(() =>
    this.store.allExpenses().filter((e) => {
      const { start, end } = getMonthBounds(this.store.currentMonth());
      return e.txnAt >= start && e.txnAt < end && e.deletedAt === null && e.isIncome;
    }).length,
  );

  payees = computed(() => {
    const spend = this.metrics().spend;
    return this.metrics().topMerchants.slice(0, 5).map((m, i) => ({
      name: m.merchant,
      count: m.count,
      total: m.total,
      sharePct: spend > 0 ? Math.max(1, Math.round((m.total / spend) * 100)) : 0,
      barColor: PIECE_COLORS[i % PIECE_COLORS.length],
      iconStyle: `background: ${PIECE_COLORS[i % PIECE_COLORS.length]}22; color: ${PIECE_COLORS[i % PIECE_COLORS.length]}; --tw-ring-color: ${PIECE_COLORS[i % PIECE_COLORS.length]}44`,
      subStyle: `color: ${PIECE_COLORS[i % PIECE_COLORS.length]}`,
      top: i === 0,
    }));
  });

  categorySplit = computed(() => {
    const spend = this.metrics().spend;
    return this.metrics().byCategory.slice(0, 6).map((c) => ({
      name: c.category,
      count: c.count,
      total: c.total,
      pct: spend > 0 ? Math.max(1, Math.round((c.total / spend) * 100)) : 0,
      color: c.color,
    }));
  });

  sources = computed(() => {
    const bySource = new Map<string, { count: number; last: number }>();
    for (const e of this.store.allExpenses()) {
      if (e.deletedAt !== null) continue;
      const key = e.source || 'unknown';
      const cur = bySource.get(key) ?? { count: 0, last: 0 };
      cur.count++;
      cur.last = Math.max(cur.last, e.txnAt);
      bySource.set(key, cur);
    }
    return [...bySource.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([source, v]) => ({
        source,
        label: SOURCE_LABELS[source] ?? source,
        count: v.count,
        lastActivity: this.relTime(v.last),
      }));
  });

  relTime(ms: number): string {
    const mins = Math.max(0, Math.round((Date.now() - ms) / 60000));
    if (mins < 60) return `${mins}m ago`;
    if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
    return `${Math.round(mins / (60 * 24))}d ago`;
  }

  formatPaiseCompact = formatPaiseCompact;
  formatPaise = formatPaise;
}

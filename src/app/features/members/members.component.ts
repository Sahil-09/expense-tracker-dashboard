import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IntentsService } from '../../core/intents';
import { ApiService } from '../../core/api';
import { DataStore } from '../../core/store';
import { computeDashboardMetrics } from '../../core/analytics';
import { formatPaise, formatPaiseCompact, formatPaisePlain, formatTime, getMonthBounds, monthLabel } from '../../core/format';
import { AdminUserSummary, ExpenseRow } from '../../core/models';

const MEMBER_COLORS = ['#c0c1ff', '#A855F7', '#0EA5E9', '#ffb95f', '#4edea3'];

interface Point { x: number; y: number; }

@Component({
  selector: 'app-members',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (showSkeleton()) {
      <div class="flex flex-col gap-10 pb-16">
        <div class="flex items-end justify-between gap-8">
          <div class="flex flex-col gap-3">
            <div class="h-3.5 w-56 rounded-full bg-surface-container-high animate-pulse"></div>
            <div class="h-10 w-96 rounded-xl bg-surface-container-high animate-pulse"></div>
          </div>
          <div class="flex gap-3">
            <div class="h-11 w-40 rounded-xl bg-surface-container-high animate-pulse"></div>
            <div class="h-11 w-40 rounded-xl bg-surface-container-high animate-pulse"></div>
          </div>
        </div>
        <div class="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          @for (i of [1,2,3,4]; track i) {
            <div class="flex h-56 flex-col justify-between rounded-3xl border border-border-subtle bg-surface-layer-1 p-8">
              <div class="flex items-center gap-3"><div class="h-12 w-12 rounded-2xl bg-surface-container-high animate-pulse"></div><div class="flex flex-1 flex-col gap-2"><div class="h-3.5 w-24 rounded-full bg-surface-container-high animate-pulse"></div><div class="h-3 w-16 rounded-full bg-surface-container animate-pulse"></div></div></div>
              @for (j of [1,2]; track j) { <div class="h-6 rounded-lg bg-surface-container animate-pulse"></div> }
              <div class="h-1.5 w-full rounded-full bg-surface-layer-3 animate-pulse"></div>
            </div>
          }
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div class="lg:col-span-7 flex h-96 flex-col justify-between rounded-3xl border border-border-subtle bg-surface-layer-1 p-8">
            <div class="h-4 w-56 rounded-full bg-surface-container-high animate-pulse"></div>
            <div class="h-full w-full rounded-xl bg-surface-container animate-pulse"></div>
          </div>
          <div class="lg:col-span-5 flex h-96 flex-col items-center justify-between rounded-3xl border border-border-subtle bg-surface-layer-1 p-8">
            <div class="h-4 w-44 rounded-full bg-surface-container-high animate-pulse"></div>
            <div class="h-44 w-44 rounded-full bg-surface-container-high animate-pulse" style="border-radius:50%"></div>
            @for (i of [1,2,3,4]; track i) { <div class="flex w-full items-center justify-between"><div class="h-3 w-32 rounded-full bg-surface-container animate-pulse"></div><div class="h-3 w-16 rounded-full bg-surface-container-high animate-pulse"></div></div> }
          </div>
        </div>
      </div>
    } @else {
    <!-- Top Header & Action Row -->
    <section class="flex flex-col gap-8 pb-2 md:flex-row md:items-end md:justify-between">
      <div class="flex flex-col gap-2">
        <div class="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-on-surface-variant/70">
          <span>{{ householdLabel() }}</span>
          <span>/</span>
          <span class="font-medium text-primary">Member Deep Dive &amp; Velocity</span>
        </div>
        <h1 class="text-3xl font-light tracking-tight text-on-surface md:text-4xl">Family Member Velocity &amp; Insights</h1>
      </div>
      <div class="flex items-center gap-3">
        <button class="flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-layer-1 px-4 py-2.5 text-xs font-medium text-on-surface transition-all hover:bg-surface-layer-2" type="button"
                title="Allowance envelopes live in the full ledger service � set budgets on the Budgets page" disabled>
          <span class="material-symbols-outlined text-[17px] text-on-surface-variant">tune</span>
          <span>Adjust Allowances</span>
        </button>
        <button class="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-medium text-on-primary shadow-lg shadow-primary/10 transition-all hover:bg-primary-container" type="button" (click)="intents.openNewExpense()">
          <span class="material-symbols-outlined text-[18px]">add</span>
          <span>Log Expense</span>
        </button>
      </div>
    </section>

    <!-- Member chips (selected member drives the drill) -->
    <div class="flex flex-wrap items-center gap-2">
      <button class="flex items-center gap-2 rounded-full border px-4 py-2 text-xs transition-all" type="button"
              [class]="selectedId() === null
                ? 'border-primary/20 bg-primary/10 font-medium text-primary shadow-sm'
                : 'border-border-subtle bg-surface-layer-1 text-on-surface-variant hover:text-on-surface'"
              (click)="selectUser(null)">All Members</button>
      @for (mem of memberMeta(); track mem.id) {
        <button class="flex items-center gap-2 rounded-full border px-4 py-2 text-xs transition-all" type="button"
                [class]="selectedId() === mem.id
                  ? 'border-primary/20 bg-primary/10 font-medium text-primary shadow-sm'
                  : 'border-border-subtle bg-surface-layer-1 text-on-surface-variant hover:text-on-surface'"
                [style]="" (click)="selectUser(mem.id)">
          <span class="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold" [style]="mem.avatarStyle">{{ mem.initials }}</span>
          <span>{{ mem.name }}</span>
          @if (mem.email === api.currentEmail()) { <span class="rounded bg-primary/15 px-1.5 text-[10px] text-primary">You</span> }
        </button>
      }
    </div>

    <!-- Household Members grid -->
    <section class="flex flex-col gap-8">
      <div class="flex items-center justify-between px-1">
        <div>
          <h2 class="text-xl font-light text-on-surface">Household Members</h2>
          <p class="mt-0.5 text-xs text-on-surface-variant">Individual totals, household share, and activity</p>
        </div>
        <span class="rounded-full border border-border-subtle bg-surface-layer-1 px-3 py-1 font-mono text-xs text-on-surface-variant">{{ memberMeta().length }} Members Active</span>
      </div>
      <div class="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
        @for (mem of memberMeta(); track mem.id) {
          <button class="group flex cursor-pointer flex-col justify-between rounded-3xl border border-border-subtle bg-surface-layer-1/80 p-8 text-left shadow-xl backdrop-blur-sm transition-all duration-300 hover:-translate-y-[2px]"
                  [class]="selectedId() === mem.id ? 'border-primary/40' : 'hover:border-primary/40'"
                  type="button" (click)="selectUser(mem.id)">
            <div>
              <div class="flex items-start justify-between">
                <div class="flex items-center gap-3">
                  <div class="flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-bold ring-2" [style]="mem.avatarStyle">{{ mem.initials }}</div>
                  <div>
                    <h3 class="text-sm font-semibold text-on-surface">{{ mem.name }}</h3>
                    <p class="mt-0.5 font-mono text-[11px]" [style.color]="mem.color">{{ mem.role }} � {{ mem.sharePct }}% share</p>
                  </div>
                </div>
                <span class="h-2 w-2 rounded-full" [style.background]="mem.active ? '#10B981' : '#F59E0B'"></span>
              </div>
              <div class="mt-7">
                <div class="flex items-baseline justify-between">
                  <span class="font-mono text-2xl font-light text-on-surface" [title]="mem.spendTitle">{{ mem.monthly ? formatPaiseCompact(mem.spendPaise) : '�' }}</span>
                  <span class="font-mono text-[11px] text-on-surface-variant">{{ mem.monthly ? mem.txnCount + (mem.txnCount === 1 ? ' txn' : ' txns') : '�' }}</span>
                </div>
                <div class="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-layer-3">
                  <div class="h-full rounded-full transition-all" [style]="mem.barStyle"></div>
                </div>
              </div>
            </div>
            <div class="mt-6 flex items-center justify-between border-t border-border-subtle pt-4 text-[11px] text-on-surface-variant">
              <span class="truncate">Income {{ formatPaiseCompact(mem.incomePaise) }}</span>
              <span class="font-mono text-on-surface">{{ mem.lastActive }}</span>
            </div>
          </button>
        } @empty {
          <div class="col-span-full rounded-2xl border border-border-subtle bg-surface-layer-1/80 p-10 text-center shadow-xl">
            <p class="text-sm text-on-surface-variant">No members registered yet.</p>
          </div>
        }
      </div>
    </section>

    <!-- Velocity + peer contribution -->
    <section class="grid grid-cols-1 items-start gap-8 lg:grid-cols-12 mt-8">
      <!-- Member Burn Velocity (selected member, real daily series) -->
      <div class="flex flex-col justify-between rounded-3xl border border-border-subtle bg-surface-layer-1/80 p-8 shadow-2xl backdrop-blur-sm lg:col-span-7">
        <div class="flex items-center justify-between border-b border-border-subtle pb-6">
          <div>
            <h2 class="text-base font-medium text-on-surface">{{ selectedName() }} Burn Velocity</h2>
            <p class="mt-0.5 text-xs text-on-surface-variant">Cumulative outflow trajectory against the daily cap</p>
          </div>
          <span class="flex items-center gap-1.5 rounded-full bg-secondary/15 px-2.5 py-1 text-[11px] font-medium text-secondary"><span class="h-1.5 w-1.5 rounded-full bg-secondary"></span> {{ selectedName() }}</span>
        </div>
        <div class="relative my-6 h-72 w-full">
          <svg class="h-full w-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 600 200">
            <defs>
              <linearGradient id="memberGlow" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stop-color="#4edea3" stop-opacity="0.15"></stop>
                <stop offset="100%" stop-color="#4edea3" stop-opacity="0"></stop>
              </linearGradient>
            </defs>
            <line stroke="rgba(255,255,255,0.04)" stroke-width="1" x1="0" x2="600" y1="50" y2="50"></line>
            <line stroke="rgba(255,255,255,0.04)" stroke-width="1" x1="0" x2="600" y1="110" y2="110"></line>
            <line stroke="rgba(255,255,255,0.04)" stroke-width="1" x1="0" x2="600" y1="170" y2="170"></line>
            @if (velocityPath().length) {
              <path [attr.d]="areaPath()" fill="url(#memberGlow)"></path>
              <path [attr.d]="velocityPath()" fill="none" stroke="#4edea3" stroke-linecap="round" stroke-width="2.5"></path>
              @for (p of velocityDots(); track p.x) {
                <circle [attr.cx]="p.x" [attr.cy]="p.y" fill="#4edea3" r="3.5" stroke="#0B0F17" stroke-width="2"></circle>
              }
            }
          </svg>
        </div>
        <div class="flex items-center justify-between border-t border-border-subtle pt-4 font-mono text-xs text-on-surface-variant">
          <span>{{ firstDayLabel() }}</span>
          <span class="font-medium text-secondary">Day {{ daysElapsed() }}</span>
          <span>{{ lastDayLabel() }}</span>
        </div>
      </div>
      <!-- Peer Contribution donut -->
      <div class="flex flex-col justify-between rounded-3xl border border-border-subtle bg-surface-layer-1/80 p-8 shadow-2xl backdrop-blur-sm lg:col-span-5">
        <div class="flex items-center justify-between border-b border-border-subtle pb-6">
          <div>
            <h2 class="text-base font-medium text-on-surface">Peer Contribution &amp; Share</h2>
            <p class="mt-0.5 text-xs text-on-surface-variant">Outflow allocation across {{ formatPaiseCompact(householdSpend()) }} total burn</p>
          </div>
          <span class="font-mono text-xs text-on-surface-variant">{{ formatPaiseCompact(householdSpend()) }}</span>
        </div>
        <div class="relative my-6 flex flex-col items-center justify-center">
          <svg class="h-44 w-44 -rotate-90 transform" viewBox="0 0 100 100">
            <circle cx="50" cy="50" fill="none" r="38" stroke="#171F2E" stroke-width="9"></circle>
            @for (seg of peerDonut(); track seg.color) {
              <circle cx="50" cy="50" fill="none" r="38" [attr.stroke]="seg.color" [attr.stroke-dasharray]="seg.dash + ' 238.76'" [attr.stroke-dashoffset]="seg.offset" stroke-width="9"></circle>
            }
          </svg>
          <div class="absolute flex flex-col items-center justify-center text-center">
            <span class="font-mono text-xs uppercase text-on-surface-variant">Paced</span>
            <span class="font-mono text-xl font-light text-on-surface">{{ formatPaiseCompact(householdSpend()) }}</span>
          </div>
        </div>
        <div class="flex flex-col gap-3">
          @for (row of peerLegend(); track row.name) {
            <div class="flex items-center justify-between py-1 text-xs">
              <div class="flex items-center gap-3">
                <span class="h-2.5 w-2.5 rounded-full" [style.background]="row.color"></span>
                <span class="text-on-surface">{{ row.name }}</span>
              </div>
              <span class="font-mono text-on-surface-variant">{{ formatPaise(row.total) }} <span class="ml-1 text-on-surface/50">{{ row.pct }}%</span></span>
            </div>
          } @empty {
            <div class="py-3 text-center text-xs text-on-surface-variant">No member aggregates yet</div>
          }
        </div>
      </div>
    </section>

    <!-- Member Activity drill (rows from GET /admin/users/:id/sync view) -->
    <section class="mb-8 flex flex-col gap-8 mt-8">
      <div class="flex flex-col justify-between gap-4 px-1 sm:flex-row sm:items-center">
        <div>
          <h2 class="text-xl font-light text-on-surface">{{ selectedName() }} Activity &amp; Ledger</h2>
          <p class="mt-0.5 text-xs text-on-surface-variant">Read-only drill from GET /admin/users/:id/sync for {{ monthLabel(store.currentMonth()) }}</p>
        </div>
        <div class="flex items-center gap-2">
          <div class="flex items-center gap-1 rounded-xl border border-border-subtle bg-surface-layer-1 p-1 text-xs">
            @for (t of FILTERS; track t.value) {
              <button class="rounded-lg px-3 py-1.5 transition-colors" type="button"
                      [class]="drillType() === t.value ? 'bg-surface-layer-2 font-medium text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'"
                      (click)="setDrillType(t.value)">{{ t.label }}</button>
            }
          </div>
          <button class="flex h-9 items-center gap-1.5 rounded-xl border border-border-subtle bg-surface-layer-1 px-3 text-xs font-medium text-on-surface transition-colors hover:bg-surface-layer-2" type="button" (click)="inspectOpen.set(true)">
            <span class="material-symbols-outlined text-[16px] text-secondary">code</span>
            <span>Inspect Raw</span>
          </button>
        </div>
      </div>
      <div class="flex flex-col divide-y divide-border-subtle/40 rounded-3xl border border-border-subtle bg-surface-layer-1/80 p-3 shadow-2xl backdrop-blur-sm sm:p-6">
        @for (t of pagedDrillRows(); track t.clientId) {
          <div class="flex items-center justify-between gap-8 rounded-2xl px-2 py-4 transition-colors duration-300 hover:bg-surface-layer-2/50 sm:px-6">
            <div class="flex min-w-0 items-center gap-4">
              <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border-subtle bg-surface-layer-2 shadow-sm" [style.color]="categoryColor(t.category)">
                <span class="material-symbols-outlined text-[20px]">{{ t.isIncome ? 'payments' : 'shopping_bag' }}</span>
              </div>
              <div class="flex min-w-0 flex-col">
                <span class="truncate text-[15px] font-medium tracking-tight text-on-surface">{{ t.merchant || 'Unknown' }}</span>
                <span class="mt-0.5 flex items-center gap-2 text-xs text-on-surface-variant/80">
                  <span>{{ t.category }}</span>
                  <span class="text-border-strong">�</span>
                  <span class="text-on-surface-variant/70">{{ t.source }}</span>
                </span>
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-8">
              <div class="text-right">
                <span class="font-mono text-base font-semibold [font-feature-settings:'tnum']" [class]="t.isIncome ? 'text-secondary' : 'text-on-surface'">{{ t.isIncome ? '+' : '-' }} {{ formatPaise(t.amountPaise) }}</span>
                <span class="mt-0.5 block font-mono text-xs text-on-surface-variant/70">{{ fmtDate(t.txnAt) }}, {{ formatTime(t.txnAt) }}</span>
              </div>
              <span class="h-2 w-2 rounded-full" title="Auto Synced"></span>
            </div>
          </div>
        } @empty {
          <div class="py-10 text-center text-sm text-on-surface-variant">No ledger entries for {{ monthLabel(store.currentMonth()) }} � nothing came in from the phone's ingest.</div>
        }
      </div>
      <!-- Pagination -->
      <div class="flex items-center justify-between px-2 text-xs text-on-surface-variant">
        <span class="font-mono">Page {{ safeDrillPage() }} of {{ drillPageCount() }} � {{ drillRows().length }} entries</span>
        <div class="flex items-center gap-1">
          <button type="button" aria-label="Previous page" class="rounded p-1 transition-colors hover:bg-surface-layer-2 hover:text-on-surface disabled:opacity-40"
                  [disabled]="safeDrillPage() <= 1" (click)="setDrillPage(safeDrillPage() - 1)">
            <span class="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>
          @for (p of drillPages(); track p) {
            <button type="button" class="flex h-7 w-7 items-center justify-center rounded-lg font-mono transition-colors"
                    [class]="p === safeDrillPage() ? 'bg-primary font-semibold text-on-primary' : 'text-on-surface-variant hover:bg-surface-layer-2 hover:text-on-surface'"
                    (click)="setDrillPage(p)">{{ p }}</button>
          }
          <button type="button" aria-label="Next page" class="rounded p-1 transition-colors hover:bg-surface-layer-2 hover:text-on-surface disabled:opacity-40"
                  [disabled]="safeDrillPage() >= drillPageCount()" (click)="setDrillPage(safeDrillPage() + 1)">
            <span class="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        </div>
      </div>
    </section>
    }

    @if (inspectOpen()) {
      <!-- Inspect Raw: the underlying SMS behind the current page of rows -->
      <div class="fixed inset-0 z-[60] flex items-center justify-center bg-surface-canvas/80 p-4 backdrop-blur-sm" (click)="inspectOpen.set(false)">
        <div class="max-h-[70vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-border-subtle bg-surface-layer-1 p-6 shadow-2xl" (click)="$event.stopPropagation()">
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-base font-medium text-on-surface">Raw SMS � {{ selectedEmail() }}</h3>
            <button type="button" aria-label="Close" class="rounded-full p-1 text-on-surface-variant hover:bg-surface-layer-2 hover:text-on-surface" (click)="inspectOpen.set(false)">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <div class="flex flex-col gap-2">
            @for (t of pagedDrillRows(); track t.clientId) {
              <div class="rounded-2xl border border-border-subtle bg-surface-layer-2 p-4">
                <div class="mb-1 font-mono text-[11px] text-on-surface-variant">{{ t.merchant || 'Unknown' }} � {{ fmtDate(t.txnAt) }}</div>
                <pre class="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-on-surface-variant">{{ t.rawSms || '(no raw message)' }}</pre>
              </div>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class MembersComponent {
  FILTERS: { value: 'all' | 'expenses' | 'income'; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'expenses', label: 'Expenses' },
    { value: 'income', label: 'Income' },
  ];

  intents = inject(IntentsService);
  api = inject(ApiService);
  store = inject(DataStore);

  inspectOpen = signal(false);
  drillType = signal<'all' | 'expenses' | 'income'>('all');
  drillPage = signal(1);
  readonly DRILL_PAGE_SIZE = 12;

  users = computed(() => this.api.availableUsersList());
  /** Which member's ledger the velocity chart and drill show. A local selection �
   *  switching members reads the already-pulled ledgers and must not re-sync the store. */
  private selectedUserId = signal<string | null>(null);
  selectedId = computed(() => this.selectedUserId());
  selectedName = computed(() => {
    const u = this.users().find((x) => x.id === this.selectedId());
    return u ? this.capName(u.email) : 'Household';
  });
  selectedEmail = computed(() => {
    const u = this.users().find((x) => x.id === this.selectedId());
    return u?.email ?? this.api.currentEmail();
  });

  totalsById = computed(() => {
    // Month-scoped per-member ledger totals only; null until a member's rows arrive.
    return new Map(this.users().map((u) => {
      const m = this.store.monthlyForUser(u.id);
      return [u.id, { spend: m?.spend ?? 0, income: m?.income ?? 0, count: m?.count ?? 0, monthly: m !== null }] as const;
    }));
  });

  memberMeta = computed(() => {
    const list = this.users();
    const totals = this.totalsById();
    const spendOf = (u: AdminUserSummary) => totals.get(u.id)!.spend;
    const total = list.reduce((s, u) => s + spendOf(u), 0);
    return list.map((u, i) => {
      const t = totals.get(u.id)!;
      const color = MEMBER_COLORS[i % MEMBER_COLORS.length];
      const name = this.capName(u.email);
      const sharePct = total > 0 ? Math.round((spendOf(u) / total) * 100) : 0;
      const idleDays = u.lastSeenAt ? (Date.now() - new Date(u.lastSeenAt).getTime()) / 86400000 : 99;
      return {
        id: u.id,
        email: u.email,
        name,
        initials: name.slice(0, 2).toUpperCase(),
        color,
        role: u.email === this.api.currentEmail() ? 'You' : 'Member',
        sharePct,
        spendPaise: t.spend,
        incomePaise: t.income,
        txnCount: t.count,
        monthly: t.monthly,
        spendTitle: t.monthly ? `${formatPaise(t.spend)} this month` : 'syncing member ledger�',
        lastActive: u.lastSeenAt ? this.relTime(u.lastSeenAt) : '�',
        active: idleDays < 3,
        avatarStyle: `background: ${color}22; color: ${color}; --tw-ring-color: ${color}44`,
        barStyle: `width: ${sharePct}%; background: ${color}`,
      };
    });
  });

  householdSpend = computed(() => {
    const totals = this.totalsById();
    return this.users().reduce((s, u) => s + totals.get(u.id)!.spend, 0);
  });

  peerDonut = computed(() => {
    const totals = this.totalsById();
    const list = this.users().filter((u) => (totals.get(u.id)?.spend ?? 0) > 0).slice(0, 5);
    const total = list.reduce((s, u) => s + totals.get(u.id)!.spend, 0);
    if (!total) return [];
    let offset = 0;
    const circ = 238.76;
    return list.map((u, i) => {
      const dash = (totals.get(u.id)!.spend / total) * circ;
      const seg = { dash, offset: -offset, color: MEMBER_COLORS[i % MEMBER_COLORS.length] };
      offset += dash;
      return seg;
    });
  });
  peerLegend = computed(() => {
    const totals = this.totalsById();
    const list = this.users().filter((u) => (totals.get(u.id)?.spend ?? 0) > 0).slice(0, 5);
    const total = this.householdSpend() || 1;
    return list.map((u, i) => ({
      name: `${this.capName(u.email)}${u.email === this.api.currentEmail() ? ' (You)' : ''}`,
      total: totals.get(u.id)!.spend,
      pct: Math.round((totals.get(u.id)!.spend / total) * 100),
      color: MEMBER_COLORS[i % MEMBER_COLORS.length],
    }));
  });

  // ---- Velocity chart for the selected member (or household in overview) ----
  private scopedMetrics = computed(() =>
    computeDashboardMetrics(this.scopedRows(), this.store.allBudgets(), this.store.currentMonth(), this.store.currentMonth()),
  );
  private velMax = computed(() => {
    const daily = this.scopedMetrics().daily;
    let cumulative = 0;
    let maxC = 0;
    for (const d of daily) {
      cumulative += d.total;
      maxC = Math.max(maxC, cumulative);
    }
    const cap = this.scopedMetrics().budgetTotal;
    return Math.max(1, maxC, cap) * 1.1;
  });
  private velPoints = computed<Point[]>(() => {
    const daily = this.scopedMetrics().daily;
    if (!daily.length) return [];
    const max = this.velMax();
    let cumulative = 0;
    return daily.map((d, i) => {
      cumulative += d.total;
      return { x: (i / Math.max(1, daily.length - 1)) * 600, y: 200 - (cumulative / max) * 185 };
    });
  });
  velocityPath = computed(() => smoothPath(this.velPoints()));
  areaPath = computed(() => (this.velPoints().length ? `${this.velocityPath()} L 600,200 L 0,200 Z` : ''));
  velocityDots = computed(() => {
    const pts = this.velPoints();
    if (pts.length < 2) return [];
    return [pts[Math.floor(pts.length / 2)], pts[pts.length - 2], pts[pts.length - 1]].filter(Boolean);
  });

  // ---- Drill rows: the selected member's month, from the cached ledger ----
  drillRows = computed<ExpenseRow[]>(() => {
    const type = this.drillType();
    const { start, end } = getMonthBounds(this.store.currentMonth());
    let rows = this.scopedRows().filter((r) => r.txnAt >= start && r.txnAt < end && r.deletedAt === null);
    if (type === 'expenses') rows = rows.filter((r) => r.isExpense && !r.isIncome);
    else if (type === 'income') rows = rows.filter((r) => r.isIncome);
    return rows.sort((a, b) => b.txnAt - a.txnAt);
  });
  drillPageCount = computed(() => Math.max(1, Math.ceil(this.drillRows().length / this.DRILL_PAGE_SIZE)));
  safeDrillPage = computed(() => Math.min(this.drillPage(), this.drillPageCount()));
  pagedDrillRows = computed(() => {
    const page = this.safeDrillPage();
    return this.drillRows().slice((page - 1) * this.DRILL_PAGE_SIZE, page * this.DRILL_PAGE_SIZE);
  });
  drillPages = computed(() => {
    const count = this.drillPageCount();
    const start = Math.max(1, Math.min(this.safeDrillPage() - 3, count - 6));
    return Array.from({ length: Math.min(7, count) }, (_, i) => start + i);
  });

  setDrillType(value: 'all' | 'expenses' | 'income'): void {
    this.drillType.set(value);
    this.drillPage.set(1);
  }

  setDrillPage(page: number): void {
    this.drillPage.set(Math.min(Math.max(1, page), this.drillPageCount()));
  }

  selectUser(userId: string | null): void {
    this.selectedUserId.set(userId);
    this.drillPage.set(1);
  }

  /** The selected member's ledger; in "All Members" mode, every member's merged. */
  scopedRows = computed<ExpenseRow[]>(() => {
    const ledgers = this.store.memberLedgers();
    const id = this.selectedId();
    if (id) return ledgers.get(id) ?? [];
    if (ledgers.size) return [...ledgers.values()].flat();
    return this.store.allExpenses();
  });

  showSkeleton = computed(() => this.store.isLoading() || this.store.lastSyncTime() === null);

  categoryColor(category: string): string {
    return MEMBER_COLORS[Math.abs(hash(category)) % MEMBER_COLORS.length];
  }

  householdLabel = computed(() => {
    const email = this.api.currentEmail() ?? '';
    const name = email.split('@')[0];
    return name ? `${name}'s Household Ledger` : 'Household Ledger';
  });

  daysInMonth = computed(() => Math.ceil((getMonthBounds(this.store.currentMonth()).end - getMonthBounds(this.store.currentMonth()).start) / 86400000));
  daysElapsed = computed(() => {
    const { start, end } = getMonthBounds(this.store.currentMonth());
    const now = Date.now();
    if (now < start) return 0;
    if (now >= end) return this.daysInMonth();
    return Math.min(this.daysInMonth(), Math.max(1, Math.ceil((now - start) / 86400000)));
  });
  firstDayLabel = computed(() => new Date(getMonthBounds(this.store.currentMonth()).start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));
  lastDayLabel = computed(() => new Date(getMonthBounds(this.store.currentMonth()).end - 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));

  relTime(iso: string): string {
    const then = new Date(iso).getTime();
    const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
    if (mins < 60) return `${mins} m ago`;
    if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
    return `${Math.round(mins / (60 * 24))} d ago`;
  }

  constNameFix(): void {}

  formatPaise = formatPaise;
  formatPaiseCompact = formatPaiseCompact;
  formatPaisePlain = formatPaisePlain;
  formatTime = formatTime;
  monthLabel = monthLabel;

  fmtDate(ms: number): string {
    return new Date(ms).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  capName(email: string): string {
    const name = email.split('@')[0].replace(/[._]/g, ' ');
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function smoothPath(pts: Point[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
  let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)},${c2x.toFixed(1)},${c2y.toFixed(1)},${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

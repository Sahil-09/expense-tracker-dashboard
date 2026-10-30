import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api';
import { DataStore } from '../../core/store';
import { computeDashboardMetrics } from '../../core/analytics';
import { formatPaise, formatPaiseCompact, getMonthBounds } from '../../core/format';
import { BudgetRow, BudgetStatus } from '../../core/models';

const CAT_ICONS: { test: RegExp; icon: string }[] = [
  { test: /grocer|fresh|market|zepto|instamart/i, icon: 'shopping_cart' },
  { test: /food|drink|swiggy|dine/i, icon: 'restaurant' },
  { test: /rent|housing|home/i, icon: 'apartment' },
  { test: /transport|uber|fuel|travel|commute/i, icon: 'local_gas_station' },
  { test: /shop|amazon|mall/i, icon: 'checkroom' },
  { test: /education|tuition|school|book/i, icon: 'school' },
  { test: /health|medic/i, icon: 'health_and_safety' },
  { test: /bill|recharge|internet|electric|util/i, icon: 'receipt' },
];

interface Island {
  category: string;
  icon: string;
  spent: number;
  budget: number;
  pct: number; // uncapped
  status: 'OVER' | 'WARNING' | 'ON TRACK' | 'UNTOUCHED';
  statusClass: string;
  accentClass: string;
  sub: string;
  subStyle: string;
  iconClass: string;
  barStyle: string;
  remaining: number;
  remainingLabel: string;
  paceLabel: string;
  paceClass: string;
  count: number;
}

@Component({
  selector: 'app-budgets',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    @if (showSkeleton()) {
      <div class="flex flex-col gap-10 pb-16">
        <div class="flex items-end justify-between gap-8">
          <div class="flex flex-col gap-3">
            <div class="h-3.5 w-52 rounded-full bg-surface-container-high animate-pulse"></div>
            <div class="h-10 w-96 rounded-xl bg-surface-container-high animate-pulse"></div>
          </div>
          <div class="h-11 w-44 rounded-xl bg-surface-container-high animate-pulse"></div>
        </div>
        <div class="grid grid-cols-1 gap-8 sm:grid-cols-2 xl:grid-cols-4">
          @for (i of [1,2,3,4]; track i) { <div class="flex h-44 flex-col justify-between rounded-3xl border border-border-subtle bg-surface-layer-1 p-8"> @for (j of [1,2,3]; track j) { <div class="h-8 bg-surface-container-high animate-pulse" style="border-radius:0.5rem"></div> } </div> }
        </div>
        <div class="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          @for (i of [1,2,3,4,5,6]; track i) {
            <div class="flex h-56 flex-col justify-between rounded-2xl border border-border-subtle bg-surface-layer-1 p-6">
              <div class="flex items-center gap-3"><div class="h-11 w-11 rounded-2xl bg-surface-container-high animate-pulse"></div><div class="flex flex-1 flex-col gap-2"><div class="h-3.5 w-28 rounded-full bg-surface-container-high animate-pulse"></div><div class="h-3 w-20 rounded-full bg-surface-container animate-pulse"></div></div></div>
              @for (j of [1,2]; track j) { <div class="h-6 bg-surface-container animate-pulse"></div> }
              <div class="h-1.5 w-full rounded-full bg-surface-layer-3 animate-pulse"></div>
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
          <span class="font-medium text-primary">Planning &amp; Thresholds</span>
        </div>
        <h1 class="text-3xl font-light tracking-tight text-on-surface md:text-4xl">Household Budgets &amp; Limits</h1>
        <p class="max-w-2xl text-xs text-on-surface-variant">Monthly spending caps, category rollover rules, and pacing thresholds for {{ monthLabel() }}.</p>
      </div>
      <div class="flex items-center gap-3">
        <a class="flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-layer-1/80 px-4 py-2.5 text-xs font-medium text-on-surface transition-all hover:bg-surface-layer-2" routerLink="/settings">
          <span class="material-symbols-outlined text-[17px] text-on-surface-variant">history</span>
          <span>Sync &amp; Account</span>
        </a>
        <button class="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-medium text-on-primary shadow-lg shadow-primary/10 transition-all hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-50" type="button"
                title="{{ viewingOther() ? 'Viewing another user — switch back to your account first' : 'Add a budget through the sync channel' }}"
                [disabled]="viewingOther()"
                (click)="openAdd()">
          <span class="material-symbols-outlined text-[18px]">add</span>
          <span>Create New Budget Pool</span>
        </button>
      </div>
    </section>

    <!-- Key metric islands -->
    <div class="grid grid-cols-1 gap-8 sm:grid-cols-2 xl:grid-cols-4">
      <!-- Card 1: Total Envelope -->
      <div class="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-border-subtle bg-surface-layer-1/80 p-8 shadow-xl backdrop-blur-sm transition-all duration-300 hover:border-border-strong">
        <div class="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-full bg-primary/10 blur-2xl"></div>
        <div class="relative z-10 flex items-center justify-between">
          <span class="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">Total Envelope</span>
          <div class="flex h-7 w-7 items-center justify-center rounded-xl bg-surface-layer-2 text-primary">
            <span class="material-symbols-outlined text-[16px]">pie_chart</span>
          </div>
        </div>
        <div class="relative z-10 my-4 flex flex-col gap-1">
          <div class="flex items-baseline gap-2">
            <span class="text-3xl font-light tracking-tight text-on-surface [font-feature-settings:'tnum'] md:text-4xl">{{ formatPaiseCompact(overallBudget()) }}</span>
          </div>
          <div class="mt-1 flex items-center justify-between font-mono text-xs text-on-surface-variant">
            <span>{{ formatPaiseCompact(overallSpent()) }} consumed</span>
            <span [class]="overallOver() ? 'font-medium text-status-crimson' : 'font-medium text-tertiary'">{{ overallPct().toFixed(1) }}%</span>
          </div>
          <div class="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-layer-3">
            <div class="h-full rounded-full bg-primary transition-all duration-500" [style.width.%]="min100(overallPct())"></div>
          </div>
        </div>
        <div class="relative z-10 flex items-center justify-between border-t border-border-subtle pt-3 font-mono text-[11px] text-on-surface-variant">
          <span>Cap: {{ formatPaiseCompact(overallBudget()) }}</span>
          <span [class]="overallRemaining() >= 0 ? 'text-secondary' : 'text-status-crimson'">{{ formatPaiseCompact(overallRemaining()) }} headroom</span>
        </div>
      </div>

      <!-- Card 2: Projected Month-End -->
      <div class="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-border-subtle bg-surface-layer-1/80 p-8 shadow-xl backdrop-blur-sm transition-all duration-300 hover:border-border-strong">
        <div class="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-full bg-secondary/10 blur-2xl"></div>
        <div class="relative z-10 flex items-center justify-between">
          <span class="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">Projected Month-End</span>
          <div class="flex h-7 w-7 items-center justify-center rounded-xl bg-surface-layer-2 text-secondary">
            <span class="material-symbols-outlined text-[16px]">trending_up</span>
          </div>
        </div>
        <div class="relative z-10 my-4 flex flex-col gap-1">
          <div class="flex items-baseline gap-2">
            <span class="text-3xl font-light tracking-tight text-on-surface [font-feature-settings:'tnum'] md:text-4xl">{{ formatPaiseCompact(projected()) }}</span>
          </div>
          <div class="mt-1 flex items-center gap-2">
            <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-medium" [class]="overCeiling() ? 'bg-status-crimson/15 text-status-crimson' : 'bg-secondary/15 text-secondary'">
              <span class="h-1.5 w-1.5 rounded-full" [class]="overCeiling() ? 'bg-status-crimson' : 'bg-secondary'"></span>{{ overCeiling() ? 'Over Budget' : 'Safe Headroom' }}
            </span>
            <span class="font-mono text-xs text-on-surface-variant [font-feature-settings:'tnum']">{{ projectedVsCapLabel() }}</span>
          </div>
        </div>
        <div class="relative z-10 flex items-center justify-between border-t border-border-subtle pt-3 text-[11px] text-on-surface-variant">
          <span>Burn pace</span>
          <span [class]="overCeiling() ? 'font-mono font-medium text-status-crimson' : 'font-mono font-medium text-status-emerald'">{{ overCeiling() ? 'Over Ceiling' : 'Under Ceiling' }}</span>
        </div>
      </div>

      <!-- Card 3: Highest Velocity Burn -->
      <div class="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-border-subtle bg-surface-layer-1/80 p-8 shadow-xl backdrop-blur-sm transition-all duration-300 hover:border-border-strong">
        <div class="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-full bg-tertiary/10 blur-2xl"></div>
        <div class="relative z-10 flex items-center justify-between">
          <span class="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">Highest Velocity Burn</span>
          <div class="flex h-7 w-7 items-center justify-center rounded-xl bg-surface-layer-2 text-tertiary">
            <span class="material-symbols-outlined text-[16px]">speed</span>
          </div>
        </div>
        <div class="relative z-10 my-4 flex flex-col gap-1">
          <h3 class="truncate text-2xl font-light text-on-surface">{{ topBurn()?.category ?? '—' }}</h3>
          <div class="mt-1 flex items-center justify-between">
            <span class="font-mono text-xs text-on-surface-variant">{{ topBurn() ? formatPaiseCompact(topBurn()!.spent) + ' of ' + formatPaiseCompact(topBurn()!.budget) : 'No budgets set' }}</span>
            @if (topBurn()) {
              <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] font-medium" [class]="topBurn()!.pct >= 100 ? 'bg-status-crimson/15 text-status-crimson' : 'bg-tertiary/20 text-tertiary'">{{ Math.round(topBurn()!.pct) }}% Burned</span>
            }
          </div>
        </div>
        <div class="relative z-10 flex items-center justify-between border-t border-border-subtle pt-3 font-mono text-[11px] text-on-surface-variant">
          <span>Daily burn: {{ topBurn() ? formatPaise(avgDailyBurn(topBurn())) : '—' }}</span>
          <span [class]="topBurn()?.pct >= 100 ? 'font-medium text-status-crimson' : 'font-medium text-tertiary'">{{ !topBurn() ? 'Idle' : topBurn()!.pct >= 100 ? 'Over Cap' : 'Near Cap' }}</span>
        </div>
      </div>

      <!-- Card 4: Rollover Reserve (previous month's unspent envelopes) -->
      <div class="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-border-subtle bg-surface-layer-1/80 p-8 shadow-xl backdrop-blur-sm transition-all duration-300 hover:border-border-strong">
        <div class="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-full bg-primary/10 blur-2xl"></div>
        <div class="relative z-10 flex items-center justify-between">
          <span class="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">Rollover Reserve</span>
          <div class="flex h-7 w-7 items-center justify-center rounded-xl bg-surface-layer-2 text-primary">
            <span class="material-symbols-outlined text-[16px]">savings</span>
          </div>
        </div>
        <div class="relative z-10 my-4 flex flex-col gap-1">
          <div class="flex items-baseline gap-2">
            <span class="text-3xl font-light tracking-tight text-on-surface [font-feature-settings:'tnum'] md:text-4xl">{{ formatPaiseCompact(rolloverReserve()) }}</span>
          </div>
          <div class="mt-1 flex items-center gap-1.5 text-xs text-on-surface-variant">
            <span class="material-symbols-outlined text-[15px]" [class]="rolloverReserve() > 0 ? 'text-secondary' : 'text-on-surface-variant'">{{ rolloverReserve() > 0 ? 'verified' : 'info' }}</span>
            <span class="font-mono">{{ rolloverReserve() > 0 ? 'Carried from' : 'Nothing left from' }} {{ prevMonthLabel() }}</span>
          </div>
        </div>
        <div class="relative z-10 flex items-center justify-between border-t border-border-subtle pt-3 text-[11px] text-on-surface-variant">
          <span>Auto Sweep</span>
          <span class="font-mono font-medium text-secondary">Active {{ nextMonthDay() }}</span>
        </div>
      </div>
    </div>

    <!-- Category Allocation Islands -->
    <section class="flex flex-col gap-8 mt-8">
      <div class="flex items-center justify-between px-1">
        <div>
          <h2 class="text-xl font-light text-on-surface">Category Allocation Islands</h2>
          <p class="mt-0.5 text-xs text-on-surface-variant">{{ islands().length }} Defined Envelopes Active • Real-time Burn Velocity</p>
        </div>
        <div class="flex items-center gap-2 font-mono text-xs text-on-surface-variant">
          <span>SORT BY:</span>
          <button class="rounded-xl border border-border-subtle bg-surface-layer-1 px-3 py-1 font-medium text-on-surface transition-all hover:bg-surface-layer-2" type="button" (click)="cycleSort()">{{ sortLabel() }}</button>
        </div>
      </div>
      <div class="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
        @for (isl of islands(); track isl.category) {
          <div class="group flex flex-col justify-between rounded-2xl border border-border-subtle bg-surface-layer-1/80 p-6 shadow-xl backdrop-blur-sm transition-all duration-300 hover:-translate-y-[2px]" [style]="isl.accentClass">
            <div>
              <div class="flex items-start justify-between">
                <div class="flex items-center gap-3">
                  <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-2" [style]="isl.iconClass">
                    <span class="material-symbols-outlined text-[20px]">{{ isl.icon }}</span>
                  </div>
                  <div>
                    <h3 class="text-sm font-semibold text-on-surface">{{ isl.category }}</h3>
                    <p class="mt-0.5 font-mono text-[11px]" [style]="isl.subStyle">{{ isl.sub }}</p>
                  </div>
                </div>
                <span class="rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold" [style]="isl.statusClass">{{ isl.status }}</span>
              </div>
              <div class="mt-7">
                <div class="flex items-baseline justify-between">
                  <span class="font-mono text-2xl font-light text-on-surface [font-feature-settings:'tnum']">{{ formatPaiseCompact(isl.spent) }}</span>
                  <span class="font-mono text-[11px] text-on-surface-variant">of {{ formatPaiseCompact(isl.budget) }}</span>
                </div>
                <div class="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-layer-3">
                  <div class="h-full rounded-full transition-all duration-500" [style]="isl.barStyle"></div>
                </div>
              </div>
            </div>
            <div class="mt-6 flex items-center justify-between border-t border-border-subtle pt-4 text-[11px] text-on-surface-variant">
              <span class="flex items-center gap-1.5 font-mono" [style]="isl.paceClass">
                <span class="material-symbols-outlined text-[14px]">{{ isl.pct >= 100 ? 'warning' : 'verified' }}</span>{{ isl.paceLabel }}
              </span>
              <span class="font-mono font-medium" [class]="isl.remaining >= 0 ? 'text-on-surface' : 'text-status-crimson'">{{ isl.remainingLabel }}</span>
            </div>
          </div>
        } @empty {
          <div class="col-span-full rounded-2xl border border-border-subtle bg-surface-layer-1/80 p-10 text-center shadow-xl">
            <p class="text-sm text-on-surface-variant">No budget pools defined yet for {{ monthLabel() }}.</p>
            <p class="mt-1 text-xs text-on-surface-variant/70">Create one to start pacing this cycle.</p>
          </div>
        }
      </div>
    </section>

    <!-- Daily burn + guardrails -->
    <div class="grid grid-cols-1 gap-8 lg:grid-cols-2 mt-8">
      <!-- Daily Burn & Safe Spending Ceiling -->
      <div class="flex flex-col justify-between rounded-3xl border border-border-subtle bg-surface-layer-1/80 p-8 shadow-2xl backdrop-blur-sm">
        <div class="flex flex-col gap-8">
          <div class="flex items-start justify-between border-b border-border-subtle pb-6">
            <div>
              <h2 class="text-base font-medium text-on-surface">Daily Burn &amp; Safe Spending Ceiling</h2>
              <p class="mt-0.5 text-xs text-on-surface-variant">Daily pacing across {{ daysInMonth() }}-day cycle (Day {{ daysElapsed() }} of {{ daysInMonth() }})</p>
            </div>
            <div class="flex flex-col items-end text-right">
              <span class="font-mono text-lg font-light text-secondary [font-feature-settings:'tnum']">{{ formatPaise(burnCap()) }}</span>
              <span class="text-[11px] uppercase text-on-surface-variant">Target Daily Cap</span>
            </div>
          </div>
          <div class="flex flex-col gap-4 rounded-2xl border border-border-subtle bg-surface-container-lowest/80 p-5">
            <div class="flex items-center justify-between text-xs">
              <div class="flex items-center gap-4">
                <span class="flex items-center gap-1.5 text-primary"><span class="h-2 w-2 rounded-full bg-primary"></span>Actual Daily Burn</span>
                <span class="flex items-center gap-1.5 text-outline"><span class="h-0.5 w-2 bg-outline"></span>Ceiling Target</span>
              </div>
              <span class="font-medium text-secondary">AVERAGE: {{ formatPaise(avgBurn()) }} / DAY</span>
            </div>
            <div class="flex h-28 w-full items-end justify-between gap-1 pt-0">
              @for (b of burnBars(); track $index) {
                <div class="w-full rounded-t transition-all" [style]="b.style"></div>
              }
            </div>
            <div class="flex items-center justify-between pt-1 text-xs text-on-surface-variant">
              <span>{{ firstDayLabel() }}</span>
              <span class="font-medium text-secondary">Today: Day {{ daysElapsed() }}</span>
              <span>{{ lastDayLabel() }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Smart Rules & Guardrails -->
      <div class="flex flex-col justify-between rounded-3xl border border-border-subtle bg-surface-layer-1/80 p-8 shadow-2xl backdrop-blur-sm">
        <div class="flex flex-col gap-8">
          <div class="flex items-start justify-between border-b border-border-subtle pb-6">
            <div>
              <h2 class="text-base font-medium text-on-surface">Smart Rules &amp; Guardrails</h2>
              <p class="mt-0.5 text-xs text-on-surface-variant">Automated ledger governance protocols for {{ monthLabel() }}</p>
            </div>
            <span class="flex items-center gap-1.5 rounded-full bg-secondary/15 px-2.5 py-1 text-xs font-medium text-secondary"><span class="h-1.5 w-1.5 rounded-full bg-secondary"></span>{{ rules().length }} Armed</span>
          </div>
          <div class="flex flex-col gap-3">
            @for (r of rules(); track r.title) {
              <div class="flex items-center justify-between gap-4 rounded-2xl border border-border-subtle bg-surface-container p-3.5 transition-all hover:bg-surface-container-high">
                <div class="flex items-center gap-3">
                  <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-layer-3" [style]="r.iconClass">
                    <span class="material-symbols-outlined text-[18px]">{{ r.icon }}</span>
                  </div>
                  <div class="flex flex-col">
                    <span class="text-sm font-medium leading-tight text-on-surface">{{ r.title }}</span>
                    <span class="text-xs text-on-surface-variant">{{ r.desc }}</span>
                  </div>
                </div>
                <label class="relative inline-flex cursor-pointer items-center" [title]="viewingOther() ? 'Viewing another user — rules are read-only' : 'Toggle rule'">
                  <input class="sr-only peer" type="checkbox" [ngModel]="r.armed" (ngModelChange)="toggleRule(r.title)">
                  <div class="relative h-5 w-9 bg-surface-layer-3 transition-colors peer-checked:bg-secondary cursor-pointer rounded-full">
                    <div class="absolute left-[2px] top-[2px] h-4 w-4 rounded-full transition-all" [style.transform]="r.armed ? 'translateX(16px)' : 'translateX(0)'" [style.background]="r.armed ? '#002113' : '#dfe2ee'"></div>
                  </div>
                </label>
              </div>
            }
          </div>
        </div>
        <div class="mt-6 flex items-center justify-between border-t border-border-subtle pt-4 text-xs text-on-surface-variant">
          <span>RULES GOVERN ALL CARDS IN THIS HOUSEHOLD</span>
          <span class="font-mono uppercase text-on-surface-variant/60">Design preview — rules run in the full ledger service</span>
        </div>
      </div>
    </div>

    <!-- Excluded merchants (real feature kept from the app) -->
    @if (exclusions().length) {
      <section class="flex flex-col gap-8 mt-8">
        <div class="flex items-center justify-between px-1">
          <div>
            <h2 class="text-xl font-light text-on-surface">Excluded Merchants</h2>
            <p class="mt-0.5 text-xs text-on-surface-variant">Marked not-an-expense by the phone app — removing one re-includes it everywhere.</p>
          </div>
          <span class="rounded-full border border-border-subtle bg-surface-layer-1 px-3 py-1 font-mono text-xs text-on-surface-variant">{{ exclusions().length }} excluded</span>
        </div>
        <div class="flex flex-col divide-y divide-border-subtle/40 rounded-3xl border border-border-subtle bg-surface-layer-1/80 p-4 shadow-xl sm:p-6">
          @for (ex of exclusions(); track ex.merchant) {
            <div class="flex items-center justify-between gap-4 rounded-2xl px-2 py-3.5 sm:px-4">
              <div class="flex items-center gap-3">
                <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-layer-2 text-status-crimson">
                  <span class="material-symbols-outlined text-[18px]">block</span>
                </div>
                <span class="text-sm font-medium text-on-surface">{{ ex.merchant }}</span>
              </div>
              <button type="button" class="flex h-8 items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-layer-2 px-3 text-[11px] text-status-crimson transition-colors hover:bg-status-crimson/10 disabled:opacity-40"
                      [disabled]="saving() || viewingOther()" (click)="removeExclusion(ex.merchant)">
                <span class="material-symbols-outlined text-[14px]">delete</span>
                <span>Remove</span>
              </button>
            </div>
          }
        </div>
      </section>
    }
}

    <!-- Create New Budget Pool dialog -->
    @if (addOpen()) {
      <div class="fixed inset-0 z-[60] flex items-center justify-center bg-surface-canvas/80 p-4 backdrop-blur-sm" (click)="addOpen.set(false)">
        <div class="w-full max-w-md rounded-3xl border border-border-subtle bg-surface-layer-1 p-6 shadow-2xl" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-medium text-on-surface">Create New Budget Pool</h3>
            <button type="button" class="rounded-full p-1 text-on-surface-variant hover:bg-surface-layer-2 hover:text-on-surface" (click)="addOpen.set(false)">
              <span class="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
          <p class="mt-1 text-xs text-on-surface-variant">Saved through the sync channel — the phone picks it up on its next pull.</p>
          <div class="mt-5 flex flex-col gap-3">
            <input list="budget-cats" type="text" placeholder="Category" aria-label="Category"
                   class="h-11 w-full rounded-xl border border-border-subtle bg-surface-layer-2 px-4 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                   [(ngModel)]="newCategory" />
            <datalist id="budget-cats">
              @for (c of knownCategories(); track c) {
                <option [value]="c"></option>
              }
            </datalist>
            <input type="number" min="1" placeholder="Monthly limit (₹)" aria-label="Monthly limit in rupees"
                   class="h-11 w-full rounded-xl border border-border-subtle bg-surface-layer-2 px-4 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                   [(ngModel)]="newAmount" />
          </div>
          <div class="mt-6 flex justify-end gap-2">
            <button type="button" class="flex h-10 items-center rounded-xl border border-border-subtle bg-surface-layer-2 px-4 text-xs font-medium text-on-surface hover:bg-surface-layer-3"
                    (click)="addOpen.set(false)">Cancel</button>
            <button type="button" class="flex h-10 items-center rounded-xl bg-primary px-5 text-xs font-medium text-on-primary shadow-lg shadow-primary/10 transition-all hover:bg-primary-container disabled:opacity-40"
                    [disabled]="saving()" (click)="saveBudget()">Save budget</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class BudgetsComponent {
  Math = Math;

  sortMode = signal<'burn' | 'budget'>('burn');
  sortLabel = computed(() => (this.sortMode() === 'burn' ? 'Highest Burn' : 'Highest Limit'));
  cycleSort(): void {
    this.sortMode.set(this.sortMode() === 'burn' ? 'budget' : 'burn');
  }

  api = inject(ApiService);
  store = inject(DataStore);

  m = computed(() => {
    const monthMs = this.store.currentMonth();
    return computeDashboardMetrics(this.store.allExpenses(), this.store.allBudgets(), monthMs, monthMs);
  });

  budgetStatus = computed(() => this.store.budgetStatus());
  overallBudget = computed(() => this.budgetStatus().reduce((s, b) => s + b.budget, 0));
  overallSpent = computed(() => this.budgetStatus().reduce((s, b) => s + b.spent, 0));
  overallRemaining = computed(() => this.overallBudget() - this.overallSpent());
  overallOver = computed(() => this.overallBudget() > 0 && this.overallSpent() > this.overallBudget());
  overallPct = computed(() => (this.overallBudget() > 0 ? (this.overallSpent() / this.overallBudget()) * 100 : 0));
  projected = computed(() => this.m().projected);
  overCeiling = computed(() => this.overallBudget() > 0 && this.projected() > this.overallBudget());
  projectedVsCapLabel = computed(() => {
    const diff = this.overallBudget() - this.projected();
    return diff >= 0 ? `+${formatPaiseCompact(diff)} Buffer` : `-₹${formatPaise(-diff).slice(1)} over`;
  });

  monthLabel = computed(() => new Date(this.store.currentMonth()).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }));
  prevMonthLabel = computed(() => {
    const ms = new Date(this.store.currentMonth());
    ms.setMonth(ms.getMonth() - 1);
    return ms.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  });
  nextMonthDay = computed(() => {
    const ms = new Date(this.store.currentMonth());
    ms.setMonth(ms.getMonth() + 1, 1);
    return ms.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  });
  // Unspent budget from the PREVIOUS month, over the live budget list: the amount the
  // 1st-of-month sweep would actually carry. Zero when every envelope was burned.
  rolloverReserve = computed(() => {
    const { start, end } = (() => {
      const ms = new Date(this.store.currentMonth());
      ms.setMonth(ms.getMonth() - 1);
      return getMonthBounds(ms.getTime());
    })();
    const spentByCategory = new Map<string, number>();
    for (const e of this.store.allExpenses()) {
      if (e.txnAt >= start && e.txnAt < end && e.deletedAt === null && e.isExpense && !e.isIncome) {
        spentByCategory.set(e.category, (spentByCategory.get(e.category) ?? 0) + e.amountPaise);
      }
    }
    const seen = new Map<string, BudgetRow>();
    for (const b of this.store.allBudgets()) {
      if (b.deletedAt === null) seen.set(b.category, b);
    }
    let reserve = 0;
    for (const b of seen.values()) {
      reserve += Math.max(0, b.monthlyPaise - (spentByCategory.get(b.category) ?? 0));
    }
    return reserve;
  });
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
  burnCap = computed(() => (this.daysInMonth() > 0 ? Math.round(this.overallBudget() / this.daysInMonth()) : 0));
  avgBurn = computed(() => {
    const rows = this.burnRows().slice(0, this.daysElapsed());
    if (!rows.length) return 0;
    return Math.round(rows.reduce((s, r) => s + r.total, 0) / rows.length);
  });

  topBurn = computed(() => this.budgetStatus()[0] ?? null);
  avgDailyBurn(b: BudgetStatus): number {
    return Math.round(b.spent / Math.max(1, this.daysElapsed()));
  }

  burnRows = computed(() => this.m().daily);
  burnBars = computed(() => {
    const rows = this.burnRows();
    const cap = this.burnCap();
    if (!rows.length) return [];
    const maxV = Math.max(...rows.map((r) => r.total), cap) || 1;
    const daysElapsed = this.daysElapsed();
    return rows.map((r, i) => {
      const future = i + 1 > daysElapsed;
      if (future) return { total: r.total, style: 'height: 20%; background: rgba(34,44,64,0.35)' };
      const pctEl = Math.max(8, Math.round((r.total / maxV) * 100));
      const bg = r.total > cap ? '#ffb95f' : i + 1 === daysElapsed ? '#4edea3' : '#222C40';
      return { total: r.total, style: `height: ${pctEl}%; background: ${bg}` };
    });
  });

  // Smart rules (design rules — toggles are presentational): `toggleRule` flips the state locally.
  rulesArmed = signal([
    { title: 'Overdraft Threshold Ping', armed: true },
    { title: 'Unassigned POS Freeze', armed: true },
    { title: 'Automated Grocery Rollover', armed: true },
    { title: '50/50 Split Rule for Dining', armed: true },
  ]);
  rules = computed(() => {
    const armed = this.rulesArmed();
    const base = [
      { title: 'Overdraft Threshold Ping', desc: 'Alert when any category hits 85% of its monthly cap', icon: 'notifications_active', color: '#ffb95f' },
      { title: 'Unassigned POS Freeze', desc: 'Flag POS swipes above ₹10,000 without a category tag', icon: 'block', color: '#c0c1ff' },
      { title: 'Automated Grocery Rollover', desc: 'Sweep unspent grocery funds to the surplus pool on the 1st', icon: 'currency_exchange', color: '#4edea3' },
      { title: '50/50 Split Rule for Dining', desc: 'Dining charges above ₹3,000 split between members', icon: 'call_split', color: '#e1e0ff' },
    ];
    return base.map((b) => ({ ...b, armed: armed.find((a) => a.title === b.title)?.armed ?? true, iconClass: `color: ${b.color}` }));
  });
  toggleRule(title: string): void {
    this.rulesArmed.set(this.rulesArmed().map((r) => (r.title === title ? { ...r, armed: !r.armed } : r)));
  }

  islands = computed<Island[]>(() => {
    const rows = [...this.budgetStatus()];
    rows.sort((a, b) => (this.sortMode() === 'burn' ? b.pct - a.pct : b.budget - a.budget));
    const countByCat = new Map<string, number>();
    for (const e of this.store.getFilteredExpenses({ type: 'spend' })) {
      countByCat.set(e.category, (countByCat.get(e.category) ?? 0) + 1);
    }
    const daysLeftCount = Math.max(1, this.daysInMonth() - this.daysElapsed());
    const accents: Record<string, { accent: string; subColor: string; icon: string; bar: string }> = {
      ok: { accent: 'border-color: rgba(78,222,163,0.4);', subColor: '#4edea3', icon: 'rgba(78,222,163,0.15); color: #4edea3; --tw-ring-color: rgba(78,222,163,0.2)', bar: 'background: #4edea3', },
      near: { accent: 'border-color: rgba(255,185,95,0.4);', subColor: '#ffb95f', icon: 'rgba(255,185,95,0.2); color: #ffb95f', bar: 'background: #ffb95f', },
      over: { accent: 'border-color: rgba(244,63,94,0.4);', subColor: '#F43F5E', icon: 'rgba(244,63,94,0.2); color: #F43F5E', bar: 'background: #F43F5E', },
    };
    return rows.map((b: BudgetStatus) => {
      const st = this.stat(b);
      const a = accents[st];
      const remaining = b.remaining;
      return {
        category: b.category,
        icon: CAT_ICONS.find((c) => c.test.test(b.category))?.icon ?? 'category',
        spent: b.spent,
        budget: b.budget,
        pct: b.pct,
        status: b.pct >= 100 ? 'OVER' : b.pct >= 85 ? 'WARNING' : b.spent === 0 ? 'UNTOUCHED' : 'ON TRACK',
        statusClass: b.pct >= 100
          ? 'background: rgba(244,63,94,0.15); color: #F43F5E'
          : b.pct >= 85
            ? 'background: rgba(255,185,95,0.2); color: #ffb95f'
            : 'background: rgba(78,222,163,0.15); color: #4edea3',
        accentClass: a.accent,
        sub: `${countByCat.get(b.category) ?? 0} txns • ${Math.round(b.pct)}%`,
        subStyle: `color: ${a.subColor}`,
        iconClass: `background: ${a.icon}`,
        barStyle: `width: ${Math.min(b.pct, 100)}%; ${a.bar}`,
        barClass: a.bar,
        remaining,
        remainingLabel: remaining >= 0 ? `${formatPaiseCompact(remaining)} left` : `₹${formatPaise(-remaining).slice(1)} over`,
        paceLabel: remaining >= 0 ? `Safe pace ${formatPaise(Math.round(remaining / daysLeftCount))}/d` : `Throttle pacing`,
        paceClass: remaining >= 0 ? `color: #4edea3` : `color: #ffb95f`,
        count: countByCat.get(b.category) ?? 0,
      };
    });
  });

  stat(b: BudgetStatus): 'ok' | 'near' | 'over' {
    return b.over || b.pct >= 100 ? 'over' : b.pct >= 85 ? 'near' : 'ok';
  }

  exclusions = computed(() => this.store.allExclusions().filter((e) => e.deletedAt === null));
  knownCategories = computed(() => this.store.getCategoriesForMonth());

  // Web pushes are user-scoped to the signed-in account — never to the user being viewed.
  viewingOther = computed(() => {
    const own = this.api.availableUsersList().find((u) => u.email === this.api.currentEmail())?.id ?? null;
    const active = this.api.activeUserIdValue();
    return !!active && !!own && active !== own;
  });

  showSkeleton = computed(() => this.store.isLoading() || this.store.lastSyncTime() === null);

  addOpen = signal(false);
  saving = signal(false);
  newCategory = signal('');
  newAmount = signal<number | null>(null);

  openAdd(): void {
    this.newCategory.set('');
    this.newAmount.set(null);
    this.addOpen.set(true);
  }

  async saveBudget(): Promise<void> {
    const amount = Math.round((this.newAmount() ?? 0) * 100);
    if (!this.newCategory().trim() || !Number.isFinite(amount) || amount <= 0) return;
    this.saving.set(true);
    try {
      await this.api.pushBudget(this.newCategory().trim(), amount);
      this.addOpen.set(false);
      await this.store.load(true);
    } finally {
      this.saving.set(false);
    }
  }

  async removeExclusion(merchant: string): Promise<void> {
    this.saving.set(true);
    try {
      await this.api.pushExclusion(merchant, true);
      await this.store.load(true);
    } finally {
      this.saving.set(false);
    }
  }

  min100 = (n: number) => Math.min(n, 100);
  formatPaise = formatPaise;
  formatPaiseCompact = formatPaiseCompact;
}

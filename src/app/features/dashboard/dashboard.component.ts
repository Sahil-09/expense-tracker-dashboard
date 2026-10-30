import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IntentsService } from '../../core/intents';
import { DataStore } from '../../core/store';
import { addMonths, formatPaise, formatPaiseCompact, getCategoryColor, getMonthBounds, monthStart } from '../../core/format';
import { ApiService } from '../../core/api';
import { DashboardMetrics, ExpenseRow } from '../../core/models';

const CATEGORY_ICONS: Record<string, string> = {
  Food: 'restaurant', Groceries: 'shopping_bag', Transport: 'directions_car',
  Shopping: 'checkroom', Bills: 'receipt_long', Health: 'health_and_safety',
  Entertainment: 'movie', Transfer: 'swap_horiz', Rent: 'apartment',
  Date: 'favorite', Other: 'category',
};

// Accent palette from the Stitch donut (primary-container, secondary, purple, cyan).
const DONUT_COLORS = ['#8083ff', '#4edea3', '#A855F7', '#0EA5E9'];
const DONUT_CIRC = 2 * Math.PI * 38;
const DEVICE_COLOR = '#171F2E';

interface DonutSeg { color: string; dash: number; offset: number; }
interface LegendRow { label: string; total: string; pct: number; color: string; }
interface SparkPoint { x: number; y: number; value?: number }
interface DayPoint { x: number; y: number; value?: number }

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    @if (showSkeleton()) {
      <!-- Skeleton Loading State (per Stitch) -->
      <div class="flex flex-col gap-14">
        <div class="flex items-end justify-between gap-8">
          <div class="flex flex-col gap-3">
            <div class="h-3.5 w-48 rounded-full bg-surface-container-high animate-pulse"></div>
            <div class="h-10 w-80 rounded-xl bg-surface-container-high animate-pulse"></div>
          </div>
          <div class="flex gap-3">
            <div class="h-11 w-36 rounded-xl bg-surface-layer-1 border border-surface-layer-2 animate-pulse flex items-center justify-center gap-2">
              <div class="h-3 w-16 rounded-full bg-surface-container-high animate-pulse"></div>
            </div>
            <div class="h-11 w-36 rounded-xl bg-surface-container-high animate-pulse flex items-center justify-center gap-2">
              <div class="h-3 w-16 rounded-full bg-surface-container-highest animate-pulse"></div>
            </div>
          </div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div class="lg:col-span-6 flex flex-col gap-4 rounded-3xl border border-border-subtle bg-surface-layer-1 p-8">
            @for (i of [1,2,3]; track i) { <div class="h-12 rounded-xl bg-surface-container-high animate-pulse" [style.width.%]="[95,70,45][i-1]"></div> }
          </div>
          <div class="lg:col-span-6 grid grid-cols-1 sm:grid-cols-3 gap-8">
            @for (i of [1,2,3]; track i) {
              <div class="flex h-56 flex-col justify-between rounded-3xl border border-border-subtle bg-surface-layer-1 p-8">
                @for (j of [1,2,3]; track j) { <div class="h-4 rounded-full bg-surface-container-high animate-pulse" [style.width.%]="[60,90,50][j-1]"></div> }
              </div>
            }
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          @for (i of [1,2,3,4]; track i) {
            <div class="flex h-64 flex-col justify-between rounded-3xl border border-border-subtle bg-surface-layer-1 p-8">
              <div class="flex items-center gap-3">
                <div class="h-12 w-12 rounded-2xl bg-surface-container-high animate-pulse"></div>
                <div class="flex flex-1 flex-col gap-2">
                  <div class="h-3.5 w-24 rounded-full bg-surface-container-high animate-pulse"></div>
                  <div class="h-3 w-16 rounded-full bg-surface-container animate-pulse"></div>
                </div>
              </div>
              @for (j of [1,2,3]; track j) { <div class="h-8 rounded-xl bg-surface-container animate-pulse"></div> }
            </div>
          }
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div class="lg:col-span-7 flex h-96 flex-col justify-between rounded-3xl border border-border-subtle bg-surface-layer-1 p-8">
            <div class="h-4 w-56 rounded-full bg-surface-container-high animate-pulse"></div>
            <div class="h-full w-full rounded-xl bg-surface-container animate-pulse"></div>
            <div class="flex justify-between">
              @for (i of [1,2,3,4]; track i) { <div class="h-3 w-16 rounded-full bg-surface-container-high animate-pulse"></div> }
            </div>
          </div>
          <div class="lg:col-span-5 flex h-96 flex-col items-center justify-between rounded-3xl border border-border-subtle bg-surface-layer-1 p-8">
            <div class="h-4 w-40 rounded-full bg-surface-container-high animate-pulse"></div>
            <div class="h-44 w-44 rounded-full bg-surface-container-high animate-pulse" style="border-radius:50%"></div>
            @for (i of [1,2,3,4]; track i) { <div class="flex w-full items-center justify-between">
              <div class="flex items-center gap-3"><div class="h-2.5 w-2.5 rounded-full bg-surface-container-high animate-pulse"></div><div class="h-3 w-28 rounded-full bg-surface-container animate-pulse"></div></div>
              <div class="h-3 w-16 rounded-full bg-surface-container animate-pulse"></div>
            </div> }
          </div>
        </div>
        <div class="flex h-96 flex-col gap-3 rounded-3xl border border-border-subtle bg-surface-layer-1 p-6">
          @for (i of [1,2,3,4,5]; track i) {
            <div class="flex flex-1 items-center gap-4 rounded-2xl bg-surface-layer-2/50 px-6">
              <div class="h-11 w-11 rounded-2xl bg-surface-container-high animate-pulse"></div>
              <div class="flex w-40 flex-col gap-2"><div class="h-3.5 w-32 rounded-full bg-surface-container-high animate-pulse"></div><div class="h-3 w-20 rounded-full bg-surface-container animate-pulse"></div></div>
              <div class="ml-auto h-10 w-60 rounded-xl bg-surface-container animate-pulse"></div>
              <div class="h-3 w-14 rounded-full bg-surface-container-high animate-pulse"></div>
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
          <span class="font-medium text-primary">{{ monthLabel() }}</span>
        </div>
        <h1 class="text-3xl font-light tracking-tight text-on-surface md:text-4xl">Family Expense &amp; Budget</h1>
      </div>
      <div class="flex items-center gap-3">
        <button class="flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-layer-1 px-4 py-2.5 text-xs font-medium text-on-surface transition-all hover:bg-surface-layer-2" type="button" title="Requires the household split service � showing from the design" disabled>
          <span class="material-symbols-outlined text-[17px] text-on-surface-variant">call_split</span>
          <span>Split Household Bill</span>
        </button>
        <button class="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-medium text-on-primary shadow-lg shadow-primary/10 transition-all hover:bg-primary-container" type="button" (click)="intents.openNewExpense()">
          <span class="material-symbols-outlined text-[18px]">add</span>
          <span>Log Expense</span>
        </button>
      </div>
    </section>

    <!-- SCULPTED HERO Island & Key Secondary Metrics -->
    <section class="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
      <!-- Hero Primary Card Island -->
      <div class="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-border-subtle bg-surface-layer-1/90 p-8 shadow-2xl backdrop-blur-md lg:col-span-6">
        <div class="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl"></div>
        <div class="relative z-10 flex items-center justify-between">
          <span class="font-mono text-xs uppercase tracking-widest text-on-surface-variant">Total Family Spend (MTD)</span>
          @if (heroDelta() !== null) {
            <span class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
                  [class]="(heroDelta() ?? 0) > 0
                    ? 'bg-status-amber/10 text-status-amber border-status-amber/20'
                    : 'bg-status-emerald/10 text-status-emerald border-status-emerald/20'">
              <span class="material-symbols-outlined text-[14px]">{{ (heroDelta() ?? 0) > 0 ? 'arrow_upward' : 'arrow_downward' }}</span>
              {{ Math.abs(heroDelta() ?? 0).toFixed(1) }}% pacing vs {{ prevMonthName() }}
            </span>
          }
        </div>
        <div class="relative z-10 my-8">
          <div class="flex items-baseline gap-2">
            <span class="text-5xl font-light tracking-tight text-on-surface [font-feature-settings:'tnum']">{{ rupee(m().spend)[0] }}</span>
            <span class="text-lg font-light text-on-surface-variant/70">{{ rupee(m().spend)[1] }}</span>
          </div>
          <div class="mt-4 flex items-center gap-4 text-xs text-on-surface-variant">
            <span>Cap: <strong class="font-mono font-semibold text-on-surface">{{ formatPaiseCompact(m().budgetTotal) }}</strong></span>
            <span class="text-border-strong">�</span>
            <span [class]="headroom() >= 0 ? 'font-medium text-secondary' : 'font-medium text-status-crimson'">
              {{ formatPaiseCompact(headroom()) }} {{ headroom() >= 0 ? 'headroom remaining' : 'over budget' }}
            </span>
          </div>
        </div>
        <!-- Pacing Progress Track -->
        <div class="relative z-10 flex flex-col gap-2.5 border-t border-border-subtle/80 pt-4">
          <div class="flex items-center justify-between font-mono text-xs text-on-surface-variant">
            <span>{{ consumedPct().toFixed(1) }}% Consumed</span>
            <span>{{ daysElapsed() }} of {{ daysInMonth() }} Days Elapsed ({{ elapsedPct() }}%)</span>
          </div>
          <div class="h-2 w-full overflow-hidden rounded-full bg-surface-layer-3/80 p-0.5">
            <div class="h-full rounded-full bg-gradient-to-r from-primary-container to-primary transition-all duration-500" [style.width.%]="Math.min(consumedPct(), 100)"></div>
          </div>
        </div>
      </div>
      <!-- 3 Secondary Floating Metric Islands -->
      <div class="grid grid-cols-1 gap-8 sm:grid-cols-3 lg:col-span-6">
        <!-- Metric 1: Top Allocation -->
        <div class="flex flex-col justify-between rounded-3xl border border-border-subtle bg-surface-layer-1/70 p-8 shadow-xl backdrop-blur-sm transition-all hover:border-border-strong">
          <div class="flex items-center justify-between">
            <span class="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">Top Allocation</span>
            <div class="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold"
                 [style]="topCatStyle()">{{ topCategory()?.category?.charAt(0)?.toUpperCase() || '?' }}</div>
          </div>
          <div class="my-3 min-h-[3.5rem]">
            <h3 class="text-2xl font-light text-on-surface">{{ topCategory()?.category ?? '�' }}</h3>
            <p class="mt-0.5 font-mono text-xs font-medium text-status-purple">{{ topCategory() ? topCatAmount() : 'No spend yet' }}</p>
          </div>
          <div class="flex items-center justify-between border-t border-border-subtle pt-3 text-[11px] text-on-surface-variant">
            <span>Limit: {{ topCatLimitLabel() }}</span>
            <span class="font-mono font-medium" [class]="topCatOver() ? 'text-status-crimson' : 'text-status-amber'">{{ topCatPctLabel() }}</span>
          </div>
        </div>
        <!-- Metric 2: Shared Bills -->
        <div class="flex flex-col justify-between rounded-3xl border border-border-subtle bg-surface-layer-1/70 p-8 shadow-xl backdrop-blur-sm transition-all hover:border-border-strong">
          <div class="flex items-center justify-between">
            <span class="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">Shared Bills</span>
            <span class="material-symbols-outlined text-[19px] text-status-emerald">verified</span>
          </div>
          <div class="my-3 min-h-[3.5rem]">
            <h3 class="text-2xl font-light text-on-surface">{{ dueList().length }} due</h3>
            <p class="mt-0.5 font-mono text-xs font-medium text-status-emerald">{{ formatPaiseCompact(dueTotal()) }} scheduled</p>
          </div>
          <div class="flex items-center justify-between border-t border-border-subtle pt-3 text-[11px] text-on-surface-variant">
            <span class="truncate">Next: {{ nextDue()?.merchant ?? 'None' }}</span>
            <span class="font-mono font-medium text-status-amber">{{ nextDue() ? formatPaiseCompact(nextDue()!.amountPaise) : '�' }}</span>
          </div>
        </div>
        <!-- Metric 3: Surplus Pool -->
        <div class="flex flex-col justify-between rounded-3xl border border-border-subtle bg-surface-layer-1/70 p-8 shadow-xl backdrop-blur-sm transition-all hover:border-border-strong">
          <div class="flex items-center justify-between">
            <span class="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">Surplus Pool</span>
            <span class="material-symbols-outlined text-[19px] text-secondary">savings</span>
          </div>
          <div class="my-3 min-h-[3.5rem]">
            <h3 class="text-2xl font-light" [class]="net() >= 0 ? 'text-secondary' : 'text-status-crimson'">{{ formatPaiseCompact(net()) }}</h3>
            <p class="mt-0.5 font-mono text-xs font-medium" [class]="net() >= 0 ? 'text-secondary/80' : 'text-status-crimson/80'">{{ netRateLabel() }}</p>
          </div>
          <div class="flex items-center justify-between border-t border-border-subtle pt-3 text-[11px] text-on-surface-variant">
            <span>Income {{ formatPaiseCompact(m().income) }}</span>
            <span class="font-medium" [class]="net() >= 0 ? 'text-status-emerald' : 'text-status-crimson'">{{ net() >= 0 ? 'On Track' : 'Shortfall' }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- EXPANDED FAMILY MEMBERS MODULE (admin) -->
    @if (api.isAdminUser() && members().length) {
      <section class="flex flex-col gap-8 mt-8">
        <div class="flex items-center justify-between px-1">
          <div>
            <h2 class="text-xl font-light text-on-surface">Household Members</h2>
            <p class="mt-0.5 text-xs text-on-surface-variant">Individual totals, household share, and activity</p>
          </div>
          <span class="rounded-full border border-border-subtle bg-surface-layer-1 px-3 py-1 font-mono text-xs text-on-surface-variant">{{ members().length }} Members Active</span>
        </div>
        <div class="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          @for (mem of members(); track mem.id) {
            <a [routerLink]="['/members']" [queryParams]="{ userId: mem.id }"
               class="group flex flex-col justify-between rounded-3xl border border-border-subtle bg-surface-layer-1/80 p-8 shadow-xl backdrop-blur-sm transition-all duration-300 hover:-translate-y-[2px] hover:border-primary/40">
              <div>
                <div class="flex items-start justify-between">
                  <div class="flex items-center gap-3">
                    <div class="flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-bold ring-2 [style]" [style]="mem.avatarStyle">{{ mem.initials }}</div>
                    <div>
                      <h3 class="text-sm font-semibold text-on-surface">{{ mem.name }}</h3>
                      <p class="mt-0.5 font-mono text-[11px]" [style.color]="mem.color">{{ mem.role }} � {{ mem.sharePct }}% share</p>
                    </div>
                  </div>
                  <span class="h-2 w-2 rounded-full" [style]="mem.dotStyle"></span>
                </div>
                <div class="mt-7">
                  <div class="flex items-baseline justify-between">
                    <span class="font-mono text-2xl font-light text-on-surface" [title]="mem.spendPaise === null ? 'syncing member ledger�' : formatPaise(mem.spendPaise) + ' ' + mem.monthlyLabel">{{ mem.spendPaise === null ? '�' : formatPaiseCompact(mem.spendPaise) }}</span>
                    <span class="font-mono text-[11px] text-on-surface-variant">{{ mem.txnCount === null ? '�' : mem.txnCount + (mem.txnCount === 1 ? ' txn' : ' txns') }}</span>
                  </div>
                  <div class="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-layer-3">
                    <div class="h-full rounded-full transition-all" [style]="mem.barStyle"></div>
                  </div>
                </div>
              </div>
              <div class="mt-6 flex items-center justify-between border-t border-border-subtle pt-4 text-[11px] text-on-surface-variant">
                <span class="truncate">Last activity</span>
                <span class="font-mono text-on-surface">{{ mem.lastActive }}</span>
              </div>
            </a>
          }
        </div>
      </section>
    }

    <!-- UNCLUTTERED CHARTS & FLOW SECTION -->
    <section class="grid grid-cols-1 items-start gap-8 lg:grid-cols-12 mt-8">
      <!-- Minimal Geometric Spline Chart -->
      <div class="flex flex-col justify-between rounded-3xl border border-border-subtle bg-surface-layer-1/80 p-8 shadow-2xl backdrop-blur-sm lg:col-span-7">
        <div class="flex items-center justify-between border-b border-border-subtle pb-6">
          <div>
            <h2 class="text-base font-medium text-on-surface">Daily Spend Trajectory</h2>
            <p class="mt-0.5 text-xs text-on-surface-variant">Burn rate across {{ monthLabel() }}</p>
          </div>
          <div class="flex items-center gap-4 font-mono text-xs">
            <span class="flex items-center gap-1.5 text-on-surface-variant"><span class="h-2 w-2 rounded-full bg-secondary"></span> Actual</span>
            <span class="flex items-center gap-1.5 text-on-surface-variant/70"><span class="h-2 w-2 rounded-full border border-dashed border-status-amber"></span> Cap {{ formatPaiseCompact(dailyCap()) }}</span>
          </div>
        </div>
        <!-- Open Minimal Chart Canvas -->
        <div class="relative my-6 h-72 w-full">
          <svg class="h-full w-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 600 200">
            <defs>
              <linearGradient id="curveGlow" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stop-color="#4edea3" stop-opacity="0.18"></stop>
                <stop offset="100%" stop-color="#4edea3" stop-opacity="0.0"></stop>
              </linearGradient>
            </defs>
            <line stroke="rgba(255,255,255,0.04)" stroke-width="1" x1="0" x2="600" y1="50" y2="50"></line>
            <line stroke="rgba(255,255,255,0.04)" stroke-width="1" x1="0" x2="600" y1="110" y2="110"></line>
            <line stroke="rgba(255,255,255,0.04)" stroke-width="1" x1="0" x2="600" y1="170" y2="170"></line>
            <!-- Safe Daily Ceiling Line -->
            <line stroke="rgba(245, 158, 11, 0.3)" stroke-dasharray="4 4" stroke-width="1.2" y1="175" y2="175" [attr.y1]="capY()" [attr.y2]="capY()" x1="0" x2="600"></line>
            @if (spark().length > 1) {
              <path [attr.d]="areaPath()" fill="url(#curveGlow)"></path>
              <path [attr.d]="linePath()" fill="none" stroke="#4edea3" stroke-linecap="round" stroke-width="2.5"></path>
              @for (p of sparkDots(); track p.x) {
                <circle [attr.cx]="p.x" [attr.cy]="p.y" fill="#4edea3" [attr.r]="p.r" stroke="#0B0F17" [attr.stroke-width]="p.r > 3 ? 2 : 0">
                  <title>{{ p.value !== undefined ? formatPaise(p.value) : '' }}</title>
                </circle>
              }
            }
          </svg>
        </div>
        <div class="flex items-center justify-between border-t border-border-subtle pt-4 font-mono text-xs text-on-surface-variant">
          @for (l of xLabels(); track $index) {
            <span [class]="l.active ? 'font-semibold text-on-surface' : ''">{{ l.text }}</span>
          }
        </div>
      </div>
      <!-- Curated Donut & Category Allocation -->
      <div class="flex flex-col justify-between rounded-3xl border border-border-subtle bg-surface-layer-1/80 p-8 shadow-2xl backdrop-blur-sm lg:col-span-5">
        <div class="flex items-center justify-between border-b border-border-subtle pb-6">
          <div>
            <h2 class="text-base font-medium text-on-surface">Category Allocation</h2>
            <p class="mt-0.5 text-xs text-on-surface-variant">Monthly distribution breakdown</p>
          </div>
          <span class="font-mono text-xs text-on-surface-variant">{{ formatPaiseCompact(m().spend) }} Total</span>
        </div>
        <div class="relative my-6 flex flex-col items-center justify-center">
          <svg class="h-44 w-44 -rotate-90 transform" viewBox="0 0 100 100">
            <circle cx="50" cy="50" fill="none" r="38" [attr.stroke]="DEVICE_COLOR" stroke-width="9"></circle>
            @for (seg of donut(); track seg.color) {
              <circle cx="50" cy="50" fill="none" r="38" [attr.stroke]="seg.color" [attr.stroke-dasharray]="seg.dash + ' ' + DONUT_CIRC" [attr.stroke-dashoffset]="seg.offset" stroke-width="9"></circle>
            }
          </svg>
          <div class="absolute flex flex-col items-center justify-center text-center">
            <span class="font-mono text-xs uppercase text-on-surface-variant">Budget</span>
            <span class="text-xl font-light" [class]="pacingVerdict() === 'Over' ? 'text-status-crimson' : 'text-on-surface'">{{ pacingVerdict() }}</span>
          </div>
        </div>
        <!-- Clean Airy Legend List -->
        <div class="flex flex-col gap-3">
          @for (row of legend(); track row.label) {
            <div class="flex items-center justify-between py-1 text-xs">
              <div class="flex items-center gap-3">
                <span class="h-2.5 w-2.5 rounded-full" [style.background]="row.color"></span>
                <span class="text-on-surface">{{ row.label }}</span>
              </div>
              <span class="font-mono text-on-surface-variant">{{ row.total }} <span class="ml-1 text-on-surface/50">{{ row.pct }}%</span></span>
            </div>
          }
          @if (!legend().length) {
            <div class="py-4 text-center text-xs text-on-surface-variant">No category spend recorded this month</div>
          }
        </div>
      </div>
    </section>

    <!-- RELAXED RECENT TRANSACTIONS LEDGER -->
    <section class="mb-8 flex flex-col gap-8 mt-8">
      <div class="flex flex-col justify-between gap-4 px-1 sm:flex-row sm:items-center">
        <div>
          <h2 class="text-xl font-light text-on-surface">Recent Activity</h2>
          <p class="mt-0.5 text-xs text-on-surface-variant">Direct SMS and net banking feeds verified across accounts</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="font-mono text-xs text-on-surface-variant">Filter:</span>
          <div class="flex items-center gap-1.5 rounded-xl border border-border-subtle bg-surface-layer-1 p-1 text-xs">
            @for (f of FILTERS; track f.key) {
              <button class="rounded-lg px-3.5 py-1.5 transition-colors" type="button"
                      [class]="activityFilter() === f.key
                        ? 'border border-border-subtle/80 bg-surface-layer-2 font-medium text-on-surface shadow-sm'
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-layer-2/50'"
                      (click)="activityFilter.set(f.key)">{{ f.label }}</button>
            }
          </div>
        </div>
      </div>
      <!-- Floating Transactions Container -->
      <div class="flex flex-col divide-y divide-border-subtle/40 rounded-3xl border border-border-subtle bg-surface-layer-1/80 p-3 shadow-2xl backdrop-blur-sm sm:p-6">
        @for (e of activity(); track $index) {
          <div class="flex items-center justify-between gap-8 rounded-2xl px-2 py-4.5 transition-colors duration-300 hover:bg-surface-layer-2/50 sm:px-6">
            <div class="flex min-w-0 items-center gap-4">
              <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border-subtle bg-surface-layer-2 shadow-sm" [style.color]="getCategoryColor(e.category)">
                <span class="material-symbols-outlined text-[20px]">{{ categoryIcon(e.category) }}</span>
              </div>
              <div class="flex min-w-0 flex-col">
                <span class="truncate text-[15px] font-medium tracking-tight text-on-surface">{{ e.merchant ?? 'Unknown' }}</span>
                <span class="mt-0.5 flex items-center gap-2 text-xs text-on-surface-variant/80">
                  <span>{{ e.category }}</span>
                  <span class="text-border-strong">�</span>
                  <span class="text-on-surface-variant/70">{{ e.source }}</span>
                </span>
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-8">
              <div class="hidden items-center gap-2 rounded-full border border-border-subtle bg-surface-layer-2/80 px-2.5 py-1 text-xs sm:flex">
                <div class="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold" [style]="ownerOf(e).style">{{ ownerOf(e).initials }}</div>
                <span class="hidden font-medium text-on-surface-variant sm:inline">{{ ownerOf(e).name }}</span>
              </div>
              <div class="text-right">
                <span class="font-mono text-base font-semibold text-on-surface [font-feature-settings:'tnum']">{{ formatPaise(e.amountPaise) }}</span>
                <span class="mt-0.5 block font-mono text-xs text-on-surface-variant/70">{{ txnWhen(e.txnAt) }}</span>
              </div>
              <span class="h-2 w-2 rounded-full" [title]="e.deletedAt === null ? 'Auto Synced' : 'Deleted'"></span>
            </div>
          </div>
        } @empty {
          <div class="py-10 text-center text-sm text-on-surface-variant">No transactions match this filter for {{ monthLabel() }}</div>
        }
      </div>
      <!-- Serene Bottom Status Note -->
      <div class="flex items-center justify-between px-2 pt-2 text-xs text-on-surface-variant/70">
        <span class="font-mono">{{ activityTotal() }} expenses recorded this cycle</span>
        <button class="flex items-center gap-1 transition-colors hover:text-primary" type="button" (click)="showAll.set(!showAll())">
          <span>{{ showAll() ? 'Collapse Statement' : 'View Complete Monthly Statement' }}</span>
          <span class="material-symbols-outlined text-[15px] transition-transform" [class.rotate-90]="showAll()">arrow_forward</span>
        </button>
      </div>
    </section>
    }
  `,
})
export class DashboardComponent {
  Math = Math;
  FILTERS = [
    { key: 'spend', label: 'All Expenses' },
    { key: 'income', label: 'Income' },
    { key: 'due', label: 'Due' },
  ] as const;

  activityFilter = signal<'spend' | 'income' | 'due'>('spend');
  showAll = signal(false);

  api = inject(ApiService);
  intents = inject(IntentsService);
  store = inject(DataStore);

  // Donut accent palette from the Stitch screen (primary-container, secondary, purple, cyan).
  DONUT_CIRC = DONUT_CIRC;
  DEVICE_COLOR = DEVICE_COLOR;

  getCategoryColor = getCategoryColor;

  m = computed<DashboardMetrics>(() => {
    // Store-scoped: household ledger when member rows are pulled (admin), else own rows.
    return this.store.getMetrics();
  });

  showSkeleton = computed(() => {
    // Always show skeleton until at least one sync has completed.
    return (this.store.isLoading() || this.store.lastSyncTime() === null) || (!this.store.isLoading() && this.m().count === 0 && this.store.allExpenses().length === 0 && !this.store.allBudgets().length);
  });

  householdLabel = computed(() => {
    const email = this.api.currentEmail() ?? '';
    const name = email.split('@')[0];
    return name ? `${name}'s Household Ledger` : 'Household Ledger';
  });

  monthLabel = computed(() => {
    const ms = this.store.currentMonth();
    return new Date(ms).toLocaleDateString(undefined, { month: 'long' });
  });

  prevMonthName = computed(() => {
    const ms = addMonths(this.store.currentMonth(), -1);
    return new Date(ms).toLocaleDateString(undefined, { month: 'short' });
  });

  heroDelta = computed(() => this.m().momDeltaPct);
  headroom = computed(() => this.m().budgetTotal - this.m().spend);
  net = computed(() => this.m().income - this.m().spend);
  netRateLabel = computed(() => {
    const income = this.m().income;
    if (income <= 0) return 'no income recorded';
    return `${Math.round(((income - this.m().spend) / income) * 100)}% net rate`;
  });

  consumedPct = computed(() => (this.m().budgetTotal > 0 ? (this.m().budgetSpent / this.m().budgetTotal) * 100 : (this.m().spend > 0 ? 100 : 0)));
  daysInMonth = computed(() => {
    const { start, end } = getMonthBounds(this.store.currentMonth());
    return Math.ceil((end - start) / 86400000);
  });
  daysElapsed = computed(() => {
    const { start, end } = getMonthBounds(this.store.currentMonth());
    const now = Date.now();
    if (now < start) return 0;
    if (now >= end) return this.daysInMonth();
    return Math.min(this.daysInMonth(), Math.max(1, Math.ceil((now - start) / 86400000)));
  });
  elapsedPct = computed(() => Math.round((this.daysElapsed() / this.daysInMonth()) * 100));
  dailyCap = computed(() => (this.daysInMonth() > 0 ? Math.round(this.m().budgetTotal / this.daysInMonth()) : 0));

  topCategory = computed(() => this.m().byCategory[0] ?? null);
  topCatAmount = computed(() => {
    const c = this.topCategory();
    if (!c) return '';
    return `${formatPaiseCompact(c.total)} (${Math.round(c.total / this.m().spend * 100)}%)`;
  });
  topCatStyle = computed(() => `background: rgba(168,85,247,0.15); color: #A855F7`);
  topCatLimitLabel = computed(() => {
    const c = this.topCategory();
    if (!c) return '�';
    const b = this.store.budgetStatus().find((s) => s.category === c.category);
    return b ? formatPaiseCompact(b.budget) : 'No cap';
  });
  topCatPctLabel = computed(() => {
    const c = this.topCategory();
    if (!c) return '�';
    const b = this.store.budgetStatus().find((s) => s.category === c.category);
    return b ? `${Math.round(b.pct)}% used` : `No cap set`;
  });
  topCatOver = computed(() => this.store.budgetStatus().some((s) => s.over && this.topCategory() && s.category === this.topCategory()!.category));

  dueList = computed(() => this.store.getFilteredExpenses({ type: 'due' }));
  dueTotal = computed(() => this.dueList().reduce((s, e) => s + e.amountPaise, 0));
  nextDue = computed(() => this.dueList()[0] ?? null);

  members = computed(() => {
    // Month-scoped per-member ledger totals only. No all-time fallback: until a
    // member's rows arrive the card shows a placeholder rather than a number that
    // could never match the selected month.
    const users = this.api.availableUsersList();
    const monthly = new Map(
      users.map((u) => [u.id, this.store.monthlyForUser(u.id)] as const)
    );
    const total = users.reduce((s, u) => s + (monthly.get(u.id)?.spend ?? 0), 0);
    const palette: { bg: string; fg: string }[] = [
      { bg: 'rgba(192,193,255,.12)', fg: '#c0c1ff' },
      { bg: 'rgba(168,85,247,.2)', fg: '#A855F7' },
      { bg: 'rgba(14,165,233,.2)', fg: '#0EA5E9' },
      { bg: 'rgba(255,185,95,.2)', fg: '#ffb95f' },
      { bg: 'rgba(78,222,163,.15)', fg: '#4edea3' },
    ];
    return users.map((u, i) => {
      const p = palette[i % palette.length];
      const m = monthly.get(u.id) ?? null;
      const spendPaise = m?.spend ?? null;
      const sharePct = total > 0 && spendPaise !== null ? Math.round((spendPaise / total) * 100) : 0;
      const name = u.email.split('@')[0];
      const nameFormatted = name.charAt(0).toUpperCase() + name.slice(1);
      const lastSeen = u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '�';
      const idleDays = u.lastSeenAt ? (Date.now() - new Date(u.lastSeenAt).getTime()) / 86400000 : 99;
      const active = idleDays < 3;
      return {
        id: u.id,
        name: nameFormatted,
        initials: nameFormatted.split(/\s/).map((s) => s.charAt(0).toUpperCase()).slice(0, 2).join(''),
        color: p.fg,
        avatarStyle: `background: ${p.bg}; color: ${p.fg}; --tw-ring-color: ${p.fg}30`,
        role: u.email === this.api.currentEmail() ? 'You' : 'Member',
        monthlyLabel: m ? 'this month' : '',
        sharePct,
        spendPaise,
        txnCount: m?.count ?? null,
        lastActive: lastSeen,
        barStyle: `width: ${sharePct}%; background: ${p.fg}`,
        dotStyle: active ? 'background: #10B981' : 'background: #F59E0B',
      };
    });
  });

  // ---- Trajectory chart ----
  private chartMax = computed(() => {
    const s = this.m().daily;
    const cap = this.dailyCap();
    const maxSpend = Math.max(1, ...s.map((d) => d.total));
    return Math.max(cap, maxSpend) * 1.12;
  });
  private chartPoints = computed<DayPoint[]>(() => {
    const s = this.m().daily;
    if (!s.length) return [];
    const max = this.chartMax();
    const n = s.length;
    return s.map((d, i) => ({ x: n === 1 ? 300 : (i / (n - 1)) * 600, y: 200 - (d.total / max) * 185, value: d.total }));
  });
  spark = computed<SparkPoint[]>(() => this.chartPoints());
  capY = computed(() => 200 - (this.dailyCap() / this.chartMax()) * 185);
  sparkDots = computed(() => {
    const pts = this.chartPoints();
    if (pts.length < 2) return [];
    const last = pts[pts.length - 1];
    return [{ ...pts[Math.floor(pts.length / 2)], r: 3 }, { ...pts[Math.max(0, pts.length - 2)], r: 4.5 }, { ...last, r: 4 }];
  });
  linePath = computed(() => smoothPath(this.chartPoints()));
  areaPath = computed(() => `${this.linePath()} L 600,200 L 0,200 Z`);
  xLabels = computed(() => {
    const s = this.m().daily;
    if (!s.length) return [] as { text: string; active?: boolean }[];
    const at = (i: number) => s[Math.min(s.length - 1, Math.round(i))].date;
    const now = Date.now();
    const { start, end } = getMonthBounds(this.store.currentMonth());
    const isCurrent = monthStart(now) === start && now < end;
    return [
      { text: at(0) },
      { text: at(s.length * 0.25) },
      { text: at(s.length * 0.5) },
      { text: at(s.length * 0.75) },
      { text: isCurrent ? `Today (${at(s.length - 1)})` : at(s.length - 1), active: true },
    ];
  });

  // ---- Donut ----
  donut = computed<DonutSeg[]>(() => {
    const cats = this.m().byCategory.slice(0, 4);
    let offset = 0;
    const total = cats.reduce((s, c) => s + c.total, 0);
    if (total <= 0) return [];
    const segs = cats.map((c, i) => {
      const dash = (c.total / total) * DONUT_CIRC;
      const seg: DonutSeg = { color: DONUT_COLORS[i], dash, offset: -offset };
      offset += dash;
      return seg;
    });
    return segs;
  });
  pacingVerdict = computed(() => (this.m().budgetTotal > 0 ? (this.m().budgetSpent > this.m().budgetTotal ? 'Over' : 'Healthy') : 'No Cap'));

  legend = computed<LegendRow[]>(() => {
    const cats = this.m().byCategory.slice(0, 4);
    const total = this.m().spend || 1;
    return cats.map((c, i) => ({
      label: c.category,
      total: formatPaise(c.total).replace(/^₹/, ''),
      pct: Math.round((c.total / total) * 100),
      color: DONUT_COLORS[i],
    }));
  });

  activity = computed<ExpenseRow[]>(() => {
    const type = this.activityFilter();
    const rows = this.store.getFilteredExpenses({ type });
    return this.showAll() ? rows : rows.slice(0, 8);
  });
  activityTotal = computed(() => this.store.getFilteredExpenses({ type: this.activityFilter() }).length);

  /** Who each recent-activity row belongs to: the merged household ledger loses the
   *  user id, so rows are attributed by clientId from the per-member pulls. Rows not
   *  in any member ledger (single-user mode) fall back to the signed-in account. */
  private ownersByClient = computed(() => {
    const map = new Map<string, { initials: string; name: string; style: string }>();
    const palette: { bg: string; fg: string }[] = [
      { bg: 'rgba(192,193,255,.12)', fg: '#c0c1ff' },
      { bg: 'rgba(168,85,247,.2)', fg: '#A855F7' },
      { bg: 'rgba(14,165,233,.2)', fg: '#0EA5E9' },
      { bg: 'rgba(255,185,95,.2)', fg: '#ffb95f' },
      { bg: 'rgba(78,222,163,.15)', fg: '#4edea3' },
    ];
    const users = this.api.availableUsersList();
    this.store.memberLedgers().forEach((rows, id) => {
      const idx = users.findIndex((u) => u.id === id);
      if (idx < 0) return;
      const p = palette[idx % palette.length];
      const name = users[idx].email.split('@')[0];
      const pretty = name.charAt(0).toUpperCase() + name.slice(1);
      const style = `background: ${p.bg}; color: ${p.fg}`;
      const initials = pretty.split(/\s/).map((s) => s.charAt(0).toUpperCase()).slice(0, 2).join('');
      for (const r of rows) map.set(r.clientId, { initials, name: pretty, style });
    });
    return map;
  });

  ownerOf(e: ExpenseRow): { initials: string; name: string; style: string } {
    return (
      this.ownersByClient().get(e.clientId) ?? {
        initials: (this.api.currentEmail() ?? '?').charAt(0).toUpperCase(),
        name: (this.api.currentEmail() ?? 'Unknown').split('@')[0],
        style: 'background: rgba(192,193,255,.12); color: #c0c1ff',
      }
    );
  }

  rupee(paise: number): [string, string] {
    const rupees = paise / 100;
    // Floor the integer part: the true paise follow, so 38,723.58 must not read 38,724.58.
    const whole = Math.floor(rupees).toLocaleString('en-IN');
    const frac = rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split('.')[1] ?? '00';
    return [whole, `.${frac}`];
  }

  formatPaise = formatPaise;
  formatPaiseCompact = formatPaiseCompact;
  txnWhen(at: number): string {
    const d = new Date(at);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) {
      return `Today, ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
    }
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
  categoryIcon(category: string): string {
    return CATEGORY_ICONS[category] ?? 'category';
  }
}

/** Catmull-Rom ? cubic bezier smoothing for the trajectory line. */
function smoothPath(pts: DayPoint[]): string {
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

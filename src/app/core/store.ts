import { Injectable, signal, computed } from '@angular/core';
import { ApiService } from './api';
import { ExpenseRow, BudgetRow, ExclusionRow, DashboardMetrics, MonthData, AdminUserSummary } from './models';
import { monthStart, addMonths, generateMonthOptions } from './format';
import { computeDashboardMetrics } from './analytics';
import { sanitizeExpenses } from './sanitize';

const normMerchant = (s: string | null): string => (s ?? '').trim().toLowerCase();

@Injectable({ providedIn: 'root' })
export class DataStore {
  private expenses = signal<ExpenseRow[]>([]);
  private budgets = signal<BudgetRow[]>([]);
  private exclusions = signal<ExclusionRow[]>([]);
  private loading = signal(false);
  private lastSync = signal<number | null>(null);
  private error = signal<string | null>(null);
  /** Per-member ledger rows (admin only) for month-scoped member cards. */
  private memberRows = signal<Map<string, ExpenseRow[]>>(
    new Map()
  );
  /** Read-only view for pages that chart a member's ledger without a re-sync. */
  readonly memberLedgers = this.memberRows.asReadonly();

  readonly allExpenses = computed(() => this.expenses());
  readonly allBudgets = computed(() => this.budgets());
  readonly allExclusions = computed(() => this.exclusions());
  readonly isLoading = computed(() => this.loading());
  readonly lastSyncTime = computed(() => this.lastSync());
  readonly lastError = computed(() => this.error());

  private currentMonthMs = signal(monthStart(Date.now()));

  readonly currentMonth = computed(() => this.currentMonthMs());
  readonly monthOptions = computed(() => generateMonthOptions(this.currentMonthMs(), 12));

  constructor(private api: ApiService) {}

  /** Month-scoped per-member totals from the pull ledger (phone-faithful: exclusions + dedupe applied). */
  monthlyForUser(userId: string): { spend: number; income: number; count: number } | null {
    const rows = this.memberRows().get(userId);
    if (!rows) return null;
    const start = monthStart(this.currentMonthMs());
    const end = addMonths(start, 1);
    let spend = 0;
    let income = 0;
    let count = 0;
    for (const e of rows) {
      if (e.txnAt < start || e.txnAt >= end || e.deletedAt !== null) continue;
      if (e.isIncome) income += e.amountPaise;
      else if (e.isExpense) {
        spend += e.amountPaise;
        count++;
      }
    }
    return { spend, income, count };
  }

  setMonth(monthMs: number): void {
    this.currentMonthMs.set(monthMs);
  }

  nextMonth(): void {
    this.currentMonthMs.set(addMonths(this.currentMonthMs(), 1));
  }

  prevMonth(): void {
    this.currentMonthMs.set(addMonths(this.currentMonthMs(), -1));
  }

  async load(force = false): Promise<void> {
    if (this.loading() && !force) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      let data: { expenses: ExpenseRow[]; budgets: BudgetRow[]; exclusions: ExclusionRow[] };
      if (this.api.isAdminUser() && this.api.activeUserIdValue()) {
        data = await this.api.pullAdminUserData(this.api.activeUserIdValue()!);
      } else {
        data = await this.api.pullAllData();
      }
      // Read-time hygiene: telecom junk, misparsed ₹9.77 crore amounts, payment
      // prompts that duplicate their own transfer, re-scanned rows, credits misfiled
      // as spends, and merchants the phone excluded (substring match — the stored
      // exclusion is often shorter than the row's merchant name). Full set per
      // session, so the prompt/pair and duplicate rules see the complete ledger.
      const excl = data.exclusions.map((x) => normMerchant(x.merchant)).filter(Boolean);
      const clean = (rows: ExpenseRow[]) =>
        sanitizeExpenses(
          rows.filter((e) => {
            const m = normMerchant(e.merchant);
            return !m || !excl.some((x) => m.includes(x));
          }),
        );
      // Publish once, after every ledger has landed — the loader must not flip to
      // "Synced" while the hero still shows the active user's interim totals.
      const map = new Map<string, ExpenseRow[]>();
      if (this.api.isAdminUser()) {
        // Pull each member's ledger once per sync; cards derive totals per selected month locally.
        const users = this.api.availableUsersList();
        const settled = await Promise.allSettled(users.map((u) => this.api.pullAdminUserData(u.id)));
        settled.forEach((r, i) => {
          if (r.status === 'fulfilled') map.set(users[i].id, clean(r.value.expenses));
        });
      }
      this.expenses.set(clean(data.expenses));
      this.budgets.set(data.budgets);
      this.exclusions.set(data.exclusions);
      this.memberRows.set(map);
      this.lastSync.set(Date.now());
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      this.loading.set(false);
    }
  }

  /** Household ledger when member rows are pulled (admin), else the active user's own. */
  private ledgerScope(): ExpenseRow[] {
    const ledgers = this.memberRows();
    if (ledgers.size) return [...ledgers.values()].flat();
    return this.expenses();
  }

  getMetrics(): DashboardMetrics {
    const monthMs = this.currentMonthMs();
    const previousMonthMs = addMonths(monthMs, -1);
    return computeDashboardMetrics(this.ledgerScope(), this.budgets(), monthMs, previousMonthMs);
  }

  getFilteredExpenses(filters: { category?: string; type?: 'spend' | 'income' | 'due'; merchant?: string }): ExpenseRow[] {
    // Same scoping as the hero: household ledger when member rows are pulled (admin).
    let result = this.ledgerScope();
    const { start, end } = { start: monthStart(this.currentMonthMs()), end: addMonths(monthStart(this.currentMonthMs()), 1) };
    result = result.filter((e) => e.txnAt >= start && e.txnAt < end);
    if (filters.category) result = result.filter((e) => e.category === filters.category);
    if (filters.type === 'spend') result = result.filter((e) => e.isExpense && !e.isIncome && e.deletedAt === null);
    else if (filters.type === 'income') result = result.filter((e) => e.isIncome && e.deletedAt === null);
    else if (filters.type === 'due') result = result.filter((e) => e.isDue);
    if (filters.merchant) {
      const q = filters.merchant.toLowerCase();
      result = result.filter((e) => (e.merchant ?? '').toLowerCase().includes(q));
    }
    return result.sort((a, b) => b.txnAt - a.txnAt);
  }

  getCategoriesForMonth(): string[] {
    const monthMs = this.currentMonthMs();
    const start = monthStart(monthMs);
    const end = addMonths(start, 1);
    const cats = new Set<string>();
    for (const e of this.expenses()) {
      if (e.txnAt >= start && e.txnAt < end && e.isExpense && !e.isIncome && e.deletedAt === null) {
        cats.add(e.category);
      }
    }
    return Array.from(cats).sort();
  }

  budgetStatus(): import('./models').BudgetStatus[] {
    const monthMs = this.currentMonthMs();
    const start = monthStart(monthMs);
    const end = addMonths(start, 1);
    const spentByCategory = new Map<string, number>();
    for (const e of this.expenses()) {
      if (e.txnAt >= start && e.txnAt < end && e.isExpense && !e.isIncome && e.deletedAt === null) {
        spentByCategory.set(e.category, (spentByCategory.get(e.category) ?? 0) + e.amountPaise);
      }
    }

    return Array.from(
      this.budgets().filter((b) => b.deletedAt === null && b.monthlyPaise > 0)
        .reduce((first, b) => first.set(b.category, first.get(b.category) ?? b), new Map<string, BudgetRow>())
        .values()
    )
      .map((b) => {
        const spent = spentByCategory.get(b.category) ?? 0;
        const budget = b.monthlyPaise;
        const remaining = budget - spent;
        const over = spent > budget;
        const pct = budget > 0 ? (spent / budget) * 100 : 0;
        return { category: b.category, budget, spent, remaining, over, pct };
      })
      .sort((a, b) => b.pct - a.pct);
  }
}
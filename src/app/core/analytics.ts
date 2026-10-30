import { ExpenseRow, BudgetRow, CategoryBreakdown, MerchantBreakdown, DailySeries, MonthlySeries, BudgetStatus, DashboardMetrics, MonthData } from './models';
import { monthStart, addMonths, monthKey, getCategoryColor, formatPaiseCompact, getMonthBounds } from './format';

function isSpend(e: ExpenseRow): boolean {
  return e.isExpense && !e.isIncome && e.deletedAt === null;
}

function isIncome(e: ExpenseRow): boolean {
  return e.isIncome && e.deletedAt === null;
}

function filterByMonth(expenses: ExpenseRow[], monthMs: number): ExpenseRow[] {
  const { start, end } = getMonthBounds(monthMs);
  return expenses.filter((e) => e.txnAt >= start && e.txnAt < end);
}

export function summarize(expenses: ExpenseRow[], monthMs: number): { spend: number; income: number; count: number } {
  const monthExpenses = filterByMonth(expenses, monthMs);
  let spend = 0;
  let income = 0;
  let count = 0;
  for (const e of monthExpenses) {
    if (isSpend(e)) {
      spend += e.amountPaise;
      count++;
    } else if (isIncome(e)) {
      income += e.amountPaise;
    }
  }
  return { spend, income, count };
}

export function byCategory(expenses: ExpenseRow[], monthMs: number): CategoryBreakdown[] {
  const monthExpenses = filterByMonth(expenses, monthMs);
  const map = new Map<string, { total: number; count: number }>();
  for (const e of monthExpenses) {
    if (!isSpend(e)) continue;
    const existing = map.get(e.category) ?? { total: 0, count: 0 };
    existing.total += e.amountPaise;
    existing.count += 1;
    map.set(e.category, existing);
  }
  return Array.from(map.entries())
    .map(([category, { total, count }]) => ({ category, total, count, color: getCategoryColor(category) }))
    .sort((a, b) => b.total - a.total);
}

export function byMerchant(expenses: ExpenseRow[], monthMs: number, limit = 10): MerchantBreakdown[] {
  const monthExpenses = filterByMonth(expenses, monthMs);
  const map = new Map<string, { total: number; count: number }>();
  for (const e of monthExpenses) {
    if (!isSpend(e)) continue;
    const merchant = e.merchant ?? 'Unknown';
    const existing = map.get(merchant) ?? { total: 0, count: 0 };
    existing.total += e.amountPaise;
    existing.count += 1;
    map.set(merchant, existing);
  }
  return Array.from(map.entries())
    .map(([merchant, { total, count }]) => ({ merchant, total, count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export function dailySeries(expenses: ExpenseRow[], monthMs: number): DailySeries[] {
  const { start, end } = getMonthBounds(monthMs);
  const daysInMonth = Math.ceil((end - start) / 86400000);
  const map = new Map<number, number>();

  for (const e of expenses) {
    if (!isSpend(e)) continue;
    if (e.txnAt < start || e.txnAt >= end) continue;
    const dayStart = new Date(e.txnAt);
    dayStart.setHours(0, 0, 0, 0);
    const key = dayStart.getTime();
    map.set(key, (map.get(key) ?? 0) + e.amountPaise);
  }

  const result: DailySeries[] = [];
  for (let i = 0; i < daysInMonth; i++) {
    const dayMs = start + i * 86400000;
    const label = new Date(dayMs).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    result.push({ date: label, total: map.get(dayMs) ?? 0 });
  }
  return result;
}

export function monthlySeries(expenses: ExpenseRow[], months: number): MonthlySeries[] {
  const now = Date.now();
  const currentMonthStart = monthStart(now);
  const result: MonthlySeries[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const start = addMonths(currentMonthStart, -i);
    const end = addMonths(start, 1);
    let spend = 0;
    let income = 0;
    for (const e of expenses) {
      if (e.txnAt < start || e.txnAt >= end) continue;
      if (isSpend(e)) spend += e.amountPaise;
      else if (isIncome(e)) income += e.amountPaise;
    }
    result.push({
      month: monthLabel(start),
      spend,
      income,
    });
  }
  return result;
}

function monthLabel(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: 'short' });
}

export function budgetStatus(expenses: ExpenseRow[], budgets: BudgetRow[], monthMs: number): BudgetStatus[] {
  const monthExpenses = filterByMonth(expenses, monthMs);
  const spentByCategory = new Map<string, number>();
  for (const e of monthExpenses) {
    if (!isSpend(e)) continue;
    spentByCategory.set(e.category, (spentByCategory.get(e.category) ?? 0) + e.amountPaise);
  }

  return budgets
    .filter((b) => b.deletedAt === null && b.monthlyPaise > 0)
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

export function projectedMonthEnd(spend: number, monthMs: number): number {
  const now = Date.now();
  const { start, end } = getMonthBounds(monthMs);
  const daysInMonth = Math.ceil((end - start) / 86400000);
  const daysSoFar = Math.min(daysInMonth, Math.max(1, Math.ceil((now - start) / 86400000)));
  const isCurrentMonth = monthStart(now) === start;
  if (!isCurrentMonth || daysSoFar >= daysInMonth) return spend;
  return Math.round((spend / daysSoFar) * daysInMonth);
}

export function momDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function computeDashboardMetrics(
  expenses: ExpenseRow[],
  budgets: BudgetRow[],
  monthMs: number,
  previousMonthMs: number,
): DashboardMetrics {
  const current = summarize(expenses, monthMs);
  const previous = summarize(expenses, previousMonthMs);
  const delta = momDelta(current.spend, previous.spend);
  const projected = projectedMonthEnd(current.spend, monthMs);
  const categoryBreakdown = byCategory(expenses, monthMs);
  const daily = dailySeries(expenses, monthMs);
  const topMerchants = byMerchant(expenses, monthMs, 5);
  const budgetStatuses = budgetStatus(expenses, budgets, monthMs);
  const budgetTotal = budgetStatuses.reduce((sum, b) => sum + b.budget, 0);
  const budgetSpent = budgetStatuses.reduce((sum, b) => sum + b.spent, 0);
  const budgetOver = budgetTotal > 0 && budgetSpent > budgetTotal;

  const monthExpenses = filterByMonth(expenses, monthMs);
  const spendTxns = monthExpenses.filter(isSpend);
  const recentTxns = [...spendTxns].sort((a, b) => b.txnAt - a.txnAt).slice(0, 8);
  const largestExpense = spendTxns.length > 0
    ? spendTxns.reduce((max, e) => (e.amountPaise > max.amountPaise ? e : max))
    : null;
  const daysInMonth = Math.ceil((getMonthBounds(monthMs).end - getMonthBounds(monthMs).start) / 86400000);
  const avgPerDay = daysInMonth > 0 ? Math.round(current.spend / daysInMonth) : 0;

  return {
    spend: current.spend,
    income: current.income,
    net: current.spend - current.income,
    count: current.count,
    momDeltaPct: delta,
    projected,
    budgetTotal,
    budgetSpent,
    budgetOver,
    byCategory: categoryBreakdown,
    daily,
    topMerchants,
    recentTxns,
    largestExpense,
    avgPerDay,
  };
}

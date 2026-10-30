import { describe, it, expect } from 'vitest';
import {
  summarize,
  byCategory,
  byMerchant,
  dailySeries,
  monthlySeries,
  budgetStatus,
  projectedMonthEnd,
  momDelta,
  computeDashboardMetrics,
} from './analytics';
import { ExpenseRow, BudgetRow } from './models';
import { monthStart, addMonths } from './format';

function exp(overrides: Partial<ExpenseRow>): ExpenseRow {
  return {
    clientId: 'c',
    amountPaise: 0,
    merchant: null,
    category: 'Food',
    txnAt: 0,
    note: null,
    rawSms: '',
    dedupeKey: '',
    source: 'sms',
    isExpense: false,
    isDue: false,
    isIncome: false,
    deletedAt: null,
    ...overrides,
  };
}

function bud(overrides: Partial<BudgetRow>): BudgetRow {
  return { category: 'Food', monthlyPaise: 0, deletedAt: null, ...overrides };
}

describe('analytics', () => {
  describe('summarize', () => {
    it('returns spend, income and count for the month', () => {
      const month = monthStart(Date.now());
      const rows = [
        exp({ amountPaise: 1000, isExpense: true, category: 'Food', txnAt: month }),
        exp({ amountPaise: 500, isIncome: true, txnAt: month }),
        exp({ amountPaise: 2000, deletedAt: 123, isExpense: true, txnAt: month }),
      ];
      const s = summarize(rows, month);
      expect(s.spend).toBe(1000);
      expect(s.income).toBe(500);
      expect(s.count).toBe(1);
    });

    it('ignores expenses outside the month', () => {
      const month = monthStart(Date.now());
      const rows = [exp({ amountPaise: 9999, isExpense: true, txnAt: monthStart(addMonths(month, 2)) })];
      const s = summarize(rows, month);
      expect(s.spend).toBe(0);
      expect(s.count).toBe(0);
    });
  });

  describe('byCategory', () => {
    it('sorts categories by descending spend', () => {
      const month = monthStart(Date.now());
      const rows = [
        exp({ category: 'Food', amountPaise: 500, isExpense: true, txnAt: month }),
        exp({ category: 'Groceries', amountPaise: 900, isExpense: true, txnAt: month }),
        exp({ category: 'Food', amountPaise: 100, isExpense: true, txnAt: month }),
      ];
      const byCat = byCategory(rows, month);
      expect(byCat.map((c) => c.category)).toEqual(['Groceries', 'Food']);
      expect(byCat[0].total).toBe(900);
    });
  });

  describe('byMerchant', () => {
    it('limits to top N merchants by spend', () => {
      const month = monthStart(Date.now());
      const rows = Array.from({ length: 15 }, (_, i) =>
        exp({ merchant: `M${i}`, category: 'Food', amountPaise: (i + 1) * 100, isExpense: true, txnAt: month }),
      );
      const top = byMerchant(rows, month, 5);
      expect(top).toHaveLength(5);
      expect(top[0].merchant).toBe('M14');
      expect(top[0].total).toBe(1500);
    });
  });

  describe('dailySeries', () => {
    it('aggregates spend per day of month', () => {
      const month = monthStart(Date.now());
      const rows = [
        exp({ amountPaise: 100, isExpense: true, category: 'Food', txnAt: month }),
        exp({ amountPaise: 200, isExpense: true, category: 'Food', txnAt: month + 3600_000 }),
      ];
      const series = dailySeries(rows, month);
      expect(series).toHaveLength(31);
      expect(series[0].total).toBe(300);
      expect(series[1].total).toBe(0);
    });
  });

  describe('monthlySeries', () => {
    it('computes spend and income across the trailing months', () => {
      const now = Date.now();
      const monthMs = monthStart(now);
      const rows = [
        exp({ amountPaise: 1000, isExpense: true, category: 'Food', txnAt: monthMs }),
        exp({ amountPaise: 2000, isIncome: true, txnAt: monthMs }),
      ];
      const series = monthlySeries(rows, 2);
      expect(series).toHaveLength(2);
      // series[0] is the previous month; series[1] is the current one.
      expect(series[0].spend).toBe(0);
      expect(series[1].spend).toBe(1000);
      expect(series[1].income).toBe(2000);
    });
  });

  describe('budgetStatus', () => {
    it('marks a budget over when spend exceeds the cap', () => {
      const month = monthStart(Date.now());
      const rows = [exp({ category: 'Food', amountPaise: 2000, isExpense: true, txnAt: month })];
      const statuses = budgetStatus(rows, [bud({ category: 'Food', monthlyPaise: 1000 })], month);
      expect(statuses).toHaveLength(1);
      expect(statuses[0].over).toBe(true);
      expect(statuses[0].remaining).toBe(-1000);
    });
  });

  describe('projectedMonthEnd', () => {
    it('projects spend across remaining days of the month', () => {
      const month = monthStart(Date.now());
      const projected = projectedMonthEnd(30000, month);
      expect(projected).toBeGreaterThan(30000);
    });
  });

  describe('momDelta', () => {
    it('returns percentage delta', () => {
      expect(momDelta(150, 100)).toBe(50);
      expect(momDelta(50, 100)).toBe(-50);
      expect(momDelta(100, 0)).toBeNull();
    });
  });

  describe('computeDashboardMetrics', () => {
    it('aggregates all metrics for the month', () => {
      const month = monthStart(Date.now());
      const rows = [
        exp({ category: 'Food', amountPaise: 5000, isExpense: true, txnAt: month }),
        exp({ category: 'Groceries', amountPaise: 5000, isExpense: true, txnAt: month + 1000 }),
        exp({ category: 'Food', amountPaise: 4000, isIncome: true, txnAt: month }),
      ];
      const m = computeDashboardMetrics(rows, [bud({ category: 'Food', monthlyPaise: 10000 })], month, addMonths(month, -1));
      expect(m.spend).toBe(10000);
      expect(m.income).toBe(4000);
      expect(m.net).toBe(6000);
      expect(m.budgetOver).toBe(false);
      expect(m.byCategory.length).toBe(2);
      expect(m.daily).toHaveLength(31);
      expect(m.recentTxns).toHaveLength(2);
      expect(m.largestExpense).toBeTruthy();
      expect(m.avgPerDay).toBeGreaterThan(0);
    });
  });
});

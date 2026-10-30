const INR_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const INR_FORMATTER_NO_SYMBOL = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPaise(paise: number): string {
  return INR_FORMATTER.format(paise / 100);
}

export function formatPaiseCompact(paise: number): string {
  const rupees = paise / 100;
  if (rupees >= 100000) {
    return `₹${(rupees / 100000).toFixed(1)}L`;
  }
  if (rupees >= 1000) {
    return `₹${(rupees / 1000).toFixed(1)}k`;
  }
  return formatPaise(paise);
}

export function formatPaisePlain(paise: number): string {
  return INR_FORMATTER_NO_SYMBOL.format(paise / 100);
}

export function monthStart(atMs: number): number {
  const d = new Date(atMs);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export function addMonths(epochMs: number, delta: number): number {
  const d = new Date(epochMs);
  return new Date(d.getFullYear(), d.getMonth() + delta, 1).getTime();
}

export function monthKey(atMs: number): string {
  const d = new Date(atMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(atMs: number): string {
  return new Date(atMs).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function dayLabel(atMs: number): string {
  return new Date(atMs).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatTime(atMs: number): string {
  return new Date(atMs).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(atMs: number): string {
  return new Date(atMs).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function getMonthBounds(monthMs: number): { start: number; end: number } {
  const start = monthStart(monthMs);
  const end = addMonths(start, 1);
  return { start, end };
}

export function generateMonthOptions(centerMs: number, count: number): MonthData[] {
  const result: MonthData[] = [];
  const centerStart = monthStart(centerMs);
  for (let i = -Math.floor(count / 2); i <= Math.floor((count - 1) / 2); i++) {
    const start = addMonths(centerStart, i);
    const end = addMonths(start, 1);
    result.push({
      key: monthKey(start),
      label: monthLabel(start),
      startMs: start,
      endMs: end,
    });
  }
  return result;
}

export interface MonthData {
  key: string;
  label: string;
  startMs: number;
  endMs: number;
}

export const CATEGORIES = [
  'Food',
  'Groceries',
  'Transport',
  'Shopping',
  'Bills',
  'Health',
  'Entertainment',
  'Transfer',
  'Rent',
  'Date',
  'Other',
] as const;

export const CATEGORY_COLORS: Record<string, string> = {
  Food: '#F97316',
  Groceries: '#84CC16',
  Transport: '#0EA5E9',
  Shopping: '#A855F7',
  Bills: '#EF4444',
  Health: '#14B8A6',
  Entertainment: '#EC4899',
  Transfer: '#6366F1',
  Rent: '#f16363',
  Date: '#ff00ea',
  Other: '#94A3B8',
};

export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS['Other'];
}
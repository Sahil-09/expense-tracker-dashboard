export interface ExpenseRow {
  clientId: string;
  amountPaise: number;
  merchant: string | null;
  category: string;
  txnAt: number;
  note: string | null;
  rawSms: string;
  dedupeKey: string;
  source: string;
  isExpense: boolean;
  isDue: boolean;
  isIncome: boolean;
  deletedAt: number | null;
}

export interface BudgetRow {
  category: string;
  monthlyPaise: number;
  deletedAt: number | null;
}

export interface ExclusionRow {
  merchant: string;
  deletedAt: number | null;
}

/** Outbound sync rows (web pushes through POST /sync). */
export interface ExpenseChange {
  clientId: string;
  amountPaise: number;
  merchant?: string | null;
  category: string;
  txnAt: number;
  note?: string | null;
  rawSms: string;
  dedupeKey: string;
  source: string;
  isExpense: boolean;
  isDue: boolean;
  isIncome?: boolean;
  deleted?: boolean;
}

export interface BudgetChange {
  category: string;
  monthlyPaise: number;
  deleted?: boolean;
}

export interface ExclusionChange {
  merchant: string;
  deleted?: boolean;
}

export interface SyncResponse {
  cursor: string;
  hasMore: boolean;
  expenses: ExpenseRow[];
  budgets: BudgetRow[];
  exclusions: ExclusionRow[];
  duplicates: Record<string, string>;
}

export interface AdminUserSummary {
  id: string;
  email: string;
  createdAt: string;
  lastSeenAt: string | null;
  spendPaise: number;
  incomePaise: number;
  txnCount: number;
  lastTxnAt: number | null;
}

export interface AdminUsersResponse {
  users: AdminUserSummary[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  deviceId: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  deviceId: string;
  deviceName: string;
  platform: string;
}

export interface UserContext {
  userId: string;
  email: string;
  isAdmin: boolean;
  availableUsers: AdminUserSummary[];
  activeUserId: string;
}

export interface MonthData {
  key: string;
  label: string;
  startMs: number;
  endMs: number;
}

export interface CategoryBreakdown {
  category: string;
  total: number;
  count: number;
  color: string;
}

export interface MerchantBreakdown {
  merchant: string;
  total: number;
  count: number;
}

export interface DailySeries {
  date: string;
  total: number;
}

export interface MonthlySeries {
  month: string;
  spend: number;
  income: number;
}

export interface BudgetStatus {
  category: string;
  budget: number;
  spent: number;
  remaining: number;
  over: boolean;
  pct: number;
}

export interface DashboardMetrics {
  spend: number;
  income: number;
  net: number;
  count: number;
  momDeltaPct: number | null;
  projected: number;
  budgetTotal: number;
  budgetSpent: number;
  budgetOver: boolean;
  byCategory: CategoryBreakdown[];
  daily: DailySeries[];
  topMerchants: MerchantBreakdown[];
  recentTxns: ExpenseRow[];
  largestExpense: ExpenseRow | null;
  avgPerDay: number;
}
import { Injectable, signal, computed } from '@angular/core';
import { environment } from '../../environments/environment';
import { AuthTokens, LoginRequest, SyncResponse, AdminUsersResponse, AdminUserSummary, ExpenseRow, BudgetRow, ExclusionRow, ExpenseChange, BudgetChange, ExclusionChange } from './models';

const STORAGE_KEYS = {
  accessToken: 'expense.accessToken',
  refreshToken: 'expense.refreshToken',
  expiresAt: 'expense.expiresAt',
  deviceId: 'expense.deviceId',
  email: 'expense.email',
  isAdmin: 'expense.isAdmin',
  availableUsers: 'expense.availableUsers',
  activeUserId: 'expense.activeUserId',
  baseUrl: 'expense.baseUrl',
};

function generateDeviceId(): string {
  return 'web-' + crypto.randomUUID();
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private baseUrl = signal(localStorage.getItem(STORAGE_KEYS.baseUrl) ?? environment.apiBaseUrl);
  private accessToken = signal<string | null>(localStorage.getItem(STORAGE_KEYS.accessToken));
  private refreshToken = signal<string | null>(localStorage.getItem(STORAGE_KEYS.refreshToken));
  private expiresAt = signal<number>(Number(localStorage.getItem(STORAGE_KEYS.expiresAt)) || 0);
  private deviceId = signal(localStorage.getItem(STORAGE_KEYS.deviceId) ?? generateDeviceId());
  private email = signal<string | null>(localStorage.getItem(STORAGE_KEYS.email));
  private isAdmin = signal(false);
  availableUsers = signal<AdminUserSummary[]>([]);
  private activeUserId = signal<string | null>(localStorage.getItem(STORAGE_KEYS.activeUserId));
  private refreshing = false;

  readonly currentBaseUrl = computed(() => this.baseUrl());
  readonly currentAccessToken = computed(() => this.accessToken());
  readonly currentEmail = computed(() => this.email());
  readonly currentDeviceId = computed(() => this.deviceId());
  readonly isAuthenticated = computed(() => !!this.accessToken() && Date.now() < this.expiresAt());
  readonly isAdminUser = computed(() => this.isAdmin());
  readonly availableUsersList = computed(() => this.availableUsers());
  readonly activeUserIdValue = computed(() => this.activeUserId());

  constructor() {
    const storedUsers = localStorage.getItem(STORAGE_KEYS.availableUsers);
    if (storedUsers) {
      try {
        this.availableUsers.set(JSON.parse(storedUsers));
      } catch {}
    }
    this.readyPromise = this.restoreSession();
  }

  private readyPromise: Promise<void>;

  /**
   * Auto-login: a stored refresh token outlives the page. Refresh an expired access
   * token (and re-probe admin status) once, before the router guard decides where to go.
   */
  private async restoreSession(): Promise<void> {
    if (!this.refreshToken()) return;
    try {
      if (!this.isAuthenticated()) await this.refresh();
      await this.checkAdmin();
    } catch (err) {
      // Network blips keep the tokens; only a rejected refresh logs the user out.
      if (err instanceof Error && err.message === 'Unauthorized') this.logout();
    }
  }

  /** Resolves once session restoration (if any) has finished. */
  ready(): Promise<void> {
    return this.readyPromise;
  }

  setBaseUrl(url: string): void {
    const clean = url.replace(/\/+$/, '');
    this.baseUrl.set(clean);
    // Persist: a reload must not silently fall back to the default (prod) server —
    // that once served stale cursor-paginated data and made totals disagree.
    localStorage.setItem(STORAGE_KEYS.baseUrl, clean);
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl()}${path}`;
    const token = this.accessToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    };
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      await this.handle401();
      throw new Error('Unauthorized');
    }
    if (!res.ok) {
      const text = await res.text();
      let message = `HTTP ${res.status}`;
      try {
        const err = JSON.parse(text);
        message = Array.isArray(err.message) ? err.message.join(', ') : err.message ?? message;
      } catch {}
      throw new Error(message);
    }
    if (res.status === 204) return {} as T;
    return res.json();
  }

  private async handle401(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      await this.refresh();
    } catch {
      this.logout();
    } finally {
      this.refreshing = false;
    }
  }

  async login(request: LoginRequest): Promise<void> {
    const res = await this.request<AuthTokens>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    this.setTokens(res);
    this.email.set(request.email);
    localStorage.setItem(STORAGE_KEYS.email, request.email);
    // Check if admin
    await this.checkAdmin();
  }

  async checkAdmin(): Promise<void> {
    try {
      const res = await this.request<AdminUsersResponse>('/admin/users');
      this.isAdmin.set(true);
      this.availableUsers.set(res.users);
      localStorage.setItem(STORAGE_KEYS.availableUsers, JSON.stringify(res.users));
      localStorage.setItem(STORAGE_KEYS.isAdmin, 'true');
      // Set active user to self if not set
      if (!this.activeUserId()) {
        const self = res.users.find((u) => u.email === this.email());
        if (self) {
          this.setActiveUser(self.id);
        }
      }
    } catch {
      this.isAdmin.set(false);
      localStorage.removeItem(STORAGE_KEYS.isAdmin);
    }
  }

  setActiveUser(userId: string): void {
    this.activeUserId.set(userId);
    localStorage.setItem(STORAGE_KEYS.activeUserId, userId);
  }

  getActiveUser(): AdminUserSummary | undefined {
    const id = this.activeUserId();
    if (!id) return undefined;
    return this.availableUsers().find((u) => u.id === id);
  }

  private setTokens(tokens: AuthTokens): void {
    this.accessToken.set(tokens.accessToken);
    this.refreshToken.set(tokens.refreshToken);
    this.expiresAt.set(Date.now() + tokens.expiresIn * 1000);
    this.deviceId.set(tokens.deviceId);
    localStorage.setItem(STORAGE_KEYS.accessToken, tokens.accessToken);
    localStorage.setItem(STORAGE_KEYS.refreshToken, tokens.refreshToken);
    localStorage.setItem(STORAGE_KEYS.expiresAt, String(this.expiresAt()));
    localStorage.setItem(STORAGE_KEYS.deviceId, tokens.deviceId);
  }

  private async refresh(): Promise<void> {
    const rt = this.refreshToken();
    if (!rt) throw new Error('No refresh token');
    const res = await this.request<AuthTokens>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: rt }),
    });
    this.setTokens(res);
  }

  /** Pages re-deliver small collections (budgets/exclusions re-read on every expense
   *  page because the shared cursor advances by date) — keep the latest copy per row.
   *  Expenses key on clientId; budgets/exclusions (no client id) key on their identity. */
  private dedupe<T extends { clientId?: string; category?: string; merchant?: string | null }>(rows: T[]): T[] {
    const byKey = new Map<string, T>();
    for (const r of rows) {
      const key = r.clientId ?? r.category ?? r.merchant;
      byKey.set(key ?? JSON.stringify(r), r);
    }
    return [...byKey.values()];
  }

  async pullAllData(): Promise<{ expenses: ExpenseRow[]; budgets: BudgetRow[]; exclusions: ExclusionRow[] }> {
    const allExpenses: ExpenseRow[] = [];
    const allBudgets: BudgetRow[] = [];
    const allExclusions: ExclusionRow[] = [];
    let cursor: string | null = null;
    let hasMore = true;
    let pages = 0;
    const maxPages = 20;

    while (hasMore && pages < maxPages) {
      const body: { deviceId: string; cursor: string | null; expenses: never[]; budgets: never[]; exclusions: never[] } = { deviceId: this.deviceId(), cursor, expenses: [], budgets: [], exclusions: [] };
      const res = await this.request<SyncResponse>('/sync', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      allExpenses.push(...res.expenses);
      allBudgets.push(...res.budgets);
      allExclusions.push(...res.exclusions);
      cursor = res.cursor;
      hasMore = res.hasMore;
      pages++;
    }

    // Filter out tombstones
    const liveExpenses = this.dedupe(allExpenses).filter((e) => e.deletedAt === null);
    const liveBudgets = this.dedupe(allBudgets).filter((b) => b.deletedAt === null);
    const liveExclusions = this.dedupe(allExclusions).filter((e) => e.deletedAt === null);

    return { expenses: liveExpenses, budgets: liveBudgets, exclusions: liveExclusions };
  }

  async pullAdminUserData(userId: string): Promise<{ expenses: ExpenseRow[]; budgets: BudgetRow[]; exclusions: ExclusionRow[] }> {
    const allExpenses: ExpenseRow[] = [];
    const allBudgets: BudgetRow[] = [];
    const allExclusions: ExclusionRow[] = [];
    let cursor: string | null = null;
    let hasMore = true;
    let pages = 0;
    const maxPages = 20;

    while (hasMore && pages < maxPages) {
      const res: SyncResponse = await this.request<SyncResponse>(`/admin/users/${userId}/sync?cursor=${cursor ?? ''}`, {
        method: 'POST',
        body: JSON.stringify({ cursor }),
      });
      allExpenses.push(...res.expenses);
      allBudgets.push(...res.budgets);
      allExclusions.push(...res.exclusions);
      cursor = res.cursor;
      hasMore = res.hasMore;
      pages++;
    }

    const liveExpenses = this.dedupe(allExpenses).filter((e) => e.deletedAt === null);
    const liveBudgets = this.dedupe(allBudgets).filter((b) => b.deletedAt === null);
    const liveExclusions = this.dedupe(allExclusions).filter((e) => e.deletedAt === null);

    return { expenses: liveExpenses, budgets: liveBudgets, exclusions: liveExclusions };
  }

  /**
   * Pushes web-made changes through the same sync channel the phone uses, then the
   * caller re-pulls. Upserts are keyed server-side (category / merchant / clientId).
   */
  async pushChanges(changes: {
    expenses?: ExpenseChange[];
    budgets?: BudgetChange[];
    exclusions?: ExclusionChange[];
  }): Promise<void> {
    await this.request('/sync', {
      method: 'POST',
      body: JSON.stringify({
        deviceId: this.deviceId(),
        cursor: null,
        expenses: changes.expenses ?? [],
        budgets: changes.budgets ?? [],
        exclusions: changes.exclusions ?? [],
      }),
    });
  }

  async pushExpense(e: { amountPaise: number; merchant: string; category: string; txnAt: number; isIncome: boolean }): Promise<void> {
    const clientId = crypto.randomUUID();
    await this.pushChanges({
      expenses: [{
        clientId,
        amountPaise: e.amountPaise,
        merchant: e.merchant,
        category: e.category,
        txnAt: e.txnAt,
        note: null,
        rawSms: '',
        dedupeKey: `web-${clientId}`,
        source: 'web-manual',
        isExpense: !e.isIncome,
        isDue: false,
        isIncome: e.isIncome,
      }],
    });
  }

  async pushBudget(category: string, monthlyPaise: number): Promise<void> {
    await this.pushChanges({ budgets: [{ category, monthlyPaise }] });
  }

  /** Tombstoning an exclusion un-hides the merchant on every device. */
  async pushExclusion(merchant: string, deleted: boolean): Promise<void> {
    await this.pushChanges({ exclusions: [{ merchant, deleted }] });
  }

  logout(): void {
    this.accessToken.set(null);
    this.refreshToken.set(null);
    this.expiresAt.set(0);
    this.email.set(null);
    this.isAdmin.set(false);
    this.availableUsers.set([]);
    this.activeUserId.set(null);
    Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
  }
}
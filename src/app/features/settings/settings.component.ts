import { Component, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ApiService } from '../../core/api';
import { DataStore } from '../../core/store';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="mx-auto flex max-w-3xl flex-col gap-10">
      <!-- Page Title -->
      <div class="pb-2">
        <div class="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-on-surface-variant/70">
          <span>{{ (api.currentEmail() ?? '').split('@')[0] }}'s Ledger <span class="mx-1">/</span></span>
          <span class="font-medium text-primary">Preferences</span>
        </div>
        <h1 class="text-3xl font-light tracking-tight text-on-surface">Settings</h1>
        <p class="mt-1 text-sm text-on-surface-variant">Configure synchronization endpoints and client session variables.</p>
      </div>

      <!-- Card 1: CONNECTION -->
      <section class="flex flex-col gap-5 rounded-3xl border border-border-subtle bg-surface-layer-1/80 p-8 shadow-xl backdrop-blur-sm">
        <div class="flex flex-col gap-1">
          <p class="font-mono text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Connection</p>
          <h3 class="text-base font-medium text-on-surface">Server Synchronization</h3>
        </div>
        <div class="flex flex-col gap-2">
          <label class="block text-xs font-medium text-on-surface" for="server-url-input">Server URL</label>
          <div class="flex items-center gap-2">
            <div class="relative flex-1">
              <span class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-on-surface-variant">
                <span class="material-symbols-outlined text-[18px]">dns</span>
              </span>
              <input
                class="h-11 w-full rounded-xl border border-border-subtle bg-surface-layer-2 pl-9 pr-3 text-sm text-on-surface transition-all focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                id="server-url-input"
                type="text"
                [(ngModel)]="newServerUrl"
                (change)="saveServerUrl()"
              />
            </div>
            <button class="h-11 rounded-xl border border-border-subtle bg-surface-layer-2 px-3.5 text-xs font-medium text-on-surface transition-colors hover:bg-surface-layer-3" type="button" (click)="presetUrl(environmentValue)">
              Default
            </button>
            <button class="h-11 rounded-xl border border-border-subtle bg-surface-layer-2 px-3.5 text-xs font-medium text-on-surface transition-colors hover:bg-surface-layer-3" type="button" (click)="presetUrl('http://localhost:3000')">
              localhost:3000
            </button>
          </div>
          <p class="pt-0.5 text-xs text-on-surface-variant">Reloads tokens only on sign-in — data pulls use this URL immediately.</p>
        </div>
        <div class="my-1 h-px bg-border-subtle"></div>
        <div class="flex items-center justify-between pt-1">
          <div class="flex items-center gap-2.5">
            <span class="relative flex h-2.5 w-2.5">
              <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-emerald opacity-75"></span>
              <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-status-emerald"></span>
            </span>
            <span class="text-sm font-medium text-on-surface">
              Signed in as <span class="font-semibold">{{ api.currentEmail() }}</span>
              @if (api.isAdminUser()) { <span class="ml-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">admin</span> }
            </span>
          </div>
          <button class="flex items-center gap-1.5 rounded-xl border border-status-crimson/30 bg-status-crimson/10 px-3 py-2 text-xs font-medium text-status-crimson transition-colors hover:bg-status-crimson/20" type="button" (click)="signOut()">
            <span class="material-symbols-outlined text-[16px]">logout</span>
            <span>Sign out</span>
          </button>
        </div>
      </section>

      <!-- Card 2: ACCOUNT & STORAGE -->
      <section class="flex flex-col gap-8 rounded-3xl border border-border-subtle bg-surface-layer-1/80 p-8 shadow-xl backdrop-blur-sm">
        <div class="flex flex-col gap-1">
          <p class="font-mono text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Account</p>
          <h3 class="text-base font-medium text-on-surface">Account &amp; Local Data</h3>
        </div>
        <div class="flex flex-col divide-y overflow-hidden rounded-xl border border-border-subtle">
          <div class="flex flex-col justify-between p-4 text-sm sm:flex-row sm:items-center">
            <span class="font-medium text-on-surface-variant">Device identifier</span>
            <div class="mt-1 flex items-center gap-2 sm:mt-0">
              <span class="rounded bg-surface-layer-2 px-2 py-0.5 font-mono text-xs font-medium text-on-surface">{{ api.currentDeviceId() }}</span>
              <span class="text-[11px] text-on-surface-variant">(this browser)</span>
            </div>
          </div>
          <div class="flex flex-col justify-between p-4 text-sm sm:flex-row sm:items-center">
            <span class="font-medium text-on-surface-variant">Last data pull</span>
            <span class="mt-1 font-semibold text-on-surface sm:mt-0">{{ lastSynced() }}</span>
          </div>
          <div class="flex flex-col justify-between p-4 text-sm sm:flex-row sm:items-center">
            <span class="font-medium text-on-surface-variant">Cached rows</span>
            <span class="mt-1 font-semibold text-on-surface sm:mt-0">{{ store.allExpenses().length }} transactions · {{ store.allBudgets().filter((b) => b.deletedAt === null).length }} budgets · {{ store.allExclusions().filter((e) => e.deletedAt === null).length }} exclusions</span>
          </div>
          <div class="flex items-start gap-2.5 bg-surface-layer-2/60 p-4 text-xs text-on-surface-variant">
            <span class="material-symbols-outlined mt-0.5 flex-shrink-0 text-[18px] text-secondary">verified_user</span>
            <span class="leading-relaxed">Sessions refresh automatically; rotating refresh tokens are stored in this browser only. Veda Ledger renders in its designed dark theme.</span>
          </div>
        </div>
        <div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div class="flex flex-col">
            <span class="text-sm font-medium text-on-surface">Reload ledger</span>
            <span class="text-xs text-on-surface-variant">Re-pulls expenses, budgets and exclusions from {{ api.currentBaseUrl() }}.</span>
          </div>
          <button class="inline-flex flex-shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-border-subtle bg-surface-layer-2 px-4 py-2.5 text-xs font-medium text-on-surface transition-colors hover:bg-surface-layer-3 sm:self-auto"
                  type="button" (click)="store.load(true)" [disabled]="store.isLoading()">
            <span class="material-symbols-outlined text-[18px] text-secondary" [class.animate-spin]="store.isLoading()">sync</span>
            <span>{{ store.isLoading() ? 'Pulling…' : 'Reload data' }}</span>
          </button>
        </div>
        <div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div class="flex flex-col">
            <span class="text-sm font-medium text-on-surface">Clear stored data</span>
            <span class="text-xs text-on-surface-variant">Wipes the cached sign-in, user list and ledger rows from this browser.</span>
          </div>
          <button class="inline-flex flex-shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-status-crimson/30 bg-status-crimson/10 px-4 py-2.5 text-xs font-medium text-status-crimson transition-colors hover:bg-status-crimson/20 sm:self-auto"
                  type="button" (click)="clearStoredData()">
            <span class="material-symbols-outlined text-[18px]">delete_forever</span>
            <span>Clear stored data</span>
          </button>
        </div>
      </section>

      <!-- Build metadata -->
      <div class="pb-8 text-center font-mono text-[11px] text-on-surface-variant/70">
        <p>Veda Ledger · server {{ api.currentBaseUrl() }} · {{ date() }}</p>
      </div>
    </div>
  `,
})
export class SettingsComponent {
  newServerUrl = '';
  environmentValue = environment.apiBaseUrl;

  private api = inject(ApiService);
  private router = inject(Router);

  constructor(public store: DataStore) {
    this.newServerUrl = this.api.currentBaseUrl();
  }

  lastSynced = computed(() => {
    const t = this.store.lastSyncTime();
    return t ? new Date(t).toLocaleString() : 'Never';
  });
  date = signal(new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }));

  saveServerUrl(): void {
    this.api.setBaseUrl(this.newServerUrl.trim());
  }

  presetUrl(url: string): void {
    this.newServerUrl = url;
    this.saveServerUrl();
  }

  signOut(): void {
    this.api.logout();
    this.router.navigate(['/login']);
  }

  clearStoredData(): void {
    if (!confirm('Clear cached sign-in, users and ledger data from this browser?')) return;
    this.api.logout();
    this.router.navigate(['/login']);
  }
}

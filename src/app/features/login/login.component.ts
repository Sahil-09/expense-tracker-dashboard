import { Component, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ApiService } from '../../core/api';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <main class="flex min-h-screen w-full flex-1 flex-col items-center justify-center bg-surface-canvas p-6 text-on-surface antialiased">
      <div class="pointer-events-none fixed inset-0 overflow-hidden">
        <div class="absolute -top-24 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/8 blur-3xl"></div>
      </div>
      <div class="relative mx-auto w-full max-w-[400px]">
        <!-- Brand Logo Cluster -->
        <div class="mb-6 flex items-center justify-center gap-2.5">
          <div class="flex h-11 w-11 select-none items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 shadow-inner">
            <span class="text-xl font-bold text-primary">₹</span>
          </div>
          <div class="flex flex-col">
            <h1 class="text-xl font-bold tracking-tight text-on-surface">Veda Ledger</h1>
            <span class="text-[11px] font-medium tracking-wide text-on-surface-variant/80">Household Expense Intelligence</span>
          </div>
        </div>

        <!-- The Auth Card -->
        <div class="rounded-3xl border border-border-subtle bg-surface-layer-1/90 p-8 shadow-2xl backdrop-blur-sm">
          <div class="mb-6">
            <h2 class="text-2xl font-light tracking-tight text-on-surface">Sign in</h2>
            <p class="mt-1 text-sm text-on-surface-variant">Sync your expenses across devices</p>
          </div>

          <form class="space-y-4" (ngSubmit)="submit()" #form="ngForm">
            <div>
              <label class="mb-1.5 block font-mono text-xs font-medium uppercase tracking-wider text-on-surface-variant" for="email">Email</label>
              <input
                class="h-11 w-full rounded-xl border border-border-subtle bg-surface-layer-2 px-4 text-sm text-on-surface outline-none transition-all placeholder:text-on-surface-variant/50 focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
                id="email" name="email" placeholder="name@example.com" required type="email"
                autocomplete="email" [disabled]="loading()" [(ngModel)]="email" />
            </div>

            <div>
              <label class="mb-1.5 block font-mono text-xs font-medium uppercase tracking-wider text-on-surface-variant" for="password">Password</label>
              <div class="relative flex items-center">
                <input
                  class="h-11 w-full rounded-xl border border-border-subtle bg-surface-layer-2 px-4 pr-10 font-mono text-sm text-on-surface outline-none transition-all placeholder:text-on-surface-variant/50 focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
                  id="password" name="password" placeholder="••••••••" required [type]="showPassword() ? 'text' : 'password'"
                  autocomplete="current-password" [disabled]="loading()" [(ngModel)]="password" />
                <button
                  type="button" aria-label="Toggle password visibility"
                  class="absolute right-3 flex items-center justify-center p-1 text-on-surface-variant transition-colors hover:text-on-surface focus:outline-none"
                  (click)="showPassword.set(!showPassword())">
                  <span class="material-symbols-outlined text-[18px]">{{ showPassword() ? 'visibility_off' : 'visibility' }}</span>
                </button>
              </div>
            </div>

            @if (error()) {
              <div class="rounded-xl border border-status-crimson/30 bg-status-crimson/10 px-3 py-2 text-sm text-status-crimson" role="alert">{{ error() }}</div>
            }

            <div class="pt-2">
              <button
                class="flex h-11 w-full cursor-pointer items-center justify-center rounded-xl bg-primary text-xs font-medium text-on-primary shadow-lg shadow-primary/10 transition-all hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-60"
                type="submit" [disabled]="loading() || form.invalid">
                @if (loading()) { Signing in… } @else { Sign in }
              </button>
            </div>
          </form>

          <div class="my-6 border-t border-border-subtle"></div>

          <!-- Connection Affordance / Server Configuration -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="font-mono text-xs font-medium uppercase tracking-wider text-on-surface-variant">Server URL</span>
              <button
                type="button"
                class="cursor-pointer font-mono text-xs font-medium text-primary transition-colors hover:text-primary-container"
                (click)="dialog.showModal()">
                Change
              </button>
            </div>
            <div class="flex items-center justify-between rounded-xl border border-border-subtle bg-surface-layer-2/70 px-3 py-2 text-sm text-on-surface">
              <span class="truncate font-mono tracking-tight text-on-surface-variant">{{ effectiveServerUrl() }}</span>
              <span class="ml-2 inline-flex flex-shrink-0 items-center gap-1.5" title="ServerURL selected">
                <span class="inline-block h-1.5 w-1.5 rounded-full bg-secondary"></span>
              </span>
            </div>
          </div>

          <div class="mt-6 border-t border-border-subtle pt-4 text-center">
            <p class="text-xs leading-relaxed text-on-surface-variant/80">Passwordless devices rotate refresh tokens — accounts are created by the owner.</p>
          </div>
        </div>
      </div>

      <!-- Quick Server Change Modal Drawer -->
      <dialog #dialog class="m-auto w-full max-w-sm rounded-3xl border border-border-subtle bg-surface-layer-1 p-6 text-on-surface shadow-2xl backdrop:bg-black/60">
        <h3 class="mb-2 text-base font-medium text-on-surface">Change Server URL</h3>
        <p class="mb-4 text-xs text-on-surface-variant">Set the backend URL for family synchronization.</p>
        <input class="mb-4 h-11 w-full rounded-xl border border-border-subtle bg-surface-layer-2 px-4 font-mono text-sm text-on-surface outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
               type="text" [(ngModel)]="serverUrl" placeholder="https://sync-expense.patelsahil.in" />
        <div class="flex justify-end gap-2">
          <button type="button" class="rounded-xl border border-border-subtle bg-surface-layer-2 px-4 py-2 text-xs font-medium text-on-surface hover:bg-surface-layer-3"
                  (click)="dialog.close()">Cancel</button>
          <button type="button" class="rounded-xl bg-primary px-4 py-2 text-xs font-medium text-on-primary hover:bg-primary-container"
                  (click)="dialog.close()">Save</button>
        </div>
      </dialog>
    </main>
  `,
})
export class LoginComponent {
  email = signal('');
  password = signal('');
  serverUrl = signal('');
  loading = signal(false);
  error = signal<string | null>(null);
  showPassword = signal(false);

  defaultServerUrl = environment.apiBaseUrl;

  private api = inject(ApiService);
  private router = inject(Router);

  effectiveServerUrl(): string {
    return (this.serverUrl() || this.defaultServerUrl).replace(/^https?:\/\//, '');
  }

  async submit(): Promise<void> {
    this.error.set(null);
    this.loading.set(true);
    try {
      if (this.serverUrl()) {
        this.api.setBaseUrl(this.serverUrl());
      }
      await this.api.login({
        email: this.email(),
        password: this.password(),
        deviceId: this.api.currentDeviceId(),
        deviceName: 'Web Dashboard',
        platform: 'web',
      });
      this.router.navigate(['']);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Login failed');
    } finally {
      this.loading.set(false);
    }
  }
}

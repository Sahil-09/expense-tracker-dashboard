import { Routes, CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { LoginComponent } from './features/login/login.component';
import { ShellComponent } from './features/shell/shell.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { MembersComponent } from './features/members/members.component';
import { BudgetsComponent } from './features/budgets/budgets.component';
import { BillsComponent } from './features/bills/bills.component';
import { VaultsComponent } from './features/vaults/vaults.component';
import { SettingsComponent } from './features/settings/settings.component';
import { ApiService } from './core/api';

const authGuard: CanActivateFn = async () => {
  const api = inject(ApiService);
  // inject() must happen before the await: the guard's injection context dies with
  // the synchronous frame, and a cold unauthenticated visit blew up on the redirect.
  const router = inject(Router);
  // Auto-login: give a stored refresh token one chance to mint a fresh access token.
  await api.ready();
  if (api.isAuthenticated()) return true;
  router.navigate(['login']);
  return false;
};
const adminGuard: CanActivateFn = () => {
  if (inject(ApiService).isAdminUser()) return true;
  inject(Router).navigate(['']);
  return false;
};

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', component: DashboardComponent },
      { path: 'members', component: MembersComponent, canActivate: [adminGuard] },
      { path: 'budgets', component: BudgetsComponent },
      { path: 'bills', component: BillsComponent },
      { path: 'vaults', component: VaultsComponent },
      { path: 'settings', component: SettingsComponent },
    ],
  },
  { path: '**', redirectTo: '' },
];

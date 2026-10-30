import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection, inject } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { ApiService } from './core/api';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    {
      provide: 'AUTH_GUARD',
      useFactory: () => () => inject(ApiService).isAuthenticated(),
    },
    {
      provide: 'ADMIN_GUARD',
      useFactory: () => () => inject(ApiService).isAdminUser(),
    },
  ],
};

import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { canAdminTenant, CrmUserInfo, SessionInfo } from '@shared/api';
import { Tenant, TenantModules } from '@shared/models';
import { environment } from '../../environments/environment';
import { api } from './http';


/**
 * Sesión del usuario. La cookie de sesión es httpOnly: el navegador la envía sola,
 * pero el código de la página no puede leerla ni robarla.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _user = signal<CrmUserInfo | null>(null);
  private readonly _tenant = signal<Tenant | null>(null);
  private readonly _ready = signal(false);
  readonly user = this._user.asReadonly();
  /** Cliente activo: el del usuario o el que gestiona un super administrador. */
  readonly tenant = this._tenant.asReadonly();
  readonly ready = this._ready.asReadonly();
  readonly isDemo = environment.demo;
  readonly loggedIn = computed(() => !!this._user());
  readonly isSuperadmin = computed(() => this._user()?.role === 'superadmin');
  readonly isOwner = computed(() => !!this._user()?.isOwner);
  /** Puede configurar el cliente activo (admin del cliente o super admin gestionándolo). */
  readonly isAdmin = computed(() => canAdminTenant(this._user()?.role));
  readonly modules = computed<TenantModules>(() => this._tenant()?.modules ?? { crm: true, chatbot: true });
  private readyPromise: Promise<void>;

  constructor() {
    if (this.isDemo) {
      this._user.set({ id: 'demo', name: 'Laura Gómez', email: 'demo@jauthia.com', role: 'admin', active: true, createdAt: 0, tenantId: 'demo' });
      this._tenant.set({
        id: 'demo', name: 'EvoSport (demo)', modules: { crm: true, chatbot: true }, status: 'activo', createdAt: 0,
        plan: { name: 'Completo', price: 0, currency: 'COP', billingDay: 1 },
      });
      this._ready.set(true);
      this.readyPromise = Promise.resolve();
      return;
    }
    this.readyPromise = this.refresh().finally(() => this._ready.set(true));
  }

  private apply(s: SessionInfo | null): void {
    this._user.set(s?.user ?? null);
    this._tenant.set(s?.tenant ?? null);
  }

  async refresh(): Promise<void> {
    try {
      this.apply(await api<SessionInfo>('/api/auth/me'));
    } catch {
      this.apply(null);
    }
  }

  /** Actualiza los datos del cliente activo (p. ej. tras cambiar módulos). */
  setTenant(t: Tenant | null): void {
    this._tenant.set(t);
  }

  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  async status(): Promise<{ setupNeeded: boolean; ownerConfigured: boolean }> {
    if (this.isDemo) return { setupNeeded: false, ownerConfigured: true };
    return api('/api/auth/status');
  }

  async setup(name: string, email: string, password: string): Promise<void> {
    this.apply(await api<SessionInfo>('/api/auth/setup', { method: 'POST', body: { name, email, password } }));
  }

  async login(email: string, password: string): Promise<void> {
    this.apply(await api<SessionInfo>('/api/auth/login', { method: 'POST', body: { email, password } }));
  }

  async logout(): Promise<void> {
    if (!this.isDemo) await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    this.apply(null);
  }
}

/** Exige sesión. Un super admin sin cliente elegido va al panel de la plataforma. */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  if (!auth.loggedIn()) return router.parseUrl('/login');
  if (auth.isSuperadmin() && !auth.tenant()) return router.parseUrl('/super');
  return true;
};

export const superGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.whenReady();
  if (!auth.loggedIn()) return router.parseUrl('/login');
  return auth.isSuperadmin() ? true : router.parseUrl('/');
};

/** Rutas que dependen de un módulo contratado. */
export function moduleGuard(mod: keyof TenantModules): CanActivateFn {
  return async () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    await auth.whenReady();
    return auth.modules()[mod] ? true : router.parseUrl('/inbox');
  };
}

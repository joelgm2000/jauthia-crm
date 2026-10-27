import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CrmUserInfo, PASSWORD_MIN, TenantSummary } from '@shared/api';
import { Tenant, TenantStatus } from '@shared/models';
import { AuthService } from '../../core/auth.service';
import { CrmStore } from '../../core/data/crm-store';
import { EMPTY_PROFILE, BusinessProfile } from '@shared/market';
import { BusinessProfileForm, cleanProfile } from '../../ui/business-profile-form';
import { Icon } from '../../ui/icon';
import { AgoPipe, CopPipe } from '../../ui/pipes';
import { DAY } from '@shared/time';



function emptyTenant(): Tenant {
  return {
    id: '', name: '', legalId: '', address: '', city: '', contactName: '', contactEmail: '', contactPhone: '',
    modules: { crm: true, chatbot: true },
    plan: { name: 'Completo', price: 300000, currency: 'COP', billingDay: 5 },
    status: 'prueba', trialEndsAt: Date.now() + 15 * DAY, nextDueAt: null, notes: '', createdAt: 0,
  };
}

@Component({
  selector: 'app-super-panel',
  imports: [FormsModule, Icon, CopPipe, AgoPipe, BusinessProfileForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './super-panel.html',
  styleUrl: './super-panel.css',
})
export class SuperPanel implements OnInit {
  readonly auth = inject(AuthService);
  readonly store = inject(CrmStore);
  private router = inject(Router);

  readonly tenants = signal<TenantSummary[]>([]);
  readonly loading = signal(true);
  readonly q = signal('');
  readonly statusFilter = signal<TenantStatus | 'todos'>('todos');

  // Modal de cliente
  readonly editing = signal<Tenant | null>(null);
  readonly aiKeySaved = signal(false);
  aiKey = '';
  aiKeyRemove = false;
  readonly isNew = signal(false);
  flowTemplate: 'evosport' | 'generico' = 'generico';
  sampleCatalog = false;
  adminName = '';
  adminEmail = '';
  adminPassword = '';
  confirmDelete = '';

  // Modal de usuarios del cliente
  readonly usersOf = signal<TenantSummary | null>(null);
  readonly tenantUsers = signal<CrmUserInfo[]>([]);
  nu = { name: '', email: '', password: '', role: 'asesor' as 'admin' | 'asesor' };

  // Super administradores
  readonly supers = signal<CrmUserInfo[]>([]);
  ns = { name: '', email: '', password: '' };

  readonly filtered = computed(() => {
    const q = this.q().toLowerCase();
    return this.tenants().filter(
      (t) => (this.statusFilter() === 'todos' || t.status === this.statusFilter()) && (!q || `${t.name} ${t.contactName} ${t.contactEmail} ${t.city}`.toLowerCase().includes(q)),
    );
  });

  readonly kpis = computed(() => {
    const list = this.tenants();
    const now = Date.now();
    return {
      activos: list.filter((t) => t.status === 'activo').length,
      prueba: list.filter((t) => t.status === 'prueba').length,
      suspendidos: list.filter((t) => t.status === 'suspendido').length,
      mrr: list.filter((t) => t.status === 'activo').reduce((n, t) => n + (t.plan?.price || 0), 0),
      porCobrar: list.filter((t) => t.status !== 'suspendido' && t.nextDueAt && t.nextDueAt - now < 7 * DAY).length,
      pruebasVencidas: list.filter((t) => t.status === 'prueba' && t.trialEndsAt && t.trialEndsAt < now).length,
    };
  });

  async ngOnInit(): Promise<void> {
    await this.load();
    if (this.auth.isOwner()) await this.loadSupers();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.tenants.set((await this.store.superCall('listTenants', {})).tenants);
    } finally {
      this.loading.set(false);
    }
  }

  async loadSupers(): Promise<void> {
    this.supers.set((await this.store.superCall('listSuperadmins', {})).users);
  }

  modulesLabel(t: Tenant): string {
    const base = t.modules.crm && t.modules.chatbot ? 'CRM + Chatbot' : t.modules.crm ? 'Solo CRM' : 'Solo Chatbot';
    return base + (t.modules.aiImages ? ' + IA' : '') + (t.modules.market ? ' + Mercado' : '');
  }

  /** Perfil del negocio del cliente en edición (se crea vacío la primera vez). */
  profileOf(t: Tenant): BusinessProfile {
    t.profile ??= structuredClone(EMPTY_PROFILE);
    t.profile.competitors ??= [];
    return t.profile;
  }

  dueState(t: TenantSummary): 'vencido' | 'pronto' | '' {
    const now = Date.now();
    const d = t.status === 'prueba' ? t.trialEndsAt : t.nextDueAt;
    if (!d || t.status === 'suspendido') return '';
    return d < now ? 'vencido' : d - now < 7 * DAY ? 'pronto' : '';
  }

  // ---- Fechas en <input type="date"> ----
  toDate(ts: number | null | undefined): string {
    return ts ? new Date(ts).toISOString().slice(0, 10) : '';
  }
  fromDate(v: string): number | null {
    return v ? new Date(v + 'T12:00:00').getTime() : null;
  }

  // ---- Cliente ----
  create(): void {
    this.isNew.set(true);
    this.resetAiKey(false);
    this.flowTemplate = 'generico';
    this.sampleCatalog = false;
    this.adminName = this.adminEmail = this.adminPassword = '';
    this.editing.set(emptyTenant());
  }

  edit(t: TenantSummary): void {
    const { users: _u, conversations: _c, lastActivityAt: _l, aiKeySaved, ...tenant } = t;
    this.isNew.set(false);
    this.resetAiKey(aiKeySaved);
    this.confirmDelete = '';
    this.editing.set(structuredClone(tenant));
  }

  async save(): Promise<void> {
    const t = this.editing();
    if (!t) return;
    if (!t.modules.crm && !t.modules.chatbot) {
      this.store.toast('Elige al menos un módulo: CRM, Chatbot o ambos', 'error');
      return;
    }
    const isNew = this.isNew();
    if (isNew && this.adminEmail && this.adminPassword.length < PASSWORD_MIN) {
      this.store.toast(`La contraseña del administrador debe tener al menos ${PASSWORD_MIN} caracteres`, 'error');
      return;
    }
    const payload: Tenant = {
      ...t, plan: { ...t.plan, price: Number(t.plan.price) || 0, billingDay: Number(t.plan.billingDay) || 1 },
      ...(t.profile ? { profile: cleanProfile(t.profile) } : {}),
    };
    if (isNew) delete (payload as Partial<Tenant>).id;
    const aiApiKey = this.aiKeyRemove ? '' : this.aiKey.trim() || undefined;
    const { tenant } = await this.store.superCall('saveTenant', {
      tenant: payload, ...(isNew ? { flowTemplate: this.flowTemplate, sampleCatalog: this.sampleCatalog } : {}), ...(aiApiKey !== undefined ? { aiApiKey } : {}),
    });
    this.resetAiKey(false);
    if (isNew && this.adminEmail) {
      await this.store.superCall('createTenantUser', { tenantId: tenant.id, name: this.adminName || 'Administrador', email: this.adminEmail, password: this.adminPassword, role: 'admin' });
    }
    this.adminPassword = '';
    this.editing.set(null);
    this.store.toast(isNew ? `Cliente ${tenant.name} creado` : 'Cliente actualizado', 'success');
    await this.load();
  }

  /** La clave escrita solo vive en el formulario hasta guardar; nunca se lee del servidor. */
  private resetAiKey(saved: boolean): void {
    this.aiKey = '';
    this.aiKeyRemove = false;
    this.aiKeySaved.set(saved);
  }

  async remove(): Promise<void> {
    const t = this.editing();
    if (!t) return;
    await this.store.superCall('deleteTenant', { id: t.id, confirmName: this.confirmDelete });
    this.editing.set(null);
    this.store.toast(`Cliente ${t.name} eliminado`, 'success');
    await this.load();
  }

  async manage(t: TenantSummary): Promise<void> {
    await this.store.enterTenant(t.id);
  }

  // ---- Usuarios del cliente ----
  async openUsers(t: TenantSummary): Promise<void> {
    this.usersOf.set(t);
    this.nu = { name: '', email: '', password: '', role: 'admin' };
    this.tenantUsers.set((await this.store.superCall('listTenantUsers', { tenantId: t.id })).users);
  }

  async addTenantUser(): Promise<void> {
    const t = this.usersOf();
    if (!t) return;
    await this.store.superCall('createTenantUser', { tenantId: t.id, ...this.nu });
    this.store.toast('Usuario creado', 'success');
    this.nu = { name: '', email: '', password: '', role: 'asesor' };
    this.tenantUsers.set((await this.store.superCall('listTenantUsers', { tenantId: t.id })).users);
    await this.load();
  }

  // ---- Super administradores (solo el dueño) ----
  async addSuper(): Promise<void> {
    await this.store.superCall('createSuperadmin', this.ns);
    this.ns = { name: '', email: '', password: '' };
    this.store.toast('Super administrador creado', 'success');
    await this.loadSupers();
  }

  async removeSuper(u: CrmUserInfo): Promise<void> {
    if (!confirm(`¿Quitar a ${u.name} como super administrador?`)) return;
    await this.store.superCall('removeSuperadmin', { id: u.id });
    await this.loadSupers();
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}

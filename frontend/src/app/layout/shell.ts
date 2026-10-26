import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { CrmStore } from '../core/data/crm-store';
import { Icon } from '../ui/icon';
import { InitialsPipe } from '../ui/pipes';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  badge?: () => number;
  badgeKind?: 'hot' | 'normal';
  /** Módulo que debe tener contratado el cliente. */
  module?: 'crm' | 'chatbot';
  /** Solo para administradores del cliente. */
  admin?: boolean;
}

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, InitialsPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="side" [class.open]="menuOpen()">
      <div class="brand">
        <img class="logo" src="brand/isotipo.webp" alt="JAUTHIA" />
        <div>
          <b>JAUTHIA CRM</b>
          <small>{{ auth.tenant()?.name || store.settings().companyName }}</small>
        </div>
      </div>
      <nav>
        @for (item of visibleNav(); track item.path) {
          <a [routerLink]="item.path" routerLinkActive="active" (click)="menuOpen.set(false)">
            <app-icon [name]="item.icon" [size]="18" />
            <span>{{ item.label }}</span>
            @if (item.badge && item.badge() > 0) {
              <em [class.hot]="item.badgeKind === 'hot'">{{ item.badge() }}</em>
            }
          </a>
        }
      </nav>
      <div class="side-foot">
        @if (store.mode === 'demo') {
          <div class="mode"><app-icon name="sparkles" [size]="14" /> Modo demo · datos locales</div>
        } @else {
          <div class="mode live" [class.off]="!store.online()"><span class="dot"></span> {{ store.online() ? 'Conectado al servidor' : 'Reconectando…' }}</div>
        }
        <div class="me">
          <span class="avatar" style="width:32px;height:32px;background:#1a9dd9;font-size:12px">{{ auth.user()?.name | initials }}</span>
          <div class="who"><b>{{ auth.user()?.name }}</b><small>{{ auth.user()?.email }}</small></div>
          <button class="btn ghost sm icon-only" (click)="toggleTheme()" [title]="dark() ? 'Modo claro' : 'Modo oscuro'"><app-icon [name]="dark() ? 'sun' : 'moon'" [size]="16" /></button>
          @if (!auth.isDemo) {
            <button class="btn ghost sm icon-only" (click)="logout()" title="Cerrar sesión"><app-icon name="logout" [size]="16" /></button>
          }
        </div>
      </div>
    </aside>
    <button class="burger btn icon-only" (click)="menuOpen.set(!menuOpen())"><app-icon name="menu" /></button>
    <main>
      @if (auth.isSuperadmin()) {
        <div class="acting">
          <app-icon name="sparkles" [size]="15" /> Estás gestionando a <b>{{ auth.tenant()?.name }}</b> como super administrador.
          <span class="spacer"></span>
          <button class="btn sm" (click)="store.enterTenant(null)"><app-icon name="chevronLeft" [size]="13" /> Volver al panel de la plataforma</button>
        </div>
      }
      <router-outlet />
    </main>

    <div class="toasts">
      @for (t of store.toasts(); track t.id) {
        <div class="toast" [class]="'toast ' + t.kind" (click)="openToast(t.conversationId, t.id)">
          <span>{{ t.text }}</span>
          <button class="btn ghost sm icon-only" (click)="$event.stopPropagation(); store.dismissToast(t.id)"><app-icon name="x" [size]="14" /></button>
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: flex; height: 100vh; overflow: hidden; }
    .side { width: 232px; flex: none; background: var(--side); color: var(--side-text); display: flex; flex-direction: column; padding: 14px 10px; }
    .brand { display: flex; align-items: center; gap: 10px; padding: 4px 8px 18px; }
    .brand b { color: #fff; display: block; font-family: 'Montserrat', sans-serif; font-weight: 800; font-size: 15px; letter-spacing: .08em; }
    .brand small { color: var(--side-text); font-size: 12px; }
    .logo { width: 38px; height: 38px; object-fit: contain; flex: none; filter: drop-shadow(0 4px 10px rgba(26, 157, 217, .35)); }
    nav { display: flex; flex-direction: column; gap: 2px; flex: 1; overflow-y: auto; }
    nav a { display: flex; align-items: center; gap: 11px; padding: 9px 10px; border-radius: 9px; color: var(--side-text); font-weight: 500; transition: background .15s, color .15s; }
    nav a:hover { background: rgba(255,255,255,.06); color: #fff; }
    nav a.active { background: rgba(26, 157, 217, .14); color: #fff; }
    nav a.active app-icon { color: var(--brand); }
    nav a span { flex: 1; }
    nav em { font-style: normal; font-size: 11px; font-weight: 700; background: rgba(255,255,255,.12); color: #fff; border-radius: 10px; padding: 1px 7px; }
    nav em.hot { background: var(--hot); }
    .side-foot { border-top: 1px solid rgba(255,255,255,.08); padding-top: 12px; display: flex; flex-direction: column; gap: 10px; }
    .mode { display: flex; align-items: center; gap: 6px; font-size: 12px; background: rgba(255,255,255,.05); padding: 7px 10px; border-radius: 8px; }
    .mode.live .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 0 3px rgba(16,185,129,.25); }
    .mode.live.off .dot { background: var(--warn); box-shadow: 0 0 0 3px rgba(245,158,11,.25); }
    .me { display: flex; align-items: center; gap: 8px; padding: 0 2px; }
    .me .who { flex: 1; min-width: 0; }
    .me .who b { color: #fff; display: block; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .me .who small { font-size: 11px; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--side-text); }
    .me .btn { color: var(--side-text); }
    .me .btn:hover { background: rgba(255,255,255,.08); }
    main { flex: 1; min-width: 0; overflow-y: auto; }
    .acting { display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: #312e81; color: #e0e7ff; font-size: 13px; position: sticky; top: 0; z-index: 30; }
    .acting .btn { background: transparent; color: #fff; border-color: rgba(255,255,255,.3); }
    .burger { display: none; position: fixed; top: 10px; left: 10px; z-index: 60; }
    @keyframes slide { from { transform: translateY(12px); opacity: 0; } }
    @media (max-width: 900px) {
      .side { position: fixed; inset: 0 auto 0 0; z-index: 50; transform: translateX(-100%); transition: transform .2s; }
      .side.open { transform: none; box-shadow: var(--shadow-lg); }
      .burger { display: inline-flex; }
    }
  `,
})
export class Shell {
  readonly store = inject(CrmStore);
  readonly auth = inject(AuthService);
  private router = inject(Router);
  readonly menuOpen = signal(false);
  readonly dark = signal(readTheme() === 'dark');

  readonly nav: NavItem[] = [
    { path: '/dashboard', label: 'Resumen', icon: 'dashboard', module: 'crm' },
    { path: '/inbox', label: 'Bandeja omnicanal', icon: 'inbox', badge: () => this.store.unreadTotal() },
    { path: '/pipeline', label: 'Embudo de ventas', icon: 'kanban', badge: () => this.store.hotLeads().length, badgeKind: 'hot', module: 'crm' },
    { path: '/contacts', label: 'Contactos', icon: 'users', module: 'crm' },
    { path: '/tasks', label: 'Tareas', icon: 'tasks', badge: () => this.overdue(), module: 'crm' },
    { path: '/catalog', label: 'Catálogo', icon: 'box' },
    { path: '/templates', label: 'Plantillas WhatsApp', icon: 'template' },
    { path: '/flow', label: 'Flujo del bot', icon: 'flow', module: 'chatbot', admin: true },
    { path: '/automation', label: 'Remarketing y alertas', icon: 'sparkles', module: 'chatbot', admin: true },
    { path: '/channels', label: 'Canales', icon: 'plug', admin: true },
    { path: '/settings', label: 'Configuración', icon: 'settings', admin: true },
  ];

  /** Menú según lo que contrató el cliente y el rol del usuario. */
  readonly visibleNav = computed(() => {
    const mods = this.auth.modules();
    const admin = this.auth.isAdmin();
    return this.nav.filter((i) => (!i.module || mods[i.module]) && (!i.admin || admin));
  });

  readonly overdue = computed(() => this.store.openTasks().filter((t) => t.dueAt <= Date.now()).length);

  constructor() {
    this.store.start();
    document.documentElement.dataset['theme'] = this.dark() ? 'dark' : 'light';
  }

  toggleTheme(): void {
    this.dark.set(!this.dark());
    const theme = this.dark() ? 'dark' : 'light';
    document.documentElement.dataset['theme'] = theme;
    try {
      localStorage.setItem('jauthia-theme', theme);
    } catch {
      /* sin almacenamiento */
    }
  }

  openToast(convId: string | undefined, id: string): void {
    this.store.dismissToast(id);
    if (convId) this.router.navigate(['/inbox', convId]);
  }

  async logout(): Promise<void> {
    this.store.stop();
    await this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}

function readTheme(): string | null {
  try {
    return localStorage.getItem('jauthia-theme');
  } catch {
    return null;
  }
}

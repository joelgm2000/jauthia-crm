import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CrmUserInfo, PASSWORD_MIN } from '@shared/api';
import { AuthService } from '../../core/auth.service';
import { CrmStore } from '../../core/data/crm-store';
import { Icon } from '../../ui/icon';

/** Gestión de usuarios (solo administrador). Las contraseñas se cifran en el servidor. */
@Component({
  selector: 'app-users-panel',
  imports: [FormsModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card">
      <div class="card-head"><h2>Usuarios y permisos</h2></div>
      <div class="card-pad col">
        <small class="muted"><b>Asesor</b>: atiende chats, mueve etapas y tareas. <b>Administrador</b>: además edita catálogo, flujo, canales, configuración y usuarios. Cambiar el rol, desactivar o cambiar la contraseña cierra las sesiones abiertas de ese usuario.</small>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Activo</th><th></th></tr></thead>
            <tbody>
              @for (u of users(); track u.id) {
                <tr>
                  <td><b>{{ u.name }}</b> @if (u.id === me()) { <span class="badge gray">tú</span> }</td>
                  <td>{{ u.email }}</td>
                  <td>
                    <select class="select" style="width:150px" [ngModel]="u.role" (ngModelChange)="setRole(u, $event)" [disabled]="u.id === me()">
                      <option value="asesor">Asesor</option><option value="admin">Administrador</option>
                    </select>
                  </td>
                  <td><label class="switch"><input type="checkbox" [ngModel]="u.active" (ngModelChange)="setActive(u, $event)" [disabled]="u.id === me()" /><span></span></label></td>
                  <td class="row">
                    <button class="btn sm" (click)="resetPassword(u)">Nueva contraseña</button>
                    @if (u.id !== me()) { <button class="btn sm ghost danger icon-only" (click)="remove(u)" title="Eliminar"><app-icon name="trash" [size]="14" /></button> }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="new">
          <b>Agregar usuario</b>
          <div class="row wrap">
            <input class="input" placeholder="Nombre" [(ngModel)]="name" />
            <input class="input" type="email" placeholder="correo@empresa.com" [(ngModel)]="email" />
            <input class="input" type="password" autocomplete="new-password" placeholder="Contraseña (mín. 10)" [(ngModel)]="password" />
            <select class="select" style="max-width:160px" [(ngModel)]="role"><option value="asesor">Asesor</option><option value="admin">Administrador</option></select>
            <button class="btn primary" (click)="create()"><app-icon name="plus" [size]="14" /> Crear</button>
          </div>
        </div>
      </div>
    </section>
  `,
  styles: `
    .new { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--line); padding-top: 12px; }
    .new .input { max-width: 220px; }
  `,
})
export class UsersPanel implements OnInit {
  private store = inject(CrmStore);
  private auth = inject(AuthService);
  readonly users = signal<CrmUserInfo[]>([]);
  readonly me = () => this.auth.user()?.id;
  name = '';
  email = '';
  password = '';
  role: 'admin' | 'asesor' = 'asesor';

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.users.set(await this.store.listUsers());
  }

  async create(): Promise<void> {
    if (this.password.length < PASSWORD_MIN) {
      this.store.toast(`La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`, 'error');
      return;
    }
    await this.store.createUser(this.name, this.email, this.password, this.role);
    this.name = this.email = this.password = '';
    this.store.toast('Usuario creado', 'success');
    await this.load();
  }

  async setRole(u: CrmUserInfo, role: 'admin' | 'asesor'): Promise<void> {
    await this.store.updateUser(u.id, { role });
    await this.load();
  }

  async setActive(u: CrmUserInfo, active: boolean): Promise<void> {
    await this.store.updateUser(u.id, { active });
    await this.load();
  }

  async resetPassword(u: CrmUserInfo): Promise<void> {
    const pw = prompt(`Nueva contraseña para ${u.name} (mínimo ${PASSWORD_MIN} caracteres):`);
    if (!pw) return;
    await this.store.updateUser(u.id, { password: pw });
    this.store.toast('Contraseña actualizada', 'success');
  }

  async remove(u: CrmUserInfo): Promise<void> {
    if (!confirm(`¿Eliminar a ${u.name}? Ya no podrá entrar al CRM.`)) return;
    await this.store.deleteUser(u.id);
    await this.load();
  }
}

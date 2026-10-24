import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <form class="card box" (ngSubmit)="submit()">
        <div class="logo">J</div>
        <h1>JAUTHIA CRM</h1>
        @if (auth.isDemo) {
          <p class="demo">Modo demo activo: no necesitas iniciar sesión.</p>
          <button class="btn primary" type="button" (click)="router.navigateByUrl('/')">Entrar al demo</button>
        } @else if (setup()) {
          <p class="muted">Primera vez: crea la cuenta del <b>dueño de la plataforma</b> (super administrador). Usa el correo configurado en el servidor como <code>PLATFORM_OWNER_EMAIL</code>. Solo se puede hacer una vez.</p>
          <div class="field"><label>Nombre</label><input class="input" name="name" autocomplete="name" [(ngModel)]="name" required /></div>
          <div class="field"><label>Correo</label><input class="input" type="email" name="email" autocomplete="username" [(ngModel)]="email" required /></div>
          <div class="field"><label>Contraseña (mínimo 10 caracteres)</label><input class="input" type="password" name="password" autocomplete="new-password" minlength="10" [(ngModel)]="password" required /></div>
          @if (error()) { <small class="err">{{ error() }}</small> }
          <button class="btn primary" type="submit" [disabled]="loading()">{{ loading() ? 'Creando…' : 'Crear cuenta del dueño' }}</button>
        } @else {
          <p class="muted">Ingresa con tu cuenta</p>
          <div class="field"><label>Correo</label><input class="input" type="email" name="email" autocomplete="username" [(ngModel)]="email" required /></div>
          <div class="field"><label>Contraseña</label><input class="input" type="password" name="password" autocomplete="current-password" [(ngModel)]="password" required /></div>
          @if (error()) { <small class="err">{{ error() }}</small> }
          <button class="btn primary" type="submit" [disabled]="loading()">{{ loading() ? 'Ingresando…' : 'Ingresar' }}</button>
          <small class="muted">¿Olvidaste la contraseña? Pídele a un administrador que te asigne una nueva.</small>
        }
      </form>
    </div>
  `,
  styles: `
    .wrap { min-height: 100vh; display: grid; place-items: center; padding: 16px; background: radial-gradient(circle at 20% 10%, rgba(255,107,26,.18), transparent 40%), var(--bg); }
    .box { width: 100%; max-width: 380px; padding: 28px; display: flex; flex-direction: column; gap: 14px; }
    .logo { width: 48px; height: 48px; border-radius: 14px; display: grid; place-items: center; color: #fff; font-weight: 800; font-size: 22px; background: linear-gradient(135deg, #ff6b1a, #ff3d6e); }
    h1 { font-size: 20px; }
    p { margin: -4px 0 0; line-height: 1.45; }
    .demo { margin: 0; background: var(--brand-soft); color: var(--brand); padding: 10px; border-radius: 8px; }
    .err { color: var(--danger); }
  `,
})
export class Login implements OnInit {
  readonly auth = inject(AuthService);
  readonly router = inject(Router);
  name = '';
  email = '';
  password = '';
  readonly setup = signal(false);
  readonly error = signal('');
  readonly loading = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      const st = await this.auth.status();
      this.setup.set(st.setupNeeded);
      if (st.setupNeeded && !st.ownerConfigured) this.error.set('Falta configurar PLATFORM_OWNER_EMAIL en backend/.env.');
    } catch {
      this.error.set('No hay conexión con el servidor. ¿Está corriendo el backend?');
    }
  }

  async submit(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      if (this.setup()) await this.auth.setup(this.name, this.email, this.password);
      else await this.auth.login(this.email, this.password);
      this.password = '';
      await this.router.navigateByUrl(this.auth.isSuperadmin() && !this.auth.tenant() ? '/super' : '/');
    } catch (e) {
      this.error.set((e as Error).message || 'No se pudo iniciar sesión');
    } finally {
      this.loading.set(false);
    }
  }
}

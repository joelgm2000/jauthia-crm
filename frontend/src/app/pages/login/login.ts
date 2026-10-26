import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Icon } from '../../ui/icon';

@Component({
  selector: 'app-login',
  imports: [FormsModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <section class="hero">
        <img class="brand" src="brand/logo-horizontal.webp" alt="JAUTHIA · Automatizamos tu operación para aumentar tu rentabilidad" />
        <div class="pitch">
          <span class="kicker">Tecnología que impulsa tu negocio</span>
          <h2>Automatizamos<br /><em>resultados.</em></h2>
          <p>Tus ventas de WhatsApp, Instagram y Messenger en un solo lugar, con un bot que atiende 24/7.</p>
        </div>
        <img class="team" src="brand/equipo.webp" alt="El equipo JAUTHIA saludando" />
      </section>
      <form class="card box" (ngSubmit)="submit()">
        <img class="mark" src="brand/isotipo.webp" alt="" />
        <h1>Bienvenido a <span>JAUTHIA CRM</span></h1>
        @if (auth.isDemo) {
          <p class="demo">Modo demo activo: no necesitas iniciar sesión.</p>
          <button class="btn primary" type="button" (click)="router.navigateByUrl('/')">Entrar al demo</button>
        } @else if (setup()) {
          <p class="muted">Primera vez: crea la cuenta del <b>dueño de la plataforma</b> (super administrador). Usa el correo configurado en el servidor como <code>PLATFORM_OWNER_EMAIL</code>. Solo se puede hacer una vez.</p>
          <div class="field"><label>Nombre</label><input class="input" name="name" autocomplete="name" [(ngModel)]="name" required /></div>
          <div class="field"><label>Correo</label><input class="input" type="email" name="email" autocomplete="username" [(ngModel)]="email" required /></div>
          <div class="field"><label>Contraseña (mínimo 10 caracteres)</label>
            <div class="pw"><input class="input" [type]="showPw() ? 'text' : 'password'" name="password" autocomplete="new-password" minlength="10" [(ngModel)]="password" required />
              <button type="button" class="eye" (click)="showPw.set(!showPw())" [title]="showPw() ? 'Ocultar contraseña' : 'Ver contraseña'" [attr.aria-label]="showPw() ? 'Ocultar contraseña' : 'Ver contraseña'"><app-icon [name]="showPw() ? 'eyeOff' : 'eye'" [size]="18" /></button></div>
          </div>
          @if (error()) { <small class="err">{{ error() }}</small> }
          <button class="btn primary" type="submit" [disabled]="loading()">{{ loading() ? 'Creando…' : 'Crear cuenta del dueño' }}</button>
        } @else {
          <p class="muted">Ingresa con tu cuenta</p>
          <div class="field"><label>Correo</label><input class="input" type="email" name="email" autocomplete="username" [(ngModel)]="email" required /></div>
          <div class="field"><label>Contraseña</label>
            <div class="pw"><input class="input" [type]="showPw() ? 'text' : 'password'" name="password" autocomplete="current-password" [(ngModel)]="password" required />
              <button type="button" class="eye" (click)="showPw.set(!showPw())" [title]="showPw() ? 'Ocultar contraseña' : 'Ver contraseña'" [attr.aria-label]="showPw() ? 'Ocultar contraseña' : 'Ver contraseña'"><app-icon [name]="showPw() ? 'eyeOff' : 'eye'" [size]="18" /></button></div>
          </div>
          @if (error()) { <small class="err">{{ error() }}</small> }
          <button class="btn primary" type="submit" [disabled]="loading()">{{ loading() ? 'Ingresando…' : 'Ingresar' }}</button>
          <small class="muted">¿Olvidaste la contraseña? Pídele a un administrador que te asigne una nueva.</small>
        }
      </form>
    </div>
  `,
  styles: `
    :host { display: block; }
    .wrap { min-height: 100vh; min-height: 100dvh; display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(360px, 1fr); background: var(--bg); }
    .hero {
      position: relative; overflow: hidden; color: #fff; padding: 40px 48px 0; display: flex; flex-direction: column; gap: 28px;
      background: radial-gradient(circle at 85% 15%, rgba(116, 203, 241, .22), transparent 42%), radial-gradient(circle at 10% 90%, rgba(26, 157, 217, .35), transparent 45%), #09101c;
    }
    .brand { width: 230px; max-width: 70%; height: auto; }
    .pitch { max-width: 440px; position: relative; z-index: 1; }
    .kicker { font-size: 12px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #74cbf1; }
    .pitch h2 { font-size: clamp(30px, 4vw, 46px); line-height: 1.05; font-weight: 800; margin: 10px 0 14px; }
    .pitch h2 em { font-style: normal; background: linear-gradient(90deg, #1a9dd9, #74cbf1); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .pitch p { color: #b8c6d6; font-size: 15px; line-height: 1.55; margin: 0; }
    .team { margin-top: auto; align-self: center; height: min(52vh, 480px); max-width: 80%; width: auto; object-fit: contain; object-position: bottom; filter: drop-shadow(0 20px 40px rgba(0, 0, 0, .45)); }
    .box { align-self: center; justify-self: center; width: calc(100% - 32px); max-width: 400px; margin: 24px 16px; padding: 30px; display: flex; flex-direction: column; gap: 14px; }
    .mark { width: 52px; height: auto; }
    h1 { font-size: 22px; line-height: 1.25; }
    h1 span { display: block; color: var(--brand); }
    p { margin: -4px 0 0; line-height: 1.45; }
    .demo { margin: 0; background: var(--brand-soft); color: var(--brand); padding: 10px; border-radius: 8px; }
    .err { color: var(--danger); }
    .pw { position: relative; }
    .pw .input { padding-right: 44px; }
    .eye { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); width: 36px; height: 36px; border: 0; background: none; color: var(--muted); display: grid; place-items: center; cursor: pointer; border-radius: 8px; }
    .eye:hover { color: var(--brand); background: var(--hover); }
    .btn.primary { background: var(--brand-gradient); border: 0; padding-top: 11px; padding-bottom: 11px; }

    /* Celular y tableta: arriba la marca con los muñequitos, abajo el formulario */
    @media (max-width: 900px) {
      .wrap { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
      .hero { padding: 20px 20px 0; gap: 12px; flex-direction: row; flex-wrap: wrap; align-items: flex-end; }
      .brand { width: 170px; max-width: 60%; }
      .pitch { flex: 1 1 55%; padding-bottom: 18px; }
      .pitch h2 { font-size: 28px; margin: 6px 0 8px; }
      .pitch p { font-size: 13px; }
      .team { flex: 0 0 auto; width: 130px; height: auto; margin: 0; align-self: flex-end; }
      .box { align-self: start; margin: -14px auto 24px; position: relative; z-index: 2; padding: 22px; }
      .mark { display: none; }
    }
    @media (max-width: 420px) {
      .pitch p { display: none; }
      .pitch h2 { font-size: 24px; }
      .team { width: 110px; height: auto; }
    }
  `,
})
export class Login implements OnInit {
  readonly auth = inject(AuthService);
  readonly router = inject(Router);
  name = '';
  email = '';
  password = '';
  readonly setup = signal(false);
  readonly showPw = signal(false);
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
      this.showPw.set(false);
      await this.router.navigateByUrl(this.auth.isSuperadmin() && !this.auth.tenant() ? '/super' : '/');
    } catch (e) {
      this.error.set((e as Error).message || 'No se pudo iniciar sesión');
    } finally {
      this.loading.set(false);
    }
  }
}

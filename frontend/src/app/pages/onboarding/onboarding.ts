import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  BUSINESS_FIELDS, BusinessData, DOC_KIND_LABEL, DocKind, HELP_OPTIONS, HelpOption, ONBOARDING_MAX_MB, OnboardingForm,
  OnboardingPublic, OnboardingUpload, WHATSAPP_MODE_LABEL, WHATSAPP_MODES,
} from '@shared/onboarding';
import { environment } from '../../../environments/environment';
import { Icon } from '../../ui/icon';

const MB = 1024 * 1024;

/** Fotos muy grandes del celular: se reducen antes de subirlas (sigue siendo legible para leer el RUT). */
async function shrinkImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.size < 3 * MB) return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((ok) => canvas.toBlob((b) => ok(b ?? file), 'image/jpeg', 0.85));
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(environment.apiUrl + '/api/onboarding/' + path, { ...init, headers: { 'X-CRM-Request': '1', ...(init.headers ?? {}) } });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? `Error ${res.status}`);
  return json as T;
}

@Component({
  selector: 'app-onboarding',
  imports: [FormsModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <header class="top">
        <img src="brand/isotipo.webp" alt="" class="mark" />
        <div><b>JAUTHIA</b><small>Conexión de WhatsApp, Instagram y Facebook</small></div>
      </header>

      @if (loading()) {
        <div class="card box center"><span class="spin"></span><p class="muted">Cargando…</p></div>
      } @else if (fatal()) {
        <div class="card box center"><app-icon name="info" [size]="28" /><h1>Link no disponible</h1><p class="muted">{{ fatal() }}</p></div>
      } @else if (info()?.expired) {
        <div class="card box center"><app-icon name="clock" [size]="28" /><h1>Este link venció</h1><p class="muted">Pídenos uno nuevo por WhatsApp y con gusto te lo enviamos.</p></div>
      } @else if (done() || info()?.status !== 'pendiente') {
        <div class="card box center ok">
          <div class="big-check"><app-icon name="check" [size]="34" /></div>
          <h1>¡Listo, recibimos tus datos!</h1>
          <p>Nuestro equipo los revisa y te escribe para seguir con la conexión. No tienes que hacer nada más por ahora.</p>
        </div>
      } @else {
        <div class="intro">
          <h1>Hola{{ info()?.label ? ', ' + info()!.label : '' }} 👋</h1>
          <p>Con estos datos conectamos tu negocio con Meta (WhatsApp, Instagram y Facebook). Toma unos 5 minutos. Lo que no sepas, déjalo en blanco: te ayudamos.</p>
        </div>

        <!-- 1. Negocio -->
        <section class="card step">
          <h2><span class="n">1</span> Tu negocio</h2>
          <p class="q">¿Tienes RUT?</p>
          <div class="choice two">
            <button type="button" [class.on]="form.hasRut && picked()" (click)="pickRut(true)"><b>Sí, tengo RUT</b><small>Lo subo y se llena solo</small></button>
            <button type="button" [class.on]="!form.hasRut && picked()" (click)="pickRut(false)"><b>No tengo RUT</b><small>Escribo los datos a mano</small></button>
          </div>

          @if (picked()) {
            @if (!form.hasRut) {
              <div class="note">
                <app-icon name="info" [size]="16" />
                <span>No hay problema, podemos empezar igual. Para verificar tu negocio, Meta puede pedir otro documento a nombre del negocio con la dirección (por ejemplo, un <b>recibo de luz, agua o internet</b> o un <b>extracto bancario</b>). El RUT se saca <b>gratis</b> en la página de la DIAN y, si quieres, te ayudamos.</span>
              </div>
            }

            <div class="upload">
              @if (!form.hasRut) {
                <div class="field"><label>¿Qué documento tienes? <small class="muted">(opcional)</small></label>
                  <select class="select" [(ngModel)]="docKind">
                    @for (k of altKinds; track k) { <option [value]="k">{{ kindLabel[k] }}</option> }
                  </select>
                </div>
              }
              <label class="drop" [class.busy]="uploading()">
                <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" (change)="upload($event)" [disabled]="uploading()" />
                @if (uploading()) {
                  <span class="spin"></span><b>{{ form.hasRut && info()?.ocr ? 'Leyendo tu RUT…' : 'Subiendo…' }}</b>
                } @else if (doc()) {
                  <app-icon name="check" [size]="20" /><b>{{ doc() }}</b><small>Toca para cambiarlo</small>
                } @else {
                  <app-icon name="image" [size]="22" />
                  <b>{{ form.hasRut ? 'Sube tu RUT' : 'Sube el documento' }}</b>
                  <small>{{ form.hasRut ? 'Mejor el PDF que descargas de la DIAN; si no, una foto de frente y con buena luz' : 'Foto o PDF' }} · máximo {{ maxMb }} MB</small>
                }
              </label>
              @if (notice()) { <small class="warn">{{ notice() }}</small> }
              @if (readOk()) { <small class="good"><app-icon name="sparkles" [size]="13" /> Llenamos los datos con tu RUT. Revísalos y corrige lo que haga falta.</small> }
            </div>

            <div class="grid">
              @if (form.hasRut) {
                <div class="field"><label>Tipo</label>
                  <select class="select" [(ngModel)]="form.business.tipo">
                    <option value="">—</option><option value="natural">Persona natural</option><option value="juridica">Empresa (persona jurídica)</option>
                  </select>
                </div>
                @for (f of rutFields; track f.key) {
                  <div class="field" [class.wide]="f.key === 'nombre' || f.key === 'direccion' || f.key === 'actividad'">
                    <label>{{ f.label }} @if (f.key === 'nombre') { * }</label>
                    <input class="input" [(ngModel)]="form.business[f.key]" [placeholder]="f.hint ?? ''" />
                  </div>
                }
              } @else {
                <div class="field wide"><label>Nombre del negocio *</label><input class="input" [(ngModel)]="form.business.nombre" placeholder="Ej. Gimnasio Titanes" /></div>
                <div class="field wide"><label>Nombre del dueño o responsable</label><input class="input" [(ngModel)]="form.business.representante" /></div>
                <div class="field wide"><label>Dirección</label><input class="input" [(ngModel)]="form.business.direccion" /></div>
                <div class="field"><label>Ciudad</label><input class="input" [(ngModel)]="form.business.ciudad" /></div>
                <div class="field"><label>Departamento</label><input class="input" [(ngModel)]="form.business.departamento" /></div>
              }
            </div>
          }
        </section>

        <!-- 2. Contacto -->
        <section class="card step">
          <h2><span class="n">2</span> ¿Con quién hablamos?</h2>
          <div class="grid">
            <div class="field wide"><label>Tu nombre *</label><input class="input" autocomplete="name" [(ngModel)]="form.contact.name" /></div>
            <div class="field"><label>Tu celular (WhatsApp) *</label><input class="input" type="tel" autocomplete="tel" [(ngModel)]="form.contact.phone" placeholder="300 123 4567" /></div>
            <div class="field"><label>Tu correo</label><input class="input" type="email" autocomplete="email" [(ngModel)]="form.contact.email" /></div>
          </div>
        </section>

        <!-- 3. Redes -->
        <section class="card step">
          <h2><span class="n">3</span> Tus redes</h2>
          <div class="grid">
            <div class="field"><label>Instagram</label><input class="input" [(ngModel)]="form.instagram" placeholder="@tunegocio" /></div>
            <div class="field"><label>Página de Facebook</label><input class="input" [(ngModel)]="form.facebook" placeholder="Nombre o link de la página" /></div>
            <div class="field wide"><label>Sitio web <small class="muted">(si tienes)</small></label><input class="input" type="url" [(ngModel)]="form.web" placeholder="https://" /></div>
            <div class="field wide"><label>Número de WhatsApp del negocio</label><input class="input" type="tel" [(ngModel)]="form.whatsappNumber" placeholder="El que usan tus clientes" /></div>
          </div>
          <p class="q">¿Qué quieres hacer con ese WhatsApp?</p>
          <div class="choice list">
            @for (m of modes; track m) {
              <button type="button" [class.on]="form.whatsappMode === m" (click)="form.whatsappMode = m"><span class="dot"></span>{{ modeLabel[m] }}</button>
            }
          </div>
        </section>

        <!-- 4. Meta -->
        <section class="card step">
          <h2><span class="n">4</span> Meta (Facebook) y en qué te ayudamos</h2>
          <p class="q">¿Tu negocio ya tiene cuenta de Meta Business (portafolio comercial)?</p>
          <div class="choice three">
            @for (o of metaOpts; track o[0]) {
              <button type="button" [class.on]="form.hasMetaBusiness === o[0]" (click)="form.hasMetaBusiness = $any(o[0])">{{ o[1] }}</button>
            }
          </div>
          <div class="field"><label>Correo de tu Facebook <small class="muted">(el que usas para administrar la página; así te enviamos las invitaciones)</small></label>
            <input class="input" type="email" [(ngModel)]="form.facebookEmail" />
          </div>
          <p class="q">¿En qué necesitas apoyo? <small class="muted">Marca todo lo que quieras</small></p>
          <div class="checks">
            @for (h of helpOpts; track h.id) {
              <label [class.on]="has(h.id)"><input type="checkbox" [checked]="has(h.id)" (change)="toggle(h.id)" /> {{ h.label }}</label>
            }
          </div>
          <div class="field"><label>¿Algo más que debamos saber?</label><textarea class="textarea" rows="3" [(ngModel)]="form.notes"></textarea></div>
        </section>

        <section class="card step final">
          <label class="consent"><input type="checkbox" [(ngModel)]="form.consent" />
            <span>Autorizo a JAUTHIA a usar estos datos y el documento solo para configurar y verificar los canales de mi negocio con Meta. Se guardan cifrados{{ info()?.ocrEngine === 'claude' ? '. Para leer el documento usamos la inteligencia artificial Claude (de Anthropic); no se comparte con nadie más.' : ', el documento se lee en nuestro propio servidor y no se comparte con nadie.' }}</span>
          </label>
          @if (error()) { <small class="err">{{ error() }}</small> }
          <button class="btn primary big" type="button" [disabled]="sending() || uploading()" (click)="submit()">
            {{ sending() ? 'Enviando…' : 'Enviar mis datos' }}
          </button>
        </section>
      }
    </div>
  `,
  styles: `
    :host { display: block; min-height: 100dvh; background: var(--bg); }
    .wrap { max-width: 720px; margin: 0 auto; padding: 0 16px 48px; }
    .top { display: flex; align-items: center; gap: 10px; padding: 16px 0; }
    .top b { display: block; letter-spacing: .04em; }
    .top small { color: var(--muted); font-size: 12px; }
    .mark { width: 36px; height: 36px; object-fit: contain; }
    .intro h1 { font-size: 26px; margin: 8px 0 6px; }
    .intro p { color: var(--muted); margin: 0 0 16px; line-height: 1.55; }
    .box { padding: 32px 24px; }
    .center { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 8px; margin-top: 24px; }
    .center h1 { font-size: 22px; margin: 4px 0; }
    .big-check { width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center; background: #dcfce7; color: #15803d; }
    .step { padding: 20px; margin-bottom: 14px; }
    .step h2 { font-size: 17px; margin: 0 0 12px; display: flex; align-items: center; gap: 10px; }
    .n { width: 26px; height: 26px; border-radius: 50%; background: var(--brand); color: #fff; display: grid; place-items: center; font-size: 13px; flex: none; }
    .q { font-weight: 600; margin: 14px 0 8px; }
    .choice { display: grid; gap: 8px; }
    .choice.two { grid-template-columns: 1fr 1fr; }
    .choice.three { grid-template-columns: repeat(3, 1fr); }
    .choice button { text-align: left; border: 2px solid var(--line); background: var(--card); color: var(--text); border-radius: 12px; padding: 12px 14px; cursor: pointer; font: inherit; display: flex; flex-direction: column; gap: 2px; }
    .choice.list button { flex-direction: row; align-items: center; gap: 10px; }
    .choice.three button { align-items: center; text-align: center; }
    .choice button small { color: var(--muted); }
    .choice button.on { border-color: var(--brand); background: var(--brand-soft); }
    .dot { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--line); flex: none; }
    .on .dot { border: 5px solid var(--brand); }
    .note { display: flex; gap: 10px; align-items: flex-start; background: var(--brand-soft); border-radius: 12px; padding: 12px 14px; margin-top: 12px; line-height: 1.5; font-size: 14px; }
    .note app-icon { flex: none; margin-top: 2px; color: var(--brand); }
    .upload { margin-top: 14px; display: flex; flex-direction: column; gap: 6px; }
    .drop { position: relative; border: 2px dashed var(--line); border-radius: 14px; padding: 22px 16px; display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; text-align: center; color: var(--text); }
    .drop:hover { border-color: var(--brand); }
    .drop small { color: var(--muted); }
    .drop input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .drop.busy { cursor: progress; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; margin-top: 12px; }
    .grid .wide { grid-column: 1 / -1; }
    .checks { display: flex; flex-direction: column; gap: 6px; }
    .checks label { display: flex; gap: 10px; align-items: center; border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; cursor: pointer; }
    .checks label.on { border-color: var(--brand); background: var(--brand-soft); }
    .consent { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; line-height: 1.5; color: var(--muted); }
    .consent input { margin-top: 3px; flex: none; }
    .final { display: flex; flex-direction: column; gap: 12px; }
    .big { padding: 14px; font-size: 16px; justify-content: center; }
    .warn { color: #b45309; }
    .good { color: #15803d; display: flex; gap: 6px; align-items: center; }
    .err { color: #dc2626; }
    .spin { width: 22px; height: 22px; border: 3px solid var(--line); border-top-color: var(--brand); border-radius: 50%; animation: s .8s linear infinite; }
    @keyframes s { to { transform: rotate(360deg); } }
    @media (max-width: 560px) {
      .grid, .choice.two { grid-template-columns: 1fr; }
      .choice.three { grid-template-columns: 1fr; }
      .choice.three button { align-items: flex-start; text-align: left; }
      .intro h1 { font-size: 22px; }
    }
  `,
})
export class Onboarding implements OnInit {
  private route = inject(ActivatedRoute);
  private token = '';

  readonly loading = signal(true);
  readonly fatal = signal('');
  readonly info = signal<OnboardingPublic | null>(null);
  readonly picked = signal(false);
  readonly uploading = signal(false);
  readonly doc = signal('');
  readonly notice = signal('');
  readonly readOk = signal(false);
  readonly sending = signal(false);
  readonly done = signal(false);
  readonly error = signal('');

  readonly maxMb = ONBOARDING_MAX_MB;
  readonly rutFields = BUSINESS_FIELDS;
  readonly modes = WHATSAPP_MODES;
  readonly modeLabel = WHATSAPP_MODE_LABEL;
  readonly helpOpts = HELP_OPTIONS;
  readonly kindLabel = DOC_KIND_LABEL;
  readonly altKinds: DocKind[] = ['recibo', 'camara', 'otro'];
  readonly metaOpts = [['si', 'Sí'], ['no', 'No'], ['no_se', 'No sé']];
  docKind: DocKind = 'recibo';

  form: OnboardingForm = {
    hasRut: true, business: { tipo: '' }, contact: { name: '', phone: '', email: '' },
    whatsappMode: 'no_se', hasMetaBusiness: 'no_se', facebookEmail: '', help: [], consent: false,
  };
  private helpSet = signal<Set<HelpOption>>(new Set());

  async ngOnInit(): Promise<void> {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    try {
      this.info.set(await call<OnboardingPublic>(encodeURIComponent(this.token)));
    } catch (e) {
      this.fatal.set((e as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  pickRut(v: boolean): void {
    this.form.hasRut = v;
    this.picked.set(true);
  }

  has(id: HelpOption): boolean {
    return this.helpSet().has(id);
  }
  toggle(id: HelpOption): void {
    const s = new Set(this.helpSet());
    if (s.has(id)) s.delete(id);
    else s.add(id);
    this.helpSet.set(s);
  }

  async upload(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.notice.set('');
    this.readOk.set(false);
    const body = await shrinkImage(file).catch(() => file);
    if (body.size > ONBOARDING_MAX_MB * MB) {
      this.notice.set(`El archivo pesa más de ${ONBOARDING_MAX_MB} MB. Toma la foto de nuevo o sube el PDF.`);
      return;
    }
    this.uploading.set(true);
    try {
      const kind: DocKind = this.form.hasRut ? 'rut' : this.docKind;
      const r = await call<OnboardingUpload>(`${encodeURIComponent(this.token)}/document?kind=${kind}&name=${encodeURIComponent(file.name.slice(0, 80))}`, {
        method: 'POST', headers: { 'Content-Type': body.type || 'application/octet-stream' }, body,
      });
      this.doc.set(file.name);
      if (r.notice) this.notice.set(r.notice);
      if (r.data) {
        // Solo se llenan los campos vacíos: lo que el cliente ya escribió no se pisa.
        const b = this.form.business as Record<string, string | undefined>;
        for (const [k, v] of Object.entries(r.data as BusinessData)) if (v && !b[k]) b[k] = v;
        this.readOk.set(true);
        if (!this.form.contact.email && r.data.correo) this.form.contact.email = r.data.correo;
      }
    } catch (e) {
      this.notice.set((e as Error).message);
    } finally {
      this.uploading.set(false);
    }
  }

  async submit(): Promise<void> {
    this.error.set('');
    if (!this.picked()) return this.error.set('Cuéntanos si tienes RUT (paso 1).');
    if (!this.form.business.nombre?.trim()) return this.error.set('Escribe el nombre del negocio (paso 1).');
    if (!this.form.contact.name.trim() || this.form.contact.phone.replace(/\D/g, '').length < 7) return this.error.set('Escribe tu nombre y tu celular (paso 2).');
    if (!this.form.consent) return this.error.set('Marca la autorización para poder enviar.');
    this.sending.set(true);
    try {
      const clean = (o: object) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]).filter(([, v]) => v !== '' && v !== undefined));
      const payload = {
        ...this.form,
        business: clean(this.form.business),
        contact: { name: this.form.contact.name.trim(), phone: this.form.contact.phone.trim(), email: this.form.contact.email.trim() },
        help: [...this.helpSet()],
        ...Object.fromEntries(['web', 'instagram', 'facebook', 'whatsappNumber', 'notes', 'facebookEmail'].map((k) => [k, ((this.form as unknown as Record<string, string | undefined>)[k] ?? '').trim()])),
      };
      await call(`${encodeURIComponent(this.token)}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      this.done.set(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.sending.set(false);
    }
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BusinessProfile, EMPTY_PROFILE, Lead, MARKET_KIND_LABEL, MarketData, MarketKind, MarketReport, profileMissing, ScriptIdea } from '@shared/market';
import { AuthService } from '../../core/auth.service';
import { CrmStore } from '../../core/data/crm-store';
import { api } from '../../core/http';
import { BusinessProfileForm, cleanProfile } from '../../ui/business-profile-form';
import { Icon } from '../../ui/icon';

type Tab = MarketKind | 'perfil';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'competencia', label: 'Competencia', icon: 'trend' },
  { id: 'guiones', label: 'Guiones', icon: 'play' },
  { id: 'clientes', label: 'Clientes potenciales', icon: 'users' },
  { id: 'perfil', label: 'Perfil del negocio', icon: 'edit' },
];

const HINTS: Record<MarketKind, { placeholder: string; button: string; intro: string }> = {
  competencia: {
    intro: 'La IA investiga a tu competencia en internet y te dice dónde enfocarte que ellos no.',
    placeholder: 'Opcional: ej. "compárame con las tiendas en línea que venden en Valledupar"',
    button: 'Analizar competencia',
  },
  guiones: {
    intro: 'Ideas de videos y publicaciones para tu nicho, con gancho, escenas y llamado a la acción, listas para grabar.',
    placeholder: 'Opcional: ej. "videos para TikTok sobre las caminadoras" o "temporada de diciembre"',
    button: 'Crear guiones',
  },
  clientes: {
    intro: 'Negocios reales que podrían comprarte, con sus datos públicos y un mensaje para el primer contacto.',
    placeholder: 'Opcional: ej. "gimnasios y hoteles en Valledupar y Riohacha"',
    button: 'Buscar clientes',
  },
};

/**
 * Inteligencia de mercado: competencia y oportunidades, ideas de guiones y clientes potenciales.
 * La IA investiga en internet a partir del perfil del negocio. Solo administradores pueden generar análisis.
 */
@Component({
  selector: 'app-market',
  imports: [FormsModule, Icon, BusinessProfileForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './market.html',
  styleUrl: './market.css',
})
export class Market implements OnInit {
  private readonly store = inject(CrmStore);
  readonly auth = inject(AuthService);
  readonly tabs = TABS;
  readonly hints = HINTS;
  readonly kindLabel = MARKET_KIND_LABEL;

  readonly tab = signal<Tab>('competencia');
  readonly loading = signal(true);
  readonly reports = signal<MarketReport[]>([]);
  readonly remaining = signal(0);
  readonly busy = signal<MarketKind | null>(null);
  readonly selected = signal<Record<MarketKind, string | null>>({ competencia: null, guiones: null, clientes: null });
  readonly profile = signal<BusinessProfile>(structuredClone(EMPTY_PROFILE));
  readonly profileDirty = signal(false);
  readonly savingProfile = signal(false);
  readonly missing = computed(() => (this.profileDirty(), profileMissing(this.profile())));
  request: Record<MarketKind, string> = { competencia: '', guiones: '', clientes: '' };

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const d = await api<MarketData>('/api/market');
      this.reports.set(d.reports);
      this.remaining.set(d.remainingToday);
      this.profile.set({ ...structuredClone(EMPTY_PROFILE), ...d.profile, competitors: d.profile.competitors ?? [] });
      if (profileMissing(d.profile).length) this.tab.set('perfil');
    } catch (e) {
      this.store.toast((e as Error).message, 'error');
    } finally {
      this.loading.set(false);
    }
  }

  history(kind: MarketKind): MarketReport[] {
    return this.reports().filter((r) => r.kind === kind);
  }

  /** Análisis a mostrar: el elegido en el historial o el más reciente. */
  current(kind: MarketKind): MarketReport | undefined {
    const list = this.history(kind);
    const id = this.selected()[kind];
    return list.find((r) => r.id === id) ?? list[0];
  }

  select(kind: MarketKind, id: string): void {
    this.selected.update((s) => ({ ...s, [kind]: id }));
  }

  async run(kind: MarketKind): Promise<void> {
    if (this.busy()) return;
    if (this.profileDirty()) await this.saveProfile();
    this.busy.set(kind);
    try {
      const r = await api<{ report: MarketReport; remainingToday: number }>('/api/market/run', { method: 'POST', body: { kind, request: this.request[kind].trim() || undefined } });
      this.reports.update((list) => [r.report, ...list]);
      this.remaining.set(r.remainingToday);
      this.select(kind, r.report.id);
      this.store.toast('Análisis listo', 'success');
    } catch (e) {
      this.store.toast((e as Error).message, 'error');
    } finally {
      this.busy.set(null);
    }
  }

  async saveProfile(): Promise<void> {
    this.savingProfile.set(true);
    try {
      const r = await api<{ profile: BusinessProfile }>('/api/market/profile', { method: 'PUT', body: { profile: cleanProfile(this.profile()) } });
      this.profile.set({ ...structuredClone(EMPTY_PROFILE), ...r.profile });
      this.profileDirty.set(false);
      this.store.toast('Perfil guardado', 'success');
    } catch (e) {
      this.store.toast((e as Error).message, 'error');
    } finally {
      this.savingProfile.set(false);
    }
  }

  async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.store.toast('Copiado', 'success');
    } catch {
      this.store.toast('No se pudo copiar', 'error');
    }
  }

  scriptText(s: ScriptIdea): string {
    return [`${s.title} (${s.format} · ${s.angle})`, `Gancho: ${s.hook}`, ...s.scenes.map((x, i) => `${i + 1}. ${x}`), `Cierre: ${s.cta}`].join('\n');
  }

  /** Enlace de WhatsApp con el mensaje sugerido (solo si hay un número). */
  waLink(l: Lead): string | null {
    const digits = (l.phone ?? '').replace(/\D/g, '');
    if (digits.length < 7) return null;
    return `https://wa.me/${digits.length === 10 ? '57' + digits : digits}?text=${encodeURIComponent(l.approach)}`;
  }

  /** "27 oct, 10:15 a. m." (o con el mes completo). */
  when(ts: number, long = false): string {
    return new Date(ts).toLocaleString('es-CO', { day: 'numeric', month: long ? 'long' : 'short', hour: 'numeric', minute: '2-digit' });
  }

  stars(n: number): string {
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  }

  exportLeads(r: MarketReport): void {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Negocio', 'Tipo', 'Ciudad', 'Web', 'Teléfono', 'Instagram', 'Puntaje', 'Por qué', 'Mensaje sugerido']];
    for (const l of r.leads ?? []) rows.push([l.name, l.type, l.city, l.website ?? '', l.phone ?? '', l.instagram ?? '', String(l.fit), l.why, l.approach]);
    const blob = new Blob(['﻿' + rows.map((x) => x.map(esc).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `clientes-potenciales-${new Date(r.createdAt).toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  isKind(t: Tab): t is MarketKind {
    return t !== 'perfil';
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { DiscoverResult, FoundAccount } from '@shared/social';
import { avg, engagementRate, followersDelta, interactions, NETWORK_LABEL, postsPerWeek, SocialAccount, SocialPost, SocialStatsData } from '@shared/social';
import { CrmStore } from '../../core/data/crm-store';
import { api } from '../../core/http';
import { Icon } from '../../ui/icon';

interface Ranked { post: SocialPost; account: SocialAccount }

const compact = new Intl.NumberFormat('es-CO', { notation: 'compact', maximumFractionDigits: 1 });
const full = new Intl.NumberFormat('es-CO');

/**
 * Estadísticas REALES de redes del cliente y su competencia, leídas con las APIs oficiales.
 * Cada cifra muestra su fuente y su fecha. Nadie escribe cifras a mano.
 */
@Component({
  selector: 'app-market-stats',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './market-stats.html',
  styleUrl: './market-stats.css',
})
export class MarketStats implements OnInit {
  private readonly store = inject(CrmStore);
  readonly admin = input(false);
  readonly printing = input(false);
  readonly pdf = output<void>();
  /** Avisa cuando hay datos (el padre habilita "Analizar con IA"). */
  readonly ready = output<boolean>();
  /** La búsqueda de cuentas cambió el perfil del negocio (el padre lo vuelve a cargar). */
  readonly profileChanged = output<void>();

  readonly label = NETWORK_LABEL;
  readonly data = signal<SocialStatsData | null>(null);
  readonly loading = signal(true);
  readonly refreshing = signal(false);
  readonly discovering = signal(false);
  readonly found = signal<DiscoverResult | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    try {
      this.set(await api<SocialStatsData>('/api/market/social'));
    } catch (e) {
      this.store.toast((e as Error).message, 'error');
    } finally {
      this.loading.set(false);
    }
  }

  private set(d: SocialStatsData): void {
    this.data.set(d);
    this.ready.emit(d.accounts.some((a) => a.posts.length > 0));
  }

  async refresh(): Promise<void> {
    if (this.refreshing()) return;
    this.refreshing.set(true);
    try {
      const r = await api<{ ok: number; failed: number; data: SocialStatsData }>('/api/market/social/refresh', { method: 'POST', body: {} });
      this.set(r.data);
      this.store.toast(r.failed ? `API oficial: ${r.ok} cuentas leídas, ${r.failed} con problemas (mira el detalle en cada una)` : `API oficial: ${r.ok} cuentas leídas`, r.failed ? 'info' : 'success');
    } catch (e) {
      this.store.toast((e as Error).message, 'error');
    } finally {
      this.refreshing.set(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Buscar cuentas con la IA (3 búsquedas por empresa)
  // ---------------------------------------------------------------------------

  async discover(): Promise<void> {
    if (this.discovering()) return;
    this.discovering.set(true);
    try {
      const r = await api<DiscoverResult>('/api/market/social/discover', { method: 'POST', body: {} });
      this.found.set(r);
      if (r.confirmed.length) this.profileChanged.emit();
      await this.load();
      this.store.toast(`Se revisaron ${r.searched} empresas: ${r.confirmed.length} cuentas confirmadas y ${r.doubtful.length} por confirmar`, 'success');
    } catch (e) {
      this.store.toast((e as Error).message, 'error');
    } finally {
      this.discovering.set(false);
    }
  }

  async accept(f: FoundAccount): Promise<void> {
    try {
      await api('/api/market/social/accept', { method: 'POST', body: { owner: f.owner, network: f.network, handle: f.handle } });
      this.found.update((r) => (r ? { ...r, doubtful: r.doubtful.filter((x) => x !== f), confirmed: [...r.confirmed, f] } : r));
      this.profileChanged.emit();
      await this.load();
    } catch (e) {
      this.store.toast((e as Error).message, 'error');
    }
  }

  dismiss(f: FoundAccount): void {
    this.found.update((r) => (r ? { ...r, doubtful: r.doubtful.filter((x) => x !== f) } : r));
  }

  // ---------------------------------------------------------------------------
  // Vistas
  // ---------------------------------------------------------------------------

  /** Cuentas agrupadas por dueño: primero el negocio, luego cada competidor. */
  readonly owners = computed(() => {
    const groups = new Map<string, SocialAccount[]>();
    for (const a of [...(this.data()?.accounts ?? [])].sort((x, y) => Number(y.isSelf) - Number(x.isSelf))) {
      groups.set(a.owner, [...(groups.get(a.owner) ?? []), a]);
    }
    return [...groups.entries()].map(([owner, accounts]) => ({ owner, accounts, isSelf: accounts[0].isSelf }));
  });

  /** Las publicaciones que mejor funcionaron, de todas las cuentas (por interacciones, luego visitas). */
  readonly ranking = computed<Ranked[]>(() =>
    (this.data()?.accounts ?? [])
      .flatMap((account) => account.posts.map((post) => ({ post, account })))
      .filter((r) => r.post.likes !== undefined || r.post.comments !== undefined || r.post.views !== undefined)
      .sort((a, b) => interactions(b.post) - interactions(a.post) || (b.post.views ?? 0) - (a.post.views ?? 0))
      .slice(0, 10),
  );

  readonly withFollowers = computed(() => (this.data()?.accounts ?? []).filter((a) => a.followers !== undefined).sort((a, b) => b.followers! - a.followers!));
  readonly maxFollowers = computed(() => Math.max(1, ...this.withFollowers().map((a) => a.followers!)));
  readonly withEngagement = computed(() =>
    (this.data()?.accounts ?? []).map((a) => ({ a, er: engagementRate(a) })).filter((x): x is { a: SocialAccount; er: number } => x.er !== undefined).sort((x, y) => y.er - x.er),
  );
  readonly maxEngagement = computed(() => Math.max(0.01, ...this.withEngagement().map((x) => x.er)));
  stats(a: SocialAccount) {
    return {
      ppw: postsPerWeek(a.posts),
      likes: avg(a.posts, (p) => p.likes),
      comments: avg(a.posts, (p) => p.comments),
      views: avg(a.posts, (p) => p.views),
      er: engagementRate(a),
      delta: followersDelta(a),
    };
  }

  /** Últimas publicaciones en orden de fecha (para el gráfico de barras). */
  chart(a: SocialAccount): { post: SocialPost; value: number; pct: number }[] {
    const posts = [...a.posts].sort((x, y) => x.date - y.date).slice(-12);
    const useViews = posts.some((p) => p.views !== undefined);
    const vals = posts.map((p) => (useViews ? p.views ?? 0 : interactions(p)));
    const max = Math.max(1, ...vals);
    return posts.map((post, i) => ({ post, value: vals[i], pct: Math.max(3, (vals[i] / max) * 100) }));
  }

  chartMetric(a: SocialAccount): string {
    return a.posts.some((p) => p.views !== undefined) ? 'visitas' : 'interacciones';
  }

  latest(a: SocialAccount): SocialPost[] {
    return [...a.posts].sort((x, y) => y.date - x.date).slice(0, this.printing() ? 15 : 8);
  }

  /** "@usuario" (los canales de YouTube ya traen la @; los ids UC… se muestran tal cual). */
  at(a: Pick<SocialAccount, 'handle'>): string {
    return a.handle.startsWith('@') || a.handle.startsWith('UC') ? a.handle : '@' + a.handle;
  }

  n(v: number | undefined, compactForm = true): string {
    return v === undefined ? '—' : compactForm ? compact.format(v) : full.format(v);
  }

  when(ts: number | undefined, withTime = false): string {
    if (!ts) return '';
    return new Date(ts).toLocaleString('es-CO', { day: 'numeric', month: 'short', year: withTime ? undefined : 'numeric', ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}) });
  }
}

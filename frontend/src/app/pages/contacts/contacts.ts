import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { stageDef } from '@shared/flow';
import { StageId } from '@shared/models';
import { CrmStore } from '../../core/data/crm-store';
import { ChannelIcon } from '../../ui/channel-icon';
import { Icon } from '../../ui/icon';
import { AgoPipe, CopPipe, InitialsPipe } from '../../ui/pipes';

@Component({
  selector: 'app-contacts',
  imports: [FormsModule, RouterLink, Icon, ChannelIcon, AgoPipe, CopPipe, InitialsPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Contactos</h1><p>Todos los clientes de todas las redes con los campos que llenó el bot.</p></div>
        <span class="spacer"></span>
        <input class="input" style="width:260px" placeholder="Buscar…" [ngModel]="q()" (ngModelChange)="q.set($event)" />
        <select class="select" style="width:200px" [ngModel]="tag()" (ngModelChange)="tag.set($event)">
          <option value="">Todas las etiquetas</option>
          @for (t of tags(); track t) { <option [value]="t">{{ t }}</option> }
        </select>
        <button class="btn" (click)="exportCsv()"><app-icon name="external" [size]="14" /> Exportar CSV</button>
      </div>
      <div class="card table-wrap">
        <table class="table">
          <thead>
            <tr><th>Cliente</th><th>Canal</th><th>Ciudad</th><th>Uso</th><th>Interés</th><th>Etapa</th><th>Puntaje</th><th>Valor</th><th>Etiquetas</th><th>Último mensaje</th></tr>
          </thead>
          <tbody>
            @for (c of rows(); track c.id) {
              <tr [routerLink]="['/inbox', c.id]" class="clickable">
                <td><span class="row"><span class="avatar" [style.background]="c.avatarColor" style="width:30px;height:30px;font-size:11px">{{ c.name | initials }}</span><span class="col0"><b>{{ c.name }}</b><small>{{ c.phone || c.externalId }}</small></span></span></td>
                <td><app-channel-icon [channel]="c.channel" [size]="20" /></td>
                <td>{{ c.fields.ciudad || '—' }}</td>
                <td>{{ c.fields.uso || '—' }}</td>
                <td class="cap">{{ c.fields.modeloInteres || c.fields.subcategoria || c.fields.categoria || '—' }}</td>
                <td><span class="stage" [style.--c]="color(c.stage)">{{ stageName(c.stage) }}</span></td>
                <td>@if (c.hot) { <span class="badge hot">🔥 {{ c.score }}</span> } @else { {{ c.score }} }</td>
                <td>{{ c.value | cop: true }}</td>
                <td><span class="row wrap">@for (t of c.tags.slice(0, 3); track t) { <span class="chip">{{ t }}</span> }</span></td>
                <td><small>{{ c.lastMessageAt | ago }}</small></td>
              </tr>
            } @empty {
              <tr><td colspan="10" class="empty">Sin contactos</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: `
    .clickable { cursor: pointer; }
    .col0 { display: flex; flex-direction: column; }
    .cap { text-transform: capitalize; }
    .stage { font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 6px; color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); white-space: nowrap; }
  `,
})
export class Contacts {
  readonly store = inject(CrmStore);
  readonly q = signal('');
  readonly tag = signal('');
  readonly tags = computed(() => [...new Set(this.store.conversations().flatMap((c) => c.tags))].sort());
  readonly rows = computed(() => {
    const q = this.q().toLowerCase();
    return this.store
      .sortedConversations()
      .filter((c) => (!this.tag() || c.tags.includes(this.tag())) && (!q || JSON.stringify([c.name, c.phone, c.fields]).toLowerCase().includes(q)));
  });

  stageName(id: StageId): string {
    return stageDef(id)?.name ?? id;
  }
  color(id: StageId): string {
    return stageDef(id)?.color ?? '#999';
  }

  exportCsv(): void {
    const cols = ['nombre', 'canal', 'telefono', 'ciudad', 'uso', 'categoria', 'equipo', 'modelo', 'etapa', 'puntaje', 'valor', 'forma_pago', 'cedula', 'correo', 'direccion', 'etiquetas'];
    // Un valor que empieza con = + - @ se abriría como fórmula en Excel: se antepone una comilla.
    const FORMULA = /^[=+\-@\t\r]/;
    const esc = (v: unknown) => {
      const t = String(v ?? '');
      return `"${(FORMULA.test(t) ? "'" + t : t).replace(/"/g, '""')}"`;
    };
    const lines = this.rows().map((c) =>
      [c.name, c.channel, c.phone, c.fields.ciudad, c.fields.uso, c.fields.categoria, c.fields.subcategoria, c.fields.modeloInteres, this.stageName(c.stage), c.score, c.value, c.fields.formaPago, c.fields.cedula, c.fields.correo, c.fields.direccion, c.tags.join(' ')]
        .map(esc)
        .join(','),
    );
    const blob = new Blob(['﻿' + [cols.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'contactos-crm.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CrmStore } from '../../core/data/crm-store';
import { Icon } from '../../ui/icon';
import { AgoPipe } from '../../ui/pipes';

@Component({
  selector: 'app-tasks',
  imports: [RouterLink, Icon, AgoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page" style="max-width:980px">
      <div class="page-head">
        <div><h1>Tareas</h1><p>El bot crea una tarea con la nota resumen cada vez que pasa un cliente al asesor. Fuera de horario, queda para primera hora.</p></div>
        <span class="spacer"></span>
        <div class="row">
          <button class="chip" [class.on]="!showDone()" (click)="showDone.set(false)">Pendientes ({{ store.openTasks().length }})</button>
          <button class="chip" [class.on]="showDone()" (click)="showDone.set(true)">Completadas</button>
        </div>
      </div>
      <div class="card">
        @for (t of list(); track t.id) {
          <div class="task" [class.done]="t.done">
            <input type="checkbox" [checked]="t.done" (change)="store.toggleTask(t)" />
            <div class="tm">
              <div class="row"><b>{{ t.title }}</b>
                @if (t.priority === 'alta') { <span class="badge high">Prioridad alta</span> }
                @if (!t.done && t.dueAt < now) { <span class="badge warn">Vencida</span> }
              </div>
              <small>{{ t.detail }}</small>
              <small class="meta"><app-icon name="clock" [size]="12" /> {{ t.dueAt | ago }} · {{ advisor(t.assignedTo) }}</small>
            </div>
            <a class="btn sm" [routerLink]="['/inbox', t.conversationId]"><app-icon name="inbox" [size]="13" /> Abrir chat</a>
            <button class="btn sm ghost icon-only" (click)="store.removeTask(t.id)" title="Eliminar"><app-icon name="trash" [size]="14" /></button>
          </div>
        } @empty {
          <div class="empty">No hay tareas aquí ✨</div>
        }
      </div>
    </div>
  `,
  styles: `
    .task { display: flex; gap: 12px; align-items: flex-start; padding: 14px 18px; border-bottom: 1px solid var(--line); }
    .task:last-child { border: 0; }
    .task input { margin-top: 4px; width: 16px; height: 16px; accent-color: var(--brand); }
    .tm { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .meta { display: inline-flex; align-items: center; gap: 4px; }
    .done .tm { opacity: .55; text-decoration: line-through; }
  `,
})
export class Tasks {
  readonly store = inject(CrmStore);
  readonly now = Date.now();
  readonly showDone = signal(false);
  readonly list = computed(() =>
    this.showDone() ? this.store.tasks().filter((t) => t.done).sort((a, b) => b.dueAt - a.dueAt) : this.store.openTasks(),
  );
  advisor(id: string | null | undefined): string {
    return this.store.settings().advisors.find((a) => a.id === id)?.name ?? 'Sin asignar';
  }
}

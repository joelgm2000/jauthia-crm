import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DEFAULT_FLOW, FlowConfig, FlowNode } from '@shared/flow';
import { buildSellerPrompt, DEFAULT_PERSONA, DEFAULT_REQUIRED, REQUIRED_LABELS, RequiredDatum, RequiredKey, SELLER_TONES } from '@shared/seller';
import { CrmStore } from '../../core/data/crm-store';
import { Icon } from '../../ui/icon';

/** Pregunta por defecto para cada dato que se puede volver obligatorio. */
const DEFAULT_QUESTIONS: Partial<Record<RequiredKey, string>> = {
  correo: '¿A qué correo te enviamos la cotización? 📧',
  cedula: '¿Me compartes tu número de cédula para la factura?',
  direccion: '¿Cuál es la dirección de entrega?',
  formaPago: '¿Cómo te gustaría pagar? (efectivo, transferencia, tarjeta…)',
};

/** Completa un flujo antiguo con el vendedor, los datos obligatorios y sus preguntas por defecto. */
export function ensureSellerConfig(f: FlowConfig): FlowConfig {
  f.persona = { ...DEFAULT_PERSONA, ...(f.persona ?? {}) };
  f.required = f.required ?? structuredClone(DEFAULT_REQUIRED);
  for (const r of f.required) {
    if (r.nodeId && !f.nodes.some((n) => n.id === r.nodeId)) {
      const def = DEFAULT_FLOW.nodes.find((n) => n.id === r.nodeId);
      if (def) f.nodes.push(structuredClone(def));
    }
  }
  return f;
}

/**
 * Pestaña "Vendedor y datos básicos" del editor de flujo:
 *  - El vendedor virtual: nombre, rol, tono, objetivo, reglas y su prompt.
 *  - Las preguntas básicas: datos que el bot SIEMPRE debe conseguir y cuándo pedirlos.
 */
@Component({
  selector: 'app-seller-panel',
  imports: [FormsModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './seller-panel.html',
  styleUrl: './flow-editor.css',
})
export class SellerPanel {
  readonly store = inject(CrmStore);
  readonly flow = input.required<FlowConfig>();
  readonly changed = output<void>();
  readonly tones = SELLER_TONES;
  readonly labels = REQUIRED_LABELS;
  /** Datos que aún se pueden agregar como obligatorios. */
  readonly available = computed(() => {
    const used = new Set((this.flow().required ?? []).map((r) => r.key));
    return (Object.keys(REQUIRED_LABELS) as RequiredKey[]).filter((k) => !used.has(k));
  });
  newKey: RequiredKey | '' = '';

  touch(): void {
    this.changed.emit();
  }

  nodeOf(r: RequiredDatum): FlowNode | undefined {
    return this.flow().nodes.find((n) => n.id === r.nodeId);
  }

  /** Prompt que corresponde a la configuración actual. */
  generated(): string {
    return buildSellerPrompt(this.flow(), this.store.settings());
  }

  regeneratePrompt(): void {
    this.flow().persona!.prompt = this.generated();
    this.touch();
  }

  addRule(): void {
    this.flow().persona!.rules.push('');
    this.touch();
  }

  removeRule(i: number): void {
    this.flow().persona!.rules.splice(i, 1);
    this.touch();
  }

  move(i: number, delta: number): void {
    const list = this.flow().required!;
    const j = i + delta;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    this.touch();
  }

  remove(i: number): void {
    this.flow().required!.splice(i, 1);
    this.touch();
  }

  /** Agrega un dato obligatorio y, si hace falta, la pregunta que lo pide (en la ruta "basicas"). */
  add(): void {
    const key = this.newKey;
    if (!key) return;
    const f = this.flow();
    let nodeId: string | undefined;
    if (key !== 'producto' && key !== 'nombre') {
      // Reutiliza una pregunta del flujo que ya guarde ese campo (p. ej. "uso"), o crea una nueva.
      const existing = f.nodes.find((n) => n.kind === 'question' && n.field === key);
      const def = DEFAULT_FLOW.nodes.find((n) => n.route === 'basicas' && n.field === key);
      if (existing) nodeId = existing.id;
      else {
        const node: FlowNode = def
          ? structuredClone(def)
          : { id: `pedir_${key}`, kind: 'question', route: 'basicas', title: REQUIRED_LABELS[key] ?? key, message: DEFAULT_QUESTIONS[key] ?? `¿Me compartes tu ${(REQUIRED_LABELS[key] ?? key).toLowerCase()}?`, display: 'text', field: key, parse: 'text' };
        f.nodes.push(node);
        nodeId = node.id;
      }
    } else if (key === 'nombre') {
      nodeId = f.startNode;
    }
    f.required!.push({ key, label: REQUIRED_LABELS[key] ?? key, when: 'antes_asesor', nodeId });
    this.newKey = '';
    this.touch();
  }
}

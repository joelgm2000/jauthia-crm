/**
 * Motor del bot SDR. Es puro (sin I/O): recibe la conversación + el mensaje entrante y devuelve
 * las respuestas, el parche de la conversación, las notas y las tareas.
 * Lo usan el backend Node/Express (backend/src/core.ts) y el modo demo del navegador.
 */
import { canBeHot, DEFAULT_FLOW, FlowConfig, FlowNode, FlowOption, STAGE_ORDER, stageDef } from './flow';
import { isOpen, nextOpening } from './hours';
import { Conversation, CrmSettings, CrmTask, IntentAlert, IntentType, Product, StageId } from './models';
import { parseNameCity } from './parse';
import { AVAIL_LABEL, BTN, detectProducts, OutgoingDraft, productCard, productDetail, recommend } from './products';
import { applyTone, missingRequired, NO_CITY, personaOf, RequiredDatum, requiredOf } from './seller';
import { hash, includesWord, normalize, titleCase } from './text';

export type { OutgoingDraft } from './products';
export type TaskDraft = Omit<CrmTask, 'id' | 'createdAt'>;

export interface EngineInput {
  text?: string;
  buttonId?: string;
  isMedia?: boolean;
}

export interface EngineContext {
  conv: Conversation;
  flow: FlowConfig;
  products: Product[];
  settings: CrmSettings;
  now: number;
}

export interface EngineResult {
  replies: OutgoingDraft[];
  patch: Partial<Conversation>;
  tasks: TaskDraft[];
  /** Notas internas visibles solo para el equipo (cambios de etapa, alertas). */
  notes: string[];
}

// ---------------------------------------------------------------------------
// Nota resumen para el asesor
// ---------------------------------------------------------------------------

export function buildSummary(conv: Conversation, products: Product[]): string {
  const f = conv.fields;
  const model = f.modeloInteres || products.find((p) => conv.bot.lastProductIds.includes(p.id))?.name;
  const parts = [
    `Cliente: ${conv.name}`,
    f.ciudad,
    f.uso === 'hogar' ? 'Hogar' : f.uso === 'negocio' ? 'Gimnasio/negocio' : '',
    f.subcategoria ? titleCase(f.subcategoria) : f.categoria ? titleCase(f.categoria) : '',
    f.pesoUsuario ? `${f.pesoUsuario} kg` : '',
    f.modoUso ? `Para ${f.modoUso}` : '',
    f.alturaTecho ? `Techo ${f.alturaTecho} cm` : '',
    f.piso ? titleCase(f.piso) : '',
    f.usuarios ? `${f.usuarios} usuarios` : '',
    f.rangoKg ? `Rango ${f.rangoKg}` : '',
    f.cantidad ? `Cantidad: ${f.cantidad}` : '',
    model ? `Modelo: ${model}` : '',
    f.formaPago ? `Quiere pagar con ${f.formaPago}` : '',
    f.disponibilidad ? AVAIL_LABEL[f.disponibilidad] : '',
  ].filter(Boolean);
  return parts.join('. ') + '.';
}

// ---------------------------------------------------------------------------
// Motor principal
// ---------------------------------------------------------------------------

const PAYMENT_WORDS: [string, string][] = [
  ['efectivo', 'efectivo'],
  ['transferencia', 'transferencia'],
  ['llave', 'transferencia (llave)'],
  ['nequi', 'transferencia (Nequi)'],
  ['daviplata', 'transferencia (Daviplata)'],
  ['tarjeta', 'tarjeta'],
  ['addi', 'Addi'],
  ['plan separe', 'plan separe'],
  ['cuotas', 'plan separe'],
];

export function processIncoming(ctx: EngineContext, input: EngineInput): EngineResult {
  const flow = ctx.flow ?? DEFAULT_FLOW;
  const run = new Run(ctx, flow);
  run.handle(input);
  return run.result();
}

class Run {
  private conv: Conversation;
  private replies: OutgoingDraft[] = [];
  private tasks: TaskDraft[] = [];
  private notes: string[] = [];
  private scoreDelta = 0;
  /** Puntaje mínimo garantizado (p. ej. al tocar "Lo quiero" ya está a punto de comprar). */
  private scoreFloor = 0;
  /** En este turno ya se dijo el saludo completo del nodo inicial. */
  private greeted = false;

  constructor(private ctx: EngineContext, private flow: FlowConfig) {
    // Copia profunda para no mutar el estado del llamador.
    this.conv = JSON.parse(JSON.stringify(ctx.conv)) as Conversation;
  }

  result(): EngineResult {
    const c = this.conv;
    const stageProb = stageDef(c.stage)?.probability ?? 0;
    c.score = Math.min(100, Math.max(stageProb, c.score + this.scoreDelta, this.scoreFloor));
    const wasHot = this.ctx.conv.hot;
    // En los primeros mensajes nunca es "caliente": todavía no hay suficiente información.
    const enoughTalk = (c.bot.inboundCount ?? 0) >= (this.ctx.settings.minMessagesForHot ?? 3);
    c.hot = enoughTalk && canBeHot(c.stage) && c.score >= (this.ctx.settings.hotThreshold || 70);
    if (c.hot && !wasHot) this.notes.push(`🔥 ${c.name} está a punto de comprar (puntaje ${c.score}).`);
    // Primer contacto que ya pide algo concreto ("¿cuánto vale la trotadora?"): el saludo va primero,
    // dentro de la primera burbuja, y nunca después de los productos.
    if ((c.bot.inboundCount ?? 0) === 1 && !this.greeted && this.replies.length) {
      const hello = this.fill(this.flow.messages.greeting || '¡Hola! 👋 Gracias por escribir a {empresa}.');
      const first = this.replies[0];
      if (first.type !== 'carousel' && first.text) first.text = `${hello}\n${first.text}`;
      else this.replies.unshift({ type: 'text', text: hello });
    }
    const tone = personaOf(this.flow).tone;
    for (const r of this.replies) {
      r.text = applyTone(r.text, tone);
      if (r.header) r.header = applyTone(r.header, tone);
    }
    const patch: Partial<Conversation> = {
      stage: c.stage,
      stageChangedAt: c.stageChangedAt,
      botActive: c.botActive,
      bot: c.bot,
      fields: c.fields,
      tags: c.tags,
      priority: c.priority,
      score: c.score,
      hot: c.hot,
      intent: c.intent ?? null,
      summary: c.summary,
      assignedTo: c.assignedTo ?? null,
      name: c.name,
      value: c.value,
    };
    return { replies: this.replies, patch, tasks: this.tasks, notes: this.notes };
  }

  handle(input: EngineInput): void {
    const c = this.conv;
    const text = input.text ?? '';
    const norm = normalize(text);

    c.bot.inboundCount = (c.bot.inboundCount ?? 0) + 1;
    const hadSeenProducts = c.bot.shownProductIds.length > 0 || c.bot.lastProductIds.length > 0;
    // Respondió: se reinicia el seguimiento.
    c.bot.awaitingSince = undefined;
    c.bot.followUpStep = 0;
    if (c.stage === 'nuevo') this.moveStage('calificando');

    this.detectSignals(norm, input);

    // Con el bot apagado solo se analizan señales (alertas y puntaje).
    if (!c.botActive) {
      // La ficha técnica es informativa: se responde aunque el bot esté en pausa.
      if (input.buttonId?.startsWith(BTN.details)) {
        const p = this.ctx.products.find((x) => x.id === input.buttonId!.slice(BTN.details.length));
        if (p) {
          this.replies.push(productDetail(p, this.ctx.settings.companyName));
          this.setIntent('producto', `Vio la ficha de ${p.name}`, [p.id]);
          this.scoreDelta += 10;
        }
      }
      return;
    }

    // 1) Botones de las tarjetas de producto (válidos en cualquier punto del flujo).
    if (input.buttonId && this.handleProductButton(input.buttonId)) return;

    // 2) Pregunta frecuente ("¿hacen envíos?"): responde y retoma el control de la conversación.
    const faq = input.buttonId ? undefined : (this.flow.faqs ?? []).find((f) => f.keywords.some((k) => includesWord(norm, k)));
    const faqKw = faq ? normalize(faq.keywords.find((k) => includesWord(norm, k)) ?? '') : '';
    // Un disparador cuya palabra es parte de la pregunta frecuente ("¿tiene garantía?") no cuenta.
    let trig = this.flow.triggers.find((t) => t.keywords.some((k) => includesWord(norm, k) && !(faqKw && faqKw.includes(normalize(k)))));
    if (faq) {
      this.say(faq.answer);
      this.scoreDelta += 2;
      const mentionedFaq = detectProducts(text, this.ctx.products);
      // "¿Cuánto vale el envío?" es una duda de la FAQ, no una solicitud de cotización.
      if (trig?.intent === 'precio' && !mentionedFaq.length) trig = undefined;
      if (!trig) {
        if (mentionedFaq.length) this.showMentioned(mentionedFaq);
        this.resume();
        return;
      }
    }

    // 3) Disparadores que pasan al asesor sin esperar.
    if (trig) {
      const mentionedNow = detectProducts(text, this.ctx.products);
      // "Quiero comprar un producto" sin decir cuál: primero le preguntamos qué busca y le mostramos el listado.
      // Todavía no suma puntos de compra ni cambia de etapa: no sabemos qué quiere.
      if ((trig.intent === 'compra' || trig.intent === 'precio') && !mentionedNow.length && !c.fields.categoria && !c.bot.lastProductIds.length) {
        const catNode = this.flow.nodes.find((n) => n.field === 'categoria' && n.kind === 'question');
        if (catNode) {
          this.scoreDelta += 5;
          this.setIntent('producto', 'Quiere comprar; aún no dice qué producto');
          this.ask(catNode, undefined, this.flow.messages.askProduct || '¡Con gusto te ayudo! 😊 ¿Qué producto te gustaría?');
          return;
        }
      }
      // "Quiero comprar una caminadora" / "¿Cuánto vale la trotadora?" sin haber visto opciones todavía:
      // le mostramos los productos y seguimos el flujo. Pasa al asesor cuando elija ("Lo quiero")
      // o cuando vuelva a pedir comprar/precio después de verlos.
      if ((trig.intent === 'compra' || trig.intent === 'precio') && !hadSeenProducts && mentionedNow.length) {
        this.scoreDelta += 5;
        this.showMentioned(mentionedNow);
        const intro = trig.intent === 'precio'
          ? this.flow.messages.choosePriced || 'Los precios cambian cada mes, así que una asesora te envía la cotización con tu descuento. 😊 Antes te ayudo a elegir la ideal.'
          : this.flow.messages.chooseToBuy || '¡Excelente! 😊 Te ayudo a elegir la ideal en un par de preguntas.';
        const early = this.missing('inicio');
        const pending = this.walk(this.flow.startNode);
        // El bot no suelta la conversación: explica el siguiente paso y hace UNA sola pregunta.
        if (early && early.key !== 'producto') this.askRequired(early, intro);
        else if (pending.kind === 'question') this.ask(pending, intro);
        else {
          this.say('Toca *Lo quiero* en la que te guste o *Ver detalles* para ver la ficha. 😊');
          c.bot.nodeId = 'recomendar';
          c.bot.awaitingSince = this.ctx.now;
        }
        return;
      }
      this.scoreDelta += trig.score;
      this.setIntent(trig.intent, trig.label);
      if (trig.moveTo) this.moveStage(trig.moveTo);
      if (trig.handoff) {
        // "¿Cuánto vale la caminadora?": guardamos qué busca para mostrarle opciones mientras tanto.
        const mentioned = mentionedNow;
        if (mentioned.length === 1) {
          c.fields.modeloInteres = mentioned[0].name;
          c.fields.disponibilidad = mentioned[0].availability;
          c.bot.lastProductIds = [mentioned[0].id];
          if (!c.value) c.value = mentioned[0].price;
        }
        if (mentioned.length) {
          if (!c.fields.categoria) c.fields.categoria = mentioned[0].category;
          if (!c.fields.subcategoria && mentioned.every((p) => p.subcategory === mentioned[0].subcategory)) c.fields.subcategoria = mentioned[0].subcategory;
          if (!c.tags.includes(mentioned[0].category)) c.tags.push(mentioned[0].category);
          this.setIntent(trig.intent, trig.label, mentioned.slice(0, this.flow.maxOptions).map((p) => p.id));
        }
        if (trig.intent === 'precio') this.say(this.flow.messages.noPrices);
        // Compra o cotización = venta: antes de pasar al asesor deben estar los datos obligatorios.
        this.handoff(trig.label, trig.intent, trig.intent === 'compra' || trig.intent === 'precio');
        return;
      }
    }

    // 4) Primer mensaje: saludo (y si ya pregunta por un producto, se lo mostramos).
    if (!c.bot.nodeId) {
      const mentioned = detectProducts(text, this.ctx.products);
      const start = this.node(this.flow.startNode);
      if (mentioned.length) this.showMentioned(mentioned);
      if (start) this.ask(start);
      return;
    }

    const node = this.node(c.bot.nodeId);
    if (!node) {
      this.ask(this.node(this.flow.startNode)!);
      return;
    }

    // 5) Esperando elección de las fichas.
    if (node.kind === 'recommend') {
      const mentioned = detectProducts(text, this.ctx.products);
      // "Me gusta la Vigor": un modelo concreto → su ficha con "Lo quiero" (no otro carrusel).
      if (mentioned.length === 1) {
        const p = mentioned[0];
        this.replies.push(productDetail(p, this.ctx.settings.companyName));
        this.setIntent('producto', `Le interesa ${p.name}`, [p.id]);
        this.scoreDelta += 10;
        if (!c.bot.shownProductIds.includes(p.id)) c.bot.shownProductIds.push(p.id);
        c.bot.lastProductIds = [p.id];
        c.bot.awaitingSince = this.ctx.now;
        return;
      }
      if (mentioned.length) {
        this.showMentioned(mentioned);
        return;
      }
      if (/\b(otra|otras|mas opciones|más opciones|ver mas)\b/.test(norm)) return this.showOthers();
      if (/\b(ninguna|no me gusta|no gracias|no me interesa)\b/.test(norm)) return this.noneLiked();
      return this.notUnderstood(node);
    }

    // 6) Responder la pregunta actual.
    const answered = this.answer(node, input, text);
    if (answered) return;

    // 7) No contestó la pregunta pero mencionó un producto: lo mostramos y seguimos.
    const mentioned = detectProducts(text, this.ctx.products);
    if (mentioned.length) {
      this.showMentioned(mentioned);
      this.ask(this.walk(node.id));
      return;
    }
    this.notUnderstood(node);
  }

  // -------------------------------------------------------------------------

  private detectSignals(norm: string, input: EngineInput): void {
    const c = this.conv;
    if (this.flow.priorityKeywords.some((k) => includesWord(norm, k)) && c.priority !== 'alta') {
      c.priority = 'alta';
      if (!c.tags.includes('gym')) c.tags.push('gym');
      this.notes.push('Prioridad alta: gimnasio o compra de varias máquinas.');
    }
    for (const [word, label] of PAYMENT_WORDS) {
      if (includesWord(norm, word)) {
        c.fields.formaPago = label;
        this.scoreDelta += 10;
        break;
      }
    }
    if (input.isMedia && STAGE_ORDER[c.stage] >= STAGE_ORDER['cotizacion']) {
      this.setIntent('pago', 'Envió una imagen: posible comprobante de pago');
      this.scoreDelta += 15;
    }
    if (!c.botActive) {
      // Aun con el bot apagado, el asesor ve las intenciones.
      const trig = this.flow.triggers.find((t) => t.keywords.some((k) => includesWord(norm, k)));
      if (trig) {
        this.scoreDelta += trig.score;
        this.setIntent(trig.intent, trig.label);
        if (trig.moveTo) this.moveStage(trig.moveTo);
      }
      const mentioned = detectProducts(norm, this.ctx.products);
      if (mentioned.length) this.setIntent('producto', `Pregunta por ${mentioned[0].subcategory}`, mentioned.map((p) => p.id));
    }
  }

  private node(id: string | undefined): FlowNode | undefined {
    // Las preguntas básicas por defecto (ciudad, cantidad) existen aunque un flujo antiguo no las tenga guardadas.
    return this.flow.nodes.find((n) => n.id === id) ?? DEFAULT_FLOW.nodes.find((n) => n.id === id && n.route === 'basicas');
  }

  private fieldFilled(node: FlowNode): boolean {
    const f = this.conv.fields;
    if (!node.field) return false;
    if (node.field === 'nombre_ciudad') return !!f.ciudad;
    return f[node.field] !== undefined && f[node.field] !== '';
  }

  /** Avanza desde un nodo saltando las preguntas que ya tienen respuesta. */
  private walk(fromId: string | undefined): FlowNode {
    let n = this.node(fromId);
    const seen = new Set<string>();
    while (n && n.kind === 'question' && this.fieldFilled(n) && !seen.has(n.id)) {
      seen.add(n.id);
      const val = n.field && n.field !== 'nombre_ciudad' ? String(this.conv.fields[n.field] ?? '') : '';
      const opt = this.optionsOf(n).find((o) => o.value === val);
      n = this.node(opt?.next ?? n.next);
    }
    return n ?? this.node('handoff')!;
  }

  /**
   * Hace la siguiente pregunta. `intro` va en la MISMA burbuja (un solo mensaje que guía al cliente);
   * `replace` reemplaza el texto de la pregunta (las opciones se mantienen).
   */
  private ask(node: FlowNode, intro?: string, replace?: string): void {
    const c = this.conv;
    if (node.kind === 'recommend' || node.kind === 'handoff') {
      if (intro) this.say(intro);
      return node.kind === 'recommend' ? this.recommendNow(false) : this.handoff('Completó la calificación', undefined, true);
    }
    c.bot.nodeId = node.id;
    c.bot.retries = 0;
    c.bot.awaitingSince = this.ctx.now;
    const opts = this.optionsOf(node);
    // El saludo completo solo va una vez: si ya hubo mensajes, se pregunta directo.
    const isStart = node.id === this.flow.startNode;
    const repeatGreeting = isStart && ((c.bot.inboundCount ?? 0) > 1 || this.replies.length > 0 || !!intro);
    if (isStart && !repeatGreeting && !replace) this.greeted = true;
    const question = this.fill(replace ?? (repeatGreeting ? this.flow.messages.askNameAgain || 'Para atenderte mejor, ¿cómo te llamas y desde qué ciudad nos escribes?' : node.message));
    const message = intro ? `${this.fill(intro)}\n${question}` : question;
    if (node.display === 'buttons' && opts.length && opts.length <= 3) {
      this.replies.push({ type: 'buttons', text: message, buttons: opts.map((o) => ({ id: o.id, title: o.title })) });
    } else if ((node.display === 'list' || node.display === 'buttons') && opts.length) {
      this.replies.push({
        type: 'list',
        text: message,
        listButton: node.listButton || 'Ver opciones',
        buttons: opts.map((o) => ({ id: o.id, title: o.title, description: o.description })),
      });
    } else {
      this.say(message);
    }
  }

  private answer(node: FlowNode, input: EngineInput, text: string): boolean {
    const c = this.conv;
    const norm = normalize(text);
    let next: string | undefined = node.next;
    let ack: string | undefined;

    const options = this.optionsOf(node);
    if (node.parse === 'choice' && options.length) {
      const opt = this.matchOption(options, input, norm);
      if (!opt) return false;
      if (node.field && node.field !== 'nombre_ciudad') (c.fields as Record<string, unknown>)[node.field] = opt.value;
      if (opt.next) next = opt.next;
      if (node.field === 'categoria' && opt.value !== 'no-sabe' && !c.tags.includes(opt.value)) c.tags.push(opt.value);
      if (node.field === 'uso') {
        const tag = opt.value === 'hogar' ? 'hogar' : 'gym';
        if (!c.tags.includes(tag)) c.tags.push(tag);
      }
      if (opt.value === 'no-sabe') {
        this.handoff('No sabe qué necesita');
        return true;
      }
    } else if (node.parse === 'number') {
      const m = text.replace(',', '.').match(/\d+(\.\d+)?/);
      if (!m) return false;
      let n = parseFloat(m[0]);
      if (node.field === 'alturaTecho' && n < 10) n = Math.round(n * 100);
      if (node.field && node.field !== 'nombre_ciudad') (c.fields as Record<string, unknown>)[node.field] = n;
    } else if (node.parse === 'name_city') {
      const { name, city } = parseNameCity(text);
      if (!name && !city) return false;
      if (name) ack = this.setName(name);
      this.setCity(city ?? NO_CITY);
    } else if (node.parse === 'city') {
      // "Bosconia" o "María, de Valledupar": se toma la ciudad (y el nombre si aún no lo había dicho).
      if (norm.length < 2) return false;
      const { name, city } = parseNameCity(text);
      if (city && name && !c.bot.nameGiven) ack = this.setName(name);
      this.setCity(city ?? titleCase(text.trim().replace(/^(?:de|desde|en)\s+/i, '').slice(0, 60)));
    } else {
      if (norm.length < 1) return false;
      if (node.field && node.field !== 'nombre_ciudad') (c.fields as Record<string, unknown>)[node.field] = text.trim();
    }
    this.scoreDelta += 3;
    // La cantidad cambia el valor estimado del negocio.
    if (node.field === 'cantidad' && c.fields.modeloInteres) {
      const p = this.ctx.products.find((x) => x.name === c.fields.modeloInteres);
      if (p) c.value = p.price * (parseInt(String(c.fields.cantidad), 10) || 1);
    }
    // Faltaban datos para pasar al asesor: se sigue pidiendo lo que falte o se hace el traspaso.
    if (c.bot.pendingHandoff) {
      this.continuePending(ack);
      return true;
    }
    // Los datos "de inicio" van antes que el resto de preguntas.
    const early = this.missing('inicio');
    if (early && early.key !== 'producto' && early.nodeId !== node.id) {
      this.askRequired(early, ack);
      return true;
    }
    // Las preguntas básicas no tienen "siguiente": se retoma el flujo desde el inicio (saltando lo ya respondido).
    if (!next && node.route === 'basicas') next = this.flow.startNode;
    // "Soy Mario de Valledupar, ¿tienen spinning?": guardamos la respuesta y además mostramos el producto.
    if (node.parse !== 'choice') {
      const mentioned = detectProducts(text, this.ctx.products);
      if (mentioned.length) this.showMentioned(mentioned);
    }
    // Sigue con las preguntas del camino actual. Antes de recomendar o pasar al asesor, completa
    // lo que quedó sin preguntar del inicio (si el cliente empezó por "quiero comprar…", el nombre y la ciudad).
    const fromNext = this.walk(next);
    if (fromNext.kind !== 'question') {
      const pending = this.walk(this.flow.startNode);
      if (pending.kind === 'question') {
        this.ask(pending, ack);
        return true;
      }
    }
    this.ask(fromNext, ack);
    return true;
  }

  private matchOption(options: FlowOption[], input: EngineInput, norm: string): FlowOption | undefined {
    if (input.buttonId) {
      const byId = options.find((o) => o.id === input.buttonId);
      if (byId) return byId;
    }
    return (
      options.find((o) => normalize(o.title) === norm || normalize(o.value) === norm) ??
      options.find((o) => (o.synonyms ?? []).some((s) => includesWord(norm, s))) ??
      options.find((o) => norm.length > 2 && normalize(o.title).includes(norm))
    );
  }

  private say(text: string): void {
    this.replies.push({ type: 'text', text: this.fill(text) });
  }

  /** Reemplaza {empresa} (nombre del negocio) y {bot} (nombre del vendedor virtual). */
  private fill(text: string): string {
    return (text ?? '').replace(/\{empresa\}/g, this.ctx.settings.companyName || '').replace(/\{bot\}/g, personaOf(this.flow).botName);
  }

  // -------------------------------------------------------------------------
  // Datos obligatorios del vendedor
  // -------------------------------------------------------------------------

  /** Datos obligatorios que el bot puede pedir (el producto se pide con el catálogo; los demás, con su pregunta). */
  private required(): RequiredDatum[] {
    return requiredOf(this.flow).filter((r) => r.key === 'producto' || !!this.node(r.nodeId));
  }

  private missing(when?: RequiredDatum['when']): RequiredDatum | undefined {
    return missingRequired(this.conv, this.required(), when);
  }

  /** Pide un dato obligatorio. */
  private askRequired(r: RequiredDatum, intro?: string): void {
    if (r.key === 'producto') return this.askWhichProduct(intro);
    this.ask(this.node(r.nodeId)!, intro);
  }

  /** "¿Cuál de estas te interesa?": muestra el catálogo para que elija un modelo (o pregunta la categoría). */
  private askWhichProduct(intro?: string): void {
    const c = this.conv;
    if (!c.fields.categoria || c.fields.categoria === 'no-sabe') {
      const catNode = this.flow.nodes.find((n) => n.field === 'categoria' && n.kind === 'question');
      if (catNode) return this.ask(catNode, intro, this.flow.messages.askProduct || '¿Qué producto te interesa?');
    }
    const withIntro = (t: string) => (intro ? `${intro}\n${t}` : t);
    // Si acaba de ver hasta 3 opciones, no se repite el carrusel: botones con los nombres de esos modelos.
    const seen = c.bot.lastProductIds.map((id) => this.ctx.products.find((p) => p.id === id)).filter((p): p is Product => !!p);
    if (seen.length >= 1 && seen.length <= 3) {
      this.replies.push({
        type: 'buttons',
        text: withIntro(this.flow.messages.askWhichSeen || '¿Cuál de las opciones que te mostré te interesa? 👇'),
        buttons: seen.map((p) => ({ id: BTN.select + p.id, title: p.name })),
      });
    } else {
      const list = recommend(c, this.ctx.products, this.flow.maxOptions);
      if (!list.length) return this.handoff('No hay productos que cumplan los requisitos');
      this.say(withIntro(this.flow.messages.askWhichProduct || '¿Cuál de estas te interesa? Toca *Lo quiero* en la que prefieras 👇'));
      this.pushCarousel(list);
    }
    c.bot.nodeId = 'recomendar';
    c.bot.retries = 0;
    c.bot.awaitingSince = this.ctx.now;
  }

  /** Guarda el nombre que dio el cliente y devuelve el saludo de reconocimiento. */
  private setName(name: string): string {
    this.conv.name = name;
    this.conv.bot.nameGiven = true;
    return (this.flow.messages.nameAck || 'Mucho gusto, {nombre} 😊').replace(/\{nombre\}/g, name.split(' ')[0]);
  }

  /** Guarda la ciudad y marca si está fuera de la zona de envío gratis. */
  private setCity(city: string): void {
    const c = this.conv;
    c.fields.ciudad = city;
    const freeCity = normalize(this.ctx.settings.freeShippingCity);
    if (city !== NO_CITY && freeCity && !normalize(city).includes(freeCity) && !c.tags.includes('fuera-de-valledupar')) c.tags.push('fuera-de-valledupar');
  }

  /** Hay un traspaso en espera: pide el siguiente dato que falte o, si ya están todos, pasa al asesor. */
  private continuePending(intro?: string): void {
    const pending = this.conv.bot.pendingHandoff!;
    const miss = this.missing();
    if (miss) return this.askRequired(miss, intro);
    if (intro) this.say(intro);
    this.handoff(pending.reason, pending.intent);
  }

  /** Opciones de una pregunta: escritas a mano o tomadas de las categorías del catálogo. */
  private optionsOf(node: FlowNode): FlowOption[] {
    if (node.optionsFrom === 'categories') {
      return (this.ctx.settings.catalog?.categories ?? []).slice(0, 10).map((cat) => ({
        id: 'cat_' + cat.id,
        title: cat.name.slice(0, 24),
        description: cat.subcategories.slice(0, 4).join(', ').slice(0, 72) || undefined,
        value: cat.id,
        synonyms: [cat.name, ...cat.subcategories],
      }));
    }
    return node.options ?? [];
  }

  private setIntent(type: IntentAlert['type'], text: string, productIds?: string[]): void {
    const ids = productIds ?? (this.conv.bot.lastProductIds.length ? this.conv.bot.lastProductIds : undefined);
    this.conv.intent = { type, text, productIds: ids, at: this.ctx.now };
  }

  private moveStage(stage: StageId): void {
    const c = this.conv;
    if (STAGE_ORDER[stage] > STAGE_ORDER[c.stage] || c.stage === 'perdido') {
      const from = stageDef(c.stage)?.name;
      const to = stageDef(stage)?.name;
      c.stage = stage;
      c.stageChangedAt = this.ctx.now;
      this.notes.push(`Etapa: ${from} → ${to}`);
    }
  }

  private showMentioned(mentioned: Product[]): void {
    const c = this.conv;
    const first = mentioned[0];
    if (!c.fields.categoria) c.fields.categoria = first.category;
    if (!c.fields.subcategoria && mentioned.every((p) => p.subcategory === first.subcategory)) c.fields.subcategoria = first.subcategory;
    if (!c.tags.includes(first.category)) c.tags.push(first.category);
    const list = recommend(c, mentioned, this.flow.maxOptions, []);
    const shown = list.length ? list : mentioned.slice(0, this.flow.maxOptions);
    this.setIntent('producto', `Quiere ver ${first.subcategory}`, shown.map((p) => p.id));
    this.scoreDelta += 10;
    this.say(this.flow.messages.productIntro);
    // Vista rápida: no cuenta como "ya mostrado" para que la recomendación final pueda incluirlos.
    this.replies.push({ type: 'carousel', text: '', cards: shown.map((p) => productCard(p)) });
    c.bot.lastProductIds = shown.map((p) => p.id);
  }

  private pushCarousel(list: Product[]): void {
    const c = this.conv;
    this.replies.push({ type: 'carousel', text: '', cards: list.map((p) => productCard(p)) });
    c.bot.shownProductIds = Array.from(new Set([...c.bot.shownProductIds, ...list.map((p) => p.id)]));
    c.bot.lastProductIds = list.map((p) => p.id);
  }

  private recommendNow(others: boolean): void {
    const c = this.conv;
    const list = recommend(c, this.ctx.products, this.flow.maxOptions, c.bot.shownProductIds);
    if (!list.length) {
      if (!c.bot.shownProductIds.length) return this.handoff('No hay productos que cumplan los requisitos');
      this.say(this.flow.messages.noMoreOptions);
      return this.handoff('Ya vio todas las opciones');
    }
    const node = this.node('recomendar');
    this.say(others ? this.flow.messages.showOthers : node?.message ?? '');
    this.pushCarousel(list);
    this.replies.push({
      type: 'buttons',
      text: '¿Te gusta alguna? Toca *Ver detalles* para ver la ficha técnica.',
      buttons: [
        { id: BTN.more, title: 'Ver otras opciones' },
        { id: BTN.none, title: 'Ninguna me gusta' },
      ],
    });
    c.bot.nodeId = 'recomendar';
    c.bot.retries = 0;
    c.bot.awaitingSince = this.ctx.now;
    this.scoreDelta += 10;
    this.setIntent('producto', `Vio ${list.length} opción(es) de ${c.fields.subcategoria ?? c.fields.categoria ?? 'productos'}`, list.map((p) => p.id));
  }

  private showOthers(): void {
    this.recommendNow(true);
  }

  private noneLiked(): void {
    const c = this.conv;
    this.say(this.flow.messages.noneLiked);
    c.bot.nodeId = 'recomendar';
    c.bot.awaitingSince = this.ctx.now;
    this.scoreDelta -= 10;
  }

  private handleProductButton(id: string): boolean {
    const c = this.conv;
    if (id.startsWith(BTN.details)) {
      const p = this.ctx.products.find((x) => x.id === id.slice(BTN.details.length));
      if (!p) return false;
      this.replies.push(productDetail(p, this.ctx.settings.companyName));
      this.setIntent('producto', `Vio la ficha de ${p.name}`, [p.id]);
      this.scoreDelta += 10;
      if (!c.bot.shownProductIds.includes(p.id)) c.bot.shownProductIds.push(p.id);
      c.bot.lastProductIds = [p.id];
      if (c.bot.nodeId !== 'recomendar' && c.bot.nodeId) {
        // Seguía calificando: recordamos la pregunta pendiente.
        const pending = this.node(c.bot.nodeId);
        if (pending && pending.kind === 'question') this.ask(pending);
      } else {
        c.bot.nodeId = 'recomendar';
      }
      c.bot.awaitingSince = this.ctx.now;
      return true;
    }
    if (id.startsWith(BTN.select)) {
      const p = this.ctx.products.find((x) => x.id === id.slice(BTN.select.length));
      if (!p) return false;
      c.fields.modeloInteres = p.name;
      c.fields.disponibilidad = p.availability;
      if (!c.fields.categoria) c.fields.categoria = p.category;
      if (!c.fields.subcategoria) c.fields.subcategoria = p.subcategory;
      c.value = p.price * (parseInt(c.fields.cantidad ?? '1', 10) || 1);
      c.bot.lastProductIds = [p.id];
      this.scoreDelta += 25;
      this.scoreFloor = this.ctx.settings.hotThreshold || 70;
      this.setIntent('compra', `Eligió ${p.name}`, [p.id]);
      if (p.availability === 'agotado' && !c.tags.includes('agotado')) c.tags.push('agotado');
      this.handoff(`Eligió ${p.name}`, 'compra', true);
      return true;
    }
    if (id === BTN.more) {
      this.showOthers();
      return true;
    }
    if (id === BTN.none) {
      this.noneLiked();
      return true;
    }
    return false;
  }

  /** Vuelve a la pregunta pendiente (o al saludo) sin contar un "no entendí". */
  private resume(): void {
    const c = this.conv;
    const back = this.flow.messages.backToFlow || 'Ahora sí, sigamos 😊';
    const node = this.node(c.bot.nodeId);
    if (!c.bot.nodeId || !node) {
      const start = this.walk(this.flow.startNode);
      if (start.kind === 'question') this.ask(start, c.bot.inboundCount === 1 ? undefined : back);
      return;
    }
    if (node.kind === 'question') return this.ask(node, back);
    if (node.kind === 'recommend' && (c.bot.lastProductIds.length || c.bot.shownProductIds.length)) {
      this.replies.push({
        type: 'buttons',
        text: '¿Te gusta alguna de las opciones que te mostré? Toca *Lo quiero* en la tarjeta o *Ver detalles*.',
        buttons: [
          { id: BTN.more, title: 'Ver otras opciones' },
          { id: BTN.none, title: 'Ninguna me gusta' },
        ],
      });
      c.bot.awaitingSince = this.ctx.now;
    }
  }

  private notUnderstood(node: FlowNode): void {
    const c = this.conv;
    c.bot.retries += 1;
    if (c.bot.retries >= this.flow.maxRetries) {
      this.handoff('El bot no entendió dos veces seguidas');
      return;
    }
    this.say(this.flow.messages.notUnderstood);
    const retries = c.bot.retries;
    if (node.kind === 'question') this.ask(node);
    c.bot.retries = retries;
  }

  /**
   * Pasa la conversación a un asesor. Si es una venta (`requireData`), primero se asegura de tener los datos
   * obligatorios: si falta alguno lo pide y deja el traspaso en espera hasta completarlos.
   * Soporte, pagos, "quiero hablar con alguien" y "no entendí" pasan siempre de inmediato.
   */
  private handoff(reason: string, intent?: IntentType, requireData = false): void {
    const c = this.conv;
    if (requireData) {
      const miss = this.missing();
      if (miss) {
        c.bot.pendingHandoff = { reason, intent };
        return this.askRequired(miss);
      }
    }
    c.bot.pendingHandoff = null;
    const s = this.ctx.settings;
    const open = isOpen(s, this.ctx.now);
    const node = this.node('handoff');
    // Garantía, pagos o "quiero hablar con alguien" no son una venta: mensaje propio y sin carrusel.
    const service = intent === 'soporte' || intent === 'pago' || intent === 'humano' ? intent : null;
    // Si aún no vio productos y sabemos qué busca, le mostramos opciones mientras tanto.
    const extra = !service && !c.bot.shownProductIds.length && !c.bot.lastProductIds.length && !c.fields.modeloInteres && c.fields.categoria && c.fields.categoria !== 'no-sabe'
      ? recommend(c, this.ctx.products, this.flow.maxOptions)
      : [];
    if (extra.length) {
      this.say(this.flow.messages.handoff);
      this.replies.push({ type: 'carousel', text: '', cards: extra.map((p) => productCard(p, false)) });
      c.bot.shownProductIds = extra.map((p) => p.id);
      c.bot.lastProductIds = extra.map((p) => p.id);
    } else if (service) {
      this.say(this.fill(this.flow.messages[SERVICE_HANDOFF[service].key] || SERVICE_HANDOFF[service].text));
    } else {
      this.say(node?.message ?? this.flow.messages.handoff);
    }
    if (!open) this.say(s.hours.outOfHoursMessage);

    this.moveStage('asesor');
    c.botActive = false;
    c.bot.nodeId = 'handoff';
    c.bot.awaitingSince = undefined;
    const advisors = s.advisors.filter((a) => a.active);
    if (!c.assignedTo && advisors.length) c.assignedTo = advisors[Math.abs(hash(c.id)) % advisors.length].id;
    c.summary = buildSummary(c, this.ctx.products);
    this.notes.push(`🤝 Traspaso al asesor: ${reason}`);
    this.tasks.push({
      conversationId: c.id,
      title: `${service ? SERVICE_HANDOFF[service].task : 'Cotizar a'} ${c.name}`,
      detail: `${reason}. ${c.summary}`,
      dueAt: open ? this.ctx.now : nextOpening(s, this.ctx.now),
      done: false,
      priority: c.priority,
      assignedTo: c.assignedTo ?? null,
    });
  }
}

/** Traspasos que no son venta: mensaje por defecto (editable en el flujo) y título de la tarea. */
const SERVICE_HANDOFF = {
  soporte: { key: 'handoffSupport', task: 'Atender garantía/soporte de', text: 'Entiendo, lamento el inconveniente 🙏. Una asesora de servicio al cliente te escribe para ayudarte con tu caso. Si puedes, envíanos una foto o video del equipo y tu número de factura.' },
  pago: { key: 'handoffPayment', task: 'Verificar pago de', text: '¡Gracias! 🙌 Una asesora verifica tu pago y te confirma el despacho.' },
  humano: { key: 'handoffHuman', task: 'Contactar a', text: 'Claro 😊, ya le aviso a una asesora para que te escriba.' },
} as const;

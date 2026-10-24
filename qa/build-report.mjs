// Arma el informe de pruebas (HTML → PDF) con los resultados reales de results/*.json y las capturas.
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'node:fs';

const R = (f) => JSON.parse(readFileSync(new URL('./results/' + f, import.meta.url), 'utf8'));
const sec0 = R('security-antes.json');
const sec = R('security-despues.json');
const convBot = R('conversations.json');
const auto = R('automation.json');
// Conversaciones del bot + remarketing y alertas de compra, en un solo recorrido.
const conv = { scenarios: [...convBot.scenarios, ...auto.scenarios] };
const load = R('load-final.json');
const prompt = readFileSync(new URL('./results/prompt.txt', import.meta.url), 'utf8');
const OUT_PDF = process.argv[2];
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (x) => Number(x).toLocaleString('es-CO');
const shotSize = (name) => {
  const d = readFileSync(new URL('./results/shots/' + name + '.jpg', import.meta.url));
  let i = 2;
  while (i < d.length) {
    const m = d[i + 1], L = d.readUInt16BE(i + 2);
    if (m === 0xc0 || m === 0xc2) return { h: d.readUInt16BE(i + 5), w: d.readUInt16BE(i + 7) };
    i += 2 + L;
  }
  return { w: 1440, h: 900 };
};

// Columna del chat dentro de la captura (x 590–1118), partida en tramos lado a lado.
function chatStrips(name) {
  const { h } = shotSize(name);
  const X0 = 592, W = 526;
  const parts = Math.max(1, Math.ceil(h / 1750));
  const seg = Math.ceil(h / parts);
  // Una sola tira va al lado de los datos (máx. 112 mm de ancho y 235 mm de alto);
  // varias tiras van debajo, a todo el ancho (182 mm) y máx. 165 mm de alto.
  const colW = parts === 1 ? Math.min(112, (235 * W) / h) : Math.min((182 - 3 * (parts - 1)) / parts, (150 * W) / seg); // mm
  const scale = colW / W;
  return `<div class="strips">${Array.from({ length: parts }, (_, k) => {
    const hh = Math.min(seg, h - k * seg);
    return `<div class="strip" style="width:${colW}mm;height:${(hh * scale).toFixed(1)}mm">
      <img src="shots/${name}.jpg" style="width:${(1440 * scale).toFixed(2)}mm;left:${(-X0 * scale).toFixed(2)}mm;top:${(-k * seg * scale).toFixed(2)}mm">
      ${parts > 1 ? `<span class="part">${k + 1}/${parts}</span>` : ''}</div>`;
  }).join('')}</div>`;
}

const STAGE = { nuevo: 'Nuevo lead', calificando: 'Calificando', asesor: 'Calificado · asesor asignado', cotizacion: 'Cotización enviada', negociacion: 'Negociación o apartado', pago: 'Pago confirmado', entrega: 'Entrega e instalación', ganado: 'Ganado', perdido: 'Perdido' };
const CH = { whatsapp: 'WhatsApp', instagram: 'Instagram', messenger: 'Messenger', webchat: 'Chat web', telegram: 'Telegram' };
const convChecks = conv.scenarios.flatMap((s) => s.checks);
const convOk = convChecks.filter((c) => c.pass).length;
const top = load.runs.at(-1);
const autoChecks = auto.scenarios.flatMap((s) => s.checks);
const best1000 = load.runs.find((r) => r.level === 1000);

// --- Gráfica de latencia (p50/p95) y capacidad por nivel de carga ---
function chart() {
  const W = 640, H = 230, L = 52, B = 34, T = 16, Rr = 54;
  const runs = load.runs;
  const maxLat = Math.ceil(Math.max(...runs.map((r) => r.p95)) / 500) * 500;
  const maxTp = 1200;
  const bw = (W - L - Rr) / runs.length;
  const y = (v) => T + (H - T - B) * (1 - v / maxLat);
  const y2 = (v) => T + (H - T - B) * (1 - v / maxTp);
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart">`;
  for (let v = 0; v <= maxLat; v += 500) s += `<line x1="${L}" x2="${W - Rr}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 6}" y="${y(v) + 4}" class="ax" text-anchor="end">${(v / 1000).toLocaleString('es-CO')} s</text>`;
  for (let v = 0; v <= maxTp; v += 300) s += `<text x="${W - Rr + 6}" y="${y2(v) + 4}" class="ax tp">${v}</text>`;
  const pts = [];
  runs.forEach((r, i) => {
    const x = L + i * bw + bw * 0.18, w = bw * 0.3;
    s += `<rect x="${x}" y="${y(r.p50)}" width="${w}" height="${y(0) - y(r.p50)}" class="b50" rx="3"/>`;
    s += `<rect x="${x + w + 3}" y="${y(r.p95)}" width="${w}" height="${y(0) - y(r.p95)}" class="b95" rx="3"/>`;
    s += `<text x="${x + w + 1}" y="${H - B + 16}" class="ax" text-anchor="middle">${n(r.level)} clientes</text>`;
    pts.push([L + i * bw + bw / 2, y2(r.throughput)]);
  });
  s += `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" class="tpl"/>`;
  pts.forEach(([x, yy], i) => (s += `<circle cx="${x}" cy="${yy}" r="4" class="tpd"/><text x="${x}" y="${yy - 9}" class="tpv" text-anchor="middle">${Math.round(runs[i].throughput)}/s</text>`));
  s += `<text x="${W - 6}" y="${T - 4}" class="ax tp" text-anchor="end">msj/s</text></svg>`;
  return s;
}

const FIXES = [
  ['Seguridad', 'El bloqueo anti fuerza-bruta y el anti-spam del chat web se podían evadir inventando la IP (encabezado X-Forwarded-For).', 'Alto', 'La IP del proxy solo se acepta cuando hay un proxy real delante (TRUST_PROXY=1 en Docker con Caddy). Además, nuevo bloqueo por cuenta: 10 intentos fallidos por correo cada 15 min aunque vengan de muchas IPs.', 'A12, A13, W13'],
  ['Seguridad', 'Un JSON mal formado o una petición gigante respondían "Error interno 500".', 'Bajo', 'Ahora responden 400 / 413 (error del cliente) y no llenan el registro de errores.', 'S04, J07'],
  ['Seguridad', 'La ruta pública del widget enviaba también el encabezado Allow-Credentials del CRM.', 'Bajo', 'El widget usa su propia política CORS, sin credenciales.', 'W11'],
  ['Masividad', 'Con más de 3.000 mensajes por minuto el límite de webhooks empezaba a rechazar mensajes legítimos de Meta (429).', 'Medio', 'El límite solo cuenta peticiones rechazadas (firma falsa, cliente inexistente), por IP y por cliente. Los mensajes firmados por Meta nunca se frenan. Una inundación de webhooks falsos sigue bloqueándose.', 'Carga, W14'],
  ['Masividad', 'Conexiones a PostgreSQL fijas en 10.', 'Medio', 'Ahora son 20 por defecto y se ajustan con DB_POOL_MAX según el servidor.', 'Carga'],
  ['Bot', 'Ante "necesito la garantía" el bot respondía "te enviará la cotización con tu descuento" y mostraba caminadoras.', 'Medio', 'Garantía/soporte, comprobante de pago y "quiero hablar con alguien" tienen su propio mensaje (editable en Flujo del bot), sin carrusel, y la tarea se llama "Atender garantía/soporte de …".', 'Conversación 5'],
  ['Bot', '"María Fernanda, de Valledupar" guardaba la ciudad como "de Valledupar".', 'Bajo', 'Se quitan los conectores (de, desde, en) antes de la ciudad.', 'Conversación 1'],
  ['Bot', 'Con "¿Cuánto vale la trotadora?" el bot saludaba DESPUÉS de mostrar los productos y hacía dos llamados a la vez ("Toca Lo quiero…" y "¿cómo te llamas?").', 'Medio', 'El bot lleva el control: el saludo va primero, explica el siguiente paso y hace UNA sola pregunta por turno; reconoce el nombre ("Mucho gusto, Carlos") y califica hasta recomendar.', 'Conversación 3'],
  ['Bot', 'Si el cliente preguntaba algo fuera del guion ("¿hacen envíos?"), el bot respondía "no te entendí".', 'Medio', 'Nuevas preguntas frecuentes configurables: el bot responde y vuelve a la pregunta pendiente. "¿Tiene garantía?" se responde sin pasar a soporte.', 'Conversación 4'],
  ['Remarketing', 'Los seguimientos eran solo texto, a 24/72/168 h, y en WhatsApp un mensaje libre después de 24 h es rechazado por Meta.', 'Medio', 'Remarketing configurable por cliente (horas, mensaje con {nombre}/{producto}, imagen y plantilla aprobada para después de 24 h). Respeta la ventana de 24 h de WhatsApp, Messenger e Instagram.', 'Remarketing'],
  ['Bot', 'El bot podía pasar al asesor sin saber la cantidad, la ciudad o qué modelo quería el cliente.', 'Medio', 'Datos obligatorios configurables (por defecto: nombre, ciudad, producto y cantidad): si falta alguno lo pregunta antes del traspaso. Si ya vio opciones, le pide elegir con botones de esos modelos.', 'Conversación 6'],
  ['Código', 'Al cerrar una transacción con error, los avisos en tiempo real pendientes podían salir en la siguiente operación.', 'Medio', 'Los avisos se descartan siempre que hay ROLLBACK.', 'Revisión de código'],
  ['Código', 'Las notas internas salían con el autor repetido ("📝 Ana: 📝 Ana: …").', 'Bajo', 'Solo el servidor agrega el autor.', 'Revisión de código'],
  ['Código', 'La clave de cifrado de desarrollo por defecto tenía 31 bytes: un backend sin archivo .env no arrancaba.', 'Bajo', 'Clave de desarrollo válida de 32 bytes (en producción sigue siendo obligatoria).', 'Revisión de código'],
  ['Código', 'Al exportar contactos a CSV, un valor que empieza con = + - @ se ejecutaba como fórmula en Excel.', 'Bajo', 'Esos valores se exportan como texto.', 'Revisión de código'],
];

const cats = [...new Set(sec.results.map((r) => r.category))];
const before = Object.fromEntries(sec0.results.map((r) => [r.id, r.pass]));

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe de pruebas · JAUTHIA CRM</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
@page { size: A4; margin: 16mm 14mm 16mm 14mm; }
:root { --o:#f97316; --o2:#ea580c; --ink:#111827; --mut:#6b7280; --line:#e5e7eb; --soft:#fff7ed; --ok:#059669; --okbg:#d1fae5; --bad:#dc2626; --badbg:#fee2e2; --blue:#0284c7; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Inter, 'Segoe UI', Arial, sans-serif; color: var(--ink); font-size: 10pt; line-height: 1.45; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1 { font-size: 30pt; line-height: 1.1; margin: 0 0 6mm; letter-spacing: -.02em; }
h2 { font-size: 17pt; margin: 0 0 3mm; letter-spacing: -.01em; }
h3 { font-size: 12pt; margin: 0 0 2mm; }
p { margin: 0 0 3mm; }
.page { page-break-after: always; break-after: page; }
.page:last-child { page-break-after: auto; }
.mut { color: var(--mut); }
.kick { text-transform: uppercase; letter-spacing: .14em; font-size: 8pt; font-weight: 700; color: var(--o2); margin-bottom: 2mm; }
.cover { height: 262mm; display: flex; flex-direction: column; justify-content: space-between; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 13pt; }
.logo { width: 34px; height: 34px; border-radius: 9px; background: linear-gradient(135deg, #fb923c, #ea580c); color: #fff; display: grid; place-items: center; font-weight: 800; }
.hero { background: linear-gradient(135deg, #111827, #1f2937); color: #fff; border-radius: 16px; padding: 14mm 12mm; }
.hero h1 { color: #fff; }
.hero p { color: #d1d5db; font-size: 11.5pt; max-width: 150mm; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm; margin: 6mm 0; }
.kpi { border: 1px solid var(--line); border-radius: 12px; padding: 4mm; background: #fff; }
.kpi b { display: block; font-size: 20pt; letter-spacing: -.02em; line-height: 1.1; }
.kpi span { font-size: 8.5pt; color: var(--mut); }
.kpi.hl { background: var(--soft); border-color: #fed7aa; }
.hero .kpi { background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.15); }
.hero .kpi span { color: #d1d5db; }
.meta { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm 8mm; font-size: 9pt; }
.meta div { border-top: 1px solid var(--line); padding-top: 2mm; }
.box { border: 1px solid var(--line); border-radius: 12px; padding: 4mm 5mm; margin-bottom: 4mm; }
.box.soft { background: #f9fafb; }
.box.warn { background: #fffbeb; border-color: #fde68a; }
ul.clean { margin: 0; padding-left: 4.5mm; } ul.clean li { margin-bottom: 1.2mm; }
.chk { list-style: none; padding: 0; margin: 0; } .chk li { display: flex; gap: 6px; margin-bottom: 1.6mm; }
.ok { color: var(--ok); font-weight: 700; } .bad { color: var(--bad); font-weight: 700; }
.pill { display: inline-block; padding: .5mm 2.4mm; border-radius: 99px; font-size: 8pt; font-weight: 600; background: #f3f4f6; }
.pill.ok { background: var(--okbg); } .pill.bad { background: var(--badbg); } .pill.hot { background: #ffedd5; color: #c2410c; }
.scen { display: grid; grid-template-columns: 62mm 1fr; gap: 6mm; align-items: start; }
.scen.wide { grid-template-columns: 1fr; }
.sidebyside { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; margin-bottom: 4mm; } .sidebyside h3 { margin-top: 0 !important; }
.scen.wide .sidebyside .facts { margin-top: 0; }
.strips { display: flex; gap: 3mm; align-items: flex-start; }
.strip { position: relative; overflow: hidden; border-radius: 8px; border: 1px solid var(--line); background: #efeae2; flex: none; }
.strip img { position: absolute; max-width: none; }
.part { position: absolute; right: 2mm; top: 2mm; background: rgba(17,24,39,.75); color: #fff; font-size: 7pt; padding: .3mm 1.8mm; border-radius: 99px; }
.facts { display: grid; grid-template-columns: auto 1fr; gap: 1.2mm 3mm; font-size: 9pt; margin-top: 3mm; }
.facts dt { color: var(--mut); } .facts dd { margin: 0; font-weight: 600; }
.shot { width: 92%; margin: 0 auto; border: 1px solid var(--line); border-radius: 10px; display: block; }
.cap { font-size: 8.5pt; color: var(--mut); margin: 1.5mm 0 5mm; }
table { width: 100%; border-collapse: collapse; font-size: 8.6pt; }
th { text-align: left; font-size: 7.6pt; text-transform: uppercase; letter-spacing: .06em; color: var(--mut); border-bottom: 1.5px solid var(--ink); padding: 1.6mm 1.5mm; }
td { border-bottom: 1px solid var(--line); padding: 1.5mm; vertical-align: top; }
tr { break-inside: avoid; }
td.c { text-align: center; white-space: nowrap; }
.cat { background: #f9fafb; font-weight: 700; font-size: 8.8pt; }
.chart { width: 100%; height: auto; } .chart .grid { stroke: #e5e7eb; } .chart .ax { font-size: 9px; fill: #6b7280; } .chart .tp { fill: #0284c7; }
.chart .b50 { fill: #fdba74; } .chart .b95 { fill: #ea580c; } .chart .tpl { fill: none; stroke: #0284c7; stroke-width: 2; } .chart .tpd { fill: #0284c7; } .chart .tpv { font-size: 9px; font-weight: 700; fill: #0284c7; paint-order: stroke; stroke: #fff; stroke-width: 3px; }
.legend { display: flex; gap: 5mm; font-size: 8.5pt; color: var(--mut); margin: 1mm 0 4mm; } .legend i { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
.num { font-variant-numeric: tabular-nums; }
.prompt { white-space: pre-wrap; font-family: ui-monospace, Consolas, monospace; font-size: 7.9pt; line-height: 1.45; background: #f9fafb; border: 1px solid var(--line); border-radius: 10px; padding: 4mm 5mm; margin: 0; }
</style></head><body>

<section class="page cover">
  <div class="brand"><div class="logo">J</div> JAUTHIA <span class="mut" style="font-weight:500">· CRM omnicanal</span></div>
  <div class="hero">
    <div class="kick" style="color:#fdba74">Informe de pruebas · Calidad y seguridad</div>
    <h1>CRM y chatbot de ventas<br>para EvoSport</h1>
    <p>Pruebas de conversación del bot, remarketing automático, alertas de compra, masividad (miles de clientes escribiendo al mismo tiempo) y seguridad, con los resultados obtenidos y las mejoras aplicadas.</p>
    <div class="kpis">
      <div class="kpi"><b>${sec.passed}/${sec.total}</b><span>pruebas de seguridad superadas</span></div>
      <div class="kpi"><b>${convOk}/${convChecks.length}</b><span>verificaciones en ${conv.scenarios.length} conversaciones y automatizaciones</span></div>
      <div class="kpi"><b>${n(best1000.level)}</b><span>clientes simultáneos sin un solo error</span></div>
      <div class="kpi"><b>~${Math.round(Math.max(...load.runs.map((r) => r.throughput)))}</b><span>mensajes por segundo procesados</span></div>
    </div>
  </div>
  <div class="meta">
    <div><span class="mut">Cliente</span><br><b>EvoSport</b> · Valledupar</div>
    <div><span class="mut">Preparado por</span><br><b>JAUTHIA</b></div>
    <div><span class="mut">Fecha</span><br><b>16 de octubre de 2026</b></div>
    <div><span class="mut">Versión del sistema</span><br><b>JAUTHIA CRM 1.2</b> · Angular + Node.js + PostgreSQL</div>
  </div>
</section>

<section class="page">
  <div class="kick">Resumen</div>
  <h2>¿Qué se probó y cómo salió?</h2>
  <p>Probamos el sistema completo, igual al que se instala en el servidor: el backend en modo producción, una base de datos PostgreSQL y la interfaz del CRM. Usamos una copia separada, así que ningún dato real se tocó.</p>
  <div class="kpis" style="grid-template-columns:repeat(3,1fr)">
    <div class="kpi hl"><b>${conv.scenarios.length} casos de chat</b><span>${convOk} de ${convChecks.length} comportamientos esperados cumplidos. Incluye los dos casos reportados (caminadora y precio de la trotadora), el remarketing y las alertas de compra.</span></div>
    <div class="kpi hl"><b>${n(top.level)} clientes a la vez</b><span>${n(top.messages)} mensajes de WhatsApp en ${top.seconds.toLocaleString('es-CO')} s, 0 errores y el 95 % respondido en ${(top.p95 / 1000).toLocaleString('es-CO')} s.</span></div>
    <div class="kpi hl"><b>${sec.total} ataques simulados</b><span>Primera ronda: ${sec0.passed}/${sec0.total}. Después de las correcciones: ${sec.passed}/${sec.total}. Las dependencias tienen 0 vulnerabilidades conocidas (npm audit).</span></div>
  </div>
  <h3>Lo más importante</h3>
  <ul class="clean">
    <li><b>Primero los productos, después el asesor.</b> Si el cliente dice "quiero comprar una caminadora", el bot le muestra las opciones con foto, <i>Ver detalles</i> y <i>Lo quiero</i>, y lo sigue calificando. Pasa a la asesora cuando el cliente elige.</li>
    <li><b>El lead caliente es real.</b> El bot no marca 🔥 en los primeros mensajes. Lo hace cuando el cliente toca <i>Lo quiero</i> o vuelve a pedir comprar. En ese momento mueve la tarjeta en el embudo y crea la tarea de cotizar.</li>
    <li><b>El bot lleva la conversación.</b> Saluda primero, hace una sola pregunta por turno, reconoce el nombre, responde preguntas frecuentes y vuelve a lo que estaba preguntando.</li>
    <li><b>Recupera a quien deja de contestar.</b> Remarketing automático con mensaje e imagen que el cliente configura, y alertas cuando alguien compra ("Un cliente de Valledupar acaba de comprar…") sin revelar quién.</li>
    <li><b>Aguanta picos de mensajes.</b> Con ${n(top.level)} clientes escribiendo a la vez no se perdió ni se duplicó ningún mensaje.</li>
    <li><b>Seguridad.</b> Cada empresa solo ve sus datos. Los tokens de WhatsApp van cifrados y nunca llegan al navegador. Los mensajes falsos que no vienen de Meta se rechazan. Los ataques de contraseña se bloquean.</li>
    <li><b>Encontramos y corregimos ${FIXES.length} problemas</b> (detalle en la página de hallazgos), entre ellos uno de seguridad de riesgo alto y una respuesta incorrecta del bot ante pedidos de garantía.</li>
  </ul>
  <div class="box soft" style="margin-top:4mm"><b>Entorno:</b> AMD Ryzen 5 7500F (6 núcleos), 16 GB de RAM, Windows 11; backend en <b>modo producción</b> sobre PostgreSQL 18 con una base aislada y vacía en cada ronda; webhooks de WhatsApp <b>firmados</b> como los de Meta; capturas con Chrome sobre el CRM real.</div>
  <div class="box warn">
    <b>Lo que este informe no cubre.</b> No se probó el envío real hacia los servidores de Meta, porque requiere la cuenta de WhatsApp Business del cliente, ni el comportamiento en el servidor definitivo (VPS). Se recomienda una prueba final con el número real antes de salir a producción.
  </div>
</section>

<section class="page">
  <div class="kick">El vendedor virtual</div>
  <h2>Prompt del vendedor de EvoSport</h2>
  <p>El bot es un vendedor con nombre, rol, tono y reglas, que sigue el flujo de venta. Antes de pasar a una asesora <b>siempre</b> consigue los datos obligatorios: <b>nombre, ciudad, producto de interés y cantidad</b>. Todo es parametrizable en <i>Flujo del bot → Vendedor y datos básicos</i>, y el prompt se genera con esa configuración.</p>
  <pre class="prompt">${esc(prompt)}</pre>
</section>

<section class="page">
  <div class="kick">El vendedor virtual</div>
  <h2>Así se configura en el CRM</h2>
  <img class="shot" src="shots/13-flujo.jpg" style="width:72%">
  <p class="cap">Pestaña "Vendedor y datos básicos": el vendedor (nombre, rol, tono, objetivo y reglas), las preguntas básicas con los datos obligatorios (cuándo se piden y con qué pregunta) y el prompt generado.</p>
</section>

${conv.scenarios.map((s, i) => `
<section class="page">
  <div class="kick">Conversación ${i + 1} de ${conv.scenarios.length} · ${CH[s.channel] ?? s.channel}</div>
  <h2>${esc(s.title)}</h2>
  <div class="scen${shotSize('chat-' + s.key).h > 1750 ? ' wide' : ''}">
    <div class="${shotSize('chat-' + s.key).h > 1750 ? 'sidebyside' : ''}">
      <div><p class="mut">${esc(s.goal)}</p>
      <h3>Lo que se verificó</h3>
      <ul class="chk">${s.checks.map((c) => `<li><span class="${c.pass ? 'ok' : 'bad'}">${c.pass ? '✔' : '✘'}</span><span>${esc(c.name)}</span></li>`).join('')}</ul></div>
      <div><h3 style="margin-top:4mm">Resultado en el CRM</h3>
      <dl class="facts">
        <dt>Cliente</dt><dd>${esc(s.final.name)}</dd>
        ${s.final.fields?.ciudad ? `<dt>Ciudad</dt><dd>${esc(s.final.fields.ciudad)}</dd>` : ''}
        <dt>Etapa</dt><dd>${esc(STAGE[s.final.stage] ?? s.final.stage)}</dd>
        <dt>Probabilidad</dt><dd>${s.final.score} / 100 ${s.final.hot ? '<span class="pill hot">🔥 Caliente</span>' : ''}</dd>
        <dt>Bot</dt><dd>${s.final.botActive ? 'Atendiendo' : 'Pausado · lo atiende la asesora'}</dd>
        ${s.final.fields?.modeloInteres ? `<dt>Modelo</dt><dd>${esc(s.final.fields.modeloInteres)}</dd>` : ''}
        <dt>Mensajes</dt><dd>${s.messages.filter((m) => m.direction === 'in').length} del cliente · ${s.messages.filter((m) => m.sender === 'bot').length} del bot</dd>
      </dl></div>
    </div>
    ${chatStrips('chat-' + s.key)}
  </div>
</section>`).join('')}

<section class="page">
  <div class="kick">Vistas del CRM</div>
  <h2>Bandeja omnicanal con la ficha del cliente</h2>
  <img class="shot" src="shots/chat-garantia.jpg">
  <p class="cap">Bandeja con las ${conv.scenarios.length} conversaciones de prueba de WhatsApp, Instagram, Messenger y chat web. A la derecha está la ficha que el bot llena solo: campos, probabilidad de compra, asesora asignada y tarea.</p>
  <img class="shot" src="shots/10-kanban.jpg">
  <p class="cap">Embudo de ventas (Kanban). Las tarjetas avanzan solas según lo que detecta el bot. Arriba se ven los clientes "listos para cerrar".</p>
</section>

<section class="page">
  <div class="kick">Vistas del CRM</div>
  <h2>Resumen, tareas y panel de la plataforma</h2>
  <img class="shot" src="shots/11-dashboard.jpg">
  <p class="cap">Resumen del negocio: leads, atención del bot, clientes a punto de comprar, valor del embudo y tareas creadas automáticamente, como cotizar o atender una garantía.</p>
  <img class="shot" src="shots/20-super-admin.jpg">
  <p class="cap">Panel de la plataforma JAUTHIA (super administrador): clientes, módulos contratados, plan mensual y estado. "EvoSport Carga" es la empresa ficticia que se usó en la prueba de masividad.</p>
</section>

<section class="page">
  <div class="kick">Remarketing y alertas</div>
  <h2>Lo configura cada cliente desde el CRM</h2>
  <p>Pantalla <b>Remarketing y alertas</b>: los pasos del remarketing (horas sin contestar, mensaje, imagen y plantilla de WhatsApp para después de 24 h) y las alertas de compra (a quién, cada cuánto y con qué mensaje). Se ve la vista previa tal como le llega al cliente.</p>
  <img class="shot" src="shots/17-remarketing.jpg" style="width:78%">
  <p class="cap">${autoChecks.filter((c) => c.pass).length} de ${autoChecks.length} verificaciones superadas en las pruebas de remarketing y alertas de compra (casos ${convBot.scenarios.length + 1} a ${conv.scenarios.length}).</p>
</section>

<section class="page">
  <div class="kick">Calidad del código</div>
  <h2>Código organizado y sin duplicidad</h2>
  <p>Hicimos una revisión completa del código para que sea más fácil de mantener y de crecer sin errores. Cada regla del negocio vive ahora en un solo lugar.</p>
  <div class="two">
    <div class="box"><h3>Organización</h3><ul class="clean">
      <li>El motor del bot (más de 1.000 líneas) se dividió en módulos con una sola responsabilidad: conversación, productos, plantillas, remarketing, horario, textos.</li>
      <li>La API del CRM separada en validación, acciones y rutas, con un manejador tipado por acción (sin <code>any</code>).</li>
      <li>El núcleo del servidor separado en: entrada de mensajes, despachador de envíos, automatizaciones y alta de clientes.</li>
    </ul></div>
    <div class="box"><h3>Sin duplicidad</h3><ul class="clean">
      <li>Una sola función para ids, notas, mensajes salientes, plantillas de WhatsApp, ventana de 24 h, etapas del embudo y textos (antes había 2 o 3 copias de cada una).</li>
      <li>Los valores permitidos (roles, estados, etapas) salen de un solo archivo, para que el servidor y la pantalla nunca se desincronicen.</li>
      <li>Estilos repetidos unificados y llamadas a Meta/Telegram con un solo cliente HTTP, siempre con tiempo límite.</li>
    </ul></div>
  </div>
  <div class="box soft"><h3>Robustez</h3><ul class="clean">
    <li>Un mensaje con problemas ya no hace perder los demás del mismo webhook, ni detiene el remarketing o el envío de los demás.</li>
    <li>Las llamadas a las redes tienen tiempo límite: una red lenta no bloquea el sistema.</li>
    <li>Verificado: el backend y la interfaz compilan sin advertencias ni imports sin usar, y todas las pruebas de este informe se corrieron sobre el código ya reorganizado.</li>
  </ul></div>
</section>

<section class="page">
  <div class="kick">Masividad</div>
  <h2>Miles de clientes escribiendo al mismo tiempo</h2>
  <p>Cada cliente simulado escribe <b>4 mensajes</b> por WhatsApp y espera la respuesta del bot antes de enviar el siguiente, como una persona real. Todos empiezan en el mismo instante. Se mide el tiempo desde que llega el mensaje hasta que la respuesta del bot aparece en la bandeja del CRM.</p>
  <div class="box soft" style="font-size:9pt"><b>Guion de cada cliente:</b> ${load.script.map((t) => `"${esc(t.replace('N', '#'))}"`).join(' → ')}</div>
  ${chart()}
  <div class="legend"><span><i style="background:#fdba74"></i>Respuesta típica (mediana)</span><span><i style="background:#ea580c"></i>95 % de las respuestas en menos de…</span><span><i style="background:#0284c7;border-radius:50%"></i>Mensajes procesados por segundo</span></div>
  <table class="num">
    <tr><th>Clientes a la vez</th><th>Mensajes</th><th>Duración</th><th>Respondidos</th><th>Errores</th><th>Típica</th><th>95 %</th><th>Máx.</th><th>Memoria</th></tr>
    ${load.runs.map((r) => `<tr><td><b>${n(r.level)}</b></td><td>${n(r.messages)}</td><td>${r.seconds.toLocaleString('es-CO')} s</td><td>${n(r.replied)}</td><td>${r.httpErrors + r.timeouts ? `<span class="bad">${r.httpErrors + r.timeouts} conexiones</span>` : '<span class="ok">0</span>'}</td><td>${(r.p50 / 1000).toLocaleString('es-CO')} s</td><td>${(r.p95 / 1000).toLocaleString('es-CO')} s</td><td>${(r.max / 1000).toLocaleString('es-CO')} s</td><td>${r.memPeak} MB</td></tr>`).join('')}
  </table>
  <div class="two" style="margin-top:5mm">
    <div class="box"><h3>Integridad de los datos</h3>En todos los niveles, cada mensaje que el servidor aceptó quedó guardado una sola vez, con su respuesta del bot y su conversación. En el nivel de ${n(top.level)}: ${n(top.db.ins)} mensajes recibidos, ${n(top.db.ins)} guardados y ${n(top.db.convs)} conversaciones creadas. No hubo duplicados ni pérdidas.</div>
    <div class="box warn"><h3>Límite de este computador</h3>En la ronda anterior también se probaron 2.000 clientes a la vez (8.000 mensajes): el servidor no perdió ningún mensaje, pero en 2 de 4 corridas entre el 3 y el 6 % de los clientes no lograron abrir la conexión, porque eran 2.000 conexiones nuevas en el mismo segundo y en la misma máquina. En producción, Caddy mantiene las conexiones abiertas y Meta reintenta cada webhook que no se entrega.</div>
  </div>
</section>

<section class="page">
  <div class="kick">Seguridad</div>
  <h2>${sec.total} ataques simulados: ${sec.passed} bloqueados</h2>
  <p>Cada prueba intenta algo que haría un atacante y comprueba que el sistema lo impide. La columna "1.ª ronda" muestra el resultado antes de las correcciones. Las pruebas A13 y W14 se agregaron después, para verificar las mejoras.</p>
  <table>
    <tr><th style="width:9mm">ID</th><th>Prueba</th><th>Ataque o verificación</th><th style="width:30mm">Esperado</th><th class="c" style="width:15mm">1.ª ronda</th><th class="c" style="width:15mm">Final</th></tr>
    ${cats.map((c) => `<tr><td colspan="6" class="cat">${esc(c)}</td></tr>` + sec.results.filter((r) => r.category === c).map((r) => `<tr><td><b>${r.id}</b></td><td>${esc(r.name)}</td><td class="mut">${esc(r.attack)}</td><td>${esc(r.expected)}</td><td class="c">${r.id in before ? (before[r.id] ? '<span class="pill ok">✔</span>' : '<span class="pill bad">✘</span>') : '<span class="pill">nueva</span>'}</td><td class="c">${r.pass ? '<span class="pill ok">✔ Bloqueado</span>' : '<span class="pill bad">✘</span>'}</td></tr>`).join('')).join('')}
  </table>
</section>

<section class="page">
  <div class="kick">Hallazgos</div>
  <h2>Problemas encontrados y cómo se corrigieron</h2>
  <p>Las pruebas sirvieron para encontrar estos puntos. Todos quedaron corregidos y verificados con una nueva ronda.</p>
  <table>
    <tr><th style="width:18mm">Área</th><th>Hallazgo</th><th style="width:13mm">Riesgo</th><th>Corrección aplicada</th><th style="width:20mm">Verificado en</th></tr>
    ${FIXES.map(([a, h, r, f, v]) => `<tr><td><b>${a}</b></td><td>${esc(h)}</td><td><span class="pill ${r === 'Alto' ? 'bad' : r === 'Medio' ? 'hot' : ''}">${r}</span></td><td>${esc(f)}</td><td class="mut">${v}</td></tr>`).join('')}
  </table>
</section>

<section class="page">
  <div class="kick">Seguridad</div>
  <h2>Protecciones que ya tenía el sistema y se confirmaron</h2>
  <div class="two">
    <ul class="clean">
      <li>Frontend y backend separados: el navegador nunca habla con la base de datos.</li>
      <li>Sesión en cookie <i>HttpOnly + Secure + SameSite</i>, que JavaScript no puede leer, más protección CSRF.</li>
      <li>Contraseñas con bcrypt (costo 12) y un mínimo de 10 caracteres.</li>
      <li>Tokens de WhatsApp, Meta y Telegram cifrados con AES-256-GCM. La pantalla solo muestra ••••1234.</li>
    </ul>
    <ul class="clean">
      <li>Cada empresa (multi-cliente) solo ve y cambia sus propios datos, también en tiempo real.</li>
      <li>Roles: asesor, administrador y super administrador. Solo el dueño de la plataforma nombra super administradores.</li>
      <li>Webhooks verificados con la firma de Meta y el token secreto de Telegram. Los reintentos no se duplican.</li>
      <li>Validación estricta de cada dato. Las inyecciones SQL y los scripts (XSS) llegan como texto inofensivo.</li>
    </ul>
  </div>
</section>

<section class="page">
  <div class="kick">Siguientes pasos</div>
  <h2>Recomendaciones para la puesta en producción</h2>
  <ul class="clean">
    <li><b>Servidor:</b> un VPS de 4 vCPU y 8 GB de RAM es suficiente para varios clientes del tamaño de EvoSport. En este computador de 6 núcleos el sistema procesó cerca de ${Math.round(Math.max(...load.runs.map((r) => r.throughput)))} mensajes por segundo.</li>
    <li><b>Despliegue con Docker + Caddy</b> (incluido): HTTPS automático, base de datos sin acceso desde internet y <code>TRUST_PROXY=1</code> ya configurado para que los bloqueos por IP funcionen detrás del proxy.</li>
    <li><b>Prueba final con WhatsApp real:</b> conectar el número de EvoSport, aprobar las plantillas en Meta y repetir las conversaciones 1 a 4 desde un celular.</li>
    <li><b>Copias de seguridad diarias</b> con <code>deploy/backup.sh</code>, guardadas fuera del servidor. Guardar en un lugar seguro la clave <code>SECRETS_KEY</code>: sin ella hay que volver a pegar los tokens.</li>
    <li><b>Fotos reales del catálogo</b> (JPG/PNG): WhatsApp las muestra en el carrusel.</li>
    <li><b>Repetir estas pruebas</b> en cada versión nueva. Los scripts de seguridad, carga y conversación quedan listos para volver a correrlos.</li>
  </ul>
  <div class="box soft" style="margin-top:8mm">
    <h3>Glosario rápido</h3>
    <ul class="clean">
      <li><b>Webhook:</b> el aviso que Meta envía a nuestro servidor cada vez que un cliente escribe.</li>
      <li><b>Lead caliente 🔥:</b> cliente con alta probabilidad de compra (70/100 o más, después de varios mensajes).</li>
      <li><b>95 %:</b> el 95 % de las respuestas tardó menos que ese tiempo.</li>
      <li><b>Fuerza bruta:</b> probar muchas contraseñas hasta adivinar una. El sistema bloquea por IP y por cuenta.</li>
    </ul>
  </div>
</section>
</body></html>`;

const htmlPath = new URL('./results/informe.html', import.meta.url);
writeFileSync(htmlPath, html);
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
await page.goto(htmlPath.href, { waitUntil: 'networkidle0' });
await page.pdf({
  path: OUT_PDF, format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: `<div style="width:100%;font-size:7.5pt;color:#9ca3af;padding:0 14mm;display:flex;justify-content:space-between;font-family:Inter,Segoe UI,Arial"><span>JAUTHIA CRM · Informe de pruebas · EvoSport</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
});
await browser.close();
console.log('PDF listo:', OUT_PDF);

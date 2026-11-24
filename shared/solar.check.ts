/* Prueba del flujo de energía solar (TECSOLAR) con mensajes reales de sus clientes. npx tsx shared/solar.check.ts */
import assert from 'node:assert/strict';
import { SOLAR_FLOW } from './flow';
import { buildSummary, EngineInput, processIncoming } from './flow-engine';
import { newConversation } from './messages';
import { Conversation, CrmSettings, Product } from './models';
import { SEED_SETTINGS } from './seed';

const NOW = Date.UTC(2026, 10, 23, 15); // lunes 10 a. m. en Colombia
const settings: CrmSettings = { ...SEED_SETTINGS, companyName: 'TecSolar', freeShippingCity: '', advisors: [], discounts: [] };
const reflector = (w: number, price: number): Product => ({
  id: `ref${w}`, name: `Reflector solar ${w}W`, category: 'reflectores', subcategory: 'reflector', keywords: ['reflector', `${w}w`],
  imageUrl: '', price, active: true, availability: 'tienda', description: 'Encendido automático en la noche.', specs: [],
} as Product);
const products = [reflector(100, 1), reflector(200, 2), reflector(400, 3)];
const quiet = !process.argv.includes('-v');

function chat(script: EngineInput[]) {
  let conv = newConversation('whatsapp', '573001112233', '', NOW);
  const all: string[] = [];
  let notes: string[] = [];
  for (const input of script) {
    const r = processIncoming({ conv, flow: SOLAR_FLOW, products, settings, now: NOW }, input);
    conv = { ...conv, ...r.patch } as Conversation;
    notes = notes.concat(r.notes);
    if (!quiet) console.log(`\n👤 ${input.text ?? '[' + input.buttonId + ']'}${input.isMedia ? ' 📷' : ''}`);
    for (const m of r.replies) {
      const t = `${m.text} ${(m.buttons ?? []).map((b) => `[${b.title}]`).join(' ')} ${(m.cards ?? []).map((c) => `{${c.title}}`).join(' ')}`.trim();
      all.push(t);
      if (!quiet) console.log(`🤖 ${t.replace(/\n/g, ' / ')}`);
    }
  }
  if (!quiet) console.log('   →', conv.stage, conv.botActive ? 'bot' : 'ASESOR', JSON.stringify(conv.fields), notes.filter((n) => n.startsWith('Cliente')).join(''));
  return { conv, all, last: all[all.length - 1] ?? '', notes };
}

// 1. Camino completo con botones: vivienda → rango → foto del recibo → plan separe → asesor
const a = chat([
  { text: 'Buenos días' },
  { text: 'Carlos Pérez, Valledupar' },
  { buttonId: 'int_paneles' },
  { buttonId: 'prop_vivienda' },
  { buttonId: 'gas_2', text: '$300.000 a $600.000' },
  { text: '[image]', isMedia: true },
  { buttonId: 'pag_separe' },
]);
assert.ok(a.all[0].includes('cotización de energía solar'), a.all[0]);
assert.equal(a.conv.name, 'Carlos Pérez');
assert.equal(a.conv.fields.ciudad, 'Valledupar');
assert.equal(a.conv.fields.tipoPropiedad, 'vivienda');
assert.equal(a.conv.fields.gastoLuz, '$300.000 a $600.000');
assert.equal(a.conv.fields.recibo, '📷 Envió una foto');
assert.equal(a.conv.fields.formaPago, 'plan separe');
assert.equal(a.conv.botActive, false, 'pasa al asesor');
assert.ok(a.all.some((t) => t.includes('gratis y sin compromiso')));
const sum = buildSummary(a.conv, products);
assert.ok(sum.includes('Para vivienda') && sum.includes('Paga de luz: $300.000 a $600.000') && sum.includes('Recibo: 📷 Envió una foto'), sum);

// 2. Escrito a mano (como en Kommo): llega por el anuncio del plan separe, "vivienda", "unos 400 mil", NIC
const b = chat([
  { text: 'Quiero info del plan separe solar.' },
  { text: 'Me llamo Ana Gómez, soy de Curumaní' },
  { text: 'vivienda' },
  { text: 'unos 400 mil' },
  { text: 'el NIC es 49740738' },
]);
assert.equal(b.conv.fields.categoria, 'paneles', 'el plan separe es de paneles: no pregunta qué quiere');
assert.ok(b.all.some((t) => t.includes('Plan Separe') && t.includes('10%')), 'explica el plan separe');
assert.equal(b.conv.fields.tipoPropiedad, 'vivienda');
assert.equal(b.conv.fields.gastoLuz, 'unos 400 mil');
assert.equal(b.conv.fields.recibo, 'el NIC es 49740738');
assert.equal(b.conv.fields.formaPago, 'plan separe', 'ya dijo plan separe: no se le pregunta cómo pagar');
assert.equal(b.conv.botActive, false);

// 3. Pregunta el precio en medio del flujo: responde y sigue preguntando (no se va al asesor sin datos)
const c = chat([{ text: 'Hola' }, { text: 'Luis, Barranquilla' }, { buttonId: 'int_paneles' }, { text: '¿Cuánto cuesta el sistema?' }]);
assert.ok(c.conv.botActive, 'sigue el bot');
assert.ok(c.all.some((t) => t.includes('depende de tu consumo')));
assert.ok(c.last.includes('vivienda, una empresa o una zona rural'), c.last);

// 4. Financiación y baterías: FAQ y vuelve a la pregunta pendiente
const d = chat([{ text: 'Hola' }, { text: 'Rosa, Santa Marta' }, { buttonId: 'int_paneles' }, { buttonId: 'prop_empresa' }, { text: 'tienen financiación? y con baterías?' }]);
assert.ok(d.all.some((t) => t.includes('cuotas sin intereses')), 'financiación');
assert.ok(d.last.includes('Cuánto pagas de luz'), d.last);

// 5. No tiene el recibo: "después" → igual sigue y pasa al asesor
const e = chat([{ text: 'Hola' }, { text: 'Pedro, El Copey' }, { buttonId: 'int_paneles' }, { buttonId: 'prop_rural' }, { buttonId: 'gas_5', text: 'No sé' }, { text: 'después' }, { buttonId: 'pag_contado' }]);
assert.equal(e.conv.fields.recibo, 'después');
assert.equal(e.conv.fields.tipoPropiedad, 'finca');
assert.equal(e.conv.botActive, false);

// 6. Reflectores: muestra el catálogo
const f = chat([{ text: '¡Hola! Quiero más información de los reflectores.' }, { text: 'Marta, Valledupar' }]);
assert.ok(f.all.some((t) => t.includes('Reflector solar')), f.all.join(' | '));

// 7. Pide una llamada o la visita: pasa al asesor de inmediato
const g = chat([{ text: 'Hola' }, { text: 'Jorge, Aguachica' }, { text: 'prefiero que me llamen' }]);
assert.equal(g.conv.botActive, false);

// 8. Otra consulta (ya es cliente) → asesor
const h = chat([{ text: 'Hola' }, { text: 'Elena, Valledupar' }, { buttonId: 'int_otro' }]);
assert.equal(h.conv.botActive, false);

// 9. Nunca pide la cédula
for (const r of [a, b, c, d, e, f, g, h]) assert.ok(!r.all.some((t) => /c[eé]dula/i.test(t)));

console.log('✔ Flujo de energía solar (TECSOLAR): OK');

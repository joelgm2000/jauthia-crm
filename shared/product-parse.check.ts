/** Prueba rápida del lector de productos:  npx tsx shared/product-parse.check.ts */
import assert from 'node:assert/strict';
import { parsePrice, parseProductText } from './product-parse';

const cats = [{ id: 'cardio', name: 'Cardio', subcategories: ['trotadora', 'elíptica'] }];

const p = parseProductText('Evo Latte \n1.889.900\nMOTOR 1.5 AC\nSoporte de peso Max 90 kg\nVelocidad 1-10 km/h', cats);
assert.equal(p.name, 'Evo Latte');
assert.equal(p.price, 1889900);
assert.deepEqual(p.specs, [
  { label: 'Motor', value: '1.5 AC' },
  { label: 'Soporte de peso máx.', value: '90 kg' },
  { label: 'Velocidad', value: '1-10 km/h' },
]);
assert.equal(p.maxUserKg, 90);
assert.equal(p.category, 'cardio');
assert.equal(p.subcategory, 'trotadora');
assert.ok(p.keywords.includes('evo latte') && p.keywords.includes('latte'));
assert.match(p.description, /^Evo Latte con motor 1\.5 AC/);

const q = parseProductText('- Nombre: Torta de chocolate\n- Precio: $45.000\n- Porciones: 12\nHecha con cacao 70%\nIdeal para cumpleaños', []);
assert.equal(q.name, 'Torta de chocolate');
assert.equal(q.price, 45000);
assert.deepEqual(q.specs, [{ label: 'Porciones', value: '12' }, { label: 'Hecha con cacao', value: '70%' }]);
assert.equal(q.description, 'Ideal para cumpleaños');
assert.equal(q.category, undefined);

assert.equal(parsePrice('$1,889,900 COP'), 1889900);
assert.equal(parsePrice('1889900.50'), 1889900.5);
assert.equal(parsePrice('45.000'), 45000);
console.log('product-parse OK');

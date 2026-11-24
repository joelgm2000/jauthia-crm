/* Teléfono del cliente con nombre de usuario: completa el código de país. npx tsx shared/phone-edit.check.ts */
import assert from 'node:assert/strict';
import { applyEdit } from './actions';
import { newConversation } from './messages';

const bsuid = newConversation('whatsapp', 'CO.1884811385984903', 'Joel', 0);
assert.equal(applyEdit(bsuid, { phone: '3187194560' }).phone, '+573187194560');
assert.equal(applyEdit(bsuid, { phone: '318 719 4560' }).phone, '+573187194560');
assert.equal(applyEdit(bsuid, { phone: '+57 318 719 4560' }).phone, '+573187194560');
assert.equal(applyEdit(bsuid, { phone: '573187194560' }).phone, '+573187194560');
assert.equal(applyEdit(bsuid, { phone: '+1 555 123 4567' }).phone, '+15551234567', 'con + se respeta el país que escribieron');
assert.equal(applyEdit(bsuid, { phone: null }).phone, undefined);
console.log('✔ Teléfono con código de país: OK');

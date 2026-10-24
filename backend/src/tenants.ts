/** Alta de un cliente nuevo de la plataforma: datos iniciales según su modelo de negocio. */
import { FLOW_TEMPLATES } from '../../shared/flow';
import { Tenant } from '../../shared/models';
import { SEED_CHANNELS, SEED_PRODUCTS, SEED_SETTINGS, SEED_TEMPLATES } from '../../shared/seed';
import { invalidateCtx } from './core';
import { putDoc, putSetting } from './db';
import { log } from './log';

/** Datos iniciales de un cliente nuevo: ajustes, flujo, canales, plantillas y (opcional) catálogo de ejemplo. */
export async function seedTenant(tenant: Tenant, flowTemplate: 'evosport' | 'generico' = 'generico', sampleCatalog = false): Promise<void> {
  const t = tenant.id;
  const gym = flowTemplate === 'evosport';
  await putSetting(t, 'general', {
    ...SEED_SETTINGS,
    companyName: tenant.name,
    freeShippingCity: gym ? SEED_SETTINGS.freeShippingCity : tenant.city ?? '',
    advisors: [],
    discounts: gym ? SEED_SETTINGS.discounts : [],
    catalog: gym ? SEED_SETTINGS.catalog : { categories: [], gymFilters: false, currency: tenant.plan.currency || 'COP' },
  }, false);
  await putSetting(t, 'flow', FLOW_TEMPLATES[flowTemplate].flow, false);
  for (const c of SEED_CHANNELS) await putDoc(t, 'channels', { ...c, connected: c.id === 'webchat', accountName: c.id === 'webchat' ? 'Widget del sitio web' : undefined });
  if (gym) for (const tpl of SEED_TEMPLATES) await putDoc(t, 'templates', tpl);
  if (sampleCatalog && gym) for (const p of SEED_PRODUCTS) await putDoc(t, 'products', p);
  invalidateCtx(t);
  log.info('Cliente inicializado', { tenant: t, flowTemplate, sampleCatalog });
}

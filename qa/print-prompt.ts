// Escribe el prompt del vendedor de EvoSport (flujo por defecto) en results/prompt.txt, para el informe.
import { mkdirSync, writeFileSync } from 'node:fs';
import { DEFAULT_FLOW } from '../shared/flow';
import { buildSellerPrompt } from '../shared/seller';

mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
writeFileSync(new URL('./results/prompt.txt', import.meta.url), buildSellerPrompt(DEFAULT_FLOW, { companyName: 'EvoSport' }));

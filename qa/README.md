# Pruebas de calidad (QA)

Corren sobre una copia AISLADA del sistema (PostgreSQL en el puerto 5544 y backend en modo producción en el 3100).
Nunca tocan la base de desarrollo (5433) ni el backend de `npm run dev` (3000).

```bash
cd qa && npm install          # una vez (puppeteer-core, usa el Chrome instalado)
sh restart.sh                 # base vacía + backend de QA
node security.mjs final       # 59 pruebas de seguridad      → results/security-final.json
sh restart.sh && node media.mjs   # fotos, videos e IA de imágenes → results/media.json
AI_BASE_URL=http://localhost:3199 sh restart.sh && node market.mjs   # inteligencia de mercado con un Gemini falso → results/market.json
sh restart.sh
node conversations.mjs        # 12 conversaciones del bot      → results/conversations.json
node shots.mjs tenant         # capturas del CRM               → results/shots/
node automation.mjs           # remarketing y alertas de compra → results/automation.json
node shots.mjs auto           # capturas de esos chats y de la pantalla de remarketing
node load.mjs 50,200,500,1000,2000   # masividad               → results/load.json
node shots.mjs super          # captura del panel de la plataforma
node ../backend/node_modules/tsx/dist/cli.mjs print-prompt.ts   # prompt del vendedor → results/prompt.txt
node build-report.mjs "../Informe.pdf"   # informe PDF (lee security-antes/despues.json y load-final.json)
powershell -File kill-qa.ps1  # apagar la instancia de QA
```

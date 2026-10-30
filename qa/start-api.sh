#!/bin/sh
# Backend del CRM en modo PRODUCCIÓN contra la base aislada de QA (puerto 3100).
cd "/c/Users/JOEL/Documents/JAUTHIA CRM EvoSport/jauthia-crm/backend"
export NODE_ENV=production PORT=3100
export DATABASE_URL=postgresql://crm:qa_test_only@localhost:5544/crm_qa
# Claves al azar en cada arranque. Git Bash convierte en ruta de Windows los valores que empiezan con "/",
# por eso se generan hasta que no empiecen con "/".
key() { node -e "const c=require('crypto');let k;do{k=c.randomBytes($1).toString('base64')}while(k[0]==='/');console.log(k)"; }
export JWT_SECRET=$(key 48)
export SECRETS_KEY=$(key 32)
export PLATFORM_OWNER_EMAIL=joelgarciamaestrejgm@gmail.com
export CORS_ORIGINS=http://localhost:3100 PUBLIC_BASE_URL=http://localhost:3100
export FRONTEND_DIR="C:/Users/JOEL/Documents/JAUTHIA CRM EvoSport/jauthia-crm/frontend/dist/jauthia-crm/browser"
export TRUST_PROXY=${TRUST_PROXY:-}
export MEDIA_DIR="C:/Users/JOEL/Documents/JAUTHIA CRM EvoSport/jauthia-crm/qa/results/media"
export GEMINI_API_KEY=${GEMINI_API_KEY:-}
export AI_BASE_URL=${AI_BASE_URL:-}
export SOCIAL_GRAPH_URL=${SOCIAL_GRAPH_URL:-} YOUTUBE_API_URL=${YOUTUBE_API_URL:-} META_SOCIAL_TOKEN=${META_SOCIAL_TOKEN:-} YOUTUBE_API_KEY=${YOUTUBE_API_KEY:-}
exec node node_modules/tsx/dist/cli.mjs src/server.ts

#!/bin/sh
# Copia de seguridad diaria de la base de datos (ejecutar en el VPS, p. ej. con cron a las 3 a. m.):
#   0 3 * * * cd /ruta/jauthia-crm && sh deploy/backup.sh
set -e
mkdir -p backups
docker compose exec -T db pg_dump -U crm -d jauthia_crm --format=custom > "backups/crm-$(date +%F).dump"
# Fotos y videos del catálogo.
docker compose exec -T app tar -czf - -C /app media > "backups/media-$(date +%F).tgz"
# Conserva los últimos 14 días.
find backups \( -name 'crm-*.dump' -o -name 'media-*.tgz' \) -mtime +14 -delete
echo "Backup listo: backups/crm-$(date +%F).dump"

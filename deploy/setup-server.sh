#!/usr/bin/env bash
# Prepara un servidor Ubuntu (Oracle Cloud Always Free u otro VPS) y arranca el CRM.
# Uso, dentro de la carpeta del proyecto en el servidor:
#   bash deploy/setup-server.sh
# Se puede volver a ejecutar sin problema: lo que ya está hecho se salta.
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n\033[1;33m▶ %s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✔ %s\033[0m\n' "$*"; }

# ---------------------------------------------------------------------------
say "1/6 Docker"
if command -v docker >/dev/null 2>&1; then
  ok "Docker ya está instalado"
else
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  ok "Docker instalado"
fi
# Mientras el grupo "docker" se aplica a la sesión, usamos sudo.
DOCKER="docker"
docker info >/dev/null 2>&1 || DOCKER="sudo docker"

# ---------------------------------------------------------------------------
say "2/6 Firewall del servidor (puertos 80 y 443)"
# Las imágenes de Ubuntu de Oracle traen iptables con todo cerrado salvo SSH.
if sudo iptables -S INPUT 2>/dev/null | grep -q REJECT; then
  for port in 80 443; do
    sudo iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null \
      || sudo iptables -I INPUT 5 -p tcp --dport "$port" -m state --state NEW -j ACCEPT
  done
  if ! command -v netfilter-persistent >/dev/null 2>&1; then
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent >/dev/null
  fi
  sudo netfilter-persistent save >/dev/null
  ok "iptables abierto para 80 y 443 (y guardado)"
fi
if command -v ufw >/dev/null 2>&1 && sudo ufw status | grep -q "Status: active"; then
  sudo ufw allow 80/tcp >/dev/null && sudo ufw allow 443/tcp >/dev/null
  ok "ufw abierto para 80 y 443"
fi
echo "  Recuerda: en Oracle también hay que abrir 80 y 443 en la 'Security List' de la red (ver la guía)."

# ---------------------------------------------------------------------------
say "3/6 Memoria de intercambio (swap)"
if [ "$(swapon --show | wc -l)" -gt 0 ]; then
  ok "Ya hay swap"
elif [ "$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)" -lt 4000 ]; then
  # Con poca RAM, compilar la interfaz puede quedarse sin memoria.
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  ok "Swap de 2 GB creado"
else
  ok "RAM suficiente, no hace falta swap"
fi

# ---------------------------------------------------------------------------
say "4/6 Configuración (.env)"
if [ -f .env ]; then
  ok ".env ya existe (no se toca)"
else
  read -r -p "  Dominio del CRM (ej. evosport-crm.duckdns.org): " DOMAIN
  read -r -p "  Tu correo (dueño de la plataforma): " OWNER
  rand() { openssl rand -base64 "$1" | tr -d '\n'; }
  umask 077
  cat > .env <<EOF
DOMAIN=${DOMAIN}
POSTGRES_PASSWORD=$(rand 36 | tr -d '/+=')
JWT_SECRET=$(rand 48)
SECRETS_KEY=$(rand 32)
PLATFORM_OWNER_EMAIL=${OWNER}
WEBCHAT_ORIGINS=*
EOF
  ok ".env creado con claves al azar (solo lo puede leer este usuario)"
  echo "  IMPORTANTE: copia el archivo .env a un lugar seguro (sobre todo SECRETS_KEY)."
fi
DOMAIN_SET=$(grep '^DOMAIN=' .env | cut -d= -f2)

# ¿El dominio apunta a este servidor? (Caddy necesita eso para sacar el certificado HTTPS)
MY_IP=$(curl -fsS https://api.ipify.org || true)
DNS_IP=$(getent hosts "$DOMAIN_SET" | awk '{print $1}' | head -1 || true)
if [ -n "$MY_IP" ] && [ "$MY_IP" != "$DNS_IP" ]; then
  echo "  ⚠ $DOMAIN_SET apunta a '${DNS_IP:-nada}' y este servidor es $MY_IP."
  echo "    Corrige el DNS (o DuckDNS) antes de seguir; si no, HTTPS no funcionará."
  read -r -p "  ¿Continuar de todas formas? [s/N] " go
  [ "${go:-N}" = "s" ] || exit 1
fi

# ---------------------------------------------------------------------------
say "5/6 Arrancando el CRM (la primera vez tarda unos minutos compilando)"
$DOCKER compose up -d --build
ok "Contenedores arriba: $($DOCKER compose ps --services | tr '\n' ' ')"

# ---------------------------------------------------------------------------
say "6/6 Copia de seguridad diaria (3 a. m.)"
CRON="0 3 * * * cd $(pwd) && sh deploy/backup.sh >> backups/backup.log 2>&1"
if crontab -l 2>/dev/null | grep -q "deploy/backup.sh"; then
  ok "Ya estaba programada"
else
  mkdir -p backups
  (crontab -l 2>/dev/null; echo "$CRON") | crontab -
  ok "Programada en cron"
fi

printf '\n\033[1;32m¡Listo!\033[0m Abre https://%s y crea la cuenta del dueño con %s.\n' "$DOMAIN_SET" "$(grep '^PLATFORM_OWNER_EMAIL=' .env | cut -d= -f2)"
echo "Actualizar a una versión nueva: sube los archivos y ejecuta 'docker compose up -d --build'."

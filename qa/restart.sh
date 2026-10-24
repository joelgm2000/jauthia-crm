#!/bin/sh
# Reinicia la instancia de QA desde cero (base vacía + backend). Solo puertos 5544/3100.
Q="$(cd "$(dirname "$0")" && pwd)"
cd "$Q"
powershell -NoProfile -ExecutionPolicy Bypass -File "$(cygpath -w "$Q/kill-qa.ps1")" >/dev/null
rm -f .qa-owner .qa-demo.json
sleep 1
(node test-db.mjs > db.log 2>&1 &)
for i in $(seq 1 30); do grep -q ready db.log 2>/dev/null && break; sleep 1; done
(sh start-api.sh > api.log 2>&1 &)
for i in $(seq 1 30); do curl -s localhost:3100/health >/dev/null && echo "QA lista" && exit 0; sleep 1; done
echo "QA no arrancó"; tail -5 api.log

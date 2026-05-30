#!/usr/bin/env bash
cd "$(dirname "$0")"
export NODE_OPTIONS="--max-old-space-size=2560"
while true; do
  echo "[$(date '+%H:%M:%S')] Démarrage du dev server…" >> .dev-server.log
  npm run dev >> .dev-server.log 2>&1
  echo "[$(date '+%H:%M:%S')] Dev server arrêté (code $?). Redémarrage dans 3s…" >> .dev-server.log
  sleep 3
done

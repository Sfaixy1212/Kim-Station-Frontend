#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Build e deploy Kim Station SPA (Vite)…"

# Vai nella cartella del progetto
cd "$(dirname "$0")"

# 1) Build
npm run build

# 2) Deploy statici verso la root servita da Nginx
DEST=/var/www/station/dist
echo "📦 Copia dist/ (asset-first) -> $DEST"
sudo mkdir -p "$DEST"
# 2a) Sincronizza prima gli asset fingerprintati
sudo rsync -a --delete dist/assets/ "$DEST/assets/" || true
# 2b) Sincronizza tutti gli altri file eccetto index.html (favicon, manifest, immagini root, ecc.)
sudo rsync -a --delete --exclude 'index.html' --exclude 'assets/' dist/ "$DEST/" || true
# 2c) Copia index.html per ultimo (così punta a file già presenti)
sudo install -m 644 dist/index.html "$DEST/index.html"

# 3) Test config Nginx e reload
echo "🧪 Verifica Nginx…"
sudo nginx -t
echo "♻️  Reload Nginx…"
sudo systemctl reload nginx

# 4) Health check robusto: prima dal file locale, poi via HTTP (con retry)
BASE="https://station.kimweb.agency"
INDEX_LOCAL="$DEST/index.html"

# Prova a estrarre dal file locale (prima con hash, poi senza)
MAIN_JS=$(grep -Eo 'assets/index-[A-Za-z0-9_-]+\.js' "$INDEX_LOCAL" | head -n 1 || true)
if [[ -z "${MAIN_JS:-}" ]]; then
  MAIN_JS=$(grep -Eo '/index\.js' "$INDEX_LOCAL" | head -n 1 || true)
fi

# Se non trovato localmente, fallback via HTTP
if [[ -z "${MAIN_JS:-}" ]]; then
  MAIN_JS=$(curl -s "$BASE" | grep -Eo 'assets/index-[A-Za-z0-9_-]+\.js' | head -n 1 || true)
  if [[ -z "${MAIN_JS:-}" ]]; then
    MAIN_JS=$(curl -s "$BASE" | grep -Eo '/index\.js' | head -n 1 || true)
  fi
fi

if [[ -z "${MAIN_JS:-}" ]]; then
  echo "❌ Health check: main bundle non trovato in index.html"
  echo "--- Debug: prime 40 righe di $INDEX_LOCAL ---"
  sed -n '1,40p' "$INDEX_LOCAL" || true
  echo "--- Debug: prime 40 righe da $BASE ---"
  curl -s "$BASE" | sed -n '1,40p' || true
  exit 2
fi
echo "✅ Main bundle: $MAIN_JS"

# Retry helper
TRIES=0; MAX_TRIES=12; SLEEP_SEC=1
check_200() {
  local path="$1"
  local tries=0
  local code
  while true; do
    code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/$path" || true)
    if [[ "$code" == "200" ]]; then
      echo "✅ OK: $path"
      break
    fi
    tries=$((tries+1))
    if [[ $tries -ge $MAX_TRIES ]]; then
      echo "❌ Health check: $path non raggiungibile (ultima http=$code)";
      curl -sI "$BASE/$path" || true
      exit 2
    fi
    sleep $SLEEP_SEC
  done
}

# Estrai anche CSS e vendor dal file locale (fallback HTTP)
CSS_MAIN=$(grep -Eo 'assets/index-[A-Za-z0-9_-]+\.css' "$INDEX_LOCAL" | head -n 1 || true)
VENDOR_JS=$(grep -Eo 'assets/vendor-[A-Za-z0-9_-]+\.js' "$INDEX_LOCAL" | head -n 1 || true)
if [[ -z "${CSS_MAIN:-}" ]]; then
  CSS_MAIN=$(curl -s "$BASE" | grep -Eo 'assets/index-[A-Za-z0-9_-]+\.css' | head -n 1 || true)
fi
if [[ -z "${VENDOR_JS:-}" ]]; then
  VENDOR_JS=$(curl -s "$BASE" | grep -Eo 'assets/vendor-[A-Za-z0-9_-]+\.js' | head -n 1 || true)
fi

echo "✅ Main bundle: $MAIN_JS"
[[ -n "$CSS_MAIN" ]] && echo "✅ CSS: $CSS_MAIN" || echo "⚠️  CSS principale non trovato (potrebbe essere inlined)"
[[ -n "$VENDOR_JS" ]] && echo "✅ Vendor: $VENDOR_JS" || echo "⚠️  Vendor chunk non rilevato (può essere bundlato nel main)"

# Verifica che gli asset critici siano serviti (200)
check_200 "$MAIN_JS"
[[ -n "$CSS_MAIN" ]] && check_200 "$CSS_MAIN" || true
[[ -n "$VENDOR_JS" ]] && check_200 "$VENDOR_JS" || true

echo "🎉 Deploy completato! App disponibile su $BASE"

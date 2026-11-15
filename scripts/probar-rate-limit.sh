#!/usr/bin/env bash
# Prueba del rate-limiting de Kong (Semana 8, Paso 4).
# Uso: ./scripts/probar-rate-limit.sh [URL_BASE] [PETICIONES]
#   ./scripts/probar-rate-limit.sh http://localhost:8000
#   ./scripts/probar-rate-limit.sh https://kong-gateway-p9.onrender.com
# Espera 200 en las primeras 5 y 429 a partir de la 6.a (minute: 5).
set -u

BASE="${1:-http://localhost:8000}"
BASE="${BASE%/}"
N="${2:-6}"
URL="$BASE/productos"
# Timeout amplio para el arranque en frio de Render Free.
TIMEOUT="${TIMEOUT:-120}"

echo "URL: $URL  (peticiones: $N)"
for i in $(seq 1 $((N - 1))); do
  codigo=$(curl -s -o /dev/null -m "$TIMEOUT" -w "%{http_code}" "$URL")
  echo "Peticion $i: $codigo"
done

# La ultima peticion se muestra completa (estado, cabeceras X-RateLimit-* / Retry-After y cuerpo).
salida=$(curl -s -i -m "$TIMEOUT" -w "
__CODIGO__%{http_code}" "$URL")
ultimo="${salida##*__CODIGO__}"
echo "Peticion $N: $ultimo"
echo
echo "Peticion $N completa (curl -i):"
echo "${salida%__CODIGO__*}"

if [ "$ultimo" = "429" ]; then
  echo "RESULTADO: OK, Kong devolvio 429 en la peticion $N"
  exit 0
fi
echo "RESULTADO: no se vio 429 en la peticion $N (ultimo codigo: $ultimo)"
exit 1

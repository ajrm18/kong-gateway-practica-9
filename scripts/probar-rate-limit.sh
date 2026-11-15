#!/usr/bin/env bash
# Prueba del rate-limiting de Kong (Semana 8, Paso 4).
# Uso: ./scripts/probar-rate-limit.sh [URL_BASE] [PETICIONES]
#   ./scripts/probar-rate-limit.sh http://localhost:8000
#   ./scripts/probar-rate-limit.sh https://kong-gateway-p9.onrender.com
# Espera 200 en las primeras N-1 y, en la N.a, un 429 generado por Kong (minute: 5).
# Codigos de salida:
#   0 = OK: 200 en las primeras N-1 y 429 de Kong en la N.a
#   1 = no se vio el 429 o alguna de las primeras no fue 200 (contador ya usado: esperar al siguiente minuto)
#   2 = hubo 429, pero no de Kong (sin "API rate limit exceeded" ni X-RateLimit-Limit-Minute): otro proxy, p. ej. Cloudflare
set -u

BASE="${1:-http://localhost:8000}"
BASE="${BASE%/}"
N="${2:-6}"
URL="$BASE/productos"
# Timeout amplio para el arranque en frio de Render Free.
TIMEOUT="${TIMEOUT:-120}"

echo "URL: $URL  (peticiones: $N)"
previas_ok=1
for i in $(seq 1 $((N - 1))); do
  codigo=$(curl -s -o /dev/null -m "$TIMEOUT" -w "%{http_code}" "$URL")
  echo "Peticion $i: $codigo"
  [ "$codigo" = "200" ] || previas_ok=0
done

# La ultima peticion se muestra completa (estado, cabeceras X-RateLimit-* / Retry-After y cuerpo).
salida=$(curl -s -i -m "$TIMEOUT" -w "
__CODIGO__%{http_code}" "$URL")
ultimo="${salida##*__CODIGO__}"
respuesta="${salida%__CODIGO__*}"
echo "Peticion $N: $ultimo"
echo
echo "Peticion $N completa (curl -i):"
echo "$respuesta"

# Un 429 cuenta como de Kong solo si trae el cuerpo y la cabecera del plugin rate-limiting.
cuerpo_kong=0
cabecera_kong=0
printf '%s' "$respuesta" | grep -q 'API rate limit exceeded' && cuerpo_kong=1
printf '%s' "$respuesta" | grep -qi '^X-RateLimit-Limit-Minute:' && cabecera_kong=1

if [ "$ultimo" = "429" ] && { [ "$cuerpo_kong" = 0 ] || [ "$cabecera_kong" = 0 ]; }; then
  echo "RESULTADO: 429 de otro proxy (Cloudflare/Render), no de Kong: falta 'API rate limit exceeded' o X-RateLimit-Limit-Minute"
  exit 2
fi
if [ "$previas_ok" = 0 ]; then
  echo "RESULTADO: alguna de las primeras $((N - 1)) peticiones no fue 200 (contador ya usado o servicio caido); repetir al inicio de un minuto"
  exit 1
fi
if [ "$ultimo" = "429" ]; then
  echo "RESULTADO: OK, Kong devolvio 429 (API rate limit exceeded) en la peticion $N"
  exit 0
fi
echo "RESULTADO: no se vio 429 en la peticion $N (ultimo codigo: $ultimo)"
exit 1

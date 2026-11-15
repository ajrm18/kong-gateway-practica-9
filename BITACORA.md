# Bitácora · Práctica 9 · Kong Gateway enrutando microservicios NestJS (Semana 8)

Autor: **Anthony Rosero**

## 1. Evidencia del 429 (Paso 4)

Salida real de `./scripts/probar-rate-limit.sh http://localhost:8000` con `rate-limiting` (`minute: 5`, `policy: local`), justo después de reiniciar Kong (`docs/evidencia/paso4-rate-limit.txt`):

```text
# Paso 4: rate-limiting minute: 5, policy: local (Kong reiniciado justo antes para resetear el contador)
# Fecha UTC de la prueba: 2026-11-15 20:28:03
$ ./scripts/probar-rate-limit.sh http://localhost:8000
URL: http://localhost:8000/productos  (peticiones: 6)
Peticion 1: 200
Peticion 2: 200
Peticion 3: 200
Peticion 4: 200
Peticion 5: 200
Peticion 6: 429

Peticion 6 completa (curl -i):
HTTP/1.1 429 Too Many Requests
Date: Sun, 15 Nov 2026 20:28:07 GMT
Content-Type: application/json; charset=utf-8
Connection: keep-alive
RateLimit-Reset: 53
Retry-After: 53
X-RateLimit-Remaining-Minute: 0
X-RateLimit-Limit-Minute: 5
RateLimit-Remaining: 0
RateLimit-Limit: 5
Content-Length: 92
X-Kong-Response-Latency: 1
Server: kong/3.6.1
X-Kong-Request-Id: ac1e40167a12bb41f8c9470aa3039012

{
  "message":"API rate limit exceeded",
  "request_id":"ac1e40167a12bb41f8c9470aa3039012"
}

RESULTADO: OK, Kong devolvio 429 en la peticion 6
(codigo de salida del script: 0)
```

## 2. Evidencia del `X-Correlation-Id` en el backend (Paso 5)

Log real de `nestjs-productos-api` (`CorrelationIdMiddleware`), primero vía Kong y después directo al puerto 3000 (`docs/evidencia/paso5-correlation.txt`):

```text
[Nest] 16924  - 15/11/2026, 15:32:02     LOG [CorrelationId] GET /api/v1/productos/1 X-Correlation-Id=kong-generado
[Nest] 16924  - 15/11/2026, 15:32:05     LOG [CorrelationId] GET /api/v1/productos/1 X-Correlation-Id=(sin header)
[Nest] 16924  - 15/11/2026, 15:32:18     LOG [CorrelationId] GET /api/v1/productos/1 X-Correlation-Id=cliente-123
```

La tercera línea es una prueba extra: el cliente envió `X-Correlation-Id: cliente-123` a Kong y `request-transformer` (`add`) no lo reemplazó.

Y la cadena completa Kong → BFF → REST (`docs/evidencia/paso7-bff.txt`):

```text
# API REST (llamada hecha por el BFF tras GET /productos-completos/1 en Kong)
[Nest] 16924  - 15/11/2026, 16:01:10     LOG [CorrelationId] GET /api/v1/productos/1 X-Correlation-Id=kong-generado
# GraphQL simulado local (llamada hecha por el BFF tras GET /productos-completos/4 en Kong)
graphql-simulado: id=4 precioMaximo=189 X-Correlation-Id=kong-generado
```

## 3. ¿Qué ganó el sistema con Kong? ¿Qué overhead agregó?

<!-- Reflexión del estudiante -->



### Datos medidos (para apoyar la reflexión)

Fuente: `docs/evidencia/latencia-crudo.txt` (15/11/2026, equipo local con Docker Desktop; `GET /productos/1`; `curl.exe -w "%{time_total}"`; vía Kong 5 peticiones por ventana de minuto para no medir respuestas 429).

| Medida (20 peticiones) | Directo `:3000/api/v1/productos/1` | Vía Kong `:8000/productos/1` |
|---|---|---|
| Promedio `time_total` | 26,8 ms | 1 156,6 ms |
| Promedio sin el valor máximo (19 peticiones) | — | 260,3 ms |
| Mediana | 20,2 ms | 176,2 ms |
| Mínimo / máximo | 8,1 ms / 70,6 ms | 30,2 ms / 18 187,5 ms |

| Cabecera de Kong (20 peticiones) | Promedio | Mediana | Mínimo / máximo | Promedio sin el máximo |
|---|---|---|---|---|
| `X-Kong-Proxy-Latency` (tiempo propio de Kong) | 90,0 ms | 7,5 ms | 1 ms / 1 146 ms | 34,5 ms |
| `X-Kong-Upstream-Latency` (espera a la API) | 265,3 ms | 64,5 ms | — | 127,7 ms |

Nota sobre los datos: la petición 6 (primera de la segunda ventana) tardó 18,2 s con `X-Kong-Proxy-Latency: 1146` y `X-Kong-Upstream-Latency: 2880`; el resto quedó por debajo de 1,3 s. Es un valor atípico del equipo durante la medición, no un comportamiento repetible, por eso se muestran también la mediana y el promedio sin el máximo. Las primeras peticiones tras reiniciar Kong (`kong 1`) también son más lentas (78 ms de proxy) por el calentamiento de la caché.

Resultado del Paso 6 (con y sin Gateway, `docs/evidencia/paso6.txt`):

| Prueba con Kong detenido (`docker compose stop kong`) | Resultado |
|---|---|
| Directo `http://localhost:3000/api/v1/productos/1` | `HTTP 200` |
| Vía Kong `http://localhost:8000/productos/1` | `curl: (7) Failed to connect to localhost:8000 ... Could not connect to server` (`HTTP 000`) |
| Vía Kong tras `docker compose start kong` | `HTTP 200` |

Lo que Kong agregó en los pasos anteriores (para comparar): límite de 5 peticiones por minuto con 429 (`paso4-rate-limit.txt`), `X-Correlation-Id` en el backend (`paso5-correlation.txt`), un único punto de entrada para la API y el BFF (`paso7-bff.txt`) y cabeceras `Via` / `X-Kong-*` (`paso3.txt`).

## 4. Diferencia entre `url` del service y `paths` de la route

<!-- Respuesta del estudiante -->



## 5. Por qué esto es un Aggregator y no un Proxy simple

<!-- Respuesta del estudiante -->



## 6. Declaración de uso de IA

- **Herramienta:** Claude Code
- **Nivel de uso:** Alto. Asistente de implementación y verificación de punta a punta.
- **Qué se le pidió:** levantar Kong 3.6 DB-less con Docker Compose delante de la API de Productos; reproducir y corregir los errores de la guía (`strip_path`, prefijo `/api/v1`, URL fija del BFF, `version:` obsoleto, comandos bash en Windows); configurar `rate-limiting` y `request-transformer` y guardar la evidencia del 429 y del `X-Correlation-Id`; agregar el `CorrelationIdMiddleware` en `nestjs-productos-api`; construir y probar el BFF `nestjs-bff-productos` (REST + GraphQL, timeouts, 400/404/502, degradación de GraphQL); escribir el CI, el Blueprint de Render y el README; desplegar en Render; y auditar la práctica.
- **Qué se modificó/verificó manualmente:**
  -
  -

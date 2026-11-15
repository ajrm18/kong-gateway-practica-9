# nestjs-bff-productos

Aggregator/BFF de la Semana 8 (reto del Paso 7). Expone `GET /productos-completos/:id` y combina:

1. **API REST de Productos** (fuente principal, repo [`ajrm18/apisemana2`](https://github.com/ajrm18/apisemana2)): `GET {PRODUCTOS_API_URL}/productos/:id`.
2. **API GraphQL de Productos** (fuente secundaria, repo `ajrm18/nestjs-productos-graphql`): una sola query con `productoPorId(id)` y `productosBaratos(precioMaximo: <precio REST>)`.

| Situación | Respuesta |
|---|---|
| REST y GraphQL ok | 200 con `graphql.coincide`, `graphql.alternativasMasBaratasOIguales` y `fuentes: {rest: "ok", graphql: "ok"}` |
| GraphQL caído, con errores o con timeout | 200 con los datos REST, `graphql: null`, `fuentes.graphql: "no-disponible"` y `avisos` |
| REST 404 | 404 |
| REST caído, con timeout, 5xx o formato inválido | 502 con mensaje claro (nunca 500 genérico) |
| `id` no entero o fuera de 1..2147483647 | 400 (`ParseIntPipe` + rango) |

El `X-Correlation-Id` recibido se reenvía a las dos fuentes y se devuelve en `correlationId`. `GET /health` es el health check de Render.

## Variables (`.env.example`)

| Variable | Por defecto | Nota |
|---|---|---|
| `PORT` | `3001` | |
| `PRODUCTOS_API_URL` | `http://localhost:3000/api/v1` | **Obligatoria con `NODE_ENV=production`** |
| `GRAPHQL_URL` | `https://nestjs-productos-graphql-tgv7.onrender.com/graphql` | |
| `FUENTE_TIMEOUT_MS` | `8000` | Timeout por fuente |

## Comandos

```bash
npm ci
npm run lint        # oxlint --type-aware --deny-warnings
npm run build
npm test            # unitarias (servicio con HttpService simulado, controlador, configuración)
npm run test:e2e    # app Nest completa con HttpService simulado
npm run start:dev   # http://localhost:3001
```

Nest 12 publica sus paquetes como ESM; el proyecto compila a CommonJS y los carga con `require(esm)` de Node ≥ 22.12. Por eso Jest se ejecuta con `--experimental-vm-modules` (igual que en `apisemana2`).

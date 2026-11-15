// GraphQL SIMULADO, solo para pruebas locales del BFF (no es la API GraphQL real de la Semana 4).
// Motivo: el resolver real tiene fija la URL https://nestjs-productos-api.onrender.com/api/v1/productos
// y hoy responde errores 429, asi que no permite ver el camino "graphql: ok" con datos locales.
// Responde solo la query del BFF (productoPorId + productosBaratos) leyendo la API REST local.
// Uso: node scripts/graphql-simulado.js   (puerto 4000, REST en http://localhost:3000/api/v1)
const http = require('node:http');

const PUERTO = Number(process.env.PORT ?? 4000);
const REST = (process.env.PRODUCTOS_API_URL ?? 'http://localhost:3000/api/v1').replace(/\/+$/, '');

const servidor = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/graphql') {
    res.writeHead(404).end();
    return;
  }
  let cuerpo = '';
  req.on('data', (d) => (cuerpo += d));
  req.on('end', async () => {
    try {
      const { variables } = JSON.parse(cuerpo);
      const id = Number(variables?.id);
      const precioMaximo = Number(variables?.precioMaximo);
      const lista = await (await fetch(`${REST}/productos`)).json();
      const solo = (p) => ({ id: p.id, nombre: p.nombre, precio: p.precio });
      const encontrado = lista.find((p) => p.id === id);
      const data = {
        productoPorId: encontrado ? solo(encontrado) : null,
        productosBaratos: lista.filter((p) => p.precio <= precioMaximo).map(solo),
      };
      console.log(
        `graphql-simulado: id=${id} precioMaximo=${precioMaximo} X-Correlation-Id=${req.headers['x-correlation-id'] ?? '(sin header)'}`,
      );
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ data }));
    } catch (error) {
      res
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ data: null, errors: [{ message: String(error.message ?? error) }] }));
    }
  });
});

servidor.listen(PUERTO, () => console.log(`graphql-simulado escuchando en http://localhost:${PUERTO}/graphql`));

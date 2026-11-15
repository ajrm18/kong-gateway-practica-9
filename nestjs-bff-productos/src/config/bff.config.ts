export interface BffConfig {
  /** Base de la API REST de Productos, incluido el prefijo /api/v1. */
  productosApiUrl: string;
  /** Endpoint de la API GraphQL de Productos. */
  graphqlUrl: string;
  /** Timeout por fuente (REST y GraphQL), en milisegundos. */
  timeoutMs: number;
}

export const BFF_CONFIG = Symbol('BFF_CONFIG');

const POR_DEFECTO = {
  productosApiUrl: 'http://localhost:3000/api/v1',
  graphqlUrl: 'https://nestjs-productos-graphql-tgv7.onrender.com/graphql',
  timeoutMs: 8000,
};

type Entorno = Record<string, string | undefined>;

function urlValida(nombre: string, valor: string): string {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    throw new Error(`${nombre} no es una URL valida: "${valor}" (ver .env.example)`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${nombre} debe usar http o https: "${valor}"`);
  }
  // Sin barra final, para concatenar rutas sin dobles barras.
  return valor.replace(/\/+$/, '');
}

/**
 * Lee la configuracion desde variables de entorno (sin URLs fijas en el codigo).
 * En produccion PRODUCTOS_API_URL es obligatoria: un valor por defecto a localhost
 * haria que el BFF fallara en silencio en Render.
 */
export function cargarConfig(env: Entorno): BffConfig {
  const produccion = env.NODE_ENV === 'production';
  const productosApiUrl = env.PRODUCTOS_API_URL?.trim();
  if (!productosApiUrl && produccion) {
    throw new Error('Falta la variable de entorno PRODUCTOS_API_URL (ver .env.example)');
  }

  const timeoutTexto = env.FUENTE_TIMEOUT_MS?.trim();
  const timeoutMs = timeoutTexto ? Number(timeoutTexto) : POR_DEFECTO.timeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000) {
    throw new Error(`FUENTE_TIMEOUT_MS debe ser un entero entre 100 y 120000: "${timeoutTexto}"`);
  }

  return {
    productosApiUrl: urlValida('PRODUCTOS_API_URL', productosApiUrl || POR_DEFECTO.productosApiUrl),
    graphqlUrl: urlValida('GRAPHQL_URL', env.GRAPHQL_URL?.trim() || POR_DEFECTO.graphqlUrl),
    timeoutMs,
  };
}

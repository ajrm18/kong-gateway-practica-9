import { cargarConfig } from './bff.config';

describe('cargarConfig', () => {
  it('desarrollo: usa los valores por defecto', () => {
    expect(cargarConfig({})).toEqual({
      productosApiUrl: 'http://localhost:3000/api/v1',
      graphqlUrl: 'https://nestjs-productos-graphql-tgv7.onrender.com/graphql',
      timeoutMs: 8000,
    });
  });

  it('lee las variables y quita la barra final', () => {
    expect(
      cargarConfig({
        PRODUCTOS_API_URL: 'https://apisemana2.onrender.com/api/v1/',
        GRAPHQL_URL: 'http://localhost:4000/graphql',
        FUENTE_TIMEOUT_MS: '5000',
      }),
    ).toEqual({
      productosApiUrl: 'https://apisemana2.onrender.com/api/v1',
      graphqlUrl: 'http://localhost:4000/graphql',
      timeoutMs: 5000,
    });
  });

  it('produccion sin PRODUCTOS_API_URL -> error claro (no cae a localhost)', () => {
    expect(() => cargarConfig({ NODE_ENV: 'production' })).toThrow(
      'Falta la variable de entorno PRODUCTOS_API_URL',
    );
  });

  it('URL invalida o con otro protocolo -> error', () => {
    expect(() => cargarConfig({ PRODUCTOS_API_URL: 'localhost:3000' })).toThrow(
      'PRODUCTOS_API_URL',
    );
    expect(() => cargarConfig({ GRAPHQL_URL: 'ftp://x/graphql' })).toThrow('http o https');
  });

  it('timeout invalido -> error', () => {
    expect(() => cargarConfig({ FUENTE_TIMEOUT_MS: 'abc' })).toThrow('FUENTE_TIMEOUT_MS');
    expect(() => cargarConfig({ FUENTE_TIMEOUT_MS: '0' })).toThrow('FUENTE_TIMEOUT_MS');
  });
});

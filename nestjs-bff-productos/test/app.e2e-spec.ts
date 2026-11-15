import { HttpService } from '@nestjs/axios';
import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AxiosError, type AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configurarApp } from '../src/configurar-app';

const respuesta = <T>(data: T, status = 200): AxiosResponse<T> =>
  ({ data, status, statusText: 'OK', headers: {}, config: {} }) as AxiosResponse<T>;

describe('BFF de productos (e2e, HttpService simulado)', () => {
  let app: INestApplication<App>;
  const http = { get: jest.fn(), post: jest.fn() };

  beforeAll(async () => {
    process.env.PRODUCTOS_API_URL = 'http://rest.test/api/v1';
    process.env.GRAPHQL_URL = 'http://graphql.test/graphql';
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(HttpService)
      .useValue(http)
      .compile();
    app = modulo.createNestApplication({ logger: false });
    configurarApp(app);
    await app.init();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    http.get.mockReset();
    http.post.mockReset();
  });

  it('GET /health -> 200, con cabeceras de helmet y sin X-Powered-By', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', servicio: 'bff-productos' });
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('GET /productos-completos/1 -> 200 combinado y reenvia X-Correlation-Id', async () => {
    http.get.mockReturnValue(of(respuesta({ id: 1, nombre: 'Teclado', precio: 55 })));
    http.post.mockReturnValue(
      of(
        respuesta({
          data: {
            productoPorId: { id: 1, nombre: 'Teclado', precio: 55 },
            productosBaratos: [{ id: 5, nombre: 'Auriculares', precio: 10 }],
          },
        }),
      ),
    );

    const res = await request(app.getHttpServer())
      .get('/productos-completos/1')
      .set('X-Correlation-Id', 'kong-generado')
      .expect(200);

    expect(res.body).toMatchObject({
      id: 1,
      fuente: 'aggregator',
      correlationId: 'kong-generado',
      fuentes: { rest: 'ok', graphql: 'ok' },
      graphql: { coincide: true, alternativasMasBaratasOIguales: [{ id: 5 }] },
    });
    expect(http.get).toHaveBeenCalledWith('http://rest.test/api/v1/productos/1', {
      headers: { 'X-Correlation-Id': 'kong-generado' },
      timeout: 8000,
    });
  });

  it.each(['abc', '0', '-1', '1.5', '99999999999'])(
    'GET /productos-completos/%s -> 400 (nunca 500) sin llamar a las fuentes',
    async (id) => {
      const res = await request(app.getHttpServer()).get(`/productos-completos/${id}`).expect(400);
      expect(res.body.statusCode).toBe(400);
      expect(http.get).not.toHaveBeenCalled();
    },
  );

  it('REST 404 -> 404', async () => {
    http.get.mockReturnValue(
      throwError(
        () => new AxiosError('404', 'ERR_BAD_REQUEST', undefined, undefined, respuesta({}, 404)),
      ),
    );
    const res = await request(app.getHttpServer()).get('/productos-completos/999').expect(404);
    expect(res.body).toMatchObject({ statusCode: 404, fuente: 'rest' });
  });

  it('REST caido -> 502 con mensaje claro y sin pila', async () => {
    http.get.mockReturnValue(throwError(() => new AxiosError('refused', 'ECONNREFUSED')));
    const res = await request(app.getHttpServer()).get('/productos-completos/1').expect(502);
    expect(res.body).toEqual({
      statusCode: 502,
      message: 'La API REST de productos no esta disponible: ECONNREFUSED',
      fuente: 'rest',
    });
  });

  it('GraphQL caido -> 200 con datos REST y graphql "no-disponible"', async () => {
    http.get.mockReturnValue(of(respuesta({ id: 1, nombre: 'Teclado', precio: 55 })));
    http.post.mockReturnValue(throwError(() => new AxiosError('down', 'ECONNREFUSED')));
    const res = await request(app.getHttpServer()).get('/productos-completos/1').expect(200);
    expect(res.body).toMatchObject({
      id: 1,
      graphql: null,
      fuentes: { rest: 'ok', graphql: 'no-disponible' },
      correlationId: null,
    });
  });
});

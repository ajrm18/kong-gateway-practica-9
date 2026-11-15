import type { HttpService } from '@nestjs/axios';
import { BadGatewayException, Logger, NotFoundException } from '@nestjs/common';
import { AxiosError, type AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';
import type { BffConfig } from '../config/bff.config';
import { ProductosCompletosService, QUERY_PRODUCTO_COMPLETO } from './productos-completos.service';

const config: BffConfig = {
  productosApiUrl: 'http://rest.test/api/v1',
  graphqlUrl: 'http://graphql.test/graphql',
  timeoutMs: 8000,
};

const respuesta = <T>(data: T, status = 200): AxiosResponse<T> =>
  ({ data, status, statusText: 'OK', headers: {}, config: {} }) as AxiosResponse<T>;

const errorHttp = (status: number) =>
  new AxiosError(
    `Request failed with status code ${status}`,
    'ERR_BAD_RESPONSE',
    undefined,
    undefined,
    respuesta({ message: 'x' }, status),
  );

const teclado = { id: 1, nombre: 'Teclado', precio: 55, categoria: null };
const graphqlOk = {
  data: {
    productoPorId: { id: 1, nombre: 'Teclado', precio: 55 },
    productosBaratos: [
      { id: 5, nombre: 'Auriculares', precio: 10 },
      { id: 1, nombre: 'Teclado', precio: 55 },
      { id: 9, nombre: 'Cable', precio: 3 },
    ],
  },
};

describe('ProductosCompletosService', () => {
  let get: jest.Mock;
  let post: jest.Mock;
  let servicio: ProductosCompletosService;

  beforeEach(() => {
    get = jest.fn();
    post = jest.fn();
    servicio = new ProductosCompletosService({ get, post } as unknown as HttpService, config);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('caso ok: combina REST + GraphQL y reenvia el X-Correlation-Id a ambas fuentes', async () => {
    get.mockReturnValue(of(respuesta(teclado)));
    post.mockReturnValue(of(respuesta(graphqlOk)));

    const r = await servicio.obtener(1, 'kong-generado');

    expect(r).toEqual({
      id: 1,
      nombre: 'Teclado',
      precio: 55,
      graphql: {
        coincide: true,
        alternativasMasBaratasOIguales: [
          { id: 9, nombre: 'Cable', precio: 3 },
          { id: 5, nombre: 'Auriculares', precio: 10 },
        ],
      },
      fuentes: { rest: 'ok', graphql: 'ok' },
      fuente: 'aggregator',
      correlationId: 'kong-generado',
    });
    expect(get).toHaveBeenCalledWith('http://rest.test/api/v1/productos/1', {
      headers: { 'X-Correlation-Id': 'kong-generado' },
      timeout: 8000,
    });
    expect(post).toHaveBeenCalledWith(
      'http://graphql.test/graphql',
      { query: QUERY_PRODUCTO_COMPLETO, variables: { id: 1, precioMaximo: 55 } },
      { headers: { 'X-Correlation-Id': 'kong-generado' }, timeout: 8000 },
    );
  });

  it('sin X-Correlation-Id no inventa uno: correlationId null y sin header hacia las fuentes', async () => {
    get.mockReturnValue(of(respuesta(teclado)));
    post.mockReturnValue(of(respuesta(graphqlOk)));

    const r = await servicio.obtener(1, null);

    expect(r.correlationId).toBeNull();
    expect(get.mock.calls[0][1]).toEqual({ headers: {}, timeout: 8000 });
  });

  it('coincide false cuando GraphQL tiene otro precio o no conoce el producto', async () => {
    get.mockReturnValue(of(respuesta(teclado)));
    post.mockReturnValueOnce(
      of(respuesta({ data: { productoPorId: { id: 1, nombre: 'Teclado', precio: 60 }, productosBaratos: [] } })),
    );
    expect((await servicio.obtener(1, null)).graphql?.coincide).toBe(false);

    post.mockReturnValueOnce(of(respuesta({ data: { productoPorId: null, productosBaratos: [] } })));
    expect((await servicio.obtener(1, null)).graphql).toEqual({
      coincide: false,
      alternativasMasBaratasOIguales: [],
    });
  });

  it('REST 404 -> NotFoundException (404) y no consulta GraphQL', async () => {
    get.mockReturnValue(throwError(() => errorHttp(404)));

    await expect(servicio.obtener(99, null)).rejects.toBeInstanceOf(NotFoundException);
    expect(post).not.toHaveBeenCalled();
  });

  it('REST caido (ECONNREFUSED) -> BadGatewayException (502) con mensaje claro', async () => {
    get.mockReturnValue(throwError(() => new AxiosError('connect ECONNREFUSED', 'ECONNREFUSED')));

    const error = await servicio.obtener(1, null).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadGatewayException);
    expect((error as BadGatewayException).getStatus()).toBe(502);
    expect((error as BadGatewayException).getResponse()).toMatchObject({
      message: 'La API REST de productos no esta disponible: ECONNREFUSED',
      fuente: 'rest',
    });
    expect(post).not.toHaveBeenCalled();
  });

  it('REST con timeout -> 502 indicando el timeout', async () => {
    get.mockReturnValue(throwError(() => new AxiosError('timeout of 8000ms exceeded', 'ECONNABORTED')));

    await expect(servicio.obtener(1, null)).rejects.toMatchObject({
      response: { message: 'La API REST de productos no esta disponible: timeout de 8000 ms' },
    });
  });

  it('REST 500 -> 502 (nunca 500 generico)', async () => {
    get.mockReturnValue(throwError(() => errorHttp(500)));

    await expect(servicio.obtener(1, null)).rejects.toMatchObject({
      response: { statusCode: 502, message: 'La API REST de productos no esta disponible: HTTP 500' },
    });
  });

  it('REST con formato invalido -> 502', async () => {
    get.mockReturnValue(of(respuesta({ id: 1, nombre: 'Teclado', precio: '55' })));

    await expect(servicio.obtener(1, null)).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('GraphQL caido -> responde con datos REST y graphql "no-disponible"', async () => {
    get.mockReturnValue(of(respuesta(teclado)));
    post.mockReturnValue(throwError(() => new AxiosError('getaddrinfo ENOTFOUND', 'ENOTFOUND')));

    const r = await servicio.obtener(1, 'kong-generado');

    expect(r).toEqual({
      id: 1,
      nombre: 'Teclado',
      precio: 55,
      graphql: null,
      fuentes: { rest: 'ok', graphql: 'no-disponible' },
      fuente: 'aggregator',
      correlationId: 'kong-generado',
      avisos: ['GraphQL no disponible: ENOTFOUND'],
    });
  });

  it('GraphQL con errores y data null (caso real del despliegue) -> "no-disponible" con el motivo', async () => {
    get.mockReturnValue(of(respuesta(teclado)));
    post.mockReturnValue(
      of(respuesta({ data: null, errors: [{ message: 'Request failed with status code 429' }] })),
    );

    const r = await servicio.obtener(1, null);

    expect(r.fuentes).toEqual({ rest: 'ok', graphql: 'no-disponible' });
    expect(r.avisos).toEqual([
      'GraphQL no disponible: GraphQL respondio sin datos: Request failed with status code 429',
    ]);
  });

  it('GraphQL con timeout -> "no-disponible"', async () => {
    get.mockReturnValue(of(respuesta(teclado)));
    post.mockReturnValue(throwError(() => new AxiosError('timeout', 'ECONNABORTED')));

    const r = await servicio.obtener(1, null);

    expect(r.avisos).toEqual(['GraphQL no disponible: timeout de 8000 ms']);
  });
});

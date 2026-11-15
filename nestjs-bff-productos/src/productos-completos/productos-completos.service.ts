import { HttpService } from '@nestjs/axios';
import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { BFF_CONFIG, type BffConfig } from '../config/bff.config';
import type {
  DatosGraphql,
  Producto,
  ProductoCompleto,
  ProductoRest,
} from './productos-completos.types';

// Una sola query: GraphQL resuelve en paralelo los dos campos raiz (productoPorId y productosBaratos).
export const QUERY_PRODUCTO_COMPLETO = `query ProductoCompleto($id: Int!, $precioMaximo: Float!) {
  productoPorId(id: $id) { id nombre precio }
  productosBaratos(precioMaximo: $precioMaximo) { id nombre precio }
}`;

interface RespuestaGraphql {
  data?: { productoPorId?: unknown; productosBaratos?: unknown } | null;
  errors?: { message?: string }[];
}

function esProducto(valor: unknown): valor is Producto {
  if (typeof valor !== 'object' || valor === null) return false;
  const p = valor as Record<string, unknown>;
  return (
    Number.isInteger(p.id) &&
    typeof p.nombre === 'string' &&
    typeof p.precio === 'number' &&
    Number.isFinite(p.precio)
  );
}

@Injectable()
export class ProductosCompletosService {
  private readonly logger = new Logger(ProductosCompletosService.name);

  constructor(
    private readonly http: HttpService,
    @Inject(BFF_CONFIG) private readonly config: BffConfig,
  ) {}

  /**
   * Aggregator: REST es la fuente principal (sin REST no hay respuesta) y GraphQL
   * la secundaria (si falla, se responde igual con los datos REST).
   * La query GraphQL necesita el precio que devuelve REST, por eso va despues de REST.
   */
  async obtener(id: number, correlationId: string | null): Promise<ProductoCompleto> {
    const headers: Record<string, string> = correlationId
      ? { 'X-Correlation-Id': correlationId }
      : {};
    const producto = await this.obtenerDeRest(id, headers, correlationId);

    const [resultadoGraphql] = await Promise.allSettled([
      this.consultarGraphql(producto, headers),
    ]);

    const { id: idRest, nombre, precio } = producto;

    if (resultadoGraphql.status === 'fulfilled') {
      return {
        id: idRest,
        nombre,
        precio,
        graphql: resultadoGraphql.value,
        fuentes: { rest: 'ok', graphql: 'ok' },
        fuente: 'aggregator',
        correlationId,
      };
    }

    const motivo = this.motivo(resultadoGraphql.reason);
    this.logger.warn(`GraphQL no disponible: ${motivo} [correlationId=${correlationId ?? '-'}]`);
    return {
      id: idRest,
      nombre,
      precio,
      graphql: null,
      fuentes: { rest: 'ok', graphql: 'no-disponible' },
      fuente: 'aggregator',
      correlationId,
      avisos: [`GraphQL no disponible: ${motivo}`],
    };
  }

  private async obtenerDeRest(
    id: number,
    headers: Record<string, string>,
    correlationId: string | null,
  ): Promise<ProductoRest> {
    const url = `${this.config.productosApiUrl}/productos/${id}`;
    let datos: unknown;
    try {
      const respuesta = await firstValueFrom(
        this.http.get<unknown>(url, { headers, timeout: this.config.timeoutMs }),
      );
      datos = respuesta.data;
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) {
        throw new NotFoundException({
          statusCode: 404,
          message: `El producto ${id} no existe en la API REST`,
          fuente: 'rest',
        });
      }
      const motivo = this.motivo(error);
      this.logger.error(
        `API REST no disponible (${url}): ${motivo} [correlationId=${correlationId ?? '-'}]`,
      );
      throw new BadGatewayException({
        statusCode: 502,
        message: `La API REST de productos no esta disponible: ${motivo}`,
        fuente: 'rest',
      });
    }

    if (!esProducto(datos)) {
      this.logger.error(`API REST devolvio un producto con formato invalido (${url})`);
      throw new BadGatewayException({
        statusCode: 502,
        message: 'La API REST de productos devolvio una respuesta con formato invalido',
        fuente: 'rest',
      });
    }
    return datos;
  }

  private async consultarGraphql(
    producto: Producto,
    headers: Record<string, string>,
  ): Promise<DatosGraphql> {
    const respuesta = await firstValueFrom(
      this.http.post<RespuestaGraphql>(
        this.config.graphqlUrl,
        {
          query: QUERY_PRODUCTO_COMPLETO,
          variables: { id: producto.id, precioMaximo: producto.precio },
        },
        { headers, timeout: this.config.timeoutMs },
      ),
    );

    const cuerpo = respuesta.data;
    const datos = cuerpo?.data;
    if (!datos || !Array.isArray(datos.productosBaratos)) {
      const errores = (cuerpo?.errors ?? [])
        .map((e) => e.message)
        .filter(Boolean)
        .join('; ');
      throw new Error(`GraphQL respondio sin datos${errores ? `: ${errores}` : ''}`);
    }

    const enGraphql = esProducto(datos.productoPorId) ? datos.productoPorId : null;
    const coincide =
      enGraphql !== null &&
      enGraphql.id === producto.id &&
      enGraphql.nombre === producto.nombre &&
      enGraphql.precio === producto.precio;

    const alternativasMasBaratasOIguales = datos.productosBaratos
      .filter(esProducto)
      .filter((p) => p.id !== producto.id && p.precio <= producto.precio)
      .map(({ id, nombre, precio }) => ({ id, nombre, precio }))
      .sort((a, b) => a.precio - b.precio || a.id - b.id);

    return { coincide, alternativasMasBaratasOIguales };
  }

  /** Motivo de una sola linea, sin pila ni cuerpo de axios (fallo recurrente R20). */
  private motivo(error: unknown): string {
    if (isAxiosError(error)) {
      if (error.response) return `HTTP ${error.response.status}`;
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return `timeout de ${this.config.timeoutMs} ms`;
      }
      return error.code ?? error.message;
    }
    const texto = error instanceof Error ? error.message : String(error);
    return texto.length > 300 ? `${texto.slice(0, 300)}...` : texto;
  }
}

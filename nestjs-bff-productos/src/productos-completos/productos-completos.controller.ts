import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { ProductosCompletosService } from './productos-completos.service';
import type { ProductoCompleto } from './productos-completos.types';

const ID_MAXIMO = 2147483647; // int4 de PostgreSQL en la API REST

/** Vacio -> null; recorta espacios y limita a 128 caracteres lo que se reenvia y se devuelve. */
export function normalizarCorrelationId(valor: string | undefined): string | null {
  const limpio = valor?.trim();
  if (!limpio) return null;
  return limpio.slice(0, 128);
}

// Sin prefijo global: la ruta coincide con la route /productos-completos de Kong (strip_path: false).
@Controller('productos-completos')
export class ProductosCompletosController {
  constructor(private readonly servicio: ProductosCompletosService) {}

  @Get(':id')
  obtener(
    @Param('id', new ParseIntPipe({ errorHttpStatusCode: 400 })) id: number,
    @Headers('x-correlation-id') correlationId?: string,
  ): Promise<ProductoCompleto> {
    if (id < 1 || id > ID_MAXIMO) {
      throw new BadRequestException(`El id debe ser un entero entre 1 y ${ID_MAXIMO}`);
    }
    return this.servicio.obtener(id, normalizarCorrelationId(correlationId));
  }
}

import { BadRequestException, ParseIntPipe } from '@nestjs/common';
import {
  normalizarCorrelationId,
  ProductosCompletosController,
} from './productos-completos.controller';
import type { ProductosCompletosService } from './productos-completos.service';

describe('ProductosCompletosController', () => {
  const obtener = jest.fn().mockResolvedValue({ id: 1 });
  const controller = new ProductosCompletosController({
    obtener,
  } as unknown as ProductosCompletosService);
  const pipe = new ParseIntPipe({ errorHttpStatusCode: 400 });

  beforeEach(() => obtener.mockClear());

  it.each(['abc', '1.5', '1e3', ''])('id invalido "%s" -> 400 en ParseIntPipe', async (valor) => {
    await expect(pipe.transform(valor, { type: 'param' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it.each([0, -3, 2147483648])('id fuera de rango %d -> 400 sin llamar al servicio', (id) => {
    expect(() => controller.obtener(id)).toThrow(BadRequestException);
    expect(obtener).not.toHaveBeenCalled();
  });

  it('id valido -> delega en el servicio con el correlationId normalizado', async () => {
    await controller.obtener(1, '  kong-generado  ');
    expect(obtener).toHaveBeenCalledWith(1, 'kong-generado');
  });

  it('normalizarCorrelationId: vacio -> null, largo -> 128 caracteres', () => {
    expect(normalizarCorrelationId(undefined)).toBeNull();
    expect(normalizarCorrelationId('   ')).toBeNull();
    expect(normalizarCorrelationId('x'.repeat(500))).toHaveLength(128);
  });
});

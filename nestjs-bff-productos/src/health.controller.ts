import { Controller, Get } from '@nestjs/common';

/**
 * Health check para Render. Es superficial a proposito: solo indica que el BFF esta vivo.
 * Si consultara REST o GraphQL, Render reiniciaria el BFF cada vez que una de esas
 * fuentes durmiera (Render Free), aunque el BFF sepa responder 502 o degradar.
 */
@Controller('health')
export class HealthController {
  @Get()
  salud() {
    return { status: 'ok', servicio: 'bff-productos' };
  }
}

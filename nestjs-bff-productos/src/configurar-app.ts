import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';

/**
 * Configuracion comun de la app, compartida por main.ts y la prueba e2e,
 * para que la prueba ejercite exactamente lo que corre en produccion.
 */
export function configurarApp(app: INestApplication): void {
  // Cabeceras de seguridad (nosniff, etc.) y sin X-Powered-By (fallo recurrente R11).
  app.use(helmet());
  const express = app.getHttpAdapter().getInstance() as { disable: (s: string) => void };
  express.disable('x-powered-by');
  app.enableShutdownHooks();
}

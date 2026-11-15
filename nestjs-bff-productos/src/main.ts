import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configurarApp } from './configurar-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configurarApp(app);
  const puerto = process.env.PORT ?? 3001;
  await app.listen(puerto);
  new Logger('Bootstrap').log(`BFF de productos escuchando en el puerto ${puerto}`);
}

// Sin promesas sueltas (fallo recurrente R01): un error de arranque se registra en una linea y sale con 1.
bootstrap().catch((error: unknown) => {
  const motivo = error instanceof Error ? error.message : String(error);
  new Logger('Bootstrap').error(`No se pudo arrancar el BFF: ${motivo}`);
  process.exit(1);
});

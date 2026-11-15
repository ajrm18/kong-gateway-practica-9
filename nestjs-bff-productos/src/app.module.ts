import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BFF_CONFIG, cargarConfig } from './config/bff.config';
import { HealthController } from './health.controller';
import { ProductosCompletosController } from './productos-completos/productos-completos.controller';
import { ProductosCompletosService } from './productos-completos/productos-completos.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), HttpModule],
  controllers: [ProductosCompletosController, HealthController],
  providers: [
    {
      provide: BFF_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        cargarConfig({
          NODE_ENV: config.get<string>('NODE_ENV'),
          PRODUCTOS_API_URL: config.get<string>('PRODUCTOS_API_URL'),
          GRAPHQL_URL: config.get<string>('GRAPHQL_URL'),
          FUENTE_TIMEOUT_MS: config.get<string>('FUENTE_TIMEOUT_MS'),
        }),
    },
    ProductosCompletosService,
  ],
})
export class AppModule {}

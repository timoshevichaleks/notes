import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AuthModule } from './auth.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AuthModule, {
    transport: Transport.TCP,
    options: { host: process.env.AUTH_HOST ?? '0.0.0.0', port: Number(process.env.AUTH_PORT ?? 3001) },
  });
  await app.listen();
}
void bootstrap();

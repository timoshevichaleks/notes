import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { NotesModule } from './notes.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(NotesModule, {
    transport: Transport.TCP,
    options: { host: process.env.NOTES_HOST ?? '0.0.0.0', port: Number(process.env.NOTES_PORT ?? 3002) },
  });
  await app.listen();
}
void bootstrap();

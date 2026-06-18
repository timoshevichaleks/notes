import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  // Обычное приложение: BullMQ-воркер живёт внутри, HTTP-порт не нужен.
  const app = await NestFactory.createApplicationContext(WorkerModule);
  await app.init();
}
void bootstrap();

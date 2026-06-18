import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '@app/prisma';
import { AiModule } from '@app/ai';
import { SUMMARIZE_QUEUE } from '@app/contracts';
import { SummarizeProcessor } from './summarize.processor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AiModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: Number(config.get<string>('REDIS_PORT', '6379')),
        },
      }),
    }),
    BullModule.registerQueue({
      name: SUMMARIZE_QUEUE,
      defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    }),
  ],
  providers: [SummarizeProcessor],
})
export class WorkerModule {}

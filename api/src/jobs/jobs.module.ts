import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SummarizeProcessor } from './summarize.processor';
import { SummariesModule } from '../summaries/summaries.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { SUMMARIZE_QUEUE } from './jobs.constants';

@Module({
  imports: [
    BullModule.registerQueue({
      name: SUMMARIZE_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    }),
    SummariesModule,
    EmbeddingsModule,
  ],
  providers: [SummarizeProcessor],
})
export class JobsModule {}

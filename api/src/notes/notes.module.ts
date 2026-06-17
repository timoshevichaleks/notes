import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotesService } from './notes.service';
import { NotesController } from './notes.controller';
import { SUMMARIZE_QUEUE } from '../jobs/jobs.constants';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { SummariesModule } from '../summaries/summaries.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: SUMMARIZE_QUEUE }),
    EmbeddingsModule,
    SummariesModule,
  ],
  controllers: [NotesController],
  providers: [NotesService],
})
export class NotesModule {}

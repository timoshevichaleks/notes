import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmbeddingsService } from './embeddings.service';
import { SummariesService } from './summaries.service';

@Module({
  imports: [ConfigModule],
  providers: [EmbeddingsService, SummariesService],
  exports: [EmbeddingsService, SummariesService],
})
export class AiModule {}

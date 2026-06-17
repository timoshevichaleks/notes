import { Module } from '@nestjs/common';
import { SummariesService } from './summaries.service';

@Module({
  providers: [SummariesService],
  exports: [SummariesService],
})
export class SummariesModule {}

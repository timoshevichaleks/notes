import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { SummariesService } from '../summaries/summaries.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { SUMMARIZE_QUEUE } from './jobs.constants';

@Processor(SUMMARIZE_QUEUE)
export class SummarizeProcessor extends WorkerHost {
  private readonly logger = new Logger(SummarizeProcessor.name);

  constructor(
    private prisma: PrismaService,
    private summaries: SummariesService,
    private embeddings: EmbeddingsService,
  ) {
    super();
  }

  async process(job: Job<{ noteId: string }>): Promise<void> {
    const { noteId } = job.data;
    const note = await this.prisma.note.findUnique({ where: { id: noteId } });
    if (!note) {
      this.logger.warn(`Note ${noteId} not found, skipping`);
      return;
    }
    await this.prisma.note.update({
      where: { id: noteId },
      data: { status: 'PROCESSING' },
    });
    const result = await this.summaries.summarize(note.title, note.content);
    const vector = await this.embeddings.embed(`${note.title}\n${note.content}`);
    await this.prisma.note.update({
      where: { id: noteId },
      data: { summary: result.summary, tags: result.tags, status: 'DONE' },
    });
    // Prisma can't write the `vector` type via the typed client → raw SQL.
    await this.prisma.$executeRawUnsafe(
      `UPDATE "Note" SET embedding = $1::vector WHERE id = $2`,
      `[${vector.join(',')}]`,
      noteId,
    );
  }

  async onFailed(job: Job<{ noteId: string }>) {
    await this.prisma.note.update({
      where: { id: job.data.noteId },
      data: { status: 'FAILED' },
    });
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { SUMMARIZE_QUEUE } from '../jobs/jobs.constants';
import { CreateNoteDto, UpdateNoteDto } from './dto/note.dto';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { SummariesService } from '../summaries/summaries.service';

@Injectable()
export class NotesService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue(SUMMARIZE_QUEUE) private queue: Queue,
    private embeddings: EmbeddingsService,
    private summaries: SummariesService,
  ) {}

  async create(userId: string, dto: CreateNoteDto) {
    const note = await this.prisma.note.create({
      data: { userId, title: dto.title, content: dto.content },
    });
    await this.queue.add('summarize', { noteId: note.id });
    return note;
  }

  findAll(userId: string) {
    return this.prisma.note.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const note = await this.prisma.note.findFirst({ where: { id, userId } });
    if (!note) throw new NotFoundException('Note not found');
    return note;
  }

  async update(userId: string, id: string, dto: UpdateNoteDto) {
    await this.findOne(userId, id);
    const note = await this.prisma.note.update({
      where: { id },
      data: { ...dto, status: 'PENDING', summary: null },
    });
    await this.queue.add('summarize', { noteId: note.id });
    return note;
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.prisma.note.delete({ where: { id } });
  }

  async search(userId: string, query: string) {
    const vector = await this.embeddings.embed(query);
    const rows = await this.prisma.$queryRawUnsafe<{ id: string; title: string; content: string }[]>(
      `SELECT id, title, content FROM "Note"
       WHERE "userId" = $1 AND embedding IS NOT NULL
       ORDER BY embedding <=> $2::vector
       LIMIT 5`,
      userId,
      `[${vector.join(',')}]`,
    );
    const answer = await this.summaries.answerFromContext(query, rows);
    return { answer, sources: rows.map((r) => ({ id: r.id, title: r.title })) };
  }
}

import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { NotesService } from './notes.service';
import { PrismaService } from '@app/prisma';
import { SUMMARIZE_QUEUE } from '@app/contracts';
import { EmbeddingsService, SummariesService } from '@app/ai';

describe('NotesService.search', () => {
  let service: NotesService;
  let prisma: any;
  let embeddings: { embed: jest.Mock };
  let summaries: { answerFromContext: jest.Mock };

  beforeEach(async () => {
    prisma = { $queryRawUnsafe: jest.fn() };
    embeddings = { embed: jest.fn().mockResolvedValue([0.1, 0.2]) };
    summaries = { answerFromContext: jest.fn().mockResolvedValue('the answer') };
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotesService,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken(SUMMARIZE_QUEUE), useValue: { add: jest.fn() } },
        { provide: EmbeddingsService, useValue: embeddings },
        { provide: SummariesService, useValue: summaries },
      ],
    }).compile();
    service = moduleRef.get(NotesService);
  });

  it('embeds query, finds notes, asks Claude with context', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ id: 'n1', title: 'Q3 plan', content: 'deadlines...' }]);

    const res = await service.search('u1', 'when are deadlines');

    expect(embeddings.embed).toHaveBeenCalledWith('when are deadlines');
    expect(summaries.answerFromContext).toHaveBeenCalled();
    expect(res.sources).toEqual([{ id: 'n1', title: 'Q3 plan' }]);
    expect(res.answer).toBe('the answer');
  });
});

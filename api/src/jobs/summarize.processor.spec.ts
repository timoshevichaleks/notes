import { Test } from '@nestjs/testing';
import { SummarizeProcessor } from './summarize.processor';
import { PrismaService } from '../prisma/prisma.service';
import { SummariesService } from '../summaries/summaries.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';

describe('SummarizeProcessor', () => {
  let processor: SummarizeProcessor;
  let prisma: any;
  let summaries: { summarize: jest.Mock };
  let embeddings: { embed: jest.Mock };

  beforeEach(async () => {
    prisma = {
      note: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $executeRawUnsafe: jest.fn(),
    };
    summaries = { summarize: jest.fn() };
    embeddings = { embed: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        SummarizeProcessor,
        { provide: PrismaService, useValue: prisma },
        { provide: SummariesService, useValue: summaries },
        { provide: EmbeddingsService, useValue: embeddings },
      ],
    }).compile();
    processor = moduleRef.get(SummarizeProcessor);
  });

  it('summarizes the note, marks it DONE, and stores the embedding', async () => {
    prisma.note.findUnique.mockResolvedValue({
      id: 'n1',
      title: 't',
      content: 'c',
    });
    summaries.summarize.mockResolvedValue({ summary: 's', tags: ['a'] });

    await processor.process({ data: { noteId: 'n1' } } as any);

    expect(prisma.note.update).toHaveBeenLastCalledWith({
      where: { id: 'n1' },
      data: { summary: 's', tags: ['a'], status: 'DONE' },
    });
    expect(embeddings.embed).toHaveBeenCalledWith('t\nc');
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "Note" SET embedding'),
      '[0.1,0.2,0.3]',
      'n1',
    );
  });
});

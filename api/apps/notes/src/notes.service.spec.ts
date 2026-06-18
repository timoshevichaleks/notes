import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { NotesService } from './notes.service';
import { PrismaService } from '@app/prisma';
import { SUMMARIZE_QUEUE } from '@app/contracts';
import { EmbeddingsService, SummariesService } from '@app/ai';

describe('NotesService', () => {
  let service: NotesService;
  let prisma: any;
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    prisma = {
      note: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    queue = { add: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotesService,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken(SUMMARIZE_QUEUE), useValue: queue },
        { provide: EmbeddingsService, useValue: { embed: jest.fn() } },
        { provide: SummariesService, useValue: { answerFromContext: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(NotesService);
  });

  it('create saves note and enqueues a summarize job', async () => {
    prisma.note.create.mockResolvedValue({ id: 'n1', title: 't', content: 'c' });

    const note = await service.create('u1', { title: 't', content: 'c' });

    expect(prisma.note.create).toHaveBeenCalledWith({
      data: { userId: 'u1', title: 't', content: 'c' },
    });
    expect(queue.add).toHaveBeenCalledWith('summarize', { noteId: 'n1' });
    expect(note.id).toBe('n1');
  });

  it('findOne throws when note not owned', async () => {
    prisma.note.findFirst.mockResolvedValue(null);
    await expect(service.findOne('u1', 'n1')).rejects.toThrow(NotFoundException);
  });
});

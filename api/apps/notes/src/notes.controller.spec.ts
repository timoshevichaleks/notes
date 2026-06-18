import { Test } from '@nestjs/testing';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';

describe('NotesController (message handlers)', () => {
  let controller: NotesController;
  const notes = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    search: jest.fn(),
  };

  beforeEach(async () => {
    const ref = await Test.createTestingModule({
      controllers: [NotesController],
      providers: [{ provide: NotesService, useValue: notes }],
    }).compile();
    controller = ref.get(NotesController);
  });

  it('create handler delegates with userId', async () => {
    notes.create.mockResolvedValue({ id: 'n1' });
    const res = await controller.create({ userId: 'u1', title: 't', content: 'c' });
    expect(notes.create).toHaveBeenCalledWith('u1', { title: 't', content: 'c' });
    expect(res).toEqual({ id: 'n1' });
  });
});

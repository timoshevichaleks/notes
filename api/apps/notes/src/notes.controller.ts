import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { NOTES_PATTERNS } from '@app/contracts';
import type { CreateNotePayload, NoteIdPayload, UpdateNotePayload, SearchPayload, ListPayload } from '@app/contracts';
import { NotesService } from './notes.service';

@Controller()
export class NotesController {
  constructor(private notes: NotesService) {}

  @MessagePattern(NOTES_PATTERNS.create)
  create(@Payload() p: CreateNotePayload) {
    return this.notes.create(p.userId, { title: p.title, content: p.content });
  }

  @MessagePattern(NOTES_PATTERNS.list)
  list(@Payload() p: ListPayload) {
    return this.notes.findAll(p.userId);
  }

  @MessagePattern(NOTES_PATTERNS.get)
  get(@Payload() p: NoteIdPayload) {
    return this.notes.findOne(p.userId, p.id);
  }

  @MessagePattern(NOTES_PATTERNS.update)
  update(@Payload() p: UpdateNotePayload) {
    return this.notes.update(p.userId, p.id, { title: p.title, content: p.content });
  }

  @MessagePattern(NOTES_PATTERNS.remove)
  remove(@Payload() p: NoteIdPayload) {
    return this.notes.remove(p.userId, p.id);
  }

  @MessagePattern(NOTES_PATTERNS.search)
  search(@Payload() p: SearchPayload) {
    return this.notes.search(p.userId, p.query);
  }
}

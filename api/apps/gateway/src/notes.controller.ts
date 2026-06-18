import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { NOTES_SERVICE, NOTES_PATTERNS } from '@app/contracts';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { CreateNoteDto, UpdateNoteDto } from './dto/note.dto';
import { SearchDto } from './dto/search.dto';
import { callService } from './rpc.util';

@UseGuards(JwtAuthGuard)
@Controller('notes')
export class NotesController {
  constructor(@Inject(NOTES_SERVICE) private notes: ClientProxy) {}

  @Get()
  list(@CurrentUser() user: { userId: string }) {
    return callService(this.notes.send(NOTES_PATTERNS.list, { userId: user.userId }));
  }

  @Post()
  create(@CurrentUser() user: { userId: string }, @Body() dto: CreateNoteDto) {
    return callService(this.notes.send(NOTES_PATTERNS.create, { userId: user.userId, ...dto }));
  }

  @Post('search')
  search(@CurrentUser() user: { userId: string }, @Body() dto: SearchDto) {
    return callService(this.notes.send(NOTES_PATTERNS.search, { userId: user.userId, query: dto.query }));
  }

  @Get(':id')
  get(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return callService(this.notes.send(NOTES_PATTERNS.get, { userId: user.userId, id }));
  }

  @Patch(':id')
  update(@CurrentUser() user: { userId: string }, @Param('id') id: string, @Body() dto: UpdateNoteDto) {
    return callService(this.notes.send(NOTES_PATTERNS.update, { userId: user.userId, id, ...dto }));
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return callService(this.notes.send(NOTES_PATTERNS.remove, { userId: user.userId, id }));
  }
}

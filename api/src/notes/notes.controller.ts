import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { NotesService } from './notes.service';
import { CreateNoteDto, UpdateNoteDto } from './dto/note.dto';
import { SearchDto } from './dto/search.dto';

@UseGuards(JwtAuthGuard)
@Controller('notes')
export class NotesController {
  constructor(private notes: NotesService) {}

  @Get()
  findAll(@CurrentUser() user: { userId: string }) {
    return this.notes.findAll(user.userId);
  }

  @Post()
  create(@CurrentUser() user: { userId: string }, @Body() dto: CreateNoteDto) {
    return this.notes.create(user.userId, dto);
  }

  @Post('search')
  search(@CurrentUser() user: { userId: string }, @Body() dto: SearchDto) {
    return this.notes.search(user.userId, dto.query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.notes.findOne(user.userId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateNoteDto,
  ) {
    return this.notes.update(user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.notes.remove(user.userId, id);
  }
}

import { NotesService } from './notes.service';
import { CreateNoteDto, UpdateNoteDto } from './dto/note.dto';
import { SearchDto } from './dto/search.dto';
export declare class NotesController {
    private notes;
    constructor(notes: NotesService);
    findAll(user: {
        userId: string;
    }): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        createdAt: Date;
        title: string;
        content: string;
        summary: string | null;
        tags: string[];
        status: import("@prisma/client").$Enums.NoteStatus;
        updatedAt: Date;
        userId: string;
    }[]>;
    create(user: {
        userId: string;
    }, dto: CreateNoteDto): Promise<{
        id: string;
        createdAt: Date;
        title: string;
        content: string;
        summary: string | null;
        tags: string[];
        status: import("@prisma/client").$Enums.NoteStatus;
        updatedAt: Date;
        userId: string;
    }>;
    search(user: {
        userId: string;
    }, dto: SearchDto): Promise<{
        answer: string;
        sources: {
            id: string;
            title: string;
        }[];
    }>;
    findOne(user: {
        userId: string;
    }, id: string): Promise<{
        id: string;
        createdAt: Date;
        title: string;
        content: string;
        summary: string | null;
        tags: string[];
        status: import("@prisma/client").$Enums.NoteStatus;
        updatedAt: Date;
        userId: string;
    }>;
    update(user: {
        userId: string;
    }, id: string, dto: UpdateNoteDto): Promise<{
        id: string;
        createdAt: Date;
        title: string;
        content: string;
        summary: string | null;
        tags: string[];
        status: import("@prisma/client").$Enums.NoteStatus;
        updatedAt: Date;
        userId: string;
    }>;
    remove(user: {
        userId: string;
    }, id: string): Promise<void>;
}

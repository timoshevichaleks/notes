import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNoteDto, UpdateNoteDto } from './dto/note.dto';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { SummariesService } from '../summaries/summaries.service';
export declare class NotesService {
    private prisma;
    private queue;
    private embeddings;
    private summaries;
    constructor(prisma: PrismaService, queue: Queue, embeddings: EmbeddingsService, summaries: SummariesService);
    create(userId: string, dto: CreateNoteDto): Promise<{
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
    findAll(userId: string): import("@prisma/client").Prisma.PrismaPromise<{
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
    findOne(userId: string, id: string): Promise<{
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
    update(userId: string, id: string, dto: UpdateNoteDto): Promise<{
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
    remove(userId: string, id: string): Promise<void>;
    search(userId: string, query: string): Promise<{
        answer: string;
        sources: {
            id: string;
            title: string;
        }[];
    }>;
}

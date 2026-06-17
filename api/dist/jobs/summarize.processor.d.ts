import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { SummariesService } from '../summaries/summaries.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
export declare class SummarizeProcessor extends WorkerHost {
    private prisma;
    private summaries;
    private embeddings;
    private readonly logger;
    constructor(prisma: PrismaService, summaries: SummariesService, embeddings: EmbeddingsService);
    process(job: Job<{
        noteId: string;
    }>): Promise<void>;
    onFailed(job: Job<{
        noteId: string;
    }>): Promise<void>;
}

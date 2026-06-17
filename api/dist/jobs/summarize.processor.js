"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var SummarizeProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SummarizeProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const summaries_service_1 = require("../summaries/summaries.service");
const embeddings_service_1 = require("../embeddings/embeddings.service");
const jobs_constants_1 = require("./jobs.constants");
let SummarizeProcessor = SummarizeProcessor_1 = class SummarizeProcessor extends bullmq_1.WorkerHost {
    prisma;
    summaries;
    embeddings;
    logger = new common_1.Logger(SummarizeProcessor_1.name);
    constructor(prisma, summaries, embeddings) {
        super();
        this.prisma = prisma;
        this.summaries = summaries;
        this.embeddings = embeddings;
    }
    async process(job) {
        const { noteId } = job.data;
        const note = await this.prisma.note.findUnique({ where: { id: noteId } });
        if (!note) {
            this.logger.warn(`Note ${noteId} not found, skipping`);
            return;
        }
        await this.prisma.note.update({
            where: { id: noteId },
            data: { status: 'PROCESSING' },
        });
        const result = await this.summaries.summarize(note.title, note.content);
        const vector = await this.embeddings.embed(`${note.title}\n${note.content}`);
        await this.prisma.note.update({
            where: { id: noteId },
            data: { summary: result.summary, tags: result.tags, status: 'DONE' },
        });
        await this.prisma.$executeRawUnsafe(`UPDATE "Note" SET embedding = $1::vector WHERE id = $2`, `[${vector.join(',')}]`, noteId);
    }
    async onFailed(job) {
        await this.prisma.note.update({
            where: { id: job.data.noteId },
            data: { status: 'FAILED' },
        });
    }
};
exports.SummarizeProcessor = SummarizeProcessor;
exports.SummarizeProcessor = SummarizeProcessor = SummarizeProcessor_1 = __decorate([
    (0, bullmq_1.Processor)(jobs_constants_1.SUMMARIZE_QUEUE),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        summaries_service_1.SummariesService,
        embeddings_service_1.EmbeddingsService])
], SummarizeProcessor);
//# sourceMappingURL=summarize.processor.js.map
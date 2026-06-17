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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotesService = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const prisma_service_1 = require("../prisma/prisma.service");
const jobs_constants_1 = require("../jobs/jobs.constants");
const embeddings_service_1 = require("../embeddings/embeddings.service");
const summaries_service_1 = require("../summaries/summaries.service");
let NotesService = class NotesService {
    prisma;
    queue;
    embeddings;
    summaries;
    constructor(prisma, queue, embeddings, summaries) {
        this.prisma = prisma;
        this.queue = queue;
        this.embeddings = embeddings;
        this.summaries = summaries;
    }
    async create(userId, dto) {
        const note = await this.prisma.note.create({
            data: { userId, title: dto.title, content: dto.content },
        });
        await this.queue.add('summarize', { noteId: note.id });
        return note;
    }
    findAll(userId) {
        return this.prisma.note.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        });
    }
    async findOne(userId, id) {
        const note = await this.prisma.note.findFirst({ where: { id, userId } });
        if (!note)
            throw new common_1.NotFoundException('Note not found');
        return note;
    }
    async update(userId, id, dto) {
        await this.findOne(userId, id);
        const note = await this.prisma.note.update({
            where: { id },
            data: { ...dto, status: 'PENDING', summary: null },
        });
        await this.queue.add('summarize', { noteId: note.id });
        return note;
    }
    async remove(userId, id) {
        await this.findOne(userId, id);
        await this.prisma.note.delete({ where: { id } });
    }
    async search(userId, query) {
        const vector = await this.embeddings.embed(query);
        const rows = await this.prisma.$queryRawUnsafe(`SELECT id, title, content FROM "Note"
       WHERE "userId" = $1 AND embedding IS NOT NULL
       ORDER BY embedding <=> $2::vector
       LIMIT 5`, userId, `[${vector.join(',')}]`);
        const answer = await this.summaries.answerFromContext(query, rows);
        return { answer, sources: rows.map((r) => ({ id: r.id, title: r.title })) };
    }
};
exports.NotesService = NotesService;
exports.NotesService = NotesService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, bullmq_1.InjectQueue)(jobs_constants_1.SUMMARIZE_QUEUE)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        bullmq_2.Queue,
        embeddings_service_1.EmbeddingsService,
        summaries_service_1.SummariesService])
], NotesService);
//# sourceMappingURL=notes.service.js.map
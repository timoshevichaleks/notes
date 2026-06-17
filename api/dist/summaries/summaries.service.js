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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var SummariesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SummariesService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
let SummariesService = SummariesService_1 = class SummariesService {
    config;
    logger = new common_1.Logger(SummariesService_1.name);
    client;
    constructor(config) {
        this.config = config;
        const key = this.config.get('ANTHROPIC_API_KEY');
        this.client = key ? new sdk_1.default({ apiKey: key }) : null;
    }
    async summarize(title, content) {
        if (!this.client) {
            return this.mock(title, content);
        }
        const response = await this.client.messages.create({
            model: 'claude-opus-4-8',
            max_tokens: 300,
            messages: [
                {
                    role: 'user',
                    content: `Summarize the following note in 1-2 sentences and propose 3 short topic tags. ` +
                        `Respond as JSON: {"summary": string, "tags": string[]}.\n\n` +
                        `Title: ${title}\n\nContent:\n${content}`,
                },
            ],
        });
        const text = response.content
            .filter((b) => b.type === 'text')
            .map((b) => b.text)
            .join('');
        try {
            const parsed = JSON.parse(text);
            return { summary: parsed.summary, tags: parsed.tags ?? [] };
        }
        catch {
            this.logger.warn('Failed to parse Claude JSON, using raw text');
            return { summary: text.slice(0, 280), tags: [] };
        }
    }
    mock(title, content) {
        const firstWords = content.split(/\s+/).slice(0, 12).join(' ');
        return {
            summary: `[mock] ${title}: ${firstWords}...`,
            tags: ['mock', 'note'],
        };
    }
    async answerFromContext(query, notes) {
        const context = notes
            .map((n, i) => `[${i + 1}] ${n.title}\n${n.content}`)
            .join('\n\n');
        if (!this.client) {
            return notes.length
                ? `[mock answer] Based on ${notes.length} note(s), most relevant: "${notes[0].title}"`
                : '[mock answer] No relevant notes found.';
        }
        const response = await this.client.messages.create({
            model: 'claude-opus-4-8',
            max_tokens: 400,
            messages: [
                {
                    role: 'user',
                    content: `Answer the question using ONLY the notes below. ` +
                        `If the notes do not contain the answer, say you could not find it.\n\n` +
                        `Notes:\n${context}\n\nQuestion: ${query}`,
                },
            ],
        });
        return response.content
            .filter((b) => b.type === 'text')
            .map((b) => b.text)
            .join('');
    }
};
exports.SummariesService = SummariesService;
exports.SummariesService = SummariesService = SummariesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], SummariesService);
//# sourceMappingURL=summaries.service.js.map
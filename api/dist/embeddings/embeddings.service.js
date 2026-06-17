"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var EmbeddingsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddingsService = void 0;
const common_1 = require("@nestjs/common");
let EmbeddingsService = EmbeddingsService_1 = class EmbeddingsService {
    logger = new common_1.Logger(EmbeddingsService_1.name);
    pipelinePromise = null;
    dynamicImport = new Function('s', 'return import(s)');
    async getPipeline() {
        if (!this.pipelinePromise) {
            this.pipelinePromise = (async () => {
                const { pipeline } = await this.dynamicImport('@xenova/transformers');
                this.logger.log('Loading embedding model all-MiniLM-L6-v2...');
                return (await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2'));
            })();
        }
        return this.pipelinePromise;
    }
    async embed(text) {
        const extractor = await this.getPipeline();
        const output = await extractor(text, { pooling: 'mean', normalize: true });
        return Array.from(output.data);
    }
};
exports.EmbeddingsService = EmbeddingsService;
exports.EmbeddingsService = EmbeddingsService = EmbeddingsService_1 = __decorate([
    (0, common_1.Injectable)()
], EmbeddingsService);
//# sourceMappingURL=embeddings.service.js.map
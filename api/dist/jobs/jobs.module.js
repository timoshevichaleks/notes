"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobsModule = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const summarize_processor_1 = require("./summarize.processor");
const summaries_module_1 = require("../summaries/summaries.module");
const embeddings_module_1 = require("../embeddings/embeddings.module");
const jobs_constants_1 = require("./jobs.constants");
let JobsModule = class JobsModule {
};
exports.JobsModule = JobsModule;
exports.JobsModule = JobsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            bullmq_1.BullModule.registerQueue({
                name: jobs_constants_1.SUMMARIZE_QUEUE,
                defaultJobOptions: {
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 2000 },
                },
            }),
            summaries_module_1.SummariesModule,
            embeddings_module_1.EmbeddingsModule,
        ],
        providers: [summarize_processor_1.SummarizeProcessor],
    })
], JobsModule);
//# sourceMappingURL=jobs.module.js.map
import { ConfigService } from '@nestjs/config';
export interface SummaryResult {
    summary: string;
    tags: string[];
}
export declare class SummariesService {
    private config;
    private readonly logger;
    private readonly client;
    constructor(config: ConfigService);
    summarize(title: string, content: string): Promise<SummaryResult>;
    private mock;
    answerFromContext(query: string, notes: {
        title: string;
        content: string;
    }[]): Promise<string>;
}

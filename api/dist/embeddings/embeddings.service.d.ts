export declare class EmbeddingsService {
    private readonly logger;
    private pipelinePromise;
    private readonly dynamicImport;
    private getPipeline;
    embed(text: string): Promise<number[]>;
}

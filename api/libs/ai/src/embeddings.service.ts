import { Injectable, Logger } from '@nestjs/common';

type FeatureExtractionPipeline = (
  text: string,
  opts: { pooling: 'mean'; normalize: boolean },
) => Promise<{ data: Float32Array }>;

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

  // Keep this a real runtime dynamic import (ESM-only package). The `Function`
  // wrapper prevents TypeScript/ts-jest from down-compiling it to require().
  // Body is a static literal (no interpolation) — not an injection vector.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  private readonly dynamicImport = new Function('s', 'return import(s)') as (
    s: string,
  ) => Promise<{ pipeline: (task: string, model: string) => Promise<unknown> }>;

  private async getPipeline(): Promise<FeatureExtractionPipeline> {
    if (!this.pipelinePromise) {
      this.pipelinePromise = (async () => {
        const { pipeline } = await this.dynamicImport('@xenova/transformers');
        this.logger.log('Loading embedding model all-MiniLM-L6-v2...');
        return (await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')) as FeatureExtractionPipeline;
      })();
    }
    return this.pipelinePromise;
  }

  async embed(text: string): Promise<number[]> {
    const extractor = await this.getPipeline();
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  }
}

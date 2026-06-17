import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SummariesService } from './summaries.service';

describe('SummariesService', () => {
  async function build(apiKey: string) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SummariesService,
        { provide: ConfigService, useValue: { get: () => apiKey } },
      ],
    }).compile();
    return moduleRef.get(SummariesService);
  }

  it('returns a mock summary when no API key is set', async () => {
    const service = await build('');
    const result = await service.summarize('Title', 'Some long content here');

    expect(result.summary).toContain('[mock]');
    expect(Array.isArray(result.tags)).toBe(true);
    expect(result.tags.length).toBeGreaterThan(0);
  });
});

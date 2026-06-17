import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

export interface SummaryResult {
  summary: string;
  tags: string[];
}

@Injectable()
export class SummariesService {
  private readonly logger = new Logger(SummariesService.name);
  private readonly client: Anthropic | null;

  constructor(private config: ConfigService) {
    const key = this.config.get<string>('ANTHROPIC_API_KEY');
    this.client = key ? new Anthropic({ apiKey: key }) : null;
  }

  async summarize(title: string, content: string): Promise<SummaryResult> {
    if (!this.client) {
      return this.mock(title, content);
    }
    const response = await this.client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content:
            `Summarize the following note in 1-2 sentences and propose 3 short topic tags. ` +
            `Respond as JSON: {"summary": string, "tags": string[]}.\n\n` +
            `Title: ${title}\n\nContent:\n${content}`,
        },
      ],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    try {
      const parsed = JSON.parse(text) as SummaryResult;
      return { summary: parsed.summary, tags: parsed.tags ?? [] };
    } catch {
      this.logger.warn('Failed to parse Claude JSON, using raw text');
      return { summary: text.slice(0, 280), tags: [] };
    }
  }

  private mock(title: string, content: string): SummaryResult {
    const firstWords = content.split(/\s+/).slice(0, 12).join(' ');
    return {
      summary: `[mock] ${title}: ${firstWords}...`,
      tags: ['mock', 'note'],
    };
  }

  async answerFromContext(query: string, notes: { title: string; content: string }[]): Promise<string> {
    const context = notes.map((n, i) => `[${i + 1}] ${n.title}\n${n.content}`).join('\n\n');
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
          content:
            `Answer the question using ONLY the notes below. ` +
            `If the notes do not contain the answer, say you could not find it.\n\n` +
            `Notes:\n${context}\n\nQuestion: ${query}`,
        },
      ],
    });
    return response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
  }
}

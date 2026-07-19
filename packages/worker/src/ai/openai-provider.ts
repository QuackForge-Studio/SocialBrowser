import type { GenerateResult, EmbedResult, SentimentResult, SentimentLabel } from '@social-browser/shared';
import type { AIProvider } from './provider';

const DEFAULT_GENERATION_MODEL = 'gpt-4o';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
const DEFAULT_EMBEDDING_DIMENSIONS = 1536;
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_EMBED_URL = 'https://api.openai.com/v1/embeddings';

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export class OpenAIProvider implements AIProvider {
  readonly provider = 'openai';
  readonly model: string;
  readonly embeddingModel: string;
  readonly embeddingDimensions: number;
  private readonly apiKey: string;

  constructor(options: {
    apiKey: string;
    model?: string;
    embeddingModel?: string;
    embeddingDimensions?: number;
  }) {
    if (!options.apiKey) {
      throw new Error('OpenAI API key is required');
    }
    this.apiKey = options.apiKey;
    this.model = options.model ?? DEFAULT_GENERATION_MODEL;
    this.embeddingModel = options.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
    this.embeddingDimensions = options.embeddingDimensions ?? DEFAULT_EMBEDDING_DIMENSIONS;
  }

  async generate(prompt: string, context?: string[]): Promise<GenerateResult> {
    const startTime = Date.now();
    const messages: Array<{ role: string; content: string }> = [];

    if (context && context.length > 0) {
      const contextText = context.map((c, i) => '[Source ' + (i + 1) + ']: ' + c).join('\n\n');
      messages.push({
        role: 'system',
        content: 'You are a social media content creator. Use the following past posts as reference for style and tone:\n\n' + contextText,
      });
    }

    messages.push({ role: 'user', content: prompt });

    const response = await fetch(OPENAI_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + this.apiKey,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      if (response.status === 429) {
        const err: Error & { statusCode?: number } = new Error('OpenAI API rate limited: ' + errorBody);
        err.statusCode = 429;
        throw err;
      }
      throw new Error('OpenAI API error (' + response.status + '): ' + errorBody);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    const latencyMs = Date.now() - startTime;
    const text = data.choices?.[0]?.message?.content ?? '';
    const tokenCount = data.usage?.total_tokens ?? estimateTokens(prompt + text);

    return { text, provider: this.provider, model: this.model, latencyMs, tokenCount };
  }

  async embed(text: string): Promise<EmbedResult> {
    const response = await fetch(OPENAI_EMBED_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + this.apiKey,
      },
      body: JSON.stringify({
        model: this.embeddingModel,
        input: text,
        dimensions: this.embeddingDimensions,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error('OpenAI Embedding API error (' + response.status + '): ' + errorBody);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };

    const vector = new Float32Array(data.data[0].embedding);
    return { vector, provider: this.provider, model: this.embeddingModel, dimensions: this.embeddingDimensions };
  }

  async classifySentiment(texts: string[]): Promise<SentimentResult[]> {
    const systemPrompt = 'You are a sentiment classifier. For each text, respond with exactly one line containing:\nLABEL: positive|negative|neutral\nSCORE: <number between -100 and 100>\n\nSeparate each result with a blank line.';
    const userMessage = texts.map((t, i) => 'Text ' + (i + 1) + ': "' + t + '"').join('\n\n');

    const response = await fetch(OPENAI_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + this.apiKey,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: texts.length * 50,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error('OpenAI API error (' + response.status + '): ' + errorBody);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const content = data.choices?.[0]?.message?.content ?? '';
    const results: SentimentResult[] = [];
    const blocks = content.split(/\n\n+/);

    for (let i = 0; i < texts.length; i++) {
      const block = blocks[i] || '';
      const labelMatch = block.match(/LABEL:\s*(positive|negative|neutral)/i);
      const scoreMatch = block.match(/SCORE:\s*(-?\d+(?:\.\d+)?)/);
      const label = (labelMatch?.[1]?.toLowerCase() as SentimentLabel) || 'neutral';
      const score = scoreMatch ? Math.max(-100, Math.min(100, parseFloat(scoreMatch[1]))) : 0;
      results.push({ label, score });
    }

    while (results.length < texts.length) {
      results.push({ label: 'neutral', score: 0 });
    }

    return results;
  }
}

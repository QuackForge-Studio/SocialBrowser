import type { GenerateResult, EmbedResult, SentimentResult, SentimentLabel } from '@social-browser/shared';
import type { AIProvider } from './provider';

function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s & 0x7fffffff) / 0x7fffffff;
  };
}

const POSITIVE_KEYWORDS = [
  'love', 'great', 'amazing', 'happy', 'excellent',
  'wonderful', 'fantastic', 'good', 'beautiful', 'awesome',
  'brilliant', 'perfect', 'lovely', 'incredible', 'best',
  'superb', 'outstanding', 'positive', 'delightful', 'joy',
  'thrilled', 'impressed', 'grateful', 'magnificent', 'splendid',
];

const NEGATIVE_KEYWORDS = [
  'hate', 'terrible', 'awful', 'bad', 'horrible',
  'sad', 'angry', 'ugly', 'worst', 'disgusting',
  'poor', 'dreadful', 'atrocious', 'lousy', 'pathetic',
  'frustrating', 'annoying', 'depressing', 'miserable', 'terribly',
  'horrific', 'abysmal', 'appalling', 'hideous', 'negative',
];

export class FakeAIProvider implements AIProvider {
  readonly provider = 'fake';
  readonly model: string;
  readonly embeddingDimensions: number;

  constructor(options?: { model?: string; embeddingDimensions?: number }) {
    this.model = options?.model ?? 'fake-model-v1';
    this.embeddingDimensions = options?.embeddingDimensions ?? 384;
  }

  async generate(prompt: string, context?: string[]): Promise<GenerateResult> {
    const startTime = Date.now();
    const contextStr = context?.join(' ') ?? '';
    const combined = prompt + '||' + contextStr;
    const hash = djb2Hash(combined);
    const random = seededRandom(hash);

    const templates = [
      'Here is a draft based on your prompt: ',
      'Based on the provided context, here is a suggested post: ',
      'Draft response: ',
    ];

    const templateIdx = hash % templates.length;
    const words = [
      'social', 'media', 'content', 'engagement', 'growth',
      'community', 'trending', 'viral', 'insightful', 'valuable',
    ];

    const wordCount = 15 + (hash % 20);
    let text = templates[templateIdx];
    for (let i = 0; i < wordCount; i++) {
      const wordIdx = Math.floor(random() * words.length);
      text += words[wordIdx] + ' ';
    }
    text = text.trim() + '.';

    const latencyMs = Date.now() - startTime;
    return {
      text,
      provider: this.provider,
      model: this.model,
      latencyMs,
      tokenCount: text.split(/\s+/).length,
    };
  }

  async embed(text: string): Promise<EmbedResult> {
    const hash = djb2Hash(text);
    const random = seededRandom(hash);
    const dimensions = this.embeddingDimensions;
    const vector = new Float32Array(dimensions);

    for (let i = 0; i < dimensions; i++) {
      vector[i] = random() * 2 - 1;
    }

    return { vector, provider: this.provider, model: this.model, dimensions };
  }

  async classifySentiment(texts: string[]): Promise<SentimentResult[]> {
    return texts.map((text) => {
      const lower = text.toLowerCase();
      let positiveCount = 0;
      let negativeCount = 0;

      for (const keyword of POSITIVE_KEYWORDS) {
        const regex = new RegExp('\\b' + keyword + '\\b', 'gi');
        const matches = lower.match(regex);
        if (matches) { positiveCount += matches.length; }
      }

      for (const keyword of NEGATIVE_KEYWORDS) {
        const regex = new RegExp('\\b' + keyword + '\\b', 'gi');
        const matches = lower.match(regex);
        if (matches) { negativeCount += matches.length; }
      }

      let label: SentimentLabel;
      let score: number;

      if (positiveCount === 0 && negativeCount === 0) {
        label = 'neutral';
        score = 0;
      } else {
        const total = positiveCount + negativeCount;
        score = ((positiveCount - negativeCount) / total) * 100;
        label = positiveCount > negativeCount ? 'positive' : negativeCount > positiveCount ? 'negative' : 'neutral';
        if (label === 'neutral') { score = 0; }
      }

      return { label, score };
    });
  }
}

import type { GenerateResult, EmbedResult, SentimentResult } from '@social-browser/shared';

/**
 * AIProvider interface.
 *
 * Defines the contract for AI providers used by the worker thread.
 */
export interface AIProvider {
  /** Provider identifier (e.g., 'fake', 'openai', 'anthropic'). */
  readonly provider: string;

  /** Model identifier (e.g., 'gpt-4o', 'text-embedding-3-small'). */
  readonly model: string;

  /** Generate text from a prompt with optional grounding context. */
  generate(prompt: string, context?: string[]): Promise<GenerateResult>;

  /** Generate an embedding vector for the given text. */
  embed(text: string): Promise<EmbedResult>;

  /** Classify sentiment for each text in the input array. */
  classifySentiment(texts: string[]): Promise<SentimentResult[]>;
}

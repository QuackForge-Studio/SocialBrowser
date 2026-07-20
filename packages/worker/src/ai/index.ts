export { AIProvider } from './provider';
export type { AIProvider as AIProviderType } from './provider';
export { FakeAIProvider } from './fake-provider';
export { OpenAIProvider } from './openai-provider';
export { AiRunTracker } from './ai-run-tracker';
export {
  registerProvider,
  getProvider,
  createProvider,
  setActiveProvider,
  getActiveProviderName,
  getActiveProviderConfig,
  KNOWN_PROVIDERS,
} from './provider-registry';

export { EmbeddingPipeline, computeContentHash } from './embedding-pipeline';
export type {
  EmbeddingStatus,
  EmbeddingRecord,
  EmbedContentResult,
  SimilarityResult,
  EmbedContentOptions,
} from './embedding-pipeline';

export { RAGPipeline } from './rag-pipeline';
export type {
  GenerateWithRAGResult,
  RAGPipelineOptions,
} from './rag-pipeline';

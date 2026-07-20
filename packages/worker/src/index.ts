export const WORKER_VERSION = '0.1.0';

export type WorkerMessageType =
  | 'shutdown'
  | 'ping'
  | 'process_capture'
  | 'generate_draft'
  | 'compute_scores'
  | 'batch_sentiment'
  | 'batch_config';

export interface WorkerMessage {
  type: WorkerMessageType;
  payload?: unknown;
  id: string;
}

export interface WorkerResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export {
  IngestionPipeline,
  createIngestionPipeline,
  PAYLOAD_SCHEMA_VERSION,
} from './ingestion';

export type {
  NormalizedPostPayload,
  SnapshotPayload,
  CommentPayload,
  AdapterReadyPayload,
  ErrorPayload,
  CaptureMetadata,
  CaptureResult,
} from './ingestion';

export { BatchProcessor } from './ai/batch-processor';
export type { BatchProcessorOptions } from './ai/batch-processor';

export {
  EmbeddingPipeline,
  computeContentHash,
  RAGPipeline,
} from './ai';
export type {
  EmbeddingStatus,
  EmbeddingRecord,
  EmbedContentResult,
  SimilarityResult,
  GenerateWithRAGResult,
  RAGPipelineOptions,
} from './ai';

export const WORKER_VERSION = '0.1.0';

export type WorkerMessageType =
  | 'get_workspaces'
  | 'create_workspace'
  | 'rename_workspace'
  | 'delete_workspace'
  | 'reorder_workspaces'
  | 'get_tab_groups'
  | 'create_tab_group'
  | 'rename_tab_group'
  | 'delete_tab_group'
  | 'reorder_tab_groups'
  | 'get_group_accounts'
  | 'add_account_to_group'
  | 'remove_account_from_group'
  | 'reorder_group_accounts'
  | 'get_group_tabs'
  | 'add_group_tab'
  | 'remove_group_tab'
  | 'reorder_group_tabs'
  | 'shutdown'
  | 'ping'
  | 'process_capture'
  | 'generate_draft'
  | 'compute_scores'
  | 'batch_sentiment'
  | 'batch_config'
  | 'get_accounts'
  | 'get_posts'
  | 'get_drafts'
  | 'create_draft'
  | 'update_draft'
  | 'delete_draft'
  | 'get_settings'
  | 'update_settings'
  | 'get_analytics'
  | 'get_heatmap'
  | 'acknowledge_account'
  | 'check_acknowledged'
  | 'check_capture_rate_limit'
  | 'check_ai_rate_limit'
  | 'record_capture_audit'
  | 'record_ai_audit'
  | 'get_audit_events'
  | 'get_group_account_ids'
  | 'get-api-key-response';

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

export {
  recordAuditEvent,
  acknowledgeAccount,
  isAccountAcknowledged,
  checkAndConsumeRateLimit,
  getAuditEvents,
  getGroupAccountIds,
} from'./workspace/compliance';

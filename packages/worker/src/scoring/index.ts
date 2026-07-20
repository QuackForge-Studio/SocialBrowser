/**
 * Scoring Engine exports
 */

export {
  computeEngagementRaw,
  computePercentileFromSorted,
  applyOutlierControl,
  computeSampleConfidence,
  computeEngagementScore,
  computeAccountRelativePercentile,
  getPeerEngagementValues,
  computeSentiment,
  computeTimingScore,
  computeComposite,
  detectContentType,
  computeScoreForPost,
  storeScore,
  computeAndStoreScore,
  getFormulaVersionSetting,
  setFormulaVersion,
  CURRENT_FORMULA_VERSION,
  COMPOSITE_WEIGHTS,
} from './scoring-engine';

export type {
  ContentType,
  EngagementMetrics,
  ScoreResult,
  ScoreRow,
} from './scoring-engine';

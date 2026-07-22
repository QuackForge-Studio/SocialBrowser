import { app } from 'electron';

export interface ProcessMetricSnapshot {
  pid: number;
  type: string;
  cpuPercent: number;
  workingSetKb: number;
  peakWorkingSetKb: number;
  workingSetMb: number;
}

export interface PerformanceSnapshot {
  timestamp: number;
  totalWorkingSetMb: number;
  processCount: number;
  metrics: ProcessMetricSnapshot[];
}

/**
 * DiagnosticsManager provides real-time performance metrics for Electron processes.
 */
export class DiagnosticsManager {
  /**
   * Get a snapshot of current Electron app metrics across all main/renderer/GPU processes.
   */
  getSnapshot(): PerformanceSnapshot {
    const rawMetrics = app.getAppMetrics();
    let totalKb = 0;

    const metrics: ProcessMetricSnapshot[] = rawMetrics.map((m) => {
      const workingSetKb = m.memory.workingSetSize;
      totalKb += workingSetKb;
      return {
        pid: m.pid,
        type: m.type,
        cpuPercent: m.cpu.percentCPUUsage,
        workingSetKb,
        peakWorkingSetKb: m.memory.peakWorkingSetSize,
        workingSetMb: Math.round((workingSetKb / 1024) * 100) / 100,
      };
    });

    return {
      timestamp: Date.now(),
      totalWorkingSetMb: Math.round((totalKb / 1024) * 100) / 100,
      processCount: metrics.length,
      metrics,
    };
  }
}

export const diagnosticsManager = new DiagnosticsManager();

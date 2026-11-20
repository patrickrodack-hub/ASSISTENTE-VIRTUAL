import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProfilerOnRenderCallback, RefObject } from 'react';
import type { AudioRingBufferStats } from '../utils/audioRingBuffer';

export interface ComponentRenderMetrics {
  id: 'SpeakingHologramOverlay' | 'DialogueStream';
  lastDurationMs: number;
  avgDurationMs: number;
  peakDurationMs: number;
  renderCount: number;
  slowFramesCount: number; // renders > 16.67ms
  lastPhase: 'mount' | 'update' | 'nested-update' | null;
}

export interface PerformanceSamplePoint {
  timestamp: number;
  timeLabel: string;
  /** Live JS Heap MB (Chrome performance.memory) or tracked audio/buffer footprint fallback */
  heapUsedMb: number;
  heapTotalMb: number;
  heapLimitMb: number;
  memorySource: 'js_heap' | 'buffer_estimate';
  /** Render latency (ms) sampled during this interval */
  hologramAvgMs: number;
  hologramPeakMs: number;
  dialogueAvgMs: number;
  dialoguePeakMs: number;
  /** Adaptive Audio Ring Buffer telemetry */
  ringBufferKb: number;
  ringBudgetKb: number;
  ringOccupiedSlots: number;
  ringCapacitySlots: number;
  ringPrefetchAhead: number;
  networkRttMs: number;
}

export interface PerformanceMonitorSnapshot {
  heapUsedMb: number;
  heapTotalMb: number;
  heapLimitMb: number;
  heapUsagePct: number;
  memorySource: 'js_heap' | 'buffer_estimate';
  hologram: ComponentRenderMetrics;
  dialogue: ComponentRenderMetrics;
  ringBuffer: AudioRingBufferStats | null;
  sampleCount: number;
  isHologramActive: boolean;
}

interface UsePerformanceMonitorOptions {
  ringBufferStatsRef?: RefObject<AudioRingBufferStats>;
  clientTtsCacheBytesRef?: RefObject<number>;
  isHologramActive: boolean;
  sampleIntervalMs?: number;
  maxHistoryPoints?: number;
}

interface AccumulatorBucket {
  lastDurationMs: number;
  totalDurationMs: number;
  peakDurationMs: number;
  renderCount: number;
  slowFramesCount: number;
  intervalDurationSumMs: number;
  intervalRenderCount: number;
  intervalPeakMs: number;
  lastPhase: 'mount' | 'update' | 'nested-update' | null;
}

interface PerformanceMemoryLike {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

function createEmptyBucket(): AccumulatorBucket {
  return {
    lastDurationMs: 0,
    totalDurationMs: 0,
    peakDurationMs: 0,
    renderCount: 0,
    slowFramesCount: 0,
    intervalDurationSumMs: 0,
    intervalRenderCount: 0,
    intervalPeakMs: 0,
    lastPhase: null,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatTimeLabel(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function readBrowserMemory(
  ringStats: AudioRingBufferStats | null,
  clientCacheBytes: number
): {
  heapUsedMb: number;
  heapTotalMb: number;
  heapLimitMb: number;
  memorySource: 'js_heap' | 'buffer_estimate';
} {
  if (typeof performance !== 'undefined') {
    const perfWithMem = performance as Performance & { memory?: PerformanceMemoryLike };
    const mem = perfWithMem.memory;
    if (mem && typeof mem.usedJSHeapSize === 'number' && mem.usedJSHeapSize > 0) {
      const mb = 1024 * 1024;
      return {
        heapUsedMb: round2(mem.usedJSHeapSize / mb),
        heapTotalMb: round2(mem.totalJSHeapSize / mb),
        heapLimitMb: round2(mem.jsHeapSizeLimit / mb),
        memorySource: 'js_heap',
      };
    }
  }

  // Fallback for browsers without performance.memory (Safari/Firefox):
  // report exact tracked ring-buffer + TTS cache memory plus baseline runtime footprint.
  const trackedBytes = (ringStats?.bufferedBytes ?? 0) + Math.max(0, clientCacheBytes);
  const trackedMb = trackedBytes / (1024 * 1024);
  const estimatedUsedMb = round2(24 + trackedMb);
  return {
    heapUsedMb: estimatedUsedMb,
    heapTotalMb: round2(estimatedUsedMb + 16),
    heapLimitMb: 512,
    memorySource: 'buffer_estimate',
  };
}

/**
 * Monitors JS heap / audio buffer memory usage and React render latencies
 * for `SpeakingHologramOverlay` and `DialogueStream` without causing
 * observer-induced render loops.
 *
 * All `<Profiler>` commits write into mutable refs (O(1), zero re-renders),
 * and snapshots are flushed on a calm interval into a bounded circular history.
 */
export function usePerformanceMonitor({
  ringBufferStatsRef,
  clientTtsCacheBytesRef,
  isHologramActive,
  sampleIntervalMs = 2000,
  maxHistoryPoints = 30,
}: UsePerformanceMonitorOptions) {
  const hologramBucketRef = useRef<AccumulatorBucket>(createEmptyBucket());
  const dialogueBucketRef = useRef<AccumulatorBucket>(createEmptyBucket());
  const isHologramActiveRef = useRef(isHologramActive);
  isHologramActiveRef.current = isHologramActive;

  const recordProfilerCommit = useCallback(
    (
      bucketRef: RefObject<AccumulatorBucket>,
      phase: 'mount' | 'update' | 'nested-update',
      actualDuration: number
    ) => {
      const bucket = bucketRef.current;
      if (!bucket) return;
      const safeMs = Number.isFinite(actualDuration) && actualDuration >= 0 ? actualDuration : 0;
      bucket.lastDurationMs = safeMs;
      bucket.totalDurationMs += safeMs;
      bucket.renderCount += 1;
      if (safeMs > bucket.peakDurationMs) bucket.peakDurationMs = safeMs;
      if (safeMs > 16.67) bucket.slowFramesCount += 1;
      bucket.intervalDurationSumMs += safeMs;
      bucket.intervalRenderCount += 1;
      if (safeMs > bucket.intervalPeakMs) bucket.intervalPeakMs = safeMs;
      bucket.lastPhase = phase;
    },
    []
  );

  const onHologramRender: ProfilerOnRenderCallback = useCallback(
    (_id, phase, actualDuration) => {
      recordProfilerCommit(hologramBucketRef, phase, actualDuration);
    },
    [recordProfilerCommit]
  );

  const onDialogueRender: ProfilerOnRenderCallback = useCallback(
    (_id, phase, actualDuration) => {
      recordProfilerCommit(dialogueBucketRef, phase, actualDuration);
    },
    [recordProfilerCommit]
  );

  const buildSnapshotAndPoint = useCallback((): {
    point: PerformanceSamplePoint;
    snap: PerformanceMonitorSnapshot;
  } => {
    const now = new Date();
    const ringStats = ringBufferStatsRef?.current ?? null;
    const cacheBytes = clientTtsCacheBytesRef?.current ?? 0;
    const mem = readBrowserMemory(ringStats, cacheBytes);

    const h = hologramBucketRef.current;
    const d = dialogueBucketRef.current;

    const hologramIntervalAvg =
      h.intervalRenderCount > 0
        ? round2(h.intervalDurationSumMs / h.intervalRenderCount)
        : 0;
    const hologramIntervalPeak = round2(h.intervalPeakMs);

    const dialogueIntervalAvg =
      d.intervalRenderCount > 0
        ? round2(d.intervalDurationSumMs / d.intervalRenderCount)
        : 0;
    const dialogueIntervalPeak = round2(d.intervalPeakMs);

    // Reset per-interval accumulators cleanly after sampling
    h.intervalDurationSumMs = 0;
    h.intervalRenderCount = 0;
    h.intervalPeakMs = 0;
    d.intervalDurationSumMs = 0;
    d.intervalRenderCount = 0;
    d.intervalPeakMs = 0;

    const ringBufferKb = round2((ringStats?.bufferedBytes ?? 0) / 1024);
    const ringBudgetKb = round2((ringStats?.maxBudgetBytes ?? 2.5 * 1024 * 1024) / 1024);

    const point: PerformanceSamplePoint = {
      timestamp: now.getTime(),
      timeLabel: formatTimeLabel(now),
      heapUsedMb: mem.heapUsedMb,
      heapTotalMb: mem.heapTotalMb,
      heapLimitMb: mem.heapLimitMb,
      memorySource: mem.memorySource,
      hologramAvgMs: hologramIntervalAvg,
      hologramPeakMs: hologramIntervalPeak,
      dialogueAvgMs: dialogueIntervalAvg,
      dialoguePeakMs: dialogueIntervalPeak,
      ringBufferKb,
      ringBudgetKb,
      ringOccupiedSlots: ringStats?.occupiedSlots ?? 0,
      ringCapacitySlots: ringStats?.capacitySlots ?? 2,
      ringPrefetchAhead: ringStats?.prefetchAhead ?? 1,
      networkRttMs: ringStats?.ewmaRttMs ?? 260,
    };

    const hologramMetrics: ComponentRenderMetrics = {
      id: 'SpeakingHologramOverlay',
      lastDurationMs: round2(h.lastDurationMs),
      avgDurationMs: h.renderCount > 0 ? round2(h.totalDurationMs / h.renderCount) : 0,
      peakDurationMs: round2(h.peakDurationMs),
      renderCount: h.renderCount,
      slowFramesCount: h.slowFramesCount,
      lastPhase: h.lastPhase,
    };

    const dialogueMetrics: ComponentRenderMetrics = {
      id: 'DialogueStream',
      lastDurationMs: round2(d.lastDurationMs),
      avgDurationMs: d.renderCount > 0 ? round2(d.totalDurationMs / d.renderCount) : 0,
      peakDurationMs: round2(d.peakDurationMs),
      renderCount: d.renderCount,
      slowFramesCount: d.slowFramesCount,
      lastPhase: d.lastPhase,
    };

    const heapUsagePct =
      mem.heapLimitMb > 0 ? round2((mem.heapUsedMb / mem.heapLimitMb) * 100) : 0;

    const snap: PerformanceMonitorSnapshot = {
      heapUsedMb: mem.heapUsedMb,
      heapTotalMb: mem.heapTotalMb,
      heapLimitMb: mem.heapLimitMb,
      heapUsagePct,
      memorySource: mem.memorySource,
      hologram: hologramMetrics,
      dialogue: dialogueMetrics,
      ringBuffer: ringStats ? { ...ringStats } : null,
      sampleCount: 0,
      isHologramActive: isHologramActiveRef.current,
    };

    return { point, snap };
  }, [clientTtsCacheBytesRef, ringBufferStatsRef]);

  const [history, setHistory] = useState<PerformanceSamplePoint[]>(() => {
    const { point } = buildSnapshotAndPoint();
    return [point];
  });

  const [snapshot, setSnapshot] = useState<PerformanceMonitorSnapshot>(() => {
    const { snap } = buildSnapshotAndPoint();
    return { ...snap, sampleCount: 1 };
  });

  const captureNow = useCallback(() => {
    const { point, snap } = buildSnapshotAndPoint();
    setHistory((prev) => {
      const next = [...prev, point];
      if (next.length > maxHistoryPoints) {
        return next.slice(next.length - maxHistoryPoints);
      }
      return next;
    });
    setSnapshot((prev) => ({
      ...snap,
      sampleCount: prev.sampleCount + 1,
    }));
  }, [buildSnapshotAndPoint, maxHistoryPoints]);

  const resetHistory = useCallback(() => {
    hologramBucketRef.current = createEmptyBucket();
    dialogueBucketRef.current = createEmptyBucket();
    const { point, snap } = buildSnapshotAndPoint();
    setHistory([point]);
    setSnapshot({ ...snap, sampleCount: 1 });
  }, [buildSnapshotAndPoint]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      captureNow();
    }, Math.max(1000, sampleIntervalMs));

    return () => {
      window.clearInterval(id);
    };
  }, [captureNow, sampleIntervalMs]);

  return {
    snapshot,
    history,
    onHologramRender,
    onDialogueRender,
    captureNow,
    resetHistory,
  };
}

export type UsePerformanceMonitorReturn = ReturnType<typeof usePerformanceMonitor>;

import type { AssistantId } from '../types/assistant';

export type NetworkLatencyTier = 'baixa' | 'moderada' | 'alta';

export interface DynamicBufferConfig {
  tier: NetworkLatencyTier;
  capacitySlots: number;
  prefetchAhead: number;
  maxBudgetBytes: number;
  maxChunkChars: number;
}

export interface AudioChunkDescriptor {
  id: string;
  speaker: AssistantId;
  text: string;
  chunkIndex: number;
  totalChunks: number;
  parentTurnIndex: number;
  /** Full text of the parent turn so hologram/subtitles keep narrative context */
  parentText: string;
}

export interface AudioRingSlot<T = unknown> {
  chunk: AudioChunkDescriptor;
  payload: T;
  byteSize: number;
  enqueuedAt: number;
  fetchLatencyMs: number;
  prefetched: boolean;
}

export interface AudioRingBufferStats {
  occupiedSlots: number;
  capacitySlots: number;
  prefetchAhead: number;
  bufferedBytes: number;
  maxBudgetBytes: number;
  ewmaRttMs: number;
  lastFetchRttMs: number;
  networkTier: NetworkLatencyTier;
  activeSpeaker: AssistantId | null;
  prefetchedChunksTotal: number;
  recycledChunksTotal: number;
  evictedByBudgetTotal: number;
  underrunCount: number;
  cacheHitCount: number;
  inFlightPrefetches: number;
  speakerChunksPlayed: Record<AssistantId, number>;
}

const DEFAULT_MIN_SLOTS = 2;
const DEFAULT_MAX_SLOTS = 6;
const EWMA_ALPHA = 0.35;

/**
 * Dynamically calculates ring buffer slot count, prefetch lookahead depth,
 * memory byte ceiling, and chunk length based on measured network RTT (ms).
 *
 * - Low latency (< 350ms): Lean footprint (2 slots, 1 prefetch ahead, 2.5MB ceiling)
 * - Moderate latency (350–899ms): Balanced pipeline (4 slots, 2 prefetch ahead, 4.5MB ceiling)
 * - High latency (>= 900ms): Underrun-resistant pipeline (6 slots, 3 prefetch ahead, 6.0MB ceiling)
 */
export function computeDynamicBufferConfig(ewmaRttMs: number): DynamicBufferConfig {
  const safeRtt = Number.isFinite(ewmaRttMs) && ewmaRttMs >= 0 ? ewmaRttMs : 280;

  if (safeRtt < 350) {
    return {
      tier: 'baixa',
      capacitySlots: 2,
      prefetchAhead: 1,
      maxBudgetBytes: Math.round(2.5 * 1024 * 1024),
      maxChunkChars: 240,
    };
  }

  if (safeRtt < 900) {
    return {
      tier: 'moderada',
      capacitySlots: 4,
      prefetchAhead: 2,
      maxBudgetBytes: Math.round(4.5 * 1024 * 1024),
      maxChunkChars: 210,
    };
  }

  return {
    tier: 'alta',
    capacitySlots: 6,
    prefetchAhead: 3,
    maxBudgetBytes: 6 * 1024 * 1024,
    maxChunkChars: 180,
  };
}

function readNavigatorInitialRtt(): number {
  if (typeof navigator === 'undefined') return 260;
  const conn = (navigator as Navigator & { connection?: { rtt?: number } }).connection;
  if (conn && typeof conn.rtt === 'number' && conn.rtt > 0) {
    return Math.max(80, Math.min(2400, conn.rtt));
  }
  return 260;
}

/**
 * Splits a single assistant speech turn (J.A.R.V.I.S., SEXTA-FEIRA, or ULTRON)
 * into natural sentence-aligned audio chunks so chunk 0 starts playing sooner
 * (lower TTFA) while chunks 1..N are prefetched into the ring buffer and recycled
 * immediately upon playback completion.
 */
export function splitTurnIntoAudioChunks(
  speaker: AssistantId,
  text: string,
  parentTurnIndex: number,
  maxCharsPerChunk = 220
): AudioChunkDescriptor[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  const limit = Math.max(90, Math.min(360, maxCharsPerChunk));

  // Short turns stay as a single atomic chunk to avoid unnecessary TTS round-trips.
  if (cleaned.length <= limit) {
    return [
      {
        id: `${speaker}-${parentTurnIndex}-0-${cleaned.length}`,
        speaker,
        text: cleaned,
        chunkIndex: 0,
        totalChunks: 1,
        parentTurnIndex,
        parentText: cleaned,
      },
    ];
  }

  // Split along sentence punctuation while preserving punctuation marks.
  const sentences = cleaned
    .split(/(?<=[.!?;:])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const rawChunks: string[] = [];
  let current = '';

  const flushCurrent = () => {
    if (current.trim()) {
      rawChunks.push(current.trim());
      current = '';
    }
  };

  for (const sentence of sentences) {
    if (sentence.length > limit) {
      flushCurrent();
      // Break oversized single sentence on commas or word boundaries.
      const clauses = sentence.split(/(?<=,)\s+/);
      let sub = '';
      for (const clause of clauses) {
        if ((sub ? `${sub} ${clause}` : clause).length <= limit) {
          sub = sub ? `${sub} ${clause}` : clause;
        } else {
          if (sub) {
            rawChunks.push(sub.trim());
            sub = '';
          }
          if (clause.length <= limit) {
            sub = clause;
          } else {
            const words = clause.split(/\s+/);
            let wordAcc = '';
            for (const w of words) {
              if ((wordAcc ? `${wordAcc} ${w}` : w).length <= limit) {
                wordAcc = wordAcc ? `${wordAcc} ${w}` : w;
              } else {
                if (wordAcc) rawChunks.push(wordAcc.trim());
                wordAcc = w;
              }
            }
            if (wordAcc) sub = wordAcc;
          }
        }
      }
      if (sub.trim()) rawChunks.push(sub.trim());
      continue;
    }

    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length <= limit) {
      current = candidate;
    } else {
      flushCurrent();
      current = sentence;
    }
  }
  flushCurrent();

  // Merge a tiny trailing tail (< 45 chars) into the previous chunk to prevent choppy playback.
  if (rawChunks.length > 1 && rawChunks[rawChunks.length - 1].length < 45) {
    const tail = rawChunks.pop()!;
    rawChunks[rawChunks.length - 1] = `${rawChunks[rawChunks.length - 1]} ${tail}`;
  }

  const totalChunks = rawChunks.length;
  return rawChunks.map((chunkText, chunkIndex) => ({
    id: `${speaker}-${parentTurnIndex}-${chunkIndex}-${chunkText.length}`,
    speaker,
    text: chunkText,
    chunkIndex,
    totalChunks,
    parentTurnIndex,
    parentText: cleaned,
  }));
}

/**
 * Circular ring buffer with strict byte ceiling and network-latency-driven dynamic capacity.
 * Designed for streaming synthesized audio chunks for J.A.R.V.I.S., SEXTA-FEIRA, and ULTRON
 * with immediate slot zeroing after consumption to eliminate lingering RAM retention.
 */
export class AdaptiveAudioRingBuffer<T = unknown> {
  private slots: Array<AudioRingSlot<T> | null>;
  private head = 0;
  private tail = 0;
  private count = 0;
  private capacity: number;
  private bufferedBytes = 0;
  private ewmaRttMs: number;
  private lastFetchRttMs = 0;
  private config: DynamicBufferConfig;
  private activeSpeaker: AssistantId | null = null;
  private prefetchedChunksTotal = 0;
  private recycledChunksTotal = 0;
  private evictedByBudgetTotal = 0;
  private underrunCount = 0;
  private cacheHitCount = 0;
  private inFlightPrefetches = 0;
  private speakerChunksPlayed: Record<AssistantId, number> = {
    jarvis: 0,
    'sexta-feira': 0,
    ultron: 0,
  };

  constructor(initialRttMs?: number) {
    this.ewmaRttMs =
      typeof initialRttMs === 'number' && Number.isFinite(initialRttMs)
        ? Math.max(40, initialRttMs)
        : readNavigatorInitialRtt();
    this.config = computeDynamicBufferConfig(this.ewmaRttMs);
    this.capacity = Math.max(DEFAULT_MIN_SLOTS, Math.min(DEFAULT_MAX_SLOTS, this.config.capacitySlots));
    this.slots = new Array<AudioRingSlot<T> | null>(this.capacity).fill(null);
  }

  getConfig(): DynamicBufferConfig {
    return this.config;
  }

  getOccupiedCount(): number {
    return this.count;
  }

  getCapacity(): number {
    return this.capacity;
  }

  hasFreeSlot(): boolean {
    return this.count < this.capacity;
  }

  setActiveSpeaker(speaker: AssistantId | null): void {
    this.activeSpeaker = speaker;
  }

  setInFlightPrefetches(count: number): void {
    this.inFlightPrefetches = Math.max(0, count);
  }

  recordCacheHit(): void {
    this.cacheHitCount += 1;
  }

  recordUnderrun(): void {
    this.underrunCount += 1;
  }

  /**
   * Feeds a measured network RTT sample (ms) from a real TTS request and
   * dynamically resizes the ring buffer capacity & prefetch lookahead if the
   * latency tier changed.
   */
  recordNetworkLatency(rttMs: number): DynamicBufferConfig {
    if (!Number.isFinite(rttMs) || rttMs < 0) return this.config;
    const clamped = Math.max(20, Math.min(8000, Math.round(rttMs)));
    this.lastFetchRttMs = clamped;
    this.ewmaRttMs = Math.round(EWMA_ALPHA * clamped + (1 - EWMA_ALPHA) * this.ewmaRttMs);

    const nextConfig = computeDynamicBufferConfig(this.ewmaRttMs);
    this.config = nextConfig;
    const targetCapacity = Math.max(DEFAULT_MIN_SLOTS, Math.min(DEFAULT_MAX_SLOTS, nextConfig.capacitySlots));

    if (targetCapacity !== this.capacity) {
      this.resize(targetCapacity);
    }

    this.enforceByteBudget();
    return this.config;
  }

  /**
   * Resizes the underlying circular buffer array in-order, preserving queued unplayed items.
   * If shrinking below current occupancy, drops only the furthest lookahead tail items first
   * (never the next item about to play).
   */
  private resize(nextCapacity: number): void {
    const ordered: AudioRingSlot<T>[] = [];
    for (let i = 0; i < this.count; i += 1) {
      const idx = (this.head + i) % this.capacity;
      const item = this.slots[idx];
      if (item) ordered.push(item);
      this.slots[idx] = null;
    }

    while (ordered.length > nextCapacity) {
      const dropped = ordered.pop();
      if (dropped) {
        this.bufferedBytes = Math.max(0, this.bufferedBytes - dropped.byteSize);
        this.evictedByBudgetTotal += 1;
      }
    }

    this.capacity = nextCapacity;
    this.slots = new Array<AudioRingSlot<T> | null>(nextCapacity).fill(null);
    this.head = 0;
    this.count = ordered.length;
    this.tail = this.count % nextCapacity;

    for (let i = 0; i < ordered.length; i += 1) {
      this.slots[i] = ordered[i];
    }
  }

  /**
   * Enforces the dynamic memory byte ceiling. Never evicts the head item (index 0)
   * if it is the only queued item so playback never stalls due to a single large phrase.
   */
  private enforceByteBudget(): void {
    while (this.count > 1 && this.bufferedBytes > this.config.maxBudgetBytes) {
      // Evict the newest tail slot (furthest prefetched chunk) first to preserve contiguous playback.
      const lastIdx = (this.tail - 1 + this.capacity) % this.capacity;
      const victim = this.slots[lastIdx];
      this.slots[lastIdx] = null;
      this.tail = lastIdx;
      this.count -= 1;
      if (victim) {
        this.bufferedBytes = Math.max(0, this.bufferedBytes - victim.byteSize);
        this.evictedByBudgetTotal += 1;
      }
    }
  }

  /**
   * Enqueues a synthesized chunk into the ring buffer.
   * Returns true if stored in the ring, false if ring is full (caller should backpressure).
   */
  enqueue(slot: AudioRingSlot<T>): boolean {
    if (this.count >= this.capacity) {
      return false;
    }

    // Evict tail lookahead slots if adding this chunk would breach the byte budget (keeping head intact).
    while (this.count > 1 && this.bufferedBytes + slot.byteSize > this.config.maxBudgetBytes) {
      const lastIdx = (this.tail - 1 + this.capacity) % this.capacity;
      const victim = this.slots[lastIdx];
      this.slots[lastIdx] = null;
      this.tail = lastIdx;
      this.count -= 1;
      if (victim) {
        this.bufferedBytes = Math.max(0, this.bufferedBytes - victim.byteSize);
        this.evictedByBudgetTotal += 1;
      }
    }

    this.slots[this.tail] = slot;
    this.tail = (this.tail + 1) % this.capacity;
    this.count += 1;
    this.bufferedBytes += Math.max(0, slot.byteSize);

    if (slot.prefetched) {
      this.prefetchedChunksTotal += 1;
    }

    return true;
  }

  /**
   * Dequeues the next chunk for immediate playback and zeroes its ring slot
   * so references are immediately eligible for GC once playback completes.
   */
  consumeNext(): AudioRingSlot<T> | null {
    if (this.count === 0) return null;

    const item = this.slots[this.head];
    this.slots[this.head] = null;
    this.head = (this.head + 1) % this.capacity;
    this.count -= 1;

    if (item) {
      this.bufferedBytes = Math.max(0, this.bufferedBytes - item.byteSize);
      this.recycledChunksTotal += 1;
      this.activeSpeaker = item.chunk.speaker;
      this.speakerChunksPlayed[item.chunk.speaker] =
        (this.speakerChunksPlayed[item.chunk.speaker] || 0) + 1;
    }

    return item;
  }

  /**
   * Clears all buffered audio slots immediately (e.g. on user interrupt / stopAudio).
   */
  clear(): number {
    let released = 0;
    for (let i = 0; i < this.capacity; i += 1) {
      if (this.slots[i] !== null) {
        this.slots[i] = null;
        released += 1;
      }
    }
    this.head = 0;
    this.tail = 0;
    this.count = 0;
    this.bufferedBytes = 0;
    this.inFlightPrefetches = 0;
    this.activeSpeaker = null;
    this.recycledChunksTotal += released;
    return released;
  }

  getStats(): AudioRingBufferStats {
    return {
      occupiedSlots: this.count,
      capacitySlots: this.capacity,
      prefetchAhead: this.config.prefetchAhead,
      bufferedBytes: this.bufferedBytes,
      maxBudgetBytes: this.config.maxBudgetBytes,
      ewmaRttMs: this.ewmaRttMs,
      lastFetchRttMs: this.lastFetchRttMs,
      networkTier: this.config.tier,
      activeSpeaker: this.activeSpeaker,
      prefetchedChunksTotal: this.prefetchedChunksTotal,
      recycledChunksTotal: this.recycledChunksTotal,
      evictedByBudgetTotal: this.evictedByBudgetTotal,
      underrunCount: this.underrunCount,
      cacheHitCount: this.cacheHitCount,
      inFlightPrefetches: this.inFlightPrefetches,
      speakerChunksPlayed: { ...this.speakerChunksPlayed },
    };
  }
}

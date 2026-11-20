import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { AssistantId } from '../types/assistant';
import type { AudioTelemetryBuffer } from '../hooks/useVoiceEngine';

interface MobileLiveWaveformProps {
  audioTelemetryRef: RefObject<AudioTelemetryBuffer>;
  isSpeaking: boolean;
  speakingSpeaker: AssistantId | 'ambos' | 'todos' | null;
  isProcessing: boolean;
  isStandbyActive: boolean;
  micLevel: number;
  compact?: boolean;
}

interface PaletteConfig {
  primary: string;
  secondary: string;
  glow: string;
  barFill: string;
  label: string;
  badgeClass: string;
}

function getSpeakerPalette(
  speaker: AssistantId | 'ambos' | 'todos' | null,
  isSpeaking: boolean,
  isStandbyActive: boolean,
  micLevel: number
): PaletteConfig {
  if (isSpeaking) {
    if (speaker === 'jarvis') {
      return {
        primary: '#fbbf24',
        secondary: '#f59e0b',
        glow: 'rgba(245, 158, 11, 0.55)',
        barFill: 'rgba(251, 191, 36, 0.36)',
        label: 'J.A.R.V.I.S.',
        badgeClass: 'text-amber-300 border-amber-500/40 bg-amber-500/15',
      };
    }
    if (speaker === 'ultron') {
      return {
        primary: '#f87171',
        secondary: '#ef4444',
        glow: 'rgba(239, 68, 68, 0.6)',
        barFill: 'rgba(248, 113, 113, 0.36)',
        label: 'ULTRON',
        badgeClass: 'text-red-300 border-red-500/45 bg-red-500/15',
      };
    }
    if (speaker === 'sexta-feira') {
      return {
        primary: '#38bdf8',
        secondary: '#0ea5e9',
        glow: 'rgba(14, 165, 233, 0.55)',
        barFill: 'rgba(56, 189, 248, 0.36)',
        label: 'SEXTA-FEIRA',
        badgeClass: 'text-sky-300 border-sky-500/40 bg-sky-500/15',
      };
    }
    return {
      primary: '#22d3ee',
      secondary: '#fbbf24',
      glow: 'rgba(34, 211, 238, 0.52)',
      barFill: 'rgba(34, 211, 238, 0.32)',
      label: speaker === 'todos' ? 'CONSELHO 3 IAs' : 'J.A.R.V.I.S. & SEXTA',
      badgeClass: 'text-cyan-200 border-cyan-500/40 bg-cyan-500/15',
    };
  }

  if (isStandbyActive && micLevel > 0.04) {
    return {
      primary: '#34d399',
      secondary: '#10b981',
      glow: 'rgba(16, 185, 129, 0.45)',
      barFill: 'rgba(52, 211, 153, 0.28)',
      label: 'ESCUTA ATIVA',
      badgeClass: 'text-emerald-300 border-emerald-500/35 bg-emerald-500/15',
    };
  }

  return {
    primary: '#38bdf8',
    secondary: '#0284c7',
    glow: 'rgba(56, 189, 248, 0.24)',
    barFill: 'rgba(56, 189, 248, 0.14)',
    label: isStandbyActive ? 'STANDBY ACÚSTICO' : 'MONITOR DE VOZ',
    badgeClass: 'text-slate-400 border-slate-700/80 bg-slate-900/70',
  };
}

export function MobileLiveWaveform({
  audioTelemetryRef,
  isSpeaking,
  speakingSpeaker,
  isProcessing,
  isStandbyActive,
  micLevel,
  compact = true,
}: MobileLiveWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intensityLabelRef = useRef<HTMLSpanElement | null>(null);
  const stateRef = useRef({
    isSpeaking,
    speakingSpeaker,
    isProcessing,
    isStandbyActive,
    micLevel,
  });

  stateRef.current = {
    isSpeaking,
    speakingSpeaker,
    isProcessing,
    isStandbyActive,
    micLevel,
  };

  const palette = getSpeakerPalette(
    speakingSpeaker,
    isSpeaking,
    isStandbyActive,
    micLevel
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let phase = 0;
    let smoothedAmp = 0;
    let lastDomUpdate = 0;
    const smoothBands = new Float32Array(24);

    const syncCanvasSize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(120, Math.round(rect.width * dpr));
      const h = Math.max(28, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    syncCanvasSize();
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => syncCanvasSize())
        : null;
    ro?.observe(canvas);

    const render = (ts: number) => {
      const {
        isSpeaking: speaking,
        speakingSpeaker: speaker,
        isProcessing: processing,
        isStandbyActive: standby,
        micLevel: mic,
      } = stateRef.current;

      const telemetry = audioTelemetryRef.current;
      const livePal = getSpeakerPalette(speaker, speaking, standby, mic);

      let targetAmp = 0.04;
      if (speaking) {
        targetAmp = Math.max(0.14, telemetry.amplitude);
      } else if (standby && mic > 0.03) {
        targetAmp = Math.min(0.85, mic * 1.15);
      } else if (processing) {
        targetAmp = 0.12 + 0.05 * Math.sin(phase * 1.6);
      }

      smoothedAmp = smoothedAmp * 0.72 + targetAmp * 0.28;
      phase += speaking ? 0.14 + smoothedAmp * 0.22 : processing ? 0.08 : 0.035;

      // Update live intensity readout directly on DOM node at ~12 Hz (zero React re-renders)
      if (intensityLabelRef.current && ts - lastDomUpdate > 80) {
        lastDomUpdate = ts;
        const pct = speaking || (standby && mic > 0.03)
          ? Math.min(100, Math.round(smoothedAmp * 100))
          : 0;
        intensityLabelRef.current.textContent = `${pct}%`;
      }

      const w = canvas.width;
      const h = canvas.height;
      const midY = h * 0.5;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      ctx.clearRect(0, 0, w, h);

      // Subtle center horizon line & calibrated micro-grid ticks
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
      ctx.lineWidth = Math.max(1, dpr * 0.75);
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(w, midY);
      ctx.stroke();

      // Layer 1: Mirrored 24-band real-time frequency spectrum bars
      const barCount = 24;
      const slotW = w / barCount;
      const barW = Math.max(2 * dpr, slotW * 0.52);

      ctx.fillStyle = livePal.barFill;
      for (let i = 0; i < barCount; i++) {
        const rawBand = speaking
          ? telemetry.bands[i] ?? smoothedAmp
          : standby && mic > 0.03
          ? Math.max(0.05, mic * (0.65 + 0.35 * Math.sin(phase + i * 0.6)))
          : processing
          ? 0.07 + 0.05 * Math.sin(phase * 1.5 + i * 0.45)
          : 0.03;

        smoothBands[i] = smoothBands[i] * 0.68 + rawBand * 0.32;
        // Edge windowing so the wave tapers gracefully at the edges
        const normX = i / (barCount - 1);
        const edgeWindow = Math.sin(normX * Math.PI);
        const barHalfH = Math.max(
          1.5 * dpr,
          smoothBands[i] * (h * 0.44) * (0.35 + 0.65 * edgeWindow)
        );
        const x = i * slotW + (slotW - barW) * 0.5;
        ctx.fillRect(x, midY - barHalfH, barW, barHalfH * 2);
      }

      // Layer 2: Secondary harmonic echo wave
      const samples = 72;
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        const x = t * w;
        const env = Math.sin(t * Math.PI);
        const bandIdx = Math.min(23, Math.floor(t * 24));
        const bandBoost = 0.55 + smoothBands[bandIdx] * 0.9;
        const freq2 = speaker === 'ultron' ? 7.5 : speaker === 'sexta-feira' ? 11.0 : 9.0;
        const yOffset =
          Math.sin(t * Math.PI * freq2 - phase * 1.35) *
          (h * 0.28) *
          smoothedAmp *
          bandBoost *
          env;
        const y = midY + yOffset;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = livePal.secondary;
      ctx.globalAlpha = speaking ? 0.55 : 0.28;
      ctx.lineWidth = 1.2 * dpr;
      ctx.stroke();
      ctx.restore();

      // Layer 3: Primary glowing dynamic vocal waveform
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        const x = t * w;
        const env = Math.sin(t * Math.PI);
        const bandIdx = Math.min(23, Math.floor(t * 24));
        const bandEnergy = smoothBands[bandIdx];

        // Each assistant has a subtly distinct harmonic waveform signature
        const primaryFreq =
          speaker === 'ultron' ? 4.5 : speaker === 'sexta-feira' ? 8.2 : 6.0;
        const harmonic =
          Math.sin(t * Math.PI * primaryFreq + phase) * 0.68 +
          Math.sin(t * Math.PI * (primaryFreq * 2.1) - phase * 1.6) * 0.32;

        const maxDisplacement = h * 0.44;
        const ampFactor = Math.min(1, smoothedAmp * 0.65 + bandEnergy * 0.55);
        const y = midY + harmonic * maxDisplacement * ampFactor * env;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = livePal.primary;
      ctx.lineWidth = (speaking ? 2.1 : 1.35) * dpr;
      ctx.shadowColor = livePal.glow;
      ctx.shadowBlur = (speaking ? 10 : 4) * dpr;
      ctx.stroke();
      ctx.restore();

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafId);
      ro?.disconnect();
    };
  }, [audioTelemetryRef]);

  return (
    <div
      className={`rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-950/95 overflow-hidden ${
        compact ? 'px-2.5 py-1.5' : 'px-3 py-2.5'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`h-1.5 w-1.5 rounded-full shrink-0 ${
              isSpeaking
                ? speakingSpeaker === 'jarvis'
                  ? 'bg-amber-400 animate-ping'
                  : speakingSpeaker === 'ultron'
                  ? 'bg-red-500 animate-ping'
                  : 'bg-sky-400 animate-ping'
                : isStandbyActive && micLevel > 0.04
                ? 'bg-emerald-400 animate-pulse'
                : 'bg-slate-600'
            }`}
          />
          <span
            className={`font-mono text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border truncate ${palette.badgeClass}`}
          >
            {palette.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[9px] text-slate-400 shrink-0 tabular-nums">
          <span>{isSpeaking ? 'AUDIO LIVE' : isProcessing ? 'SINAL' : 'IDLE'}</span>
          <span className="text-slate-600">·</span>
          <span ref={intensityLabelRef} className="text-slate-200 font-semibold w-7 text-right">
            0%
          </span>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        aria-label="Visualização de onda sonora em tempo real da fala da IA"
        className={`block w-full ${compact ? 'h-8' : 'h-14'}`}
      />
    </div>
  );
}

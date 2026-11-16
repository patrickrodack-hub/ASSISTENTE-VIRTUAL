import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronUp, Square, Volume2 } from 'lucide-react';
import type { AssistantId, InteractionMode } from '../types/assistant';

import jarvisAvatarUrl from '../assets/images/jarvis_avatar_1794791050216.jpg';
import fridayAvatarUrl from '../assets/images/friday_avatar_1794791051362.jpg';
import ultronAvatarUrl from '../assets/images/ultron_avatar_1794797018006.jpg';

interface SpeakingHologramOverlayProps {
  isProcessing: boolean;
  isSynthesizingAudio: boolean;
  isSpeaking: boolean;
  speakingSpeaker: AssistantId | 'ambos' | 'todos' | null;
  targetMode: InteractionMode;
  speakingText: string;
  audioAmplitude: number;
  audioBands: number[];
  onStopAudio: () => void;
}

export function SpeakingHologramOverlay({
  isProcessing,
  isSynthesizingAudio,
  isSpeaking,
  speakingSpeaker,
  targetMode,
  speakingText,
  audioAmplitude,
  audioBands,
  onStopAudio,
}: SpeakingHologramOverlayProps) {
  const [isMinimized, setIsMinimized] = useState(false);

  const isVisible = isProcessing || isSynthesizingAudio || isSpeaking;
  const activeSpeaker: AssistantId | 'ambos' | 'todos' =
    speakingSpeaker ??
    (targetMode === 'jarvis' || targetMode === 'sexta-feira' || targetMode === 'ultron'
      ? targetMode
      : targetMode === 'ambos'
      ? 'ambos'
      : 'todos');

  const isJarvis = activeSpeaker === 'jarvis';
  const isFriday = activeSpeaker === 'sexta-feira';
  const isUltron = activeSpeaker === 'ultron';
  const isMulti = activeSpeaker === 'ambos' || activeSpeaker === 'todos';

  const statusLabel = isSpeaking
    ? 'Respondendo por voz'
    : isSynthesizingAudio
    ? 'Calibrando síntese vocal'
    : 'Processando resposta';

  const speakerTitle = isJarvis
    ? 'J.A.R.V.I.S.'
    : isFriday
    ? 'SEXTA-FEIRA'
    : isUltron
    ? 'ULTRON'
    : activeSpeaker === 'ambos'
    ? 'J.A.R.V.I.S. & SEXTA-FEIRA'
    : 'J.A.R.V.I.S. · SEXTA-FEIRA · ULTRON';

  const primaryAccent = isFriday ? '#38BDF8' : isUltron ? '#EF4444' : '#F59E0B';
  const borderClass = isFriday
    ? 'border-sky-500/45 bg-[#07111E]/95'
    : isUltron
    ? 'border-red-500/50 bg-[#150709]/95'
    : isJarvis
    ? 'border-amber-500/45 bg-[#110D06]/95'
    : 'border-slate-700/80 bg-[#0A101C]/95';

  const radialBars = Array.from({ length: 32 }, (_, idx) => {
    const bandValue = audioBands[idx % Math.max(1, audioBands.length)] ?? 0;
    const height = isSpeaking
      ? 6 + Math.round(bandValue * 22)
      : isProcessing || isSynthesizingAudio
      ? 5 + Math.round(((idx % 3) + 1) * 2.5)
      : 4;
    return { angle: (idx * 360) / 32, height };
  });

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.98 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className={`mx-4 mt-4 rounded-2xl border backdrop-blur-xl shadow-2xl overflow-hidden ${borderClass}`}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/10">
            <div className="flex items-center gap-2.5 min-w-0">
              <Volume2
                className={`h-4 w-4 shrink-0 ${
                  isFriday ? 'text-sky-300' : isUltron ? 'text-red-400' : 'text-amber-300'
                }`}
              />
              <span className="font-display text-xs font-semibold tracking-wide text-slate-100 truncate">
                {speakerTitle}
              </span>
              <span aria-hidden="true" className="text-slate-500 text-xs">
                ·
              </span>
              <span className="text-xs text-slate-300 truncate">{statusLabel}</span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {(isSpeaking || isSynthesizingAudio) && (
                <button
                  type="button"
                  onClick={onStopAudio}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-100 hover:bg-white/10 transition-colors"
                >
                  <Square className="h-3 w-3" />
                  <span>Silenciar</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsMinimized((v) => !v)}
                aria-label={isMinimized ? 'Expandir visor holográfico' : 'Minimizar visor holográfico'}
                className="rounded-lg border border-white/10 bg-white/5 p-1 text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              >
                {isMinimized ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {!isMinimized && (
            <div className="p-4 sm:p-5 flex flex-col sm:flex-row items-center gap-5">
              <div className="relative flex items-center justify-center shrink-0">
                {isMulti ? (
                  <div className="flex items-center gap-2.5">
                    <HologramCoreOrb
                      imageSrc={jarvisAvatarUrl}
                      name="J.A.R.V.I.S."
                      accent="#F59E0B"
                      isSpeaking={isSpeaking}
                      isThinking={isProcessing || isSynthesizingAudio}
                      audioAmplitude={audioAmplitude}
                      radialBars={radialBars}
                      size="sm"
                    />
                    <HologramCoreOrb
                      imageSrc={fridayAvatarUrl}
                      name="SEXTA-FEIRA"
                      accent="#38BDF8"
                      isSpeaking={isSpeaking}
                      isThinking={isProcessing || isSynthesizingAudio}
                      audioAmplitude={audioAmplitude}
                      radialBars={radialBars}
                      size="sm"
                    />
                    {activeSpeaker === 'todos' && (
                      <HologramCoreOrb
                        imageSrc={ultronAvatarUrl}
                        name="ULTRON"
                        accent="#EF4444"
                        isSpeaking={isSpeaking}
                        isThinking={isProcessing || isSynthesizingAudio}
                        audioAmplitude={audioAmplitude}
                        radialBars={radialBars}
                        size="sm"
                      />
                    )}
                  </div>
                ) : (
                  <HologramCoreOrb
                    imageSrc={
                      isFriday ? fridayAvatarUrl : isUltron ? ultronAvatarUrl : jarvisAvatarUrl
                    }
                    name={isFriday ? 'SEXTA-FEIRA' : isUltron ? 'ULTRON' : 'J.A.R.V.I.S.'}
                    accent={primaryAccent}
                    isSpeaking={isSpeaking}
                    isThinking={isProcessing || isSynthesizingAudio}
                    audioAmplitude={audioAmplitude}
                    radialBars={radialBars}
                    size="lg"
                  />
                )}
              </div>

              <div className="flex-1 min-w-0 w-full space-y-3">
                <div
                  className="flex items-center justify-center sm:justify-start gap-1 h-9"
                  aria-hidden="true"
                >
                  {Array.from({ length: 24 }).map((_, i) => {
                    const level = audioBands[i] ?? 0;
                    const barHeight = isSpeaking
                      ? Math.max(5, Math.round(level * 36))
                      : isProcessing || isSynthesizingAudio
                      ? 6 + ((i * 7) % 10)
                      : 4;
                    return (
                      <span
                        key={i}
                        className={`w-1.5 rounded-full transition-all duration-75 ${
                          isFriday ? 'bg-sky-400' : isUltron ? 'bg-red-500' : 'bg-amber-400'
                        }`}
                        style={{
                          height: `${barHeight}px`,
                          opacity: isSpeaking ? 0.45 + level * 0.55 : 0.45,
                        }}
                      />
                    );
                  })}
                </div>

                <p className="text-sm text-slate-100 leading-relaxed line-clamp-3">
                  {speakingText
                    ? `“${speakingText}”`
                    : isSynthesizingAudio
                    ? 'Gerando resposta vocal personalizada...'
                    : 'Analisando sua solicitação e consultando a memória de trabalho...'}
                </p>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface HologramCoreOrbProps {
  imageSrc: string;
  name: string;
  accent: string;
  isSpeaking: boolean;
  isThinking: boolean;
  audioAmplitude: number;
  radialBars: Array<{ angle: number; height: number }>;
  size: 'sm' | 'lg';
}

function HologramCoreOrb({
  imageSrc,
  name,
  accent,
  isSpeaking,
  isThinking,
  audioAmplitude,
  radialBars,
  size,
}: HologramCoreOrbProps) {
  const dim = size === 'lg' ? 128 : 88;
  const imgSize = size === 'lg' ? 'h-20 w-20' : 'h-12 w-12';
  const radius = size === 'lg' ? 46 : 31;
  const pulseScale = isSpeaking ? 1 + audioAmplitude * 0.09 : 1;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: dim, height: dim }}
    >
      <div
        className="absolute inset-2 rounded-full blur-xl transition-transform duration-100"
        style={{
          backgroundColor: accent,
          opacity: isSpeaking ? 0.22 + audioAmplitude * 0.34 : isThinking ? 0.16 : 0.08,
          transform: `scale(${pulseScale})`,
        }}
      />

      <svg
        viewBox={`0 0 ${dim} ${dim}`}
        className="absolute inset-0 h-full w-full overflow-visible"
        aria-hidden="true"
      >
        <g transform={`translate(${dim / 2}, ${dim / 2})`}>
          <circle
            r={radius + 11}
            fill="none"
            stroke={accent}
            strokeOpacity={isSpeaking ? 0.78 : 0.35}
            strokeWidth="1.5"
            strokeDasharray="18 10 6 10"
            className="animate-optical-slow origin-center"
          />
          <circle
            r={radius + 4}
            fill="none"
            stroke={accent}
            strokeOpacity={isSpeaking ? 0.88 : 0.4}
            strokeWidth="1"
            strokeDasharray="8 6"
            className="animate-optical-reverse origin-center"
          />

          {radialBars.map((bar, idx) => (
            <line
              key={idx}
              x1={0}
              y1={-(radius + 5)}
              x2={0}
              y2={-(radius + 5 + bar.height * (size === 'lg' ? 0.75 : 0.5))}
              stroke={accent}
              strokeWidth={size === 'lg' ? 2 : 1.5}
              strokeLinecap="round"
              strokeOpacity={isSpeaking ? 0.9 : 0.4}
              transform={`rotate(${bar.angle})`}
            />
          ))}
        </g>
      </svg>

      <div
        className={`relative ${imgSize} overflow-hidden rounded-full border-2 bg-slate-950 transition-transform duration-100`}
        style={{
          borderColor: accent,
          transform: `scale(${pulseScale})`,
        }}
      >
        <img
          src={imageSrc}
          alt={`Holograma de ${name}`}
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      </div>
    </div>
  );
}

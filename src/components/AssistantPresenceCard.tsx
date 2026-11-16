import { useState } from 'react';
import { Bot, Cpu, Shield, Sparkles, Volume2 } from 'lucide-react';
import type { AssistantId, InteractionMode } from '../types/assistant';

interface AssistantPresenceCardProps {
  id: AssistantId;
  name: string;
  subtitle: string;
  specialtyLine: string;
  imageSrc: string;
  isSelected: boolean;
  isSpeaking: boolean;
  isThinking: boolean;
  isAwake: boolean;
  audioBands?: number[];
  onSelect: (mode: InteractionMode) => void;
}

export function AssistantPresenceCard({
  id,
  name,
  subtitle,
  specialtyLine,
  imageSrc,
  isSelected,
  isSpeaking,
  isThinking,
  isAwake,
  audioBands,
  onSelect,
}: AssistantPresenceCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const isJarvis = id === 'jarvis';
  const isUltron = id === 'ultron';

  const ringColor = isJarvis
    ? 'border-amber-500/60 dark:border-amber-400/50'
    : isUltron
    ? 'border-red-500/65 dark:border-red-500/60'
    : 'border-sky-500/60 dark:border-sky-400/50';

  const activeBorder = isSelected
    ? isJarvis
      ? 'border-amber-500/70 bg-amber-50/70 dark:border-amber-500/60 dark:bg-slate-900/90'
      : isUltron
      ? 'border-red-500/70 bg-red-50/70 dark:border-red-500/65 dark:bg-red-950/20'
      : 'border-sky-500/70 bg-sky-50/70 dark:border-sky-500/60 dark:bg-slate-900/90'
    : 'border-slate-200/90 bg-white/90 hover:border-slate-300 dark:border-slate-800/90 dark:bg-slate-900/60 dark:hover:border-slate-700';

  const accentText = isJarvis
    ? 'text-amber-700 dark:text-amber-300'
    : isUltron
    ? 'text-red-600 dark:text-red-400'
    : 'text-sky-700 dark:text-sky-300';

  const barColor = isJarvis
    ? 'bg-amber-500 dark:bg-amber-400'
    : isUltron
    ? 'bg-red-500'
    : 'bg-sky-500 dark:bg-sky-400';

  const focusRing = isJarvis
    ? 'focus-visible:ring-amber-500 dark:focus-visible:ring-amber-400'
    : isUltron
    ? 'focus-visible:ring-red-500'
    : 'focus-visible:ring-sky-500 dark:focus-visible:ring-sky-400';

  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={`group relative w-full text-left rounded-xl border p-4 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 ${focusRing} ${activeBorder}`}
    >
      <div className="flex items-start gap-3.5">
        <div className="relative h-16 w-16 sm:h-20 sm:w-20 shrink-0 mt-0.5">
          <div
            className={`absolute -inset-1.5 rounded-full border border-dashed transition-opacity duration-300 ${ringColor} ${
              isSpeaking || isThinking || isAwake
                ? 'opacity-100 animate-optical-slow'
                : 'opacity-30 group-hover:opacity-65'
            }`}
          />
          <div
            className={`absolute -inset-0.5 rounded-full border transition-opacity duration-300 ${ringColor} ${
              isSpeaking ? 'opacity-90 animate-optical-reverse' : 'opacity-25'
            }`}
          />

          <div className="relative h-full w-full overflow-hidden rounded-full border border-slate-300 dark:border-slate-700/80 bg-slate-900 dark:bg-slate-950">
            {!imgFailed ? (
              <img
                src={imageSrc}
                alt={`Núcleo visual de ${name}`}
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className={`h-full w-full object-cover transition-transform duration-300 ${
                  isSpeaking ? 'scale-105' : 'scale-100'
                }`}
              />
            ) : (
              <div
                className={`flex h-full w-full items-center justify-center ${
                  isJarvis
                    ? 'bg-gradient-to-br from-amber-950 via-slate-900 to-slate-950 text-amber-300'
                    : isUltron
                    ? 'bg-gradient-to-br from-red-950 via-slate-900 to-slate-950 text-red-400'
                    : 'bg-gradient-to-br from-sky-950 via-slate-900 to-slate-950 text-sky-300'
                }`}
              >
                {isJarvis ? (
                  <Shield className="h-7 w-7" />
                ) : isUltron ? (
                  <Bot className="h-7 w-7" />
                ) : (
                  <Cpu className="h-7 w-7" />
                )}
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-base sm:text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50 truncate">
              {name}
            </h2>
            {isSpeaking ? (
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium shrink-0 ${accentText}`}>
                <Volume2 className="h-3.5 w-3.5 shrink-0" />
                <span>Falando</span>
              </span>
            ) : isAwake ? (
              <span className={`inline-flex items-center gap-1 text-xs font-medium shrink-0 ${accentText}`}>
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                <span>Ouvindo você</span>
              </span>
            ) : isThinking ? (
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300 shrink-0">
                Analisando...
              </span>
            ) : (
              <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">
                {isSelected ? 'Alvo ativo' : 'Em prontidão'}
              </span>
            )}
          </div>

          <p className="mt-0.5 text-xs font-medium text-slate-700 dark:text-slate-300 leading-snug">
            {subtitle}
          </p>
          <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {specialtyLine}
          </p>

          {isSpeaking && (
            <div className="mt-2.5 flex items-end gap-1 h-4" aria-hidden="true">
              {Array.from({ length: 12 }).map((_, idx) => {
                const level = audioBands?.[idx] ?? 0.45;
                const px = Math.max(3, Math.round(level * 16));
                return (
                  <span
                    key={idx}
                    className={`w-1 rounded-full ${barColor} transition-all duration-75`}
                    style={{
                      height: `${px}px`,
                      opacity: 0.5 + level * 0.5,
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

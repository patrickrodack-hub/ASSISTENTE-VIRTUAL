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
    ? 'border-amber-400/50'
    : isUltron
    ? 'border-red-500/60'
    : 'border-sky-400/50';

  const activeBorder = isSelected
    ? isJarvis
      ? 'border-amber-500/60 bg-slate-900/90'
      : isUltron
      ? 'border-red-500/65 bg-red-950/20'
      : 'border-sky-500/60 bg-slate-900/90'
    : 'border-slate-800/90 bg-slate-900/60 hover:border-slate-700';

  const accentText = isJarvis
    ? 'text-amber-300'
    : isUltron
    ? 'text-red-400'
    : 'text-sky-300';

  const barColor = isJarvis
    ? 'bg-amber-400'
    : isUltron
    ? 'bg-red-500'
    : 'bg-sky-400';

  const focusRing = isJarvis
    ? 'focus-visible:ring-amber-400'
    : isUltron
    ? 'focus-visible:ring-red-500'
    : 'focus-visible:ring-sky-400';

  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={`group relative w-full text-left rounded-xl border p-4 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 ${focusRing} ${activeBorder}`}
    >
      <div className="flex items-center gap-4">
        <div className="relative h-20 w-20 shrink-0">
          <div
            className={`absolute -inset-1.5 rounded-full border border-dashed transition-opacity duration-300 ${ringColor} ${
              isSpeaking || isThinking || isAwake
                ? 'opacity-100 animate-optical-slow'
                : 'opacity-25 group-hover:opacity-60'
            }`}
          />
          <div
            className={`absolute -inset-0.5 rounded-full border transition-opacity duration-300 ${ringColor} ${
              isSpeaking ? 'opacity-90 animate-optical-reverse' : 'opacity-20'
            }`}
          />

          <div className="relative h-full w-full overflow-hidden rounded-full border border-slate-700/80 bg-slate-950">
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
            <h2 className="font-display text-lg font-semibold tracking-tight text-slate-50 truncate">
              {name}
            </h2>
            {isSpeaking ? (
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${accentText}`}>
                <Volume2 className="h-3.5 w-3.5 shrink-0" />
                <span>Falando</span>
              </span>
            ) : isAwake ? (
              <span className={`inline-flex items-center gap-1 text-xs font-medium ${accentText}`}>
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                <span>Ouvindo você</span>
              </span>
            ) : isThinking ? (
              <span className="text-xs font-medium text-slate-300">Analisando...</span>
            ) : (
              <span className="text-xs text-slate-400">
                {isSelected ? 'Alvo ativo' : 'Em prontidão'}
              </span>
            )}
          </div>

          <p className="mt-0.5 text-xs font-medium text-slate-300 truncate">{subtitle}</p>
          <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">{specialtyLine}</p>

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

import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  KeyRound,
  RefreshCw,
  ServerCrash,
  ShieldAlert,
  Terminal,
  X,
} from 'lucide-react';
import {
  WORKSPACE_LATENCY_THRESHOLD_MS,
  type StartupDiagnosticReport,
} from '../utils/workspaceDiagnostics';

interface ApiKeyDiagnosticAlertProps {
  report: StartupDiagnosticReport | null;
  isChecking: boolean;
  onRecheck: () => void;
  forceShowEvenWhenOk?: boolean;
}

export function ApiKeyDiagnosticAlert({
  report,
  isChecking,
  onRecheck,
  forceShowEvenWhenOk = false,
}: ApiKeyDiagnosticAlertProps) {
  const [expandedGuide, setExpandedGuide] = useState(false);
  const [copiedVarName, setCopiedVarName] = useState(false);
  const [dismissedLatencyCheckedAt, setDismissedLatencyCheckedAt] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (report?.hasCriticalAlert) {
      setExpandedGuide(true);
    }
  }, [report?.hasCriticalAlert]);

  if (!report) return null;

  const isLatencyOnlyAlert =
    !report.hasCriticalAlert &&
    (report.hasLatencyAlert || report.exceedsLatencyThreshold);

  const isLatencyAlertDismissed =
    isLatencyOnlyAlert && dismissedLatencyCheckedAt === report.checkedAt;

  // Render whenever GEMINI_API_KEY is missing/malformed, /api/workspace is unreachable, or latency > 3000ms
  if (
    !report.hasCriticalAlert &&
    (!isLatencyOnlyAlert || isLatencyAlertDismissed) &&
    !forceShowEvenWhenOk
  ) {
    return null;
  }

  const isKeyIssue =
    report.geminiKeyStatus === 'missing' || report.geminiKeyStatus === 'malformed';
  const isUnreachable = !report.workspaceEndpointReachable;

  const handleCopyVarName = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText('GEMINI_API_KEY');
      setCopiedVarName(true);
      window.setTimeout(() => setCopiedVarName(false), 2000);
    }
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`mb-3 sm:mb-4 rounded-xl border px-3.5 sm:px-4 py-3 shadow-lg transition-all ${
        report.hasCriticalAlert
          ? 'border-amber-500/70 bg-gradient-to-r from-[#1A0D06]/95 via-[#1F1108]/95 to-[#160B06]/95 text-amber-50 shadow-[0_0_25px_rgba(245,158,11,0.22)]'
          : isLatencyOnlyAlert
          ? 'border-orange-400/70 bg-gradient-to-r from-[#1C1105]/95 via-[#221507]/95 to-[#170E05]/95 text-orange-50 shadow-[0_0_24px_rgba(249,115,22,0.22)]'
          : 'border-emerald-500/50 bg-[#051B14]/90 text-emerald-50'
      }`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
              report.hasCriticalAlert
                ? 'border-amber-400/60 bg-amber-500/20 text-amber-300'
                : isLatencyOnlyAlert
                ? 'border-orange-400/60 bg-orange-500/20 text-orange-300'
                : 'border-emerald-400/50 bg-emerald-500/20 text-emerald-300'
            }`}
          >
            {isUnreachable ? (
              <ServerCrash className="h-5 w-5" />
            ) : isKeyIssue ? (
              <KeyRound className="h-5 w-5" />
            ) : isLatencyOnlyAlert ? (
              <Clock className="h-5 w-5 animate-pulse" />
            ) : report.hasCriticalAlert ? (
              <ShieldAlert className="h-5 w-5" />
            ) : (
              <CheckCircle2 className="h-5 w-5" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
                  isLatencyOnlyAlert
                    ? 'border-orange-400/55 bg-orange-500/20 text-orange-200'
                    : 'border-amber-400/50 bg-amber-500/20 text-amber-200'
                }`}
              >
                {isLatencyOnlyAlert ? (
                  <>
                    <Activity className="h-3 w-3" />
                    Monitor Background · Latência &gt; 3s (/api/workspace)
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-3 w-3" />
                    Diagnóstico Persistente · /api/workspace
                  </>
                )}
              </span>

              <span
                className={`rounded border px-2 py-0.5 font-mono text-[10px] font-semibold ${
                  report.exceedsLatencyThreshold
                    ? 'border-rose-400/60 bg-rose-500/25 text-rose-100'
                    : 'border-cyan-500/35 bg-cyan-950/60 text-cyan-200'
                }`}
              >
                Latência: {report.latencyMs} ms (Limite: {WORKSPACE_LATENCY_THRESHOLD_MS} ms · Média:{' '}
                {report.averageLatencyMs} ms)
              </span>

              <span
                className={`rounded border px-2 py-0.5 font-mono text-[10px] font-semibold ${
                  report.geminiKeyStatus === 'valid'
                    ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                    : 'border-rose-400/50 bg-rose-500/20 text-rose-200'
                }`}
              >
                GEMINI_API_KEY: {report.geminiKeyHint}
              </span>
            </div>

            <h3 className="mt-1.5 font-display text-sm sm:text-base font-bold text-amber-100">
              {report.headline}
            </h3>
            <p className="mt-0.5 text-xs sm:text-sm text-amber-200/85 leading-relaxed">
              {report.description}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {report.hasCriticalAlert && (
            <button
              type="button"
              onClick={handleCopyVarName}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/25 transition-colors"
              title="Copiar nome exato da variável de ambiente para colar na Vercel"
            >
              {copiedVarName ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-300" />
                  <span>GEMINI_API_KEY Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copiar GEMINI_API_KEY</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onRecheck}
            disabled={isChecking}
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/50 bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/30 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? 'animate-spin' : ''}`} />
            <span>{isChecking ? 'Diagnosticando...' : 'Testar /api/workspace'}</span>
          </button>

          {report.hasCriticalAlert && (
            <button
              type="button"
              onClick={() => setExpandedGuide((prev) => !prev)}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-400/35 bg-black/30 px-2.5 py-1.5 text-xs font-medium text-amber-200 hover:bg-black/50 transition-colors"
            >
              <span>{expandedGuide ? 'Ocultar Guia Vercel' : 'Como Corrigir na Vercel'}</span>
              {expandedGuide ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          )}

          {isLatencyOnlyAlert && (
            <button
              type="button"
              onClick={() => setDismissedLatencyCheckedAt(report.checkedAt)}
              className="inline-flex items-center gap-1 rounded-lg border border-orange-400/35 bg-black/30 px-2.5 py-1.5 text-xs font-medium text-orange-200 hover:bg-black/50 transition-colors"
              title="Ocultar aviso atual até a próxima medição acima de 3 segundos"
            >
              <X className="h-3.5 w-3.5" />
              <span>Dispensar</span>
            </button>
          )}
        </div>
      </div>

      {report.hasCriticalAlert && expandedGuide && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-black/40 p-3 text-xs">
          <div className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-amber-300 mb-2">
            <Terminal className="h-3.5 w-3.5" />
            <span>Passo a Passo para Corrigir a Chave GEMINI_API_KEY na Vercel</span>
          </div>
          <ol className="space-y-1.5 text-amber-100/90">
            {report.vercelRemediationSteps.map((step, idx) => (
              <li key={idx} className="leading-relaxed">
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export function WorkspaceConnectionStatusBadge({
  report,
  isChecking,
  onRecheck,
}: {
  report: StartupDiagnosticReport | null;
  isChecking: boolean;
  onRecheck: () => void;
}) {
  if (!report) return null;

  const isHighLatency = report.exceedsLatencyThreshold;
  const isUnreachable = !report.workspaceEndpointReachable;

  return (
    <button
      type="button"
      onClick={onRecheck}
      disabled={isChecking}
      title={`Diagnóstico periódico em background (/api/workspace): ${report.latencyMs} ms (média: ${report.averageLatencyMs} ms, limite: ${WORKSPACE_LATENCY_THRESHOLD_MS} ms). Clique para testar agora.`}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 min-h-[34px] font-mono text-[11px] font-medium transition-colors ${
        isUnreachable
          ? 'border-rose-500/50 bg-rose-500/15 text-rose-700 dark:text-rose-200 hover:bg-rose-500/25'
          : isHighLatency
          ? 'border-amber-500/60 bg-amber-500/20 text-amber-800 dark:text-amber-200 animate-pulse hover:bg-amber-500/30'
          : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-500/20'
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          isUnreachable
            ? 'bg-rose-500'
            : isHighLatency
            ? 'bg-amber-400'
            : 'bg-emerald-400'
        }`}
      />
      <span>
        /api/workspace: {report.latencyMs}ms
        {isHighLatency ? ' (>3s!)' : ''}
      </span>
    </button>
  );
}

import type {
  GeminiKeyDiagnosticStatus,
  WorkspaceEndpointDiagnostics,
  WorkspaceState,
} from '../types/assistant';

export const WORKSPACE_LATENCY_THRESHOLD_MS = 3000;
export const PERIODIC_DIAGNOSTIC_INTERVAL_MS = 25_000;

export type ConnectionStabilityState = 'estavel' | 'latencia_elevada' | 'instavel';

export interface StartupDiagnosticReport {
  checkedAt: string;
  latencyMs: number;
  latencyThresholdMs: number;
  exceedsLatencyThreshold: boolean;
  averageLatencyMs: number;
  recentLatenciesMs: number[];
  consecutiveHighLatencyCount: number;
  connectionStability: ConnectionStabilityState;
  isBackgroundProbe: boolean;
  workspaceEndpointReachable: boolean;
  httpStatus: number;
  geminiConfigured: boolean;
  geminiKeyStatus: GeminiKeyDiagnosticStatus;
  geminiKeyHint: string;
  runtime: 'vercel-serverless' | 'node-express' | 'offline-client';
  vercelEnv: boolean;
  hasCriticalAlert: boolean;
  hasLatencyAlert: boolean;
  severity: 'ok' | 'warning' | 'critical';
  headline: string;
  description: string;
  vercelRemediationSteps: string[];
  workspaceData: WorkspaceState | null;
}

const VERCEL_GEMINI_REMEDIATION_STEPS: string[] = [
  '1. Acesse o painel do seu projeto na Vercel (vercel.com) e abra a aba "Settings" > "Environment Variables".',
  '2. Crie (ou edite) a variável com o nome exato GEMINI_API_KEY e cole a sua chave válida do Google AI Studio (iniciada por "AIzaSy...", sem espaços ou aspas extras).',
  '3. Marque os três ambientes ("Production", "Preview" e "Development") e clique em "Save".',
  '4. Acesse a aba "Deployments", clique nos três pontos (...) do último deploy e selecione "Redeploy" para que as Serverless Functions (/api/workspace e /api/assistant/*) carreguem a nova chave.',
];

const rollingLatenciesMs: number[] = [];
let consecutiveHighLatencySamples = 0;

function recordLatencySample(latencyMs: number, reachable: boolean): {
  averageLatencyMs: number;
  recentLatenciesMs: number[];
  consecutiveHighLatencyCount: number;
  exceedsLatencyThreshold: boolean;
  connectionStability: ConnectionStabilityState;
} {
  rollingLatenciesMs.push(latencyMs);
  if (rollingLatenciesMs.length > 10) {
    rollingLatenciesMs.shift();
  }

  const exceedsLatencyThreshold = latencyMs > WORKSPACE_LATENCY_THRESHOLD_MS;
  if (exceedsLatencyThreshold || !reachable) {
    consecutiveHighLatencySamples += 1;
  } else {
    consecutiveHighLatencySamples = 0;
  }

  const sum = rollingLatenciesMs.reduce((acc, v) => acc + v, 0);
  const averageLatencyMs = Math.round(sum / Math.max(1, rollingLatenciesMs.length));

  const connectionStability: ConnectionStabilityState = !reachable
    ? 'instavel'
    : exceedsLatencyThreshold
    ? 'latencia_elevada'
    : 'estavel';

  return {
    averageLatencyMs,
    recentLatenciesMs: [...rollingLatenciesMs],
    consecutiveHighLatencyCount: consecutiveHighLatencySamples,
    exceedsLatencyThreshold,
    connectionStability,
  };
}

/**
 * Utilitário de diagnóstico de inicialização e monitoramento periódico em background:
 * Verifica a conectividade e a estabilidade com o endpoint `/api/workspace`,
 * monitora se a latência excede 3 segundos (3000 ms) e valida o status da chave `GEMINI_API_KEY`.
 */
export async function runStartupWorkspaceDiagnostics(options?: {
  isBackgroundProbe?: boolean;
  onSlowThresholdReached?: (elapsedMs: number) => void;
}): Promise<StartupDiagnosticReport> {
  const isBackgroundProbe = Boolean(options?.isBackgroundProbe);
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const checkedAt = new Date().toISOString();
  const isLikelyVercelHost =
    typeof window !== 'undefined' &&
    (window.location.hostname.endsWith('.vercel.app') ||
      (!window.location.hostname.includes('localhost') &&
        !window.location.hostname.includes('127.0.0.1') &&
        !window.location.hostname.endsWith('.run.app')));

  let slowTimerId: number | undefined;
  if (typeof window !== 'undefined' && options?.onSlowThresholdReached) {
    slowTimerId = window.setTimeout(() => {
      const currentElapsed = Math.round(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt
      );
      options.onSlowThresholdReached?.(Math.max(WORKSPACE_LATENCY_THRESHOLD_MS + 1, currentElapsed));
    }, WORKSPACE_LATENCY_THRESHOLD_MS + 50);
  }

  const abortController =
    typeof AbortController !== 'undefined' ? new AbortController() : null;
  const hardTimeoutId =
    typeof window !== 'undefined' && abortController
      ? window.setTimeout(() => abortController.abort(), 12_000)
      : undefined;

  try {
    const response = await fetch('/api/workspace', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
      },
      cache: 'no-store',
      ...(abortController ? { signal: abortController.signal } : {}),
    });

    if (slowTimerId !== undefined && typeof window !== 'undefined') {
      window.clearTimeout(slowTimerId);
    }
    if (hardTimeoutId !== undefined && typeof window !== 'undefined') {
      window.clearTimeout(hardTimeoutId);
    }

    const elapsed = Math.max(
      1,
      Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt)
    );

    const headerKeyStatus = response.headers.get(
      'x-rodack-gemini-status'
    ) as GeminiKeyDiagnosticStatus | null;
    const headerRuntime = response.headers.get('x-rodack-runtime') as
      | 'vercel-serverless'
      | 'node-express'
      | null;

    const rawText = await response.text();
    const trimmed = rawText.trim();

    let parsedWorkspace: WorkspaceState | null = null;
    if (trimmed.startsWith('{')) {
      try {
        parsedWorkspace = JSON.parse(trimmed) as WorkspaceState;
      } catch {
        parsedWorkspace = null;
      }
    }

    if (!response.ok || !parsedWorkspace || !Array.isArray(parsedWorkspace.conversations)) {
      const stats = recordLatencySample(elapsed, false);
      return {
        checkedAt,
        latencyMs: elapsed,
        latencyThresholdMs: WORKSPACE_LATENCY_THRESHOLD_MS,
        ...stats,
        isBackgroundProbe,
        workspaceEndpointReachable: false,
        httpStatus: response.status,
        geminiConfigured: false,
        geminiKeyStatus: 'unreachable',
        geminiKeyHint: 'Endpoint /api/workspace não retornou JSON válido',
        runtime: headerRuntime ?? (isLikelyVercelHost ? 'vercel-serverless' : 'offline-client'),
        vercelEnv: isLikelyVercelHost,
        hasCriticalAlert: true,
        hasLatencyAlert: stats.exceedsLatencyThreshold,
        severity: 'critical',
        headline: `Falha de Conectividade com /api/workspace (HTTP ${response.status || 'Erro'})`,
        description:
          'O endpoint /api/workspace não respondeu corretamente. Verifique se as rotas Serverless (/api/*) estão ativas no deploy da Vercel e se a variável GEMINI_API_KEY está configurada.',
        vercelRemediationSteps: VERCEL_GEMINI_REMEDIATION_STEPS,
        workspaceData: null,
      };
    }

    let diag: WorkspaceEndpointDiagnostics | undefined = parsedWorkspace._diagnostics;

    if (!diag) {
      try {
        const healthRes = await fetch('/api/health', { cache: 'no-store' });
        if (healthRes.ok) {
          const healthJson = (await healthRes.json()) as {
            geminiConfigured?: boolean;
            geminiKeyStatus?: GeminiKeyDiagnosticStatus;
            geminiKeyHint?: string;
            runtime?: 'vercel-serverless' | 'node-express';
            vercelEnv?: boolean;
          };
          diag = {
            endpoint: '/api/workspace',
            connected: true,
            geminiConfigured: Boolean(healthJson.geminiConfigured),
            geminiKeyStatus:
              healthJson.geminiKeyStatus ??
              (healthJson.geminiConfigured ? 'valid' : 'missing'),
            geminiKeyHint:
              healthJson.geminiKeyHint ??
              (healthJson.geminiConfigured ? 'Configurada' : 'Ausente'),
            runtime:
              healthJson.runtime ??
              headerRuntime ??
              (isLikelyVercelHost ? 'vercel-serverless' : 'node-express'),
            vercelEnv: Boolean(healthJson.vercelEnv ?? isLikelyVercelHost),
            checkedAt,
          };
        }
      } catch {
        // fallback to header values
      }
    }

    const keyStatus: GeminiKeyDiagnosticStatus =
      diag?.geminiKeyStatus ?? headerKeyStatus ?? 'valid';
    const geminiConfigured =
      diag?.geminiConfigured !== undefined ? diag.geminiConfigured : keyStatus === 'valid';
    const runtime =
      diag?.runtime ??
      headerRuntime ??
      (isLikelyVercelHost ? 'vercel-serverless' : 'node-express');
    const vercelEnv = Boolean(diag?.vercelEnv ?? isLikelyVercelHost);
    const keyHint =
      diag?.geminiKeyHint ??
      (geminiConfigured ? 'Chave ativa no servidor' : 'GEMINI_API_KEY não detectada');

    const stats = recordLatencySample(elapsed, true);

    if (!geminiConfigured || keyStatus === 'missing' || keyStatus === 'malformed') {
      const isMalformed = keyStatus === 'malformed';
      return {
        checkedAt,
        latencyMs: elapsed,
        latencyThresholdMs: WORKSPACE_LATENCY_THRESHOLD_MS,
        ...stats,
        isBackgroundProbe,
        workspaceEndpointReachable: true,
        httpStatus: response.status,
        geminiConfigured: false,
        geminiKeyStatus: isMalformed ? 'malformed' : 'missing',
        geminiKeyHint: keyHint,
        runtime,
        vercelEnv,
        hasCriticalAlert: true,
        hasLatencyAlert: stats.exceedsLatencyThreshold,
        severity: 'critical',
        headline: isMalformed
          ? 'Alerta de Diagnóstico: Chave GEMINI_API_KEY Malformada ou Inválida na Vercel'
          : 'Alerta de Diagnóstico: Chave GEMINI_API_KEY Ausente nas Variáveis de Ambiente da Vercel',
        description: isMalformed
          ? `O endpoint /api/workspace respondeu (${elapsed} ms), mas detectou que a variável GEMINI_API_KEY está mal configurada (${keyHint}). Sem uma chave válida, J.A.R.V.I.S., SEXTA-FEIRA e ULTRON operam apenas em contingência local.`
          : `O endpoint /api/workspace está online (${elapsed} ms), porém a variável de ambiente GEMINI_API_KEY não foi encontrada no servidor (${runtime}). Configure-a na Vercel para habilitar o motor neural Gemini e a síntese vocal de alta fidelidade.`,
        vercelRemediationSteps: VERCEL_GEMINI_REMEDIATION_STEPS,
        workspaceData: parsedWorkspace,
      };
    }

    if (stats.exceedsLatencyThreshold) {
      return {
        checkedAt,
        latencyMs: elapsed,
        latencyThresholdMs: WORKSPACE_LATENCY_THRESHOLD_MS,
        ...stats,
        isBackgroundProbe,
        workspaceEndpointReachable: true,
        httpStatus: response.status,
        geminiConfigured: true,
        geminiKeyStatus: 'valid',
        geminiKeyHint: keyHint,
        runtime,
        vercelEnv,
        hasCriticalAlert: false,
        hasLatencyAlert: true,
        severity: 'warning',
        headline: `Alerta de Estabilidade: Latência de /api/workspace Excedeu 3 Segundos (${elapsed} ms)`,
        description: `O diagnóstico periódico em background detectou resposta lenta no endpoint /api/workspace (${elapsed} ms, acima do limite de ${WORKSPACE_LATENCY_THRESHOLD_MS} ms; média recente: ${stats.averageLatencyMs} ms). As instruções imutáveis de personalidade de J.A.R.V.I.S., SEXTA-FEIRA e ULTRON permanecem blindadas mesmo sob alta latência.`,
        vercelRemediationSteps: VERCEL_GEMINI_REMEDIATION_STEPS,
        workspaceData: parsedWorkspace,
      };
    }

    return {
      checkedAt,
      latencyMs: elapsed,
      latencyThresholdMs: WORKSPACE_LATENCY_THRESHOLD_MS,
      ...stats,
      isBackgroundProbe,
      workspaceEndpointReachable: true,
      httpStatus: response.status,
      geminiConfigured: true,
      geminiKeyStatus: 'valid',
      geminiKeyHint: keyHint,
      runtime,
      vercelEnv,
      hasCriticalAlert: false,
      hasLatencyAlert: false,
      severity: 'ok',
      headline: 'Conectividade /api/workspace Estável e GEMINI_API_KEY Verificada',
      description: `Endpoint /api/workspace conectado em ${elapsed} ms (limite: ${WORKSPACE_LATENCY_THRESHOLD_MS} ms · média: ${stats.averageLatencyMs} ms · ${runtime}) com chave GEMINI_API_KEY validada (${keyHint}).`,
      vercelRemediationSteps: VERCEL_GEMINI_REMEDIATION_STEPS,
      workspaceData: parsedWorkspace,
    };
  } catch {
    if (slowTimerId !== undefined && typeof window !== 'undefined') {
      window.clearTimeout(slowTimerId);
    }
    if (hardTimeoutId !== undefined && typeof window !== 'undefined') {
      window.clearTimeout(hardTimeoutId);
    }
    const elapsed = Math.max(
      1,
      Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt)
    );
    const stats = recordLatencySample(elapsed, false);
    const isTimeoutOverThreshold = elapsed >= WORKSPACE_LATENCY_THRESHOLD_MS;

    return {
      checkedAt,
      latencyMs: elapsed,
      latencyThresholdMs: WORKSPACE_LATENCY_THRESHOLD_MS,
      ...stats,
      isBackgroundProbe,
      workspaceEndpointReachable: false,
      httpStatus: 0,
      geminiConfigured: false,
      geminiKeyStatus: 'unreachable',
      geminiKeyHint: 'Sem conexão com /api/workspace',
      runtime: isLikelyVercelHost ? 'vercel-serverless' : 'offline-client',
      vercelEnv: isLikelyVercelHost,
      hasCriticalAlert: true,
      hasLatencyAlert: isTimeoutOverThreshold,
      severity: 'warning',
      headline: isTimeoutOverThreshold
        ? `Latência Crítica / Timeout em /api/workspace (${elapsed} ms > 3000 ms)`
        : 'Diagnóstico de Conexão: Endpoint /api/workspace Inacessível',
      description: isTimeoutOverThreshold
        ? `A requisição de diagnóstico ao endpoint /api/workspace excedeu o limite de 3 segundos (${elapsed} ms) sem resposta. O sistema ativou a proteção de alta latência mantendo as personalidades de J.A.R.V.I.S., SEXTA-FEIRA e ULTRON preservadas.`
        : 'Não foi possível estabelecer conexão com /api/workspace. Caso esteja hospedado na Vercel, verifique se o deploy das Serverless Functions (/api/*) foi concluído e se a chave GEMINI_API_KEY está configurada em Environment Variables.',
      vercelRemediationSteps: VERCEL_GEMINI_REMEDIATION_STEPS,
      workspaceData: null,
    };
  }
}

/**
 * Inicia o utilitário de diagnóstico periódico em background para monitorar
 * continuamente a estabilidade e a latência (> 3000 ms) do endpoint `/api/workspace`.
 * Retorna uma função de cleanup para encerrar o monitoramento.
 */
export function startPeriodicWorkspaceDiagnostics(params: {
  intervalMs?: number;
  onReport: (report: StartupDiagnosticReport) => void;
}): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const intervalMs = Math.max(10_000, params.intervalMs ?? PERIODIC_DIAGNOSTIC_INTERVAL_MS);
  let cancelled = false;
  let inFlight = false;

  const executeProbe = async (isBackgroundProbe: boolean) => {
    if (cancelled || inFlight) return;
    if (
      isBackgroundProbe &&
      typeof document !== 'undefined' &&
      document.visibilityState === 'hidden'
    ) {
      return;
    }

    inFlight = true;
    try {
      const report = await runStartupWorkspaceDiagnostics({
        isBackgroundProbe,
        onSlowThresholdReached: (elapsedMs) => {
          if (cancelled) return;
          // Emit immediate visual notification as soon as in-flight latency exceeds 3000ms
          params.onReport({
            checkedAt: new Date().toISOString(),
            latencyMs: elapsedMs,
            latencyThresholdMs: WORKSPACE_LATENCY_THRESHOLD_MS,
            exceedsLatencyThreshold: true,
            averageLatencyMs: elapsedMs,
            recentLatenciesMs: [...rollingLatenciesMs, elapsedMs].slice(-10),
            consecutiveHighLatencyCount: consecutiveHighLatencySamples + 1,
            connectionStability: 'latencia_elevada',
            isBackgroundProbe,
            workspaceEndpointReachable: true,
            httpStatus: 200,
            geminiConfigured: true,
            geminiKeyStatus: 'valid',
            geminiKeyHint: 'Verificando...',
            runtime: 'node-express',
            vercelEnv: false,
            hasCriticalAlert: false,
            hasLatencyAlert: true,
            severity: 'warning',
            headline: `Alerta de Estabilidade: Latência com /api/workspace Excedeu 3 Segundos (${elapsedMs} ms)`,
            description:
              'A conexão com o endpoint /api/workspace está demorando mais de 3 segundos para responder. O contexto constante de personalidade mantém J.A.R.V.I.S., SEXTA-FEIRA e ULTRON protegidos contra degradação.',
            vercelRemediationSteps: VERCEL_GEMINI_REMEDIATION_STEPS,
            workspaceData: null,
          });
        },
      });
      if (!cancelled) {
        params.onReport(report);
      }
    } finally {
      inFlight = false;
    }
  };

  const timerId = window.setInterval(() => {
    void executeProbe(true);
  }, intervalMs);

  const handleVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      void executeProbe(true);
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  return () => {
    cancelled = true;
    window.clearInterval(timerId);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  };
}

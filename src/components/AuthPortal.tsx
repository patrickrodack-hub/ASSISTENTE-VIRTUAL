import { useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Cpu,
  KeyRound,
  Lock,
  Mail,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserPlus,
  Volume2,
  X,
} from 'lucide-react';
import type { AssistantTurn, SystemUserAccount, WorkspaceState } from '../types/assistant';
import {
  authenticateUserResilient,
  registerUserResilient,
} from '../utils/apiClient';
import { triggerHaptic } from '../utils/haptics';

export interface LogoutGreetingSummary {
  userName: string;
  periodLabel: string;
  greetingLabel: string;
  turns: AssistantTurn[];
}

interface AuthPortalProps {
  onAuthenticated: (user: SystemUserAccount, workspace?: WorkspaceState) => void;
  registeredUsers?: SystemUserAccount[];
  onBeforeAuthSubmit?: () => void;
  lastLogoutSummary?: LogoutGreetingSummary | null;
  onReplayLogoutAudio?: (turns: AssistantTurn[]) => void;
  onDismissLogoutSummary?: () => void;
}

function getLocalDayPeriodBadge(): { periodLabel: string; greetingLabel: string } {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return { periodLabel: 'MANHÃ', greetingLabel: 'Bom dia' };
  }
  if (hour >= 12 && hour < 18) {
    return { periodLabel: 'TARDE', greetingLabel: 'Boa tarde' };
  }
  return { periodLabel: 'NOITE', greetingLabel: 'Boa noite' };
}

export function AuthPortal({
  onAuthenticated,
  registeredUsers = [],
  onBeforeAuthSubmit,
  lastLogoutSummary,
  onReplayLogoutAudio,
  onDismissLogoutSummary,
}: AuthPortalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('Patrick Pessoa');
  const [password, setPassword] = useState('190996');
  const [email, setEmail] = useState('');
  const [roleLabel, setRoleLabel] = useState('Engenheiro / Operador Convidado');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const isCreatorTyped = username.trim().toLowerCase() === 'patrick pessoa';
  const dayPeriod = getLocalDayPeriodBadge();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    onBeforeAuthSubmit?.();
    setErrorMsg(null);
    setSuccessBanner(null);

    if (!username.trim() || !password) {
      setErrorMsg('Preencha o nome de usuário e a senha de segurança.');
      triggerHaptic('warning');
      return;
    }

    setIsLoading(true);
    triggerHaptic('tap');

    try {
      if (mode === 'login') {
        const res = await authenticateUserResilient(username.trim(), password);

        if (!res.ok || !res.user) {
          setErrorMsg(
            res.errorMessage || 'Credenciais negadas. Verifique o usuário e a senha informados.'
          );
          triggerHaptic('warning');
          setIsLoading(false);
          return;
        }

        triggerHaptic('success');
        onAuthenticated(res.user, res.workspace);
      } else {
        const res = await registerUserResilient({
          username: username.trim(),
          password,
          email: email.trim(),
          roleLabel: roleLabel.trim() || 'Operador Credenciado',
        });

        if (!res.ok || !res.user) {
          setErrorMsg(
            res.errorMessage || 'Não foi possível concluir o cadastro do usuário.'
          );
          triggerHaptic('warning');
          setIsLoading(false);
          return;
        }

        triggerHaptic('success');
        setSuccessBanner(
          `Credencial de ${res.user.username} registrada com sucesso! Iniciando console...`
        );
        onAuthenticated(res.user, res.workspace);
      }
    } catch {
      setErrorMsg('Falha de comunicação com o núcleo de autenticação.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickFillCreator = () => {
    triggerHaptic('tap');
    setMode('login');
    setUsername('Patrick Pessoa');
    setPassword('190996');
    setErrorMsg(null);
  };

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#040B12] text-cyan-50 flex flex-col justify-between select-none">
      {/* Full-Viewport Holographic Command Room Background from Attached Image */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <img
          src="/assets/aistudio/image_e386c665.png"
          alt="Laboratório Holográfico RODACK SISTEMA DE IA"
          className="h-full w-full object-cover object-center opacity-45 scale-[1.01] filter saturate-125 contrast-110"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#030911]/85 via-[#051320]/70 to-[#030911]/92" />
        <div className="absolute inset-0 rodack-holo-grid opacity-50" />
      </div>

      {/* Left & Right Vertical Cyan Light Pillars (Extracted from Reference Image) */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-2 sm:left-5 top-0 bottom-0 w-1.5 sm:w-2.5 rodack-light-pillar z-10 opacity-85"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed right-2 sm:right-5 top-0 bottom-0 w-1.5 sm:w-2.5 rodack-light-pillar z-10 opacity-85"
      />

      {/* Top Command Laboratory Telemetry Header */}
      <header className="relative z-20 mx-auto w-full max-w-6xl px-6 pt-5 pb-3 flex flex-wrap items-center justify-between gap-4 border-b border-cyan-500/25">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/50 bg-cyan-950/70 shadow-[0_0_20px_rgba(34,211,238,0.35)]">
            <Cpu className="h-5 w-5 text-cyan-300" />
            <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-cyan-400 animate-ping" />
            <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-cyan-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-base sm:text-lg font-bold tracking-wider text-cyan-100">
                RODACK SISTEMA DE IA
              </span>
              <span className="rounded border border-cyan-400/40 bg-cyan-500/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-cyan-300">
                HOLOLAB v4.2
              </span>
            </div>
            <p className="text-xs text-cyan-300/75 font-mono">
              PROPRIETÁRIO &amp; CRIADOR SOBERANO: PATRICK PESSOA · RIO DE JANEIRO, RJ
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono text-cyan-200/80">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-2.5 py-1.5 text-cyan-100">
            <span>PERÍODO: {dayPeriod.periodLabel}</span>
            <span className="text-cyan-300">({dayPeriod.greetingLabel})</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-950/60 px-3 py-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>J.A.R.V.I.S. · SEXTA-FEIRA · ULTRON EM PRONTIDÃO</span>
          </span>
        </div>
      </header>

      {/* Main 3-Column Holographic Command Room Portal */}
      <main className="relative z-20 mx-auto w-full max-w-6xl flex-1 px-6 py-6 flex items-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full items-center">
          {/* Left Suspended Glass HUD Panel (Inspired by Left Circular Radar Screen in Image) */}
          <div className="hidden lg:flex lg:col-span-4 flex-col justify-between rodack-holo-panel rounded-2xl p-5 space-y-5 relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-cyan-400">
                  MATRIZ ÓPTICA ESQUERDA
                </div>
                <h2 className="font-display text-sm font-semibold text-cyan-100 mt-0.5">
                  Ressonância do Conselho Triplo
                </h2>
              </div>
              <span className="font-mono text-xs text-cyan-300 tabular-nums">104.3 Hz · 90.2 Hz</span>
            </div>

            {/* Concentric Holographic Reactor Rings SVG (Extracted from Reference Image) */}
            <div className="relative mx-auto my-2 flex h-48 w-48 items-center justify-center">
              <svg
                viewBox="0 0 200 200"
                className="h-full w-full text-cyan-400/75 animate-optical-slow"
              >
                <circle
                  cx="100"
                  cy="100"
                  r="90"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeDasharray="18 8 4 8"
                />
                <circle
                  cx="100"
                  cy="100"
                  r="74"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray="45 15"
                />
                <circle
                  cx="100"
                  cy="100"
                  r="56"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeDasharray="6 6"
                />
                <polygon
                  points="100,26 164,63 164,137 100,174 36,137 36,63"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                  opacity="0.55"
                />
              </svg>
              <div className="absolute inset-6 rounded-full border border-cyan-300/30 flex flex-col items-center justify-center text-center bg-cyan-950/40 backdrop-blur-xs">
                <Sparkles className="h-5 w-5 text-cyan-300 mb-1" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-cyan-300">
                  NÚCLEO ATIVO
                </span>
                <span className="font-display text-xs font-bold text-white mt-0.5">
                  PATRICK PESSOA
                </span>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="rounded-xl border border-cyan-500/25 bg-cyan-950/50 p-3">
                <div className="flex items-center justify-between font-mono text-[11px] text-cyan-300">
                  <span>J.A.R.V.I.S. (104.3 Hz)</span>
                  <span className="text-emerald-300">ONLINE</span>
                </div>
                <p className="mt-1 text-cyan-100/80 text-[11px] leading-relaxed">
                  Arquitetura, segurança e controle estratégico dedicados ao Criador Patrick Pessoa.
                </p>
              </div>
              <div className="rounded-xl border border-cyan-500/25 bg-cyan-950/50 p-3">
                <div className="flex items-center justify-between font-mono text-[11px] text-cyan-300">
                  <span>SEXTA-FEIRA &amp; ULTRON (90.2 Hz)</span>
                  <span className="text-emerald-300">SINCRONIZADOS</span>
                </div>
                <p className="mt-1 text-cyan-100/80 text-[11px] leading-relaxed">
                  Monitoramento de rotina, clima do Rio de Janeiro, notícias globais e diagnóstico preditivo.
                </p>
              </div>
            </div>
          </div>

          {/* Center Holographic Authentication & User Registration Console */}
          <div className="lg:col-span-5 rodack-holo-panel rounded-2xl p-6 sm:p-7 relative overflow-hidden">
            {/* Corner Technical HUD Brackets */}
            <span className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 border-t-2 border-l-2 border-cyan-400/80" />
            <span className="pointer-events-none absolute top-2.5 right-2.5 h-4 w-4 border-t-2 border-r-2 border-cyan-400/80" />
            <span className="pointer-events-none absolute bottom-2.5 left-2.5 h-4 w-4 border-b-2 border-l-2 border-cyan-400/80" />
            <span className="pointer-events-none absolute bottom-2.5 right-2.5 h-4 w-4 border-b-2 border-r-2 border-cyan-400/80" />

            {/* Logout Farewell & Period Briefing Summary Card */}
            {lastLogoutSummary && lastLogoutSummary.turns.length > 0 && (
              <div className="mb-5 rounded-xl border border-cyan-400/50 bg-cyan-950/75 p-3.5 space-y-2.5 shadow-[0_0_24px_rgba(34,211,238,0.2)]">
                <div className="flex items-center justify-between gap-2 border-b border-cyan-500/25 pb-2">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-cyan-300">
                      SAUDAÇÃO DE LOGOUT · {lastLogoutSummary.periodLabel.toUpperCase()} ({lastLogoutSummary.greetingLabel})
                    </div>
                    <div className="text-xs font-semibold text-white">
                      Despedida de Sessão para {lastLogoutSummary.userName}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {onReplayLogoutAudio && (
                      <button
                        type="button"
                        onClick={() => onReplayLogoutAudio(lastLogoutSummary.turns)}
                        title="Ouvir saudação de despedida dos assistentes"
                        className="inline-flex items-center gap-1 rounded-lg border border-cyan-400/40 bg-cyan-500/20 hover:bg-cyan-500/30 px-2 py-1 text-[11px] font-mono text-cyan-100"
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                        <span>Ouvir</span>
                      </button>
                    )}
                    {onDismissLogoutSummary && (
                      <button
                        type="button"
                        onClick={onDismissLogoutSummary}
                        title="Fechar resumo de logout"
                        className="rounded-lg border border-cyan-500/30 bg-cyan-950/60 p-1 text-cyan-300 hover:text-white"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="max-h-44 overflow-y-auto space-y-2 pr-1">
                  {lastLogoutSummary.turns.map((turn, idx) => (
                    <div
                      key={`${turn.speaker}-${idx}`}
                      className="rounded-lg border border-cyan-500/25 bg-[#030B14]/85 px-2.5 py-2 text-[11px] leading-relaxed"
                    >
                      <span className="font-mono font-bold uppercase text-cyan-300 mr-1.5">
                        {turn.speaker === 'jarvis'
                          ? 'J.A.R.V.I.S.:'
                          : turn.speaker === 'ultron'
                          ? 'ULTRON:'
                          : 'SEXTA-FEIRA:'}
                      </span>
                      <span className="text-cyan-50/90">{turn.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 mb-5">
              <div>
                <span className="font-mono text-[10px] uppercase tracking-widest text-cyan-300">
                  TERMINAL DE ACESSO HOLOGRÁFICO
                </span>
                <h1 className="font-display text-xl sm:text-2xl font-bold text-white mt-0.5">
                  {mode === 'login' ? 'Autenticação de Comando' : 'Módulo de Cadastro'}
                </h1>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-400/40 bg-cyan-500/15 text-cyan-300">
                {mode === 'login' ? (
                  <ShieldCheck className="h-6 w-6" />
                ) : (
                  <UserPlus className="h-6 w-6" />
                )}
              </div>
            </div>

            {/* Mode Switch Tabs: Login vs Cadastro de Usuário */}
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#030A12]/90 border border-cyan-500/30 mb-5">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tap');
                  setMode('login');
                  setErrorMsg(null);
                }}
                className={`flex items-center justify-center gap-2 rounded-lg py-2 px-3 text-xs font-semibold transition-all ${
                  mode === 'login'
                    ? 'bg-cyan-500 text-slate-950 shadow-[0_0_16px_rgba(34,211,238,0.45)]'
                    : 'text-cyan-200/80 hover:text-white'
                }`}
              >
                <KeyRound className="h-3.5 w-3.5" />
                <span>Login de Usuário</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('tap');
                  setMode('register');
                  if (username.trim().toLowerCase() === 'patrick pessoa') {
                    setUsername('');
                    setPassword('');
                  }
                  setErrorMsg(null);
                }}
                className={`flex items-center justify-center gap-2 rounded-lg py-2 px-3 text-xs font-semibold transition-all ${
                  mode === 'register'
                    ? 'bg-cyan-500 text-slate-950 shadow-[0_0_16px_rgba(34,211,238,0.45)]'
                    : 'text-cyan-200/80 hover:text-white'
                }`}
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>Cadastrar Usuário</span>
              </button>
            </div>

            {/* Creator Sovereignty Notice when Patrick Pessoa is selected */}
            {mode === 'login' && isCreatorTyped && (
              <div className="mb-4 rounded-xl border border-cyan-400/45 bg-cyan-500/15 px-3.5 py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <ShieldCheck className="h-4 w-4 text-cyan-300 shrink-0" />
                  <div className="text-xs leading-snug">
                    <span className="font-semibold text-cyan-100">
                      Credencial Raiz Detectada: Patrick Pessoa
                    </span>
                    <p className="text-[11px] text-cyan-200/80">
                      Criador, Desenvolvedor Principal &amp; Dono do Sistema
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleQuickFillCreator}
                  className="shrink-0 rounded-lg border border-cyan-300/50 bg-cyan-400/20 hover:bg-cyan-400/30 px-2.5 py-1 text-[11px] font-mono font-semibold text-cyan-100 transition-colors"
                >
                  Auto-Preencher
                </button>
              </div>
            )}

            {errorMsg && (
              <div className="mb-4 rounded-xl border border-red-500/50 bg-red-950/60 px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-red-200">
                <ShieldAlert className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successBanner && (
              <div className="mb-4 rounded-xl border border-emerald-500/50 bg-emerald-950/60 px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-emerald-200">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{successBanner}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-cyan-200/90 mb-1.5">
                  Usuário de Comando
                </label>
                <div className="relative">
                  <UserCheck className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-cyan-400/80" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={
                      mode === 'login' ? 'Patrick Pessoa' : 'Nome do novo usuário'
                    }
                    autoComplete="username"
                    className="w-full rounded-xl border border-cyan-500/35 bg-[#030C16]/90 pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-cyan-500/40 focus:outline-none focus:border-cyan-300 focus:ring-1 focus:ring-cyan-400/50"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-mono uppercase tracking-wider text-cyan-200/90">
                    Senha de Segurança
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={handleQuickFillCreator}
                      className="text-[11px] font-mono text-cyan-300 hover:text-cyan-100 underline underline-offset-2"
                    >
                      Usar Login Criador (Patrick Pessoa)
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-cyan-400/80" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'login' ? '••••••' : 'Mínimo de 4 caracteres'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    className="w-full rounded-xl border border-cyan-500/35 bg-[#030C16]/90 pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-cyan-500/40 focus:outline-none focus:border-cyan-300 focus:ring-1 focus:ring-cyan-400/50 font-mono"
                  />
                </div>
              </div>

              {mode === 'register' && (
                <>
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-cyan-200/90 mb-1.5">
                      E-mail (Opcional)
                    </label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-cyan-400/80" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="usuario@rodack.ai"
                        className="w-full rounded-xl border border-cyan-500/35 bg-[#030C16]/90 pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-cyan-500/40 focus:outline-none focus:border-cyan-300"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-cyan-200/90 mb-1.5">
                      Função / Cargo no Laboratório
                    </label>
                    <input
                      type="text"
                      value={roleLabel}
                      onChange={(e) => setRoleLabel(e.target.value)}
                      placeholder="Ex: Analista de Sistemas / Convidado"
                      className="w-full rounded-xl border border-cyan-500/35 bg-[#030C16]/90 px-3.5 py-2.5 text-sm text-white placeholder:text-cyan-500/40 focus:outline-none focus:border-cyan-300"
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-xl bg-gradient-to-r from-cyan-400 via-cyan-300 to-sky-400 hover:from-cyan-300 hover:to-sky-300 text-slate-950 font-display font-bold text-sm py-3 px-4 shadow-[0_0_24px_rgba(34,211,238,0.45)] transition-all disabled:opacity-50 cursor-pointer"
              >
                {isLoading
                  ? 'Sincronizando Matriz Neural...'
                  : mode === 'login'
                  ? 'Acessar Console Holográfico RODACK'
                  : 'Concluir Cadastro & Iniciar Sessão'}
              </button>
            </form>

            {/* Quick Registered Accounts Switcher */}
            {registeredUsers.length > 0 && mode === 'login' && (
              <div className="mt-5 pt-4 border-t border-cyan-500/20">
                <div className="text-[11px] font-mono uppercase tracking-wider text-cyan-300/80 mb-2">
                  Perfis Credenciados no Núcleo:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {registeredUsers.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic('tap');
                        setUsername(u.username);
                        if (u.isCreator) {
                          setPassword('190996');
                        } else {
                          setPassword('');
                        }
                        setErrorMsg(null);
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                        username.toLowerCase() === u.username.toLowerCase()
                          ? 'border-cyan-300 bg-cyan-400/20 text-white'
                          : 'border-cyan-500/25 bg-cyan-950/50 text-cyan-200/80 hover:border-cyan-400/50'
                      }`}
                    >
                      <span>{u.username}</span>
                      {u.isCreator && (
                        <span className="rounded bg-cyan-400/25 px-1 py-0.2 font-mono text-[9px] text-cyan-200">
                          DONO
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Suspended Glass HUD Panel (Inspired by Right Holographic Screen & Molecular Lattice) */}
          <div className="lg:col-span-3 rodack-holo-panel rounded-2xl p-5 space-y-4 relative overflow-hidden">
            <div className="border-b border-cyan-500/20 pb-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-cyan-400">
                PROTOCOLO SOBERANO DE CÓDIGO
              </div>
              <h2 className="font-display text-sm font-semibold text-cyan-100 mt-0.5">
                Hierarquia do Criador
              </h2>
            </div>

            <div className="rounded-xl border border-cyan-400/35 bg-cyan-950/60 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-cyan-300">CRIADOR &amp; DONO:</span>
                <span className="font-semibold text-white">Patrick Pessoa</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-cyan-300">CREDENCIAL RAIZ:</span>
                <span className="font-mono text-emerald-300">FIXADA NO CÓDIGO</span>
              </div>
              <p className="text-[11px] text-cyan-100/80 leading-relaxed pt-1 border-t border-cyan-500/20">
                J.A.R.V.I.S., SEXTA-FEIRA e ULTRON reconhecem permanentemente{' '}
                <strong className="text-cyan-200">Patrick Pessoa</strong> como criador,
                desenvolvedor principal e dono soberano do RODACK SISTEMA DE IA.
              </p>
            </div>

            <div className="rounded-xl border border-cyan-500/25 bg-[#030A14]/80 p-3.5 space-y-2 text-xs">
              <div className="font-mono text-[10px] uppercase tracking-wider text-cyan-400">
                ARQUITETURA VISUAL EXTRAÍDA
              </div>
              <ul className="space-y-1.5 text-[11px] text-cyan-100/80">
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                  <span>Pilares verticais de plasma ciano nas bordas</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                  <span>Painéis suspensos em vidro holográfico translúcido</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                  <span>Bancada multi-monitor com núcleo molecular central</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Command Desk Telemetry Bar */}
      <footer className="relative z-20 mx-auto w-full max-w-6xl px-6 py-3 border-t border-cyan-500/20 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-cyan-300/75">
        <span>RODACK SISTEMA DE IA · BANCADA HOLOGRÁFICA CENTRAL</span>
        <span>DESENVOLVEDOR &amp; PROPRIETÁRIO: PATRICK PESSOA</span>
      </footer>
    </div>
  );
}

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CheckCircle2,
  Copy,
  Download,
  MoreVertical,
  Share,
  Smartphone,
  WifiOff,
  X,
} from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, isAndroid, isInIframe, install } =
    usePWAInstall();
  const [showModal, setShowModal] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  if (isInstalled) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden sm:inline">App Instalado</span>
      </span>
    );
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) {
        setShowModal(true);
      }
      return;
    }
    setShowModal(true);
  };

  const currentUrl =
    typeof window !== 'undefined' ? window.location.origin : '';

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2200);
    } catch {
      // ignore
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 active:scale-[0.98] px-3 py-1.5 min-h-[36px] text-xs font-semibold text-slate-950 shadow-xs transition-all whitespace-nowrap shrink-0"
      >
        <Download className="h-3.5 w-3.5 shrink-0" />
        <span>Instalar App (PWA)</span>
      </button>

      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/75 backdrop-blur-sm p-0 sm:p-4"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 30, opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            >
              {/* Mobile Bottom-Sheet Grab Handle */}
              <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto sm:hidden" />

              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img
                    src="/pwa-192x192.png"
                    alt="Ícone Stark Lab"
                    className="h-12 w-12 rounded-xl border border-slate-300 dark:border-slate-700 shrink-0"
                  />
                  <div>
                    <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                      Instalar Stark Lab no Celular
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      J.A.R.V.I.S. · SEXTA-FEIRA · ULTRON em tela cheia (PWA)
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  aria-label="Fechar guia de instalação"
                  className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {isInstallable && (
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await install();
                    if (ok) setShowModal(false);
                  }}
                  className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-sm font-semibold text-slate-950 shadow-sm transition-colors"
                >
                  <Download className="h-4 w-4" />
                  <span>Instalar Automaticamente Agora</span>
                </button>
              )}

              {isInIframe && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-50/90 dark:bg-amber-950/30 p-3.5 space-y-2.5">
                  <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                    Para instalar diretamente pelo navegador ou celular:
                  </p>
                  <p className="text-xs text-amber-800 dark:text-amber-300/90 leading-relaxed">
                    Navegadores bloqueiam o pop-up nativo de instalação dentro de janelas de pré-visualização. Copie o link abaixo e abra diretamente no Chrome (Android/Desktop) ou Safari (iPhone):
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={currentUrl}
                      className="flex-1 rounded-lg border border-amber-400/50 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCopyUrl}
                      className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 shrink-0"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span>{copiedUrl ? 'Copiado!' : 'Copiar Link'}</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {/* Android / Chrome Instructions */}
                <div
                  className={`rounded-xl border p-3.5 space-y-1.5 ${
                    isAndroid
                      ? 'border-sky-500/60 bg-sky-50/70 dark:bg-sky-950/25'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60'
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                    <Smartphone className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                    <span>Android (Google Chrome / Edge)</span>
                  </div>
                  <ol className="text-xs text-slate-600 dark:text-slate-300 space-y-1 list-decimal list-inside leading-relaxed">
                    <li>
                      Toque no menu{' '}
                      <span className="inline-flex items-center font-semibold text-slate-800 dark:text-slate-100">
                        <MoreVertical className="h-3.5 w-3.5 inline" /> (3 pontos)
                      </span>{' '}
                      no canto superior do navegador.
                    </li>
                    <li>
                      Selecione <strong>Instalar aplicativo</strong> ou{' '}
                      <strong>Adicionar à tela inicial</strong>.
                    </li>
                  </ol>
                </div>

                {/* iOS / Safari Instructions */}
                <div
                  className={`rounded-xl border p-3.5 space-y-1.5 ${
                    isIOS
                      ? 'border-amber-500/60 bg-amber-50/70 dark:bg-amber-950/25'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60'
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                    <Share className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <span>iPhone &amp; iPad (Safari iOS)</span>
                  </div>
                  <ol className="text-xs text-slate-600 dark:text-slate-300 space-y-1 list-decimal list-inside leading-relaxed">
                    <li>
                      Toque no botão <strong>Compartilhar</strong> na barra inferior do Safari.
                    </li>
                    <li>
                      Role para baixo e toque em{' '}
                      <strong>Adicionar à Tela de Início</strong>.
                    </li>
                  </ol>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Service Worker &amp; Cache Offline Ativos</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg bg-slate-200 dark:bg-slate-800 px-3.5 py-2 font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-20 md:bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl border border-amber-500/60 bg-amber-500 px-3.5 py-2 text-xs font-semibold text-slate-950 shadow-lg"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span>Modo Offline — Dados em cache local de Patrick Pessoa em uso.</span>
    </div>
  );
}

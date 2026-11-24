import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Brain,
  CheckCircle2,
  Cloud,
  CloudOff,
  Database,
  FileText,
  GraduationCap,
  HelpCircle,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Wifi,
} from 'lucide-react';
import type {
  JarvisKnowledgeCategory,
  JarvisKnowledgeDocument,
  WorkspaceState,
} from '../types/assistant';
import {
  JARVIS_KNOWLEDGE_CATEGORY_LABELS,
  buildStructuredDocumentFromExtractedText,
  extractTextFromPdfArrayBufferOffline,
  loadOfflineJarvisKnowledgeDocs,
  saveOfflineJarvisKnowledgeDocs,
  searchJarvisKnowledgeBase,
} from '../utils/jarvisOfflinePdfKnowledge';
import { safeFetchJson, saveWorkspaceCache } from '../utils/apiClient';
import {
  auth,
  deleteJarvisPdfDocumentFromFirestore,
  hydrateJarvisPdfDocumentsFromFirestoreRecords,
  subscribeFirebaseAuth,
  subscribeOwnerSystemRecords,
  syncJarvisPdfDocumentToFirestore,
} from '../firebase';

interface JarvisPdfStudyLibraryPanelProps {
  workspace: WorkspaceState;
  onWorkspaceUpdate: (ws: WorkspaceState) => void;
  onAskJarvisToStudy?: (prompt: string) => void;
}

const CATEGORY_OPTIONS: Array<{
  id: JarvisKnowledgeCategory;
  label: string;
  badgeColor: string;
}> = [
  {
    id: 'estudo_biblico_cristao',
    label: JARVIS_KNOWLEDGE_CATEGORY_LABELS.estudo_biblico_cristao,
    badgeColor: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  },
  {
    id: 'arquitetura_engenharia',
    label: JARVIS_KNOWLEDGE_CATEGORY_LABELS.arquitetura_engenharia,
    badgeColor: 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300',
  },
  {
    id: 'financas_economia',
    label: JARVIS_KNOWLEDGE_CATEGORY_LABELS.financas_economia,
    badgeColor: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  },
  {
    id: 'desenvolvimento_pessoal',
    label: JARVIS_KNOWLEDGE_CATEGORY_LABELS.desenvolvimento_pessoal,
    badgeColor: 'border-purple-500/40 bg-purple-500/15 text-purple-300',
  },
  {
    id: 'ciencias_estudos_gerais',
    label: JARVIS_KNOWLEDGE_CATEGORY_LABELS.ciencias_estudos_gerais,
    badgeColor: 'border-indigo-500/40 bg-indigo-500/15 text-indigo-300',
  },
];

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return window.btoa(binary);
}

export const JarvisPdfStudyLibraryPanel: React.FC<JarvisPdfStudyLibraryPanelProps> = ({
  workspace,
  onWorkspaceUpdate,
  onAskJarvisToStudy,
}) => {
  const [offlineDocs, setOfflineDocs] = useState<JarvisKnowledgeDocument[]>([]);
  const [firestoreDocIds, setFirestoreDocIds] = useState<Set<string>>(new Set());
  const [isFirestoreConnected, setIsFirestoreConnected] = useState<boolean>(
    Boolean(auth.currentUser)
  );
  const [selectedCategory, setSelectedCategory] =
    useState<JarvisKnowledgeCategory>('estudo_biblico_cristao');
  const [customTitle, setCustomTitle] = useState('');
  const [manualPasteText, setManualPasteText] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatusText, setUploadStatusText] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load 100% offline IndexedDB documents and merge with workspace.jarvisKnowledgeBase
  useEffect(() => {
    let mounted = true;
    loadOfflineJarvisKnowledgeDocs().then((loaded) => {
      if (!mounted) return;
      const serverDocs = workspace.jarvisKnowledgeBase ?? [];
      const map = new Map<string, JarvisKnowledgeDocument>();
      for (const doc of loaded) {
        if (doc?.id) map.set(doc.id, doc);
      }
      for (const doc of serverDocs) {
        if (doc?.id) map.set(doc.id, doc);
      }
      const merged = Array.from(map.values()).sort((a, b) =>
        (b.createdAt || '').localeCompare(a.createdAt || '')
      );
      setOfflineDocs(merged);
      if (merged.length > 0 && !activeDocId) {
        setActiveDocId(merged[0].id);
      }
      if (serverDocs.length > loaded.length) {
        void saveOfflineJarvisKnowledgeDocs(merged);
      }
    });
    return () => {
      mounted = false;
    };
  }, [workspace.jarvisKnowledgeBase, activeDocId]);

  // Real-Time Cloud Firestore Subscription: Hydrate PDFs from Firestore -> IndexedDB -> Backend System Prompt
  useEffect(() => {
    let unsubRecords: (() => void) | null = null;
    const unsubAuth = subscribeFirebaseAuth((fbUser) => {
      setIsFirestoreConnected(Boolean(fbUser));
      if (unsubRecords) {
        unsubRecords();
        unsubRecords = null;
      }
      if (!fbUser) return;

      unsubRecords = subscribeOwnerSystemRecords(
        fbUser.uid,
        (records) => {
          const hydratedFromFirestore = hydrateJarvisPdfDocumentsFromFirestoreRecords(records);
          if (hydratedFromFirestore.length === 0) return;

          setFirestoreDocIds(new Set(hydratedFromFirestore.map((d) => d.id)));
          setOfflineDocs((prev) => {
            const map = new Map<string, JarvisKnowledgeDocument>();
            for (const d of prev) {
              if (d?.id) map.set(d.id, d);
            }
            for (const d of hydratedFromFirestore) {
              if (d?.id && !map.has(d.id)) {
                map.set(d.id, d);
              }
            }
            const merged = Array.from(map.values()).sort((a, b) =>
              (b.createdAt || '').localeCompare(a.createdAt || '')
            );
            void saveOfflineJarvisKnowledgeDocs(merged);
            return merged;
          });

          // Link hydrated Firestore PDFs to backend J.A.R.V.I.S. system prompt
          void safeFetchJson<{ workspace?: WorkspaceState }>(
            '/api/jarvis/knowledge/sync',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ documents: hydratedFromFirestore }),
            },
            0
          );
        },
        () => {}
      );
    });

    return () => {
      unsubAuth();
      if (unsubRecords) unsubRecords();
    };
  }, []);

  const allDocuments = useMemo(() => {
    const map = new Map<string, JarvisKnowledgeDocument>();
    for (const d of offlineDocs) {
      if (d?.id) map.set(d.id, d);
    }
    for (const d of workspace.jarvisKnowledgeBase ?? []) {
      if (d?.id) map.set(d.id, d);
    }
    return Array.from(map.values()).sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    );
  }, [offlineDocs, workspace.jarvisKnowledgeBase]);

  const activeDoc = useMemo(
    () => allDocuments.find((d) => d.id === activeDocId) ?? allDocuments[0] ?? null,
    [allDocuments, activeDocId]
  );

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return searchJarvisKnowledgeBase(searchQuery, allDocuments, 6);
  }, [searchQuery, allDocuments]);

  const persistMergedDocument = async (
    newDoc: JarvisKnowledgeDocument,
    serverWs?: WorkspaceState
  ): Promise<boolean> => {
    const map = new Map<string, JarvisKnowledgeDocument>();
    map.set(newDoc.id, newDoc);
    for (const d of allDocuments) {
      if (d?.id && !map.has(d.id)) map.set(d.id, d);
    }
    const mergedList = Array.from(map.values()).slice(0, 40);
    setOfflineDocs(mergedList);
    setActiveDocId(newDoc.id);
    await saveOfflineJarvisKnowledgeDocs(mergedList);

    const updatedWorkspace: WorkspaceState = serverWs
      ? {
          ...serverWs,
          jarvisKnowledgeBase: mergedList,
        }
      : {
          ...workspace,
          jarvisKnowledgeBase: mergedList,
        };

    saveWorkspaceCache(updatedWorkspace);
    onWorkspaceUpdate(updatedWorkspace);

    // Store extracted PDF text & study units in Cloud Firestore (/system_records)
    let syncedToFirestore = false;
    try {
      const count = await syncJarvisPdfDocumentToFirestore(
        newDoc,
        newDoc.uploadedBy || 'Patrick Pessoa'
      );
      if (count > 0) {
        syncedToFirestore = true;
        setFirestoreDocIds((prev) => new Set([...prev, newDoc.id]));
      }
    } catch {
      syncedToFirestore = false;
    }

    return syncedToFirestore;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setIsUploading(true);
    setUploadStatusText(
      `Extraindo texto de "${file.name}" e enviando ao backend e Firestore para vincular ao prompt do J.A.R.V.I.S...`
    );

    try {
      const arrayBuffer = await file.arrayBuffer();
      const isTextFile =
        file.name.toLowerCase().endsWith('.txt') ||
        file.name.toLowerCase().endsWith('.md');

      let extractedText = '';
      let pageCountEstimate = 1;

      if (isTextFile) {
        extractedText = new TextDecoder('utf-8').decode(arrayBuffer);
        pageCountEstimate = Math.max(1, Math.ceil(extractedText.length / 2200));
      } else {
        const extracted = await extractTextFromPdfArrayBufferOffline(arrayBuffer);
        extractedText = extracted.extractedText;
        pageCountEstimate = extracted.pageCountEstimate;
      }

      const resolvedTitle =
        customTitle.trim() || file.name.replace(/\.(pdf|txt|md)$/i, '').trim() || file.name;

      // Send PDF payload (up to 8 MB) to backend for server-side PDF extraction (Node zlib + Gemini multimodal)
      const shouldSendBase64 = !isTextFile && file.size <= 8 * 1024 * 1024;
      const pdfBase64 = shouldSendBase64 ? arrayBufferToBase64(arrayBuffer) : '';

      const serverRes = await safeFetchJson<{
        document?: JarvisKnowledgeDocument;
        workspace?: WorkspaceState;
        error?: string;
      }>(
        '/api/jarvis/knowledge/ingest',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            title: resolvedTitle,
            category: selectedCategory,
            fileSizeBytes: file.size,
            pageCountEstimate,
            extractedText,
            pdfBase64,
            uploadedBy: 'Patrick Pessoa',
          }),
        },
        0
      );

      if (serverRes.ok && serverRes.data?.document) {
        const syncedFirestore = await persistMergedDocument(
          serverRes.data.document,
          serverRes.data.workspace
        );
        setCustomTitle('');
        setUploadStatusText(
          `PDF "${serverRes.data.document.title}" extraído pelo backend, vinculado ao System Prompt do J.A.R.V.I.S. e salvo ${
            syncedFirestore ? 'no Cloud Firestore + ' : ''
          }na base offline (IndexedDB · ${serverRes.data.document.chunks.length} seções)!`
        );
      } else {
        // 100% Offline Autonomous Ingestion Fallback
        const localDoc = buildStructuredDocumentFromExtractedText({
          fileName: file.name,
          title: resolvedTitle,
          category: selectedCategory,
          fileSizeBytes: file.size,
          pageCountEstimate,
          uploadedBy: 'Patrick Pessoa',
          extractedText:
            extractedText ||
            `Material de estudo PDF (${file.name}) anexado por Patrick Pessoa para mentoria com J.A.R.V.I.S.`,
        });
        const syncedFirestore = await persistMergedDocument(localDoc);
        setCustomTitle('');
        setUploadStatusText(
          `PDF "${localDoc.title}" processado e salvo ${
            syncedFirestore ? 'no Cloud Firestore + ' : ''
          }na base persistente offline (IndexedDB · ${localDoc.chunks.length} seções prontas para consulta)!`
        );
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Não foi possível processar o arquivo PDF selecionado.'
      );
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleManualStudyIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualPasteText.trim()) return;

    setErrorMessage(null);
    setIsUploading(true);
    setUploadStatusText(
      'Extraindo e armazenando conteúdo no Firestore, IndexedDB e System Prompt do J.A.R.V.I.S...'
    );

    const titleToUse = customTitle.trim() || 'Apostila de Estudo Direto — Patrick Pessoa';
    const virtualFileName = `${titleToUse.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`;

    try {
      const serverRes = await safeFetchJson<{
        document?: JarvisKnowledgeDocument;
        workspace?: WorkspaceState;
      }>(
        '/api/jarvis/knowledge/ingest',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: virtualFileName,
            title: titleToUse,
            category: selectedCategory,
            fileSizeBytes: manualPasteText.length,
            pageCountEstimate: Math.max(1, Math.ceil(manualPasteText.length / 2200)),
            extractedText: manualPasteText.trim(),
            uploadedBy: 'Patrick Pessoa',
          }),
        },
        0
      );

      let syncedFirestore = false;
      if (serverRes.ok && serverRes.data?.document) {
        syncedFirestore = await persistMergedDocument(
          serverRes.data.document,
          serverRes.data.workspace
        );
      } else {
        const localDoc = buildStructuredDocumentFromExtractedText({
          fileName: virtualFileName,
          title: titleToUse,
          category: selectedCategory,
          fileSizeBytes: manualPasteText.length,
          pageCountEstimate: Math.max(1, Math.ceil(manualPasteText.length / 2200)),
          uploadedBy: 'Patrick Pessoa',
          extractedText: manualPasteText.trim(),
        });
        syncedFirestore = await persistMergedDocument(localDoc);
      }

      setCustomTitle('');
      setManualPasteText('');
      setShowManualInput(false);
      setUploadStatusText(
        `Conteúdo "${titleToUse}" vinculado ao System Prompt do J.A.R.V.I.S. e salvo ${
          syncedFirestore ? 'no Cloud Firestore + ' : ''
        }na base offline!`
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Erro ao indexar material de estudo.'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    const targetDoc = allDocuments.find((d) => d.id === docId);
    const remaining = allDocuments.filter((d) => d.id !== docId);
    setOfflineDocs(remaining);
    await saveOfflineJarvisKnowledgeDocs(remaining);

    if (activeDocId === docId) {
      setActiveDocId(remaining[0]?.id ?? null);
    }

    if (targetDoc) {
      void deleteJarvisPdfDocumentFromFirestore(targetDoc);
    }

    const res = await safeFetchJson<{ workspace?: WorkspaceState }>(
      `/api/jarvis/knowledge/${docId}`,
      { method: 'DELETE' },
      0
    );

    const updatedWs: WorkspaceState = res.data?.workspace
      ? { ...res.data.workspace, jarvisKnowledgeBase: remaining }
      : { ...workspace, jarvisKnowledgeBase: remaining };

    saveWorkspaceCache(updatedWs);
    onWorkspaceUpdate(updatedWs);
  };

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-slate-950/90 p-5 shadow-2xl">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-500/15 text-amber-300 shadow-inner">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold tracking-wide text-white">
                BIBLIOTECA DE ESTUDOS PDF &amp; MENTORIA J.A.R.V.I.S.
              </h2>
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                <Brain className="h-3 w-3" />
                Vinculado ao System Prompt do J.A.R.V.I.S.
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
                <Database className="h-3 w-3" />
                {isFirestoreConnected
                  ? 'Firestore Cloud + Cache Offline Ativo'
                  : 'Persistência Local IndexedDB + Firestore Ready'}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                  isOnline
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                    : 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
                }`}
              >
                {isOnline ? (
                  <>
                    <Wifi className="h-3 w-3" />
                    Online &amp; Consulta Offline Pronta
                  </>
                ) : (
                  <>
                    <CloudOff className="h-3 w-3" />
                    Operando 100% Offline (IndexedDB + Firestore Cache)
                  </>
                )}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Selecione e envie arquivos <strong className="text-amber-300">.PDF</strong> (ou .TXT/.MD). O backend extrai todo o texto do PDF, armazena os dados no <strong className="text-cyan-300">Cloud Firestore</strong> e no <strong className="text-emerald-300">IndexedDB Offline</strong>, e vincula o conteúdo diretamente ao <strong className="text-amber-300">System Prompt do J.A.R.V.I.S.</strong> para que ele aprenda e utilize essas informações em todas as respostas.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowManualInput((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/90 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-amber-500/40 hover:text-amber-200"
          >
            <Plus className="h-3.5 w-3.5 text-amber-400" />
            {showManualInput ? 'Fechar Texto Direto' : 'Colar Trecho / Apostila'}
          </button>

          <button
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl border border-amber-400/50 bg-gradient-to-r from-amber-500/25 to-yellow-500/20 px-4 py-2 text-xs font-bold text-amber-200 shadow-lg transition hover:border-amber-300 hover:from-amber-500/35 hover:to-yellow-500/30 disabled:opacity-50"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin text-amber-300" />
            ) : (
              <Upload className="h-4 w-4 text-amber-300" />
            )}
            {isUploading ? 'Extraindo e Salvando PDF...' : 'Selecionar e Enviar PDF ao J.A.R.V.I.S.'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md,application/pdf,text/plain"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </div>

      {/* Upload Configuration Bar */}
      <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5 md:grid-cols-3">
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Título Personalizado do Estudo (Opcional)
          </label>
          <input
            type="text"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            placeholder="Ex: Apostila de Teologia Sistemática / Arquitetura NVIDIA..."
            className="mt-1 w-full rounded-lg border border-slate-700/80 bg-slate-950/80 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Área de Conhecimento &amp; Mentoria
          </label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as JarvisKnowledgeCategory)}
            className="mt-1 w-full rounded-lg border border-slate-700/80 bg-slate-950/80 px-3 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none"
          >
            {CATEGORY_OPTIONS.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Consulta Instantânea Offline na Base PDF
          </label>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar conceito, capítulo ou termo nos PDFs..."
              className="w-full rounded-lg border border-slate-700/80 bg-slate-950/80 py-1.5 pl-8 pr-3 text-xs text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Optional Manual Paste Form */}
      {showManualInput && (
        <form
          onSubmit={handleManualStudyIngest}
          className="mt-3 rounded-xl border border-amber-500/30 bg-slate-900/80 p-3.5"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-300">
              Inserir Texto de PDF / Apostila Diretamente na Base Offline &amp; Firestore do J.A.R.V.I.S.
            </span>
            <span className="text-[11px] text-slate-400">
              Vinculado imediatamente ao System Prompt
            </span>
          </div>
          <textarea
            rows={4}
            value={manualPasteText}
            onChange={(e) => setManualPasteText(e.target.value)}
            placeholder="Cole aqui o texto do seu PDF, resumo de livro ou estudo bíblico/técnico para o J.A.R.V.I.S. memorizar..."
            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:border-amber-400 focus:outline-none"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowManualInput(false)}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isUploading || !manualPasteText.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/50 bg-amber-500/20 px-3.5 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/30 disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Indexar Estudo no J.A.R.V.I.S.
            </button>
          </div>
        </form>
      )}

      {/* Status & Error Alerts */}
      {uploadStatusText && (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs text-emerald-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{uploadStatusText}</span>
          </div>
          <button
            type="button"
            onClick={() => setUploadStatusText(null)}
            className="text-[11px] text-emerald-300 underline hover:text-white"
          >
            Ocultar
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="mt-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2 text-xs text-rose-200">
          {errorMessage}
        </div>
      )}

      {/* Instant Offline Search Results */}
      {searchQuery.trim() && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-slate-900/90 p-3.5">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
              Resultados Encontrados na Base PDF Persistente ({searchResults.length})
            </span>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-[11px] text-slate-400 hover:text-white"
            >
              Limpar busca
            </button>
          </div>
          {searchResults.length === 0 ? (
            <p className="text-xs text-slate-400">
              Nenhum trecho correspondente a "{searchQuery}" nos PDFs indexados.
            </p>
          ) : (
            <div className="space-y-2">
              {searchResults.map((match, idx) => (
                <div
                  key={`${match.docId}-${idx}`}
                  className="rounded-lg border border-slate-800 bg-slate-950/80 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-amber-300">
                      {match.docTitle} · {match.chunkHeading}
                    </span>
                    {onAskJarvisToStudy && (
                      <button
                        type="button"
                        onClick={() =>
                          onAskJarvisToStudy(
                            `Jarvis, me ajude a estudar e aprofundar este trecho do PDF "${match.docTitle}" (${match.chunkHeading}): "${match.chunkContent.slice(0, 350)}..."`
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-md border border-amber-400/40 bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/25"
                      >
                        <BookOpen className="h-3 w-3" />
                        Debater Trecho com J.A.R.V.I.S.
                      </button>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                    {match.chunkContent.slice(0, 420)}
                    {match.chunkContent.length > 420 ? '...' : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Content: Document List & Active Study Inspector */}
      {allDocuments.length === 0 ? (
        <div className="mt-4 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-900/40 px-4 py-8 text-center">
          <FileText className="h-10 w-10 text-amber-400/60" />
          <p className="mt-2 text-sm font-semibold text-slate-200">
            Nenhum PDF adicionado à base persistente do J.A.R.V.I.S. ainda
          </p>
          <p className="mt-1 max-w-lg text-xs text-slate-400">
            Clique em <strong className="text-amber-300">"Selecionar e Enviar PDF ao J.A.R.V.I.S."</strong> acima para carregar qualquer apostila, livro ou documento de estudo. O backend extrai o texto, salva no Firestore e no IndexedDB para consulta offline e vincula ao prompt de sistema do J.A.R.V.I.S.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Left Column: Uploaded PDFs */}
          <div className="space-y-2 lg:col-span-4">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <span>Base de Conhecimento PDF ({allDocuments.length})</span>
              <span>Firestore + Offline</span>
            </div>
            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {allDocuments.map((doc) => {
                const isSelected = activeDoc?.id === doc.id;
                const catMeta =
                  CATEGORY_OPTIONS.find((c) => c.id === doc.category) ?? CATEGORY_OPTIONS[4];
                const isSyncedCloud = firestoreDocIds.has(doc.id) || isFirestoreConnected;
                return (
                  <div
                    key={doc.id}
                    onClick={() => setActiveDocId(doc.id)}
                    className={`cursor-pointer rounded-xl border p-3 transition ${
                      isSelected
                        ? 'border-amber-400/60 bg-amber-500/10 shadow-md'
                        : 'border-slate-800/90 bg-slate-900/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span
                          className={`inline-block rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${catMeta.badgeColor}`}
                        >
                          {catMeta.label}
                        </span>
                        <h3 className="mt-1 truncate text-xs font-bold text-white">
                          {doc.title}
                        </h3>
                        <p className="truncate text-[10px] text-slate-400">{doc.fileName}</p>
                      </div>
                      <button
                        type="button"
                        title="Remover PDF"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteDocument(doc.id);
                        }}
                        className="rounded-lg p-1 text-slate-500 hover:bg-rose-500/15 hover:text-rose-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                      <span>{doc.chunks.length} seções</span>
                      <span>•</span>
                      <span>~{doc.pageCountEstimate} pág.</span>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1 text-emerald-400">
                        <Cloud className="h-2.5 w-2.5" />
                        {isSyncedCloud ? 'Firestore + Offline' : 'Offline Ready'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Active PDF Pedagogical Synthesis & Study Controls */}
          {activeDoc && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 lg:col-span-8">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white">{activeDoc.title}</h3>
                  <p className="text-[11px] text-slate-400">
                    Arquivo: {activeDoc.fileName} · ~{activeDoc.pageCountEstimate} pág. ·{' '}
                    {activeDoc.chunks.length} unidades de estudo vinculadas ao System Prompt &amp;
                    consulta offline
                  </p>
                </div>

                {onAskJarvisToStudy && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onAskJarvisToStudy(
                          `Jarvis, quero estudar o documento PDF "${activeDoc.title}" com você. Faça uma aula estruturada sobre os principais conceitos deste material e me explique como aplicá-los na prática.`
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/50 bg-amber-500/20 px-3 py-1.5 text-xs font-bold text-amber-200 transition hover:bg-amber-500/30"
                    >
                      <GraduationCap className="h-3.5 w-3.5" />
                      Iniciar Aula com J.A.R.V.I.S.
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        onAskJarvisToStudy(
                          `Jarvis, aplique um simulado interativo e me faça 3 perguntas práticas baseadas no meu PDF "${activeDoc.title}" para testar meu aprendizado.`
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/25"
                    >
                      <HelpCircle className="h-3.5 w-3.5" />
                      Testar Meu Conhecimento
                    </button>
                  </div>
                )}
              </div>

              {/* Personality & System Prompt Incorporation Directive */}
              <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                  Diretriz Vinculada ao System Prompt &amp; Personalidade do J.A.R.V.I.S.:
                </div>
                <p className="mt-1 text-xs leading-relaxed text-amber-100/90">
                  {activeDoc.personalityIntegrationDirective}
                </p>
              </div>

              {/* Executive Summary */}
              <div className="mt-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Síntese Executiva Extraída do PDF
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">
                  {activeDoc.summary}
                </p>
              </div>

              {/* Key Teachings & Study Questions */}
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                    Ensinamentos-Chave Extraídos
                  </div>
                  <ul className="mt-1.5 space-y-1.5 text-xs text-slate-300">
                    {activeDoc.keyTeachings.map((teaching, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <span className="mt-0.5 text-emerald-400">•</span>
                        <span>{teaching}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                    Perguntas de Estudo &amp; Fixação (Clique para perguntar)
                  </div>
                  <div className="mt-1.5 space-y-1.5">
                    {activeDoc.studyQuestions.map((question, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() =>
                          onAskJarvisToStudy?.(
                            `Jarvis, com base no PDF "${activeDoc.title}", vamos trabalhar esta questão de estudo: "${question}"`
                          )
                        }
                        className="block w-full rounded-md border border-slate-800 bg-slate-900/90 px-2.5 py-1.5 text-left text-[11px] text-slate-200 transition hover:border-cyan-500/40 hover:text-cyan-200"
                      >
                        {idx + 1}. {question}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Offline Chunks Preview */}
              <div className="mt-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Unidades de Texto Extraídas do PDF (Firestore &amp; Consulta Offline ·{' '}
                  {activeDoc.chunks.length} seções)
                </div>
                <div className="mt-1.5 max-h-40 space-y-2 overflow-y-auto pr-1">
                  {activeDoc.chunks.map((chunk) => (
                    <div
                      key={chunk.id}
                      className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-2.5 text-xs text-slate-300"
                    >
                      <div className="flex items-center justify-between text-[11px] font-semibold text-amber-300">
                        <span>{chunk.heading}</span>
                        {onAskJarvisToStudy && (
                          <button
                            type="button"
                            onClick={() =>
                              onAskJarvisToStudy(
                                `Jarvis, me explique detalhadamente a "${chunk.heading}" do PDF "${activeDoc.title}": "${chunk.content.slice(0, 350)}..."`
                              )
                            }
                            className="text-[10px] text-amber-400 underline hover:text-amber-200"
                          >
                            Estudar esta seção
                          </button>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">
                        {chunk.content}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

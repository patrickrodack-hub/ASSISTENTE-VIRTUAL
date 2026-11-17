import { useEffect, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Cloud,
  Database,
  Download,
  Edit3,
  KeyRound,
  Lock,
  Mail,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  BLUEPRINT_CONSTRAINTS,
  deleteFirestoreSystemRecord,
  firebaseConfig,
  signInWithGoogleCloud,
  signOutFromGoogleCloud,
  subscribeFirebaseAuth,
  subscribeOwnerSystemRecords,
  syncWorkspaceToCloudFirestore,
  testConnection,
  upsertFirestoreSystemRecord,
  type FirestoreSystemRecord,
} from '../firebase';
import type { SystemUserAccount, WorkspaceState } from '../types/assistant';
import { safeFetchJson } from '../utils/apiClient';
import { triggerHaptic } from '../utils/haptics';

interface DatabaseSummaryResponse {
  engine: string;
  firestoreDatabaseId: string;
  firebaseProjectId: string;
  storageBytes: number;
  lastModifiedIso: string;
  counts: {
    users: number;
    memories: number;
    tasks: number;
    agenda: number;
    routines: number;
    alerts: number;
    conversations: number;
    dossierQuestions: number;
    socialProfiles: number;
  };
}

interface DatabaseManagerPanelProps {
  workspace: WorkspaceState;
  currentUser: SystemUserAccount;
  onWorkspaceUpdated: (nextWorkspace: WorkspaceState) => void;
}

type DbTab =
  | 'usuarios'
  | 'firestore_cloud'
  | 'memorias'
  | 'tarefas'
  | 'agenda_rotinas'
  | 'conversas';

export function DatabaseManagerPanel({
  workspace,
  currentUser,
  onWorkspaceUpdated,
}: DatabaseManagerPanelProps) {
  const [activeTab, setActiveTab] = useState<DbTab>('usuarios');
  const [searchQuery, setSearchQuery] = useState('');
  const [dbSummary, setDbSummary] = useState<DatabaseSummaryResponse | null>(null);
  const [firestoreConnected, setFirestoreConnected] = useState<boolean | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [cloudRecords, setCloudRecords] = useState<FirestoreSystemRecord[]>([]);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);

  // User Registration / Edit State
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRoleLabel, setNewRoleLabel] = useState('Operador Credenciado · RODACK IA');
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRoleLabel, setEditRoleLabel] = useState('');
  const [editPassword, setEditPassword] = useState('');

  // Custom Cloud Record Creation
  const [customTitle, setCustomTitle] = useState('');
  const [customSummary, setCustomSummary] = useState('');
  const [customType, setCustomType] =
    useState<FirestoreSystemRecord['recordType']>('usuario');

  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const loadDbSummary = async () => {
    const res = await safeFetchJson<DatabaseSummaryResponse>('/api/database/summary');
    if (res.ok && res.data) {
      setDbSummary(res.data);
    }
    const ok = await testConnection();
    setFirestoreConnected(ok);
  };

  useEffect(() => {
    void loadDbSummary();
    const unsubAuth = subscribeFirebaseAuth((u) => {
      setFirebaseUser(u);
    });
    return () => unsubAuth();
  }, [workspace.users?.length, workspace.memories.length, workspace.tasks.length]);

  useEffect(() => {
    if (!firebaseUser) {
      setCloudRecords([]);
      return;
    }
    const unsubRecords = subscribeOwnerSystemRecords(
      firebaseUser.uid,
      (records) => {
        setCloudRecords(records);
      },
      (err) => {
        setStatusBanner({
          type: 'error',
          message: `Erro de leitura no Firestore: ${err.message}`,
        });
      }
    );
    return () => unsubRecords();
  }, [firebaseUser]);

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    setStatusBanner(null);

    const cleanName = newUsername.trim().slice(0, BLUEPRINT_CONSTRAINTS.USERNAME_MAX_LENGTH);
    const cleanPass = newPassword.trim();
    const cleanEmail = newEmail.trim().slice(0, BLUEPRINT_CONSTRAINTS.EMAIL_MAX_LENGTH);
    const cleanRole =
      newRoleLabel.trim().slice(0, BLUEPRINT_CONSTRAINTS.ROLE_MAX_LENGTH) ||
      'Operador Credenciado';

    if (cleanName.length < BLUEPRINT_CONSTRAINTS.USERNAME_MIN_LENGTH || cleanPass.length < 4) {
      setStatusBanner({
        type: 'error',
        message: 'Informe um nome de usuário (mín. 2 caracteres) e senha (mín. 4 caracteres).',
      });
      triggerHaptic('warning');
      return;
    }

    setIsSubmittingUser(true);
    try {
      const res = await safeFetchJson<{
        user?: SystemUserAccount;
        workspace?: WorkspaceState;
        error?: string;
      }>('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanName,
          password: cleanPass,
          email: cleanEmail,
          roleLabel: cleanRole,
        }),
      });

      if (!res.ok || !res.data?.workspace) {
        setStatusBanner({
          type: 'error',
          message: res.errorMessage || 'Erro ao gravar usuário no banco de dados.',
        });
        triggerHaptic('warning');
        return;
      }

      onWorkspaceUpdated(res.data.workspace);
      setNewUsername('');
      setNewPassword('');
      setNewEmail('');
      setNewRoleLabel('Operador Credenciado · RODACK IA');
      triggerHaptic('success');

      if (firebaseUser && res.data.user) {
        try {
          await upsertFirestoreSystemRecord({
            id: `usr_${res.data.user.id}`,
            recordType: 'usuario',
            title: `${res.data.user.username} (${res.data.user.roleLabel})`,
            summary: `Usuário cadastrado no banco de dados | Função: ${res.data.user.roleLabel}`,
            status: 'ativo',
            createdByUsername: currentUser.username,
          });
        } catch {
          // Local save already succeeded
        }
      }

      setStatusBanner({
        type: 'success',
        message: `Usuário "${res.data.user?.username}" gravado com sucesso no banco de dados!`,
      });
    } finally {
      setIsSubmittingUser(false);
    }
  };

  const startEditingUser = (u: SystemUserAccount) => {
    triggerHaptic('tap');
    setEditingUserId(u.id);
    setEditUsername(u.username);
    setEditEmail(u.email || '');
    setEditRoleLabel(u.roleLabel);
    setEditPassword('');
  };

  const handleSaveUserEdit = async (userId: string) => {
    setStatusBanner(null);
    const res = await safeFetchJson<{
      user?: SystemUserAccount;
      workspace?: WorkspaceState;
      error?: string;
    }>(`/api/auth/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: editUsername.trim().slice(0, BLUEPRINT_CONSTRAINTS.USERNAME_MAX_LENGTH),
        email: editEmail.trim().slice(0, BLUEPRINT_CONSTRAINTS.EMAIL_MAX_LENGTH),
        roleLabel: editRoleLabel.trim().slice(0, BLUEPRINT_CONSTRAINTS.ROLE_MAX_LENGTH),
        password: editPassword.trim() || undefined,
      }),
    });

    if (!res.ok || !res.data?.workspace) {
      setStatusBanner({
        type: 'error',
        message: res.errorMessage || 'Não foi possível atualizar o usuário.',
      });
      triggerHaptic('warning');
      return;
    }

    onWorkspaceUpdated(res.data.workspace);
    setEditingUserId(null);
    triggerHaptic('success');
    setStatusBanner({
      type: 'success',
      message: `Registro de "${res.data.user?.username}" atualizado no banco de dados.`,
    });
  };

  const handleDeleteUser = async (u: SystemUserAccount) => {
    if (u.isCreator) return;
    triggerHaptic('warning');
    setStatusBanner(null);
    const res = await safeFetchJson<{ workspace?: WorkspaceState; error?: string }>(
      `/api/auth/users/${u.id}`,
      { method: 'DELETE' }
    );
    if (!res.ok || !res.data?.workspace) {
      setStatusBanner({
        type: 'error',
        message: res.errorMessage || 'Erro ao remover usuário.',
      });
      return;
    }
    onWorkspaceUpdated(res.data.workspace);
    setStatusBanner({
      type: 'success',
      message: `Usuário "${u.username}" removido do banco de dados.`,
    });
  };

  const handleSyncAllToCloud = async () => {
    setStatusBanner(null);
    setIsSyncingCloud(true);
    triggerHaptic('tap');
    try {
      let activeFbUser = firebaseUser;
      if (!activeFbUser) {
        activeFbUser = await signInWithGoogleCloud();
        setFirebaseUser(activeFbUser);
      }
      const count = await syncWorkspaceToCloudFirestore(workspace, currentUser);
      triggerHaptic('success');
      setStatusBanner({
        type: 'success',
        message: `Sincronização concluída! ${count} registros (usuários, memórias, tarefas, agenda, rotinas e dossiê) salvos no Cloud Firestore.`,
      });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Falha ao sincronizar com o Cloud Firestore.',
      });
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const handleCreateCustomCloudRecord = async (e: FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim() || !customSummary.trim()) return;
    setIsSyncingCloud(true);
    setStatusBanner(null);
    try {
      if (!firebaseUser) {
        const signed = await signInWithGoogleCloud();
        setFirebaseUser(signed);
      }
      await upsertFirestoreSystemRecord({
        id: `custom_${Date.now()}`,
        recordType: customType,
        title: customTitle.trim().slice(0, BLUEPRINT_CONSTRAINTS.TITLE_MAX_LENGTH),
        summary: customSummary.trim().slice(0, BLUEPRINT_CONSTRAINTS.SUMMARY_MAX_LENGTH),
        status: 'ativo',
        createdByUsername: currentUser.username,
      });
      setCustomTitle('');
      setCustomSummary('');
      triggerHaptic('success');
      setStatusBanner({
        type: 'success',
        message: 'Documento gravado diretamente no Cloud Firestore!',
      });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao gravar no Firestore.',
      });
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const handleExportDatabaseJson = () => {
    triggerHaptic('tap');
    const blob = new Blob([JSON.stringify(workspace, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rodack_database_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const usersList = (workspace.users ?? []).filter(
    (u) =>
      !searchQuery.trim() ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.email && u.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      u.roleLabel.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <section className="rounded-xl border border-slate-200/90 dark:border-cyan-500/35 bg-white/95 dark:bg-[#051320]/90 p-4 sm:p-6 space-y-5 shadow-xs">
      {/* Top Database Telemetry Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 dark:border-cyan-500/25 pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-400/50 bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.25)]">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-cyan-600 dark:text-cyan-300">
                NÚCLEO DE PERSISTÊNCIA HÍBRIDO · CLOUD FIRESTORE + SERVIDOR
              </span>
              <span className="inline-flex items-center gap-1 rounded border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] text-emerald-700 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {firestoreConnected === false ? 'LOCAL ATIVO' : 'FIRESTORE PROVISIONADO'}
              </span>
            </div>
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white mt-0.5">
              Banco de Dados Central — Usuários &amp; Registros do Sistema
            </h2>
            <p className="text-xs text-slate-600 dark:text-cyan-200/75 mt-0.5">
              Projeto: <code className="font-mono">{firebaseConfig.projectId}</code> · Banco:{' '}
              <code className="font-mono">
                {firebaseConfig.firestoreDatabaseId.slice(0, 36)}...
              </code>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleSyncAllToCloud()}
            disabled={isSyncingCloud}
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs px-3.5 py-2 shadow-[0_0_16px_rgba(34,211,238,0.35)] transition-all disabled:opacity-50"
          >
            <Cloud className="h-3.5 w-3.5" />
            <span>
              {isSyncingCloud
                ? 'Sincronizando Nuvem...'
                : firebaseUser
                ? 'Sincronizar Tudo no Firestore'
                : 'Conectar Google & Sincronizar Firestore'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleExportDatabaseJson}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-cyan-500/35 bg-slate-100 dark:bg-[#04101C] px-3 py-2 text-xs font-medium text-slate-700 dark:text-cyan-200 hover:bg-slate-200 dark:hover:bg-cyan-950/70 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Exportar JSON</span>
          </button>

          <button
            type="button"
            onClick={() => void loadDbSummary()}
            title="Atualizar métricas do banco de dados"
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 dark:border-cyan-500/35 bg-slate-100 dark:bg-[#04101C] p-2 text-slate-700 dark:text-cyan-200 hover:bg-slate-200 dark:hover:bg-cyan-950/70"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Database Collection Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {[
          {
            id: 'usuarios' as const,
            label: 'Usuários',
            count: (workspace.users ?? []).length,
            sub: 'Patrick + Operadores',
          },
          {
            id: 'firestore_cloud' as const,
            label: 'Cloud Firestore',
            count: cloudRecords.length,
            sub: firebaseUser ? 'Sincronizado' : 'Pronto p/ Auth',
          },
          {
            id: 'memorias' as const,
            label: 'Memórias IA',
            count: workspace.memories.length,
            sub: 'Aprendizado Contínuo',
          },
          {
            id: 'tarefas' as const,
            label: 'Tarefas & Alertas',
            count: workspace.tasks.length + workspace.alerts.length,
            sub: `${workspace.tasks.filter((t) => t.status !== 'concluida').length} pendentes`,
          },
          {
            id: 'agenda_rotinas' as const,
            label: 'Agenda & Rotinas',
            count: (workspace.agenda?.length ?? 0) + (workspace.routines?.length ?? 0),
            sub: 'Horários & Eventos',
          },
          {
            id: 'conversas' as const,
            label: 'Diálogos Salvos',
            count: workspace.conversations.length,
            sub: dbSummary
              ? `${(dbSummary.storageBytes / 1024).toFixed(1)} KB em disco`
              : 'Histórico Completo',
          },
        ].map((card) => {
          const active = activeTab === card.id;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => {
                triggerHaptic('tap');
                setActiveTab(card.id);
              }}
              className={`text-left rounded-xl border p-3 transition-all ${
                active
                  ? 'border-cyan-400 bg-cyan-500/15 shadow-[0_0_16px_rgba(34,211,238,0.2)]'
                  : 'border-slate-200 dark:border-cyan-500/20 bg-slate-50/70 dark:bg-[#030C15]/80 hover:border-cyan-400/50'
              }`}
            >
              <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500 dark:text-cyan-300/80">
                {card.label}
              </div>
              <div className="font-display text-xl font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                {card.count}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-cyan-200/65 truncate">
                {card.sub}
              </div>
            </button>
          );
        })}
      </div>

      {statusBanner && (
        <div
          className={`rounded-xl border px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs ${
            statusBanner.type === 'success'
              ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-700 dark:text-emerald-200'
              : 'border-red-500/50 bg-red-950/40 text-red-700 dark:text-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusBanner.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            ) : (
              <ShieldAlert className="h-4 w-4 shrink-0 text-red-400" />
            )}
            <span>{statusBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-[11px] underline"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-cyan-400/70" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Pesquisar registros no banco de dados (nome de usuário, e-mail, cargo, título, memória ou tarefa)..."
          className="w-full rounded-xl border border-slate-200 dark:border-cyan-500/30 bg-slate-50 dark:bg-[#030B14] pl-10 pr-4 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-cyan-400/40 focus:outline-none focus:border-cyan-400"
        />
      </div>

      {/* TAB 1: USUÁRIOS DO SISTEMA (PRINCIPAL) */}
      {activeTab === 'usuarios' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Register New User in Database */}
          <form
            onSubmit={handleCreateUser}
            className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-cyan-500/30 bg-slate-50/80 dark:bg-[#030B14]/90 p-4 space-y-3.5"
          >
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-cyan-500/20 pb-2.5">
              <UserPlus className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
              <div>
                <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  Cadastrar Novo Usuário no Banco
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-cyan-200/70">
                  Persiste credenciais com hash SHA-256 e perfil de acesso.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase text-slate-600 dark:text-cyan-200/80 mb-1">
                Nome de Usuário *
              </label>
              <div className="relative">
                <UserCheck className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-cyan-400" />
                <input
                  type="text"
                  maxLength={BLUEPRINT_CONSTRAINTS.USERNAME_MAX_LENGTH}
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="Ex: Engenheiro Stark / Maria Silva"
                  className="w-full rounded-lg border border-slate-300 dark:border-cyan-500/30 bg-white dark:bg-[#051320] pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase text-slate-600 dark:text-cyan-200/80 mb-1">
                Senha de Acesso *
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-cyan-400" />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo de 4 caracteres"
                  className="w-full rounded-lg border border-slate-300 dark:border-cyan-500/30 bg-white dark:bg-[#051320] pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase text-slate-600 dark:text-cyan-200/80 mb-1">
                E-mail (Isolamento PII)
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-cyan-400" />
                <input
                  type="email"
                  maxLength={BLUEPRINT_CONSTRAINTS.EMAIL_MAX_LENGTH}
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="operador@rodack.ai"
                  className="w-full rounded-lg border border-slate-300 dark:border-cyan-500/30 bg-white dark:bg-[#051320] pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase text-slate-600 dark:text-cyan-200/80 mb-1">
                Cargo / Função no Sistema
              </label>
              <input
                type="text"
                maxLength={BLUEPRINT_CONSTRAINTS.ROLE_MAX_LENGTH}
                value={newRoleLabel}
                onChange={(e) => setNewRoleLabel(e.target.value)}
                placeholder="Ex: Analista de Sistemas"
                className="w-full rounded-lg border border-slate-300 dark:border-cyan-500/30 bg-white dark:bg-[#051320] px-3 py-2 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmittingUser}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs py-2.5 px-4 transition-colors disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              <span>
                {isSubmittingUser ? 'Gravando no Banco...' : 'Salvar Usuário no Banco de Dados'}
              </span>
            </button>
          </form>

          {/* Right Column: Users Table */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-cyan-500" />
                <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  Tabela de Usuários Cadastrados ({usersList.length})
                </h3>
              </div>
              <span className="font-mono text-[10px] text-cyan-600 dark:text-cyan-300">
                CRIADOR RAIZ PROTEGIDO: PATRICK PESSOA
              </span>
            </div>

            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
              {usersList.map((u) => {
                const isEditing = editingUserId === u.id;
                return (
                  <div
                    key={u.id}
                    className={`rounded-xl border p-3.5 transition-all ${
                      u.isCreator
                        ? 'border-cyan-400/60 bg-cyan-500/10 dark:bg-cyan-950/45'
                        : 'border-slate-200 dark:border-cyan-500/25 bg-white dark:bg-[#030B14]/85'
                    }`}
                  >
                    {isEditing ? (
                      <div className="space-y-2.5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={editUsername}
                            onChange={(e) => setEditUsername(e.target.value)}
                            placeholder="Nome do usuário"
                            className="rounded-lg border border-cyan-500/40 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                          />
                          <input
                            type="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            placeholder="E-mail"
                            className="rounded-lg border border-cyan-500/40 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                          />
                          <input
                            type="text"
                            value={editRoleLabel}
                            onChange={(e) => setEditRoleLabel(e.target.value)}
                            placeholder="Cargo / Função"
                            className="rounded-lg border border-cyan-500/40 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                          />
                          <input
                            type="password"
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                            placeholder="Nova senha (deixe em branco p/ manter)"
                            className="rounded-lg border border-cyan-500/40 bg-slate-900 px-2.5 py-1.5 text-xs text-white font-mono"
                          />
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingUserId(null)}
                            className="rounded-lg border border-slate-500/40 px-2.5 py-1 text-xs text-slate-300"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleSaveUserEdit(u.id)}
                            className="rounded-lg bg-cyan-500 px-3 py-1 text-xs font-semibold text-slate-950"
                          >
                            Salvar Alterações
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-display text-sm font-bold text-slate-900 dark:text-white">
                              {u.username}
                            </span>
                            {u.isCreator ? (
                              <span className="inline-flex items-center gap-1 rounded border border-cyan-400/50 bg-cyan-500/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-cyan-800 dark:text-cyan-200">
                                <ShieldCheck className="h-3 w-3" />
                                CRIADOR, DESENVOLVEDOR &amp; DONO (SENHA: 190996)
                              </span>
                            ) : (
                              <span className="rounded border border-slate-300 dark:border-cyan-500/30 px-2 py-0.5 font-mono text-[10px] text-slate-600 dark:text-cyan-300">
                                OPERADOR CREDENCIADO
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 dark:text-cyan-100/80">
                            {u.roleLabel}
                            {u.email ? ` · ${u.email}` : ''}
                          </p>
                          <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono text-slate-400 dark:text-cyan-300/65">
                            <span>ID: {u.id}</span>
                            <span>
                              Criado: {new Date(u.createdAt).toLocaleDateString('pt-BR')}
                            </span>
                            {u.lastLoginAt && (
                              <span>
                                Último login:{' '}
                                {new Date(u.lastLoginAt).toLocaleString('pt-BR')}
                              </span>
                            )}
                          </div>
                        </div>

                        {!u.isCreator && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => startEditingUser(u)}
                              title="Editar usuário ou redefinir senha"
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-cyan-500/35 px-2.5 py-1 text-xs text-slate-700 dark:text-cyan-200 hover:bg-cyan-500/15"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              <span>Editar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteUser(u)}
                              title="Excluir usuário do banco de dados"
                              className="inline-flex items-center gap-1 rounded-lg border border-red-500/35 px-2.5 py-1 text-xs text-red-600 dark:text-red-300 hover:bg-red-500/15"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Remover</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CLOUD FIRESTORE (NUVEM GOOGLE) */}
      {activeTab === 'firestore_cloud' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-cyan-500/30 bg-slate-50 dark:bg-[#030B14]/90 p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-cyan-600 dark:text-cyan-300">
                CONEXÃO FIREBASE AUTH &amp; CLOUD FIRESTORE ABAC
              </div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white mt-0.5">
                {firebaseUser
                  ? `Conectado como ${firebaseUser.displayName || firebaseUser.email} (UID: ${firebaseUser.uid.slice(0, 12)}...)`
                  : 'Conecte sua conta Google para ler e gravar diretamente nas coleções protegidas /users e /system_records do Firestore'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {firebaseUser ? (
                <>
                  <button
                    type="button"
                    onClick={() => void handleSyncAllToCloud()}
                    disabled={isSyncingCloud}
                    className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
                  >
                    {isSyncingCloud ? 'Sincronizando...' : 'Espelhar Workspace Agora'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void signOutFromGoogleCloud()}
                    className="rounded-lg border border-slate-400/40 px-3 py-1.5 text-xs text-slate-600 dark:text-cyan-200"
                  >
                    Desconectar Google
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleSyncAllToCloud()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>Autenticar Google &amp; Ativar Firestore</span>
                </button>
              )}
            </div>
          </div>

          {/* Direct Cloud Record Creator */}
          <form
            onSubmit={handleCreateCustomCloudRecord}
            className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 rounded-xl border border-slate-200 dark:border-cyan-500/25 bg-white dark:bg-[#030B14]/70 p-3.5"
          >
            <select
              value={customType}
              onChange={(e) =>
                setCustomType(e.target.value as FirestoreSystemRecord['recordType'])
              }
              className="sm:col-span-2 rounded-lg border border-slate-300 dark:border-cyan-500/30 bg-slate-50 dark:bg-[#051320] px-2.5 py-2 text-xs text-slate-900 dark:text-white"
            >
              <option value="usuario">Usuário</option>
              <option value="memoria">Memória</option>
              <option value="tarefa">Tarefa</option>
              <option value="agenda">Agenda</option>
              <option value="rotina">Rotina</option>
              <option value="dossie">Dossiê</option>
            </select>
            <input
              type="text"
              maxLength={BLUEPRINT_CONSTRAINTS.TITLE_MAX_LENGTH}
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="Título do registro no Firestore..."
              className="sm:col-span-3 rounded-lg border border-slate-300 dark:border-cyan-500/30 bg-slate-50 dark:bg-[#051320] px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
            <input
              type="text"
              maxLength={BLUEPRINT_CONSTRAINTS.SUMMARY_MAX_LENGTH}
              value={customSummary}
              onChange={(e) => setCustomSummary(e.target.value)}
              placeholder="Conteúdo / descrição para persistir na nuvem..."
              className="sm:col-span-5 rounded-lg border border-slate-300 dark:border-cyan-500/30 bg-slate-50 dark:bg-[#051320] px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={isSyncingCloud}
              className="sm:col-span-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs px-3 py-2"
            >
              Gravar Nuvem
            </button>
          </form>

          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {cloudRecords.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-cyan-500/30 p-6 text-center text-xs text-slate-500 dark:text-cyan-200/70">
                {firebaseUser
                  ? 'Nenhum documento em /system_records ainda. Clique em "Espelhar Workspace Agora" para sincronizar todos os usuários, memórias, tarefas e rotinas.'
                  : 'Conecte sua conta Google acima para visualizar e sincronizar os documentos em tempo real no Cloud Firestore.'}
              </div>
            ) : (
              cloudRecords
                .filter(
                  (r) =>
                    !searchQuery.trim() ||
                    r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    r.summary.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((rec) => (
                  <div
                    key={rec.id}
                    className="rounded-xl border border-slate-200 dark:border-cyan-500/25 bg-white dark:bg-[#030B14]/85 p-3 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 font-mono text-[10px] uppercase text-cyan-700 dark:text-cyan-300">
                          {rec.recordType}
                        </span>
                        <span className="font-semibold text-xs text-slate-900 dark:text-white">
                          {rec.title}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-cyan-100/80 line-clamp-2">
                        {rec.summary}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void deleteFirestoreSystemRecord(rec.id)}
                      className="text-red-500 hover:text-red-400 p-1 shrink-0"
                      title="Remover documento do Cloud Firestore"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: MEMÓRIAS IA */}
      {activeTab === 'memorias' && (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {workspace.memories
            .filter(
              (m) =>
                !searchQuery.trim() ||
                m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                m.content.toLowerCase().includes(searchQuery.toLowerCase())
            )
            .map((m) => (
              <div
                key={m.id}
                className="rounded-xl border border-slate-200 dark:border-cyan-500/25 bg-slate-50 dark:bg-[#030B14]/85 p-3 space-y-1"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {m.title}
                  </span>
                  <span className="font-mono text-[10px] uppercase text-cyan-600 dark:text-cyan-300">
                    {m.sourceAssistant} · {m.category}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-cyan-100/80">{m.content}</p>
              </div>
            ))}
        </div>
      )}

      {/* TAB 4: TAREFAS & ALERTAS */}
      {activeTab === 'tarefas' && (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {workspace.tasks
            .filter(
              (t) =>
                !searchQuery.trim() ||
                t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                t.description.toLowerCase().includes(searchQuery.toLowerCase())
            )
            .map((t) => (
              <div
                key={t.id}
                className="rounded-xl border border-slate-200 dark:border-cyan-500/25 bg-slate-50 dark:bg-[#030B14]/85 p-3 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-white">
                    {t.title}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-cyan-200/75">
                    {t.description || 'Sem descrição adicional'} · Responsável: {t.assignedTo}
                  </div>
                </div>
                <span className="rounded px-2 py-0.5 font-mono text-[10px] uppercase bg-cyan-500/15 text-cyan-700 dark:text-cyan-300">
                  {t.status}
                </span>
              </div>
            ))}
        </div>
      )}

      {/* TAB 5: AGENDA & ROTINAS */}
      {activeTab === 'agenda_rotinas' && (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {(workspace.agenda ?? []).map((ev) => (
            <div
              key={ev.id}
              className="rounded-xl border border-slate-200 dark:border-cyan-500/25 bg-slate-50 dark:bg-[#030B14]/85 p-3 flex items-center justify-between gap-3"
            >
              <div>
                <div className="text-xs font-semibold text-slate-900 dark:text-white">
                  {ev.date} às {ev.startTime} — {ev.title}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-cyan-200/75">
                  {ev.notes || ev.category}
                </div>
              </div>
              <span className="font-mono text-[10px] text-cyan-600 dark:text-cyan-300">
                {ev.assignedAssistant.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* TAB 6: DIÁLOGOS SALVOS */}
      {activeTab === 'conversas' && (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {workspace.conversations.slice(-20).reverse().map((c) => (
            <div
              key={c.id}
              className="rounded-xl border border-slate-200 dark:border-cyan-500/25 bg-slate-50 dark:bg-[#030B14]/85 p-3 space-y-1"
            >
              <div className="flex items-center justify-between text-[11px] font-mono text-cyan-600 dark:text-cyan-300">
                <span>{new Date(c.timestamp).toLocaleString('pt-BR')}</span>
                <span>{c.responses.length} resposta(s)</span>
              </div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white">
                {c.userMessage}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

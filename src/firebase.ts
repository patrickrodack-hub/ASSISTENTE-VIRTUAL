import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import type { SystemUserAccount, WorkspaceState } from './types/assistant';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Validation constants synchronized verbatim with firebase-blueprint.json
export const BLUEPRINT_CONSTRAINTS = {
  ID_MIN_LENGTH: 1,
  ID_MAX_LENGTH: 128,
  ID_PATTERN: /^[a-zA-Z0-9_\-]+$/,
  USERNAME_MIN_LENGTH: 2,
  USERNAME_MAX_LENGTH: 80,
  ROLE_MIN_LENGTH: 2,
  ROLE_MAX_LENGTH: 120,
  EMAIL_MIN_LENGTH: 3,
  EMAIL_MAX_LENGTH: 160,
  TITLE_MIN_LENGTH: 1,
  TITLE_MAX_LENGTH: 200,
  SUMMARY_MIN_LENGTH: 1,
  SUMMARY_MAX_LENGTH: 4000,
} as const;

export function sanitizeValidFirestoreId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, BLUEPRINT_CONSTRAINTS.ID_MAX_LENGTH);
  return cleaned.length >= BLUEPRINT_CONSTRAINTS.ID_MIN_LENGTH ? cleaned : `rec_${Date.now()}`;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Mandatory startup connection check
let connectionTested = false;
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    connectionTested = true;
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return false;
    }
    connectionTested = true;
    return true;
  }
}

if (typeof window !== 'undefined' && !connectionTested) {
  void testConnection();
}

export interface FirestoreSystemRecord {
  id: string;
  recordType:
    | 'usuario'
    | 'memoria'
    | 'tarefa'
    | 'agenda'
    | 'rotina'
    | 'alerta'
    | 'conversa'
    | 'dossie';
  title: string;
  summary: string;
  status: 'ativo' | 'pendente' | 'concluido' | 'arquivado';
  ownerUid: string;
  createdByUsername: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export function subscribeFirebaseAuth(
  callback: (user: FirebaseUser | null) => void
): Unsubscribe {
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogleCloud(): Promise<FirebaseUser> {
  const provider = new GoogleAuthProvider();
  const credential = await signInWithPopup(auth, provider);
  return credential.user;
}

export async function signOutFromGoogleCloud(): Promise<void> {
  await signOut(auth);
}

export async function ensureFirestoreUserProfile(
  fbUser: FirebaseUser,
  localAccount?: SystemUserAccount | null
): Promise<void> {
  const uid = sanitizeValidFirestoreId(fbUser.uid);
  const userPath = `users/${uid}`;
  const isCreator =
    fbUser.email?.toLowerCase() === 'patrickrodack@gmail.com' ||
    Boolean(localAccount?.isCreator && fbUser.email?.toLowerCase() === 'patrickrodack@gmail.com');

  const safeUsername = (
    localAccount?.username ||
    fbUser.displayName ||
    'Patrick Pessoa'
  )
    .trim()
    .slice(0, BLUEPRINT_CONSTRAINTS.USERNAME_MAX_LENGTH);

  const safeRole = (
    localAccount?.roleLabel ||
    (isCreator
      ? 'Criador, Desenvolvedor Principal & Dono do Sistema'
      : 'Operador Credenciado · RODACK IA')
  )
    .trim()
    .slice(0, BLUEPRINT_CONSTRAINTS.ROLE_MAX_LENGTH);

  try {
    const existingSnap = await getDoc(doc(db, 'users', uid));
    if (!existingSnap.exists()) {
      await setDoc(doc(db, 'users', uid), {
        id: uid,
        username: safeUsername.length >= 2 ? safeUsername : 'Operador',
        roleLabel: safeRole.length >= 2 ? safeRole : 'Operador',
        isCreator,
        ownerUid: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'users', uid), {
        username: safeUsername.length >= 2 ? safeUsername : 'Operador',
        roleLabel: safeRole.length >= 2 ? safeRole : 'Operador',
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }

  // Split-collection PII storage for email
  if (fbUser.email && fbUser.email.trim().length >= BLUEPRINT_CONSTRAINTS.EMAIL_MIN_LENGTH) {
    const privatePath = `users/${uid}/private/contact`;
    const safeEmail = fbUser.email.trim().slice(0, BLUEPRINT_CONSTRAINTS.EMAIL_MAX_LENGTH);
    try {
      const privSnap = await getDoc(doc(db, 'users', uid, 'private', 'contact'));
      if (!privSnap.exists()) {
        await setDoc(doc(db, 'users', uid, 'private', 'contact'), {
          ownerUid: uid,
          email: safeEmail,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(db, 'users', uid, 'private', 'contact'), {
          email: safeEmail,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, privatePath);
    }
  }
}

export function subscribeOwnerSystemRecords(
  ownerUid: string,
  onRecords: (records: FirestoreSystemRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'system_records';
  const q = query(collection(db, path), where('ownerUid', '==', ownerUid));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: FirestoreSystemRecord[] = snapshot.docs.map(
        (d) => d.data() as FirestoreSystemRecord
      );
      onRecords(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function upsertFirestoreSystemRecord(params: {
  id: string;
  recordType: FirestoreSystemRecord['recordType'];
  title: string;
  summary: string;
  status: FirestoreSystemRecord['status'];
  createdByUsername: string;
}): Promise<void> {
  const fbUser = auth.currentUser;
  if (!fbUser) {
    throw new Error('Autentique-se no Cloud Firestore para sincronizar registros na nuvem.');
  }

  await ensureFirestoreUserProfile(fbUser);

  const cleanId = sanitizeValidFirestoreId(params.id);
  const path = `system_records/${cleanId}`;
  const cleanTitle = params.title.trim().slice(0, BLUEPRINT_CONSTRAINTS.TITLE_MAX_LENGTH) || 'Registro';
  const cleanSummary =
    params.summary.trim().slice(0, BLUEPRINT_CONSTRAINTS.SUMMARY_MAX_LENGTH) || 'Sem detalhes';
  const cleanCreator =
    params.createdByUsername.trim().slice(0, BLUEPRINT_CONSTRAINTS.USERNAME_MAX_LENGTH) ||
    'Patrick Pessoa';

  try {
    const docRef = doc(db, 'system_records', cleanId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      await setDoc(docRef, {
        id: cleanId,
        recordType: params.recordType,
        title: cleanTitle,
        summary: cleanSummary,
        status: params.status,
        ownerUid: fbUser.uid,
        createdByUsername: cleanCreator,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(docRef, {
        title: cleanTitle,
        summary: cleanSummary,
        status: params.status,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteFirestoreSystemRecord(recordId: string): Promise<void> {
  const cleanId = sanitizeValidFirestoreId(recordId);
  const path = `system_records/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'system_records', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function syncWorkspaceToCloudFirestore(
  workspace: WorkspaceState,
  activeUser?: SystemUserAccount | null
): Promise<number> {
  const fbUser = auth.currentUser;
  if (!fbUser) {
    throw new Error('Conecte sua conta Google no painel para espelhar os dados no Cloud Firestore.');
  }

  await ensureFirestoreUserProfile(fbUser, activeUser);
  let syncedCount = 0;
  const actorName = activeUser?.username || 'Patrick Pessoa';

  // 1. Sync Users
  for (const u of workspace.users ?? []) {
    await upsertFirestoreSystemRecord({
      id: `usr_${sanitizeValidFirestoreId(u.id)}`,
      recordType: 'usuario',
      title: `${u.username} (${u.isCreator ? 'Criador & Dono' : u.roleLabel})`,
      summary: `Usuário: ${u.username} | Função: ${u.roleLabel} | Criador: ${
        u.isCreator ? 'Sim (Patrick Pessoa)' : 'Não'
      } | Criado em: ${u.createdAt}`,
      status: 'ativo',
      createdByUsername: actorName,
    });
    syncedCount += 1;
  }

  // 2. Sync Memories
  for (const m of (workspace.memories ?? []).slice(0, 25)) {
    await upsertFirestoreSystemRecord({
      id: `mem_${sanitizeValidFirestoreId(m.id)}`,
      recordType: 'memoria',
      title: m.title,
      summary: `[${m.category.toUpperCase()} · ${m.sourceAssistant.toUpperCase()}] ${m.content}`,
      status: 'ativo',
      createdByUsername: actorName,
    });
    syncedCount += 1;
  }

  // 3. Sync Tasks
  for (const t of (workspace.tasks ?? []).slice(0, 25)) {
    await upsertFirestoreSystemRecord({
      id: `tsk_${sanitizeValidFirestoreId(t.id)}`,
      recordType: 'tarefa',
      title: t.title,
      summary: `${t.description || t.title} | Prioridade: ${t.priority} | Responsável: ${
        t.assignedTo
      } | Prazo: ${t.dueTime}`,
      status: t.status === 'concluida' ? 'concluido' : 'pendente',
      createdByUsername: actorName,
    });
    syncedCount += 1;
  }

  // 4. Sync Agenda Events
  for (const ev of (workspace.agenda ?? []).slice(0, 20)) {
    await upsertFirestoreSystemRecord({
      id: `agd_${sanitizeValidFirestoreId(ev.id)}`,
      recordType: 'agenda',
      title: `${ev.date} ${ev.startTime} · ${ev.title}`,
      summary: `${ev.notes || ev.title} | Categoria: ${ev.category} | Assistente: ${
        ev.assignedAssistant
      }`,
      status: ev.completed ? 'concluido' : 'pendente',
      createdByUsername: actorName,
    });
    syncedCount += 1;
  }

  // 5. Sync Routines
  for (const rt of (workspace.routines ?? []).slice(0, 15)) {
    await upsertFirestoreSystemRecord({
      id: `rtn_${sanitizeValidFirestoreId(rt.id)}`,
      recordType: 'rotina',
      title: `${rt.time} (${rt.frequencyLabel}) · ${rt.title}`,
      summary: `${rt.instructions} | Líder: ${rt.leadAssistant}`,
      status: rt.enabled ? 'ativo' : 'pendente',
      createdByUsername: actorName,
    });
    syncedCount += 1;
  }

  // 6. Sync Creator Dossier snapshot
  if (workspace.creatorDossier) {
    const d = workspace.creatorDossier;
    await upsertFirestoreSystemRecord({
      id: 'dossier_patrick_pessoa',
      recordType: 'dossie',
      title: `Dossiê Soberano · ${d.fullName}`,
      summary: `${d.roleTitle} | ${d.city} - ${d.stateCountry} | Foco: ${d.focusAreas.join(', ')}`,
      status: 'ativo',
      createdByUsername: actorName,
    });
    syncedCount += 1;
  }

  return syncedCount;
}

export async function fetchOwnerSystemRecordsOnce(): Promise<FirestoreSystemRecord[]> {
  const fbUser = auth.currentUser;
  if (!fbUser) return [];
  const path = 'system_records';
  try {
    const q = query(collection(db, path), where('ownerUid', '==', fbUser.uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as FirestoreSystemRecord);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export { firebaseConfig };

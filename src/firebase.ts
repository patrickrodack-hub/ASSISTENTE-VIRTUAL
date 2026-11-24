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
  setLogLevel,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import type {
  JarvisKnowledgeCategory,
  JarvisKnowledgeChunk,
  JarvisKnowledgeDocument,
  SystemUserAccount,
  WorkspaceState,
} from './types/assistant';

// Silence internal @firebase/firestore clock-skew warnings ("Detected an update time that is in the future")
try {
  setLogLevel('silent');
} catch {
  // ignore if unsupported in environment
}

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

const ensuredProfileUids = new Set<string>();

export async function signOutFromGoogleCloud(): Promise<void> {
  ensuredProfileUids.clear();
  await signOut(auth);
}

export async function ensureFirestoreUserProfile(
  fbUser: FirebaseUser,
  localAccount?: SystemUserAccount | null,
  forceRefresh = false
): Promise<void> {
  const uid = sanitizeValidFirestoreId(fbUser.uid);
  if (!forceRefresh && ensuredProfileUids.has(uid)) {
    return;
  }
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
    } else if (forceRefresh) {
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
      } else if (forceRefresh) {
        await updateDoc(doc(db, 'users', uid, 'private', 'contact'), {
          email: safeEmail,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, privatePath);
    }
  }

  ensuredProfileUids.add(uid);
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

  // 7. Sync Daily External Intel Feed snapshots (G1, GE, B3, CEPEA, Redes Sociais)
  for (const snap of (workspace.dailyIntelFeed ?? []).slice(0, 15)) {
    const itemsSummary = snap.items
      .slice(0, 4)
      .map((i) => `${i.title}${i.detail ? ` — ${i.detail}` : ''}`)
      .join(' | ');
    await upsertFirestoreSystemRecord({
      id: sanitizeValidFirestoreId(`intel_${snap.sourceKey}_${snap.queryDate}`),
      recordType: 'memoria',
      title: `[${snap.queryDate}] ${snap.sourceLabel}`,
      summary: itemsSummary || snap.headlineSummary || snap.domainUrl,
      status: 'ativo',
      createdByUsername: actorName,
    });
    syncedCount += 1;
  }

  // 8. Sync Voice Sample Training Metadata (104.3 Hz J.A.R.V.I.S. / 90.2 Hz ULTRON)
  for (const vs of (workspace.voiceSamples ?? []).slice(0, 20)) {
    await upsertFirestoreSystemRecord({
      id: sanitizeValidFirestoreId(`voice_${vs.id}`),
      recordType: 'memoria',
      title: `[VOZ ${vs.assistantId.toUpperCase()} · ${vs.acoustics.medianF0Hz} Hz] ${vs.fileName}`,
      summary: `Formato: .${vs.format} | F0: ${vs.acoustics.medianF0Hz} Hz (${vs.acoustics.p25F0Hz}–${vs.acoustics.p75F0Hz} Hz) | RMS: ${vs.acoustics.rmsDbfs} dBFS | Treino ativo: ${vs.isActiveTraining ? 'Sim' : 'Não'}`,
      status: vs.isActiveTraining ? 'ativo' : 'arquivado',
      createdByUsername: actorName,
    });
    syncedCount += 1;
  }

  // 9. Sync J.A.R.V.I.S. Extracted PDF Study Knowledge Base & Chunks
  for (const pdfDoc of (workspace.jarvisKnowledgeBase ?? []).slice(0, 15)) {
    const count = await syncJarvisPdfDocumentToFirestore(pdfDoc, actorName);
    syncedCount += count;
  }

  return syncedCount;
}

/**
 * Armazena o documento PDF extraído e seus blocos de estudo no Cloud Firestore (/system_records),
 * respeitando rigorosamente os limites de validação de firestore.rules e firebase-blueprint.json
 * e mantendo cache persistente offline.
 */
export async function syncJarvisPdfDocumentToFirestore(
  pdfDoc: JarvisKnowledgeDocument,
  actorName = 'Patrick Pessoa'
): Promise<number> {
  const fbUser = auth.currentUser;
  if (!fbUser) return 0;

  const cleanDocId = sanitizeValidFirestoreId(pdfDoc.id);
  const metaEnvelope = JSON.stringify({
    __jarvisPdfMetaV1: true,
    docId: pdfDoc.id,
    title: pdfDoc.title,
    fileName: pdfDoc.fileName,
    category: pdfDoc.category,
    fileSizeBytes: pdfDoc.fileSizeBytes,
    pageCountEstimate: pdfDoc.pageCountEstimate,
    totalCharacters: pdfDoc.totalCharacters,
    createdAt: pdfDoc.createdAt,
    uploadedBy: pdfDoc.uploadedBy || actorName,
    summary: pdfDoc.summary.slice(0, 850),
    personalityIntegrationDirective: pdfDoc.personalityIntegrationDirective.slice(0, 650),
    keyTeachings: (pdfDoc.keyTeachings ?? []).slice(0, 4).map((t) => t.slice(0, 260)),
    studyQuestions: (pdfDoc.studyQuestions ?? []).slice(0, 4).map((q) => q.slice(0, 240)),
    chunksCount: pdfDoc.chunks.length,
  });

  await upsertFirestoreSystemRecord({
    id: sanitizeValidFirestoreId(`pdf_doc_${cleanDocId}`),
    recordType: 'memoria',
    title: `[PDF J.A.R.V.I.S.] ${pdfDoc.title}`.slice(0, BLUEPRINT_CONSTRAINTS.TITLE_MAX_LENGTH),
    summary: metaEnvelope.slice(0, BLUEPRINT_CONSTRAINTS.SUMMARY_MAX_LENGTH),
    status: 'ativo',
    createdByUsername: (pdfDoc.uploadedBy || actorName).slice(
      0,
      BLUEPRINT_CONSTRAINTS.USERNAME_MAX_LENGTH
    ),
  });

  let written = 1;
  // Store up to 12 extracted text sections in Firestore so the full study text is persisted in Firestore
  for (const chunk of (pdfDoc.chunks ?? []).slice(0, 12)) {
    const chunkEnvelope = JSON.stringify({
      __jarvisPdfChunkV1: true,
      docId: pdfDoc.id,
      docTitle: pdfDoc.title,
      chunkId: chunk.id,
      index: chunk.index,
      heading: chunk.heading.slice(0, 140),
      keywords: (chunk.keywords ?? []).slice(0, 8),
      content: chunk.content.slice(0, 3100),
    });

    await upsertFirestoreSystemRecord({
      id: sanitizeValidFirestoreId(`pdf_chk_${cleanDocId}_${chunk.index}`),
      recordType: 'memoria',
      title: `[PDF SEÇÃO ${chunk.index}] ${pdfDoc.title} · ${chunk.heading}`.slice(
        0,
        BLUEPRINT_CONSTRAINTS.TITLE_MAX_LENGTH
      ),
      summary: chunkEnvelope.slice(0, BLUEPRINT_CONSTRAINTS.SUMMARY_MAX_LENGTH),
      status: 'ativo',
      createdByUsername: (pdfDoc.uploadedBy || actorName).slice(
        0,
        BLUEPRINT_CONSTRAINTS.USERNAME_MAX_LENGTH
      ),
    });
    written += 1;
  }

  return written;
}

export async function deleteJarvisPdfDocumentFromFirestore(
  pdfDoc: JarvisKnowledgeDocument
): Promise<void> {
  const fbUser = auth.currentUser;
  if (!fbUser) return;
  const cleanDocId = sanitizeValidFirestoreId(pdfDoc.id);
  await deleteFirestoreSystemRecord(`pdf_doc_${cleanDocId}`).catch(() => {});
  const maxChunks = Math.max(12, pdfDoc.chunks?.length ?? 0);
  for (let idx = 1; idx <= maxChunks; idx += 1) {
    await deleteFirestoreSystemRecord(`pdf_chk_${cleanDocId}_${idx}`).catch(() => {});
  }
}

/**
 * Reconstrói os documentos PDF do J.A.R.V.I.S. armazenados na coleção /system_records do Cloud Firestore
 * para vinculação automática ao prompt de sistema do J.A.R.V.I.S. e consulta offline.
 */
export function hydrateJarvisPdfDocumentsFromFirestoreRecords(
  records: FirestoreSystemRecord[]
): JarvisKnowledgeDocument[] {
  if (!Array.isArray(records) || records.length === 0) return [];

  const docMetaMap = new Map<
    string,
    {
      docId: string;
      title: string;
      fileName: string;
      category: JarvisKnowledgeCategory;
      fileSizeBytes: number;
      pageCountEstimate: number;
      totalCharacters: number;
      createdAt: string;
      uploadedBy: string;
      summary: string;
      personalityIntegrationDirective: string;
      keyTeachings: string[];
      studyQuestions: string[];
    }
  >();

  const chunksByDocId = new Map<string, JarvisKnowledgeChunk[]>();

  for (const rec of records) {
    if (rec.recordType !== 'memoria' || !rec.summary) continue;
    const trimmed = rec.summary.trim();
    if (!trimmed.startsWith('{')) continue;

    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (parsed.__jarvisPdfMetaV1 && typeof parsed.docId === 'string') {
        docMetaMap.set(parsed.docId, {
          docId: parsed.docId,
          title: String(parsed.title || rec.title || 'Estudo PDF'),
          fileName: String(parsed.fileName || 'documento.pdf'),
          category: (parsed.category as JarvisKnowledgeCategory) || 'ciencias_estudos_gerais',
          fileSizeBytes: Number(parsed.fileSizeBytes) || 0,
          pageCountEstimate: Number(parsed.pageCountEstimate) || 1,
          totalCharacters: Number(parsed.totalCharacters) || 0,
          createdAt: String(parsed.createdAt || new Date().toISOString()),
          uploadedBy: String(parsed.uploadedBy || rec.createdByUsername || 'Patrick Pessoa'),
          summary: String(parsed.summary || ''),
          personalityIntegrationDirective: String(parsed.personalityIntegrationDirective || ''),
          keyTeachings: Array.isArray(parsed.keyTeachings)
            ? parsed.keyTeachings.map((t) => String(t))
            : [],
          studyQuestions: Array.isArray(parsed.studyQuestions)
            ? parsed.studyQuestions.map((q) => String(q))
            : [],
        });
      } else if (parsed.__jarvisPdfChunkV1 && typeof parsed.docId === 'string') {
        const list = chunksByDocId.get(parsed.docId) ?? [];
        list.push({
          id: String(parsed.chunkId || `chunk-${parsed.index || list.length + 1}`),
          index: Number(parsed.index) || list.length + 1,
          heading: String(parsed.heading || `Seção ${list.length + 1}`),
          content: String(parsed.content || ''),
          keywords: Array.isArray(parsed.keywords)
            ? parsed.keywords.map((k) => String(k))
            : [],
        });
        chunksByDocId.set(parsed.docId, list);
      }
    } catch {
      // ignore non-JSON memory records
    }
  }

  const hydrated: JarvisKnowledgeDocument[] = [];
  for (const [docId, meta] of docMetaMap.entries()) {
    const rawChunks = (chunksByDocId.get(docId) ?? []).sort((a, b) => a.index - b.index);
    const chunks: JarvisKnowledgeChunk[] =
      rawChunks.length > 0
        ? rawChunks
        : [
            {
              id: `chunk-1-${docId}`,
              index: 1,
              heading: `${meta.title} · Síntese Principal`,
              content: `${meta.summary}\n${meta.keyTeachings.join('\n')}`,
              keywords: [],
            },
          ];

    hydrated.push({
      id: meta.docId,
      title: meta.title,
      fileName: meta.fileName,
      category: meta.category,
      fileSizeBytes: meta.fileSizeBytes,
      pageCountEstimate: meta.pageCountEstimate,
      summary: meta.summary,
      personalityIntegrationDirective: meta.personalityIntegrationDirective,
      keyTeachings: meta.keyTeachings,
      studyQuestions: meta.studyQuestions,
      chunks,
      totalCharacters:
        meta.totalCharacters || chunks.reduce((acc, c) => acc + c.content.length, 0),
      offlineReady: true,
      uploadedBy: meta.uploadedBy,
      createdAt: meta.createdAt,
    });
  }

  return hydrated.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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

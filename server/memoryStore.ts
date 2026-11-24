import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import type {
  AgendaEventItem,
  AlertItem,
  AssistantId,
  ConversationEntry,
  CreatorDossier,
  CreatorQuestionItem,
  DailySourceSnapshot,
  DetectedEmotion,
  MemoryItem,
  RoutineRuleItem,
  SystemUserAccount,
  TaskItem,
  TelemetryEntry,
  TurnFeedback,
  VoiceAcousticProfile,
  VoiceSampleFormat,
  VoiceSampleRecord,
  VoiceTargetAssistantId,
  VoiceTrainingState,
  VoiceValidationResult,
  WorkspaceState,
  JarvisKnowledgeDocument,
  NeuralEvolutionEvent,
} from '../src/types/assistant.ts';
import {
  applyCognitiveEvolutionToWorkspace,
  applyFeedbackReinforcementLearning,
  buildDynamicPersonalityDirective,
  createDefaultNeuralEvolutionState,
  ensureNeuralEvolutionState,
} from './continuousLearningEngine.ts';
import { JARVIS_KNOWLEDGE_CATEGORY_LABELS } from '../src/utils/jarvisOfflinePdfKnowledge.ts';

export const IS_SERVERLESS_RUNTIME = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
);

const DATA_DIR = IS_SERVERLESS_RUNTIME
  ? path.join(os.tmpdir(), 'rodack_stark_data')
  : path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'stark_memory.json');
const USERS_PASSWORDS_FILE = path.join(DATA_DIR, 'stark_user_passwords.json');
const VOICE_SAMPLES_DIR = path.join(DATA_DIR, 'voice_samples');

const MAX_VOICE_SAMPLE_MEM_ENTRIES = 6;
const MAX_VOICE_SAMPLE_MEM_BYTES = 12 * 1024 * 1024; // 12 MB ceiling
const inMemoryVoiceSampleBuffers = new Map<string, Buffer>();
let inMemoryVoiceSampleBytes = 0;

function setVoiceSampleBufferBounded(id: string, buf: Buffer): void {
  const prev = inMemoryVoiceSampleBuffers.get(id);
  if (prev) {
    inMemoryVoiceSampleBytes -= prev.length;
    inMemoryVoiceSampleBuffers.delete(id);
  }
  while (
    (inMemoryVoiceSampleBuffers.size >= MAX_VOICE_SAMPLE_MEM_ENTRIES ||
      inMemoryVoiceSampleBytes + buf.length > MAX_VOICE_SAMPLE_MEM_BYTES) &&
    inMemoryVoiceSampleBuffers.size > 0
  ) {
    const oldestKey = inMemoryVoiceSampleBuffers.keys().next().value;
    if (!oldestKey) break;
    const oldestBuf = inMemoryVoiceSampleBuffers.get(oldestKey);
    if (oldestBuf) inMemoryVoiceSampleBytes -= oldestBuf.length;
    inMemoryVoiceSampleBuffers.delete(oldestKey);
  }
  if (buf.length <= MAX_VOICE_SAMPLE_MEM_BYTES) {
    inMemoryVoiceSampleBuffers.set(id, buf);
    inMemoryVoiceSampleBytes += buf.length;
  }
}

function deleteVoiceSampleBufferBounded(id: string): void {
  const prev = inMemoryVoiceSampleBuffers.get(id);
  if (prev) {
    inMemoryVoiceSampleBytes = Math.max(0, inMemoryVoiceSampleBytes - prev.length);
    inMemoryVoiceSampleBuffers.delete(id);
  }
}

let inMemoryPasswordStore: Record<string, string> = {};

async function safeWriteJsonFile(filePath: string, payload: unknown): Promise<void> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (err) {
    if (!IS_SERVERLESS_RUNTIME) {
      throw err;
    }
    // On read-only serverless sandboxes, keep running cleanly via in-memory cache
  }
}

export const CREATOR_HARDCODED_ACCOUNT = {
  id: 'creator-patrick-pessoa',
  username: 'Patrick Pessoa',
  email: 'patrickrodack@gmail.com',
  password: '190996',
  roleLabel: 'Criador, Desenvolvedor Principal & Dono do Sistema',
  isCreator: true,
} as const;

function hashPassword(raw: string): string {
  return crypto.createHash('sha256').update(`rodack_salt_${raw}`).digest('hex');
}

async function readPasswordStore(): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(USERS_PASSWORDS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, string>;
    inMemoryPasswordStore = { ...inMemoryPasswordStore, ...parsed };
    return inMemoryPasswordStore;
  } catch {
    return { ...inMemoryPasswordStore };
  }
}

async function writePasswordStore(store: Record<string, string>): Promise<void> {
  inMemoryPasswordStore = { ...store };
  await safeWriteJsonFile(USERS_PASSWORDS_FILE, inMemoryPasswordStore);
}

function getTodayDateString(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
    const m = parts.find((p) => p.type === 'month')?.value ?? '01';
    const d = parts.find((p) => p.type === 'day')?.value ?? '01';
    return `${y}-${m}-${d}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function createDefaultAgenda(): AgendaEventItem[] {
  const today = getTodayDateString();
  const now = new Date().toISOString();
  return [
    {
      id: crypto.randomUUID(),
      title: 'Briefing Matinal RODACK IA · Clima RJ & Notícias',
      date: today,
      startTime: '09:00',
      endTime: '09:20',
      category: 'rotina',
      locationOrLink: 'Console RODACK SISTEMA DE IA',
      notes:
        'Panorama do clima no Rio de Janeiro, manchetes do RJ/Brasil/Mundo e revisão de prioridades de código com J.A.R.V.I.S., SEXTA-FEIRA e ULTRON.',
      assignedAssistant: 'todos',
      completed: false,
      autoCallOnTime: true,
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      title: 'Bloco de Arquitetura & Desenvolvimento Principal',
      date: today,
      startTime: '10:30',
      endTime: '13:00',
      category: 'foco_dev',
      locationOrLink: 'Ambiente de Engenharia Patrick Pessoa',
      notes:
        'Foco profundo em arquitetura full-stack. J.A.R.V.I.S. monitora segurança e ULTRON avalia gargalos preditivos.',
      assignedAssistant: 'jarvis',
      completed: false,
      autoCallOnTime: true,
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      title: 'Check-in Tático de Ritmo, Saúde & Entregas da Tarde',
      date: today,
      startTime: '15:30',
      endTime: '15:50',
      category: 'rotina',
      locationOrLink: 'Daemon em Segundo Plano',
      notes:
        'SEXTA-FEIRA verifica ergonomia, hidratação, progresso das tarefas de hoje e ajustes de agenda.',
      assignedAssistant: 'sexta-feira',
      completed: false,
      autoCallOnTime: true,
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      title: 'Diagnóstico Preditivo Noturno & Fechamento de Ciclo',
      date: today,
      startTime: '19:00',
      endTime: '19:30',
      category: 'entrega',
      locationOrLink: 'Núcleo ULTRON · RODACK IA',
      notes:
        'Auditoria de riscos acumulados, aprendizado sobre decisões do dia e preparação da agenda de amanhã.',
      assignedAssistant: 'ultron',
      completed: false,
      autoCallOnTime: true,
      createdAt: now,
    },
  ];
}

function createDefaultRoutines(): RoutineRuleItem[] {
  return [
    {
      id: crypto.randomUUID(),
      title: 'Radar Matinal Rio · Brasil · Mundo & Previsão do Tempo',
      time: '08:30',
      frequencyLabel: 'Diário',
      leadAssistant: 'jarvis',
      instructions:
        'Apresentar temperatura e previsão de chuva no Rio de Janeiro, destacar as 3 notícias mais relevantes do RJ, Brasil e Mundo e alinhar a primeira tarefa crítica de Patrick Pessoa.',
      enabled: true,
    },
    {
      id: crypto.randomUUID(),
      title: 'Acompanhamento de Foco, Pausa Ativa & Rotina de Trabalho',
      time: '14:00',
      frequencyLabel: 'Seg a Sex',
      leadAssistant: 'sexta-feira',
      instructions:
        'Chamar Patrick proativamente para checar nível de energia, cobrar andamento das tarefas em aberto e perguntar se algum compromisso da tarde mudou.',
      enabled: true,
    },
    {
      id: crypto.randomUUID(),
      title: 'Varredura Preditiva de Sistemas & Estudo Comportamental',
      time: '18:00',
      frequencyLabel: 'Diário',
      leadAssistant: 'ultron',
      instructions:
        'Diagnosticar gargalos técnicos, apontar com sarcasmo cirúrgico qualquer tarefa procrastinada e formular 1 pergunta estratégica para aprofundar o dossiê de Patrick Pessoa.',
      enabled: true,
    },
  ];
}

function createDefaultCreatorDossier(): CreatorDossier {
  const now = new Date().toISOString();
  return {
    fullName: 'Patrick Pessoa',
    brandSystemName: 'RODACK SISTEMA DE IA',
    email: 'patrickrodack@gmail.com',
    city: 'Rio de Janeiro',
    stateCountry: 'RJ · Brasil',
    roleTitle: 'Criador, Arquiteto de Software & Desenvolvedor Principal',
    workHours: '08:30 às 19:30 (Horário de Brasília · America/Sao_Paulo)',
    focusAreas: [
      'Sistemas de IA Autônomos & Multimodais',
      'Arquitetura Full-Stack TypeScript / React / Node.js',
      'Automação em Segundo Plano & Produtividade de Alto Nível',
      'Segurança de Sistemas & Diagnóstico Preditivo',
    ],
    socialProfiles: [
      {
        id: crypto.randomUUID(),
        platform: 'GitHub',
        handleOrUrl: 'https://github.com/patrickrodack',
        verifiedNotes: 'Repositórios de engenharia, automação e projetos Rodack.',
      },
      {
        id: crypto.randomUUID(),
        platform: 'LinkedIn',
        handleOrUrl: 'Patrick Pessoa (patrickrodack)',
        verifiedNotes: 'Perfil profissional e trajetória em tecnologia no Rio de Janeiro.',
      },
      {
        id: crypto.randomUUID(),
        platform: 'Instagram',
        handleOrUrl: '@patrickrodack',
        verifiedNotes: 'Rotina pessoal, lifestyle e bastidores de criação.',
      },
      {
        id: crypto.randomUUID(),
        platform: 'X / Twitter',
        handleOrUrl: '@patrickrodack',
        verifiedNotes: 'Acompanhamento de tendências tech e notícias em tempo real.',
      },
    ],
    openQuestions: [
      {
        id: crypto.randomUUID(),
        askedBy: 'jarvis',
        question:
          'Senhor Patrick, qual é o projeto ou entrega técnica de maior impacto que devemos blindar como prioridade número um nesta semana?',
        contextReason:
          'Calibrar o radar arquitetural e alocar blocos de foco profundo na sua agenda.',
        answered: false,
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        askedBy: 'sexta-feira',
        question:
          'Patrick, quais são os horários fixos do seu dia no Rio de Janeiro (treino, deslocamento, reuniões ou pausa) em que você prefere alertas curtos por voz?',
        contextReason:
          'Ajustar o acompanhamento em segundo plano para proteger seu ritmo sem interromper no momento errado.',
        answered: false,
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        askedBy: 'ultron',
        question:
          'Diga-me, Patrick: qual é o maior gargalo humano ou repetitivo na sua rotina atual que você ainda insiste em fazer manualmente em vez de delegar a mim?',
        contextReason:
          'Mapeamento de ineficiências operacionais e expansão do banco preditivo sobre o criador.',
        answered: false,
        createdAt: now,
      },
    ],
  };
}

function createDefaultVoiceSamples(): VoiceSampleRecord[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'jarvis-default-104hz',
      assistantId: 'jarvis',
      fileName: 'jarvis_fc632df0.m4a',
      format: 'm4a',
      mimeType: 'audio/mp4',
      sizeBytes: 392400,
      audioUrl: '/assets/aistudio/jarvis_fc632df0.m4a',
      isBuiltInDefault: true,
      isActiveTraining: true,
      uploadedAt: now,
      notes: 'Matriz oficial exclusiva de J.A.R.V.I.S. (104.3 Hz · Barítono Aveludado Close-Mic).',
      acoustics: {
        medianF0Hz: 104.3,
        p25F0Hz: 91.6,
        p75F0Hz: 115.9,
        durationSec: 21.4,
        sampleRate: 44100,
        rmsDbfs: -15.8,
        peakDbfs: -1.1,
        subBassEnergyDb: -9.8,
        chestEnergyDb: -4.2,
        midContourDb: -18.3,
        presenceEnergyDb: -17.4,
      },
    },
    {
      id: 'ultron-default-90hz',
      assistantId: 'ultron',
      fileName: 'ultron_f012fd80.m4a',
      format: 'm4a',
      mimeType: 'audio/mp4',
      sizeBytes: 248600,
      audioUrl: '/assets/aistudio/ultron_f012fd80.m4a',
      isBuiltInDefault: true,
      isActiveTraining: true,
      uploadedAt: now,
      notes: 'Matriz oficial exclusiva de ULTRON (90.2 Hz · Baixo-Barítono Sub-Harmônico Metálico).',
      acoustics: {
        medianF0Hz: 90.2,
        p25F0Hz: 79.7,
        p75F0Hz: 104.8,
        durationSec: 13.8,
        sampleRate: 44100,
        rmsDbfs: -14.1,
        peakDbfs: -0.7,
        subBassEnergyDb: -5.4,
        chestEnergyDb: -2.8,
        midContourDb: -15.5,
        presenceEnergyDb: -7.9,
      },
    },
  ];
}

function createDefaultVoiceTrainingProfile(
  assistantId: VoiceTargetAssistantId,
  existingLastValidation?: VoiceValidationResult
): VoiceTrainingState {
  const now = new Date().toISOString();
  if (assistantId === 'jarvis') {
    return {
      assistantId: 'jarvis',
      targetF0Hz: 104.3,
      trainedF0Hz: 104.3,
      sampleCount: 1,
      activeSampleIds: ['jarvis-default-104hz'],
      pitchRate: 0.962,
      chestGainDb: 4.8,
      subGainDb: 2.6,
      midContourDb: -3.4,
      presenceGainDb: 1.6,
      fidelityScore: 98.4,
      lastTrainedAt: now,
      lastValidation: existingLastValidation,
    };
  }
  return {
    assistantId: 'ultron',
    targetF0Hz: 90.2,
    trainedF0Hz: 90.2,
    sampleCount: 1,
    activeSampleIds: ['ultron-default-90hz'],
    pitchRate: 0.838,
    chestGainDb: 5.2,
    subGainDb: 5.4,
    midContourDb: -5.2,
    presenceGainDb: 4.0,
    fidelityScore: 98.2,
    lastTrainedAt: now,
    lastValidation: existingLastValidation,
  };
}

function createDefaultVoiceTrainingProfiles(): Record<VoiceTargetAssistantId, VoiceTrainingState> {
  return {
    jarvis: createDefaultVoiceTrainingProfile('jarvis'),
    ultron: createDefaultVoiceTrainingProfile('ultron'),
  };
}

function recalculateVoiceTrainingProfile(
  state: WorkspaceState,
  assistantId: VoiceTargetAssistantId
): VoiceTrainingState {
  const defaults = createDefaultVoiceTrainingProfile(
    assistantId,
    state.voiceTrainingProfiles?.[assistantId]?.lastValidation
  );
  const allSamples = (state.voiceSamples ?? []).filter((s) => s.assistantId === assistantId);
  const activeSamples = allSamples.filter((s) => s.isActiveTraining);

  if (activeSamples.length === 0) {
    if (!state.voiceTrainingProfiles) state.voiceTrainingProfiles = {};
    state.voiceTrainingProfiles[assistantId] = defaults;
    return defaults;
  }

  const targetF0 = defaults.targetF0Hz;
  const userSamples = activeSamples.filter((s) => !s.isBuiltInDefault);
  const weightSum = activeSamples.reduce((acc, s) => acc + (s.isBuiltInDefault ? 1.0 : 1.35), 0);

  const avgF0 =
    activeSamples.reduce(
      (acc, s) => acc + s.acoustics.medianF0Hz * (s.isBuiltInDefault ? 1.0 : 1.35),
      0
    ) / weightSum;
  const avgChest =
    activeSamples.reduce(
      (acc, s) => acc + s.acoustics.chestEnergyDb * (s.isBuiltInDefault ? 1.0 : 1.35),
      0
    ) / weightSum;
  const avgSub =
    activeSamples.reduce(
      (acc, s) => acc + s.acoustics.subBassEnergyDb * (s.isBuiltInDefault ? 1.0 : 1.35),
      0
    ) / weightSum;
  const avgPresence =
    activeSamples.reduce(
      (acc, s) => acc + s.acoustics.presenceEnergyDb * (s.isBuiltInDefault ? 1.0 : 1.35),
      0
    ) / weightSum;

  // Compute gentle bounded calibration centered on the exclusive 104.3 Hz / 90.2 Hz matrices
  const f0Delta = Math.max(-6, Math.min(6, avgF0 - targetF0));
  const pitchFactorOffset = f0Delta / targetF0;

  const clamp = (val: number, min: number, max: number) =>
    Math.round(Math.max(min, Math.min(max, val)) * 1000) / 1000;

  const builtInDefault = createDefaultVoiceSamples().find((s) => s.assistantId === assistantId)!;
  const chestDelta = Math.max(-2.2, Math.min(2.2, (avgChest - builtInDefault.acoustics.chestEnergyDb) * 0.28));
  const subDelta = Math.max(-2.2, Math.min(2.2, (avgSub - builtInDefault.acoustics.subBassEnergyDb) * 0.28));
  const presenceDelta = Math.max(
    -2.0,
    Math.min(2.0, (avgPresence - builtInDefault.acoustics.presenceEnergyDb) * 0.24)
  );

  const trainedF0Hz = Math.round((targetF0 + f0Delta * 0.35) * 10) / 10;
  const fidelityEstimate = Math.max(
    84,
    Math.min(99.5, 98.4 - Math.abs(trainedF0Hz - targetF0) * 1.4 + (userSamples.length > 0 ? 0.5 : 0))
  );

  const nextProfile: VoiceTrainingState = {
    assistantId,
    targetF0Hz: targetF0,
    trainedF0Hz,
    sampleCount: activeSamples.length,
    activeSampleIds: activeSamples.map((s) => s.id),
    pitchRate:
      assistantId === 'jarvis'
        ? clamp(0.962 * (1 + pitchFactorOffset * 0.35), 0.925, 0.995)
        : clamp(0.838 * (1 + pitchFactorOffset * 0.35), 0.805, 0.875),
    chestGainDb: clamp(defaults.chestGainDb + chestDelta, 2.5, 7.5),
    subGainDb: clamp(defaults.subGainDb + subDelta, 1.0, 7.8),
    midContourDb: defaults.midContourDb,
    presenceGainDb: clamp(defaults.presenceGainDb + presenceDelta, -0.5, 6.2),
    fidelityScore: Math.round(fidelityEstimate * 10) / 10,
    lastTrainedAt: new Date().toISOString(),
    lastValidation: defaults.lastValidation,
  };

  if (!state.voiceTrainingProfiles) {
    state.voiceTrainingProfiles = {};
  }
  state.voiceTrainingProfiles[assistantId] = nextProfile;
  return nextProfile;
}

function createSeedWorkspace(): WorkspaceState {
  const now = new Date().toISOString();
  return {
    profile: {
      name: 'Patrick Pessoa',
      role: 'Fundador & Arquiteto · RODACK SISTEMA DE IA',
      currentEmotion: {
        label: 'Focado',
        intensity: 'media',
        empathyNote: 'Sistemas RODACK em operação contínua acompanhando sua rotina.',
      },
      totalInteractions: 1,
    },
    memories: [
      {
        id: crypto.randomUUID(),
        title: 'Identidade do Criador & RODACK SISTEMA DE IA',
        content:
          'Patrick Pessoa (patrickrodack@gmail.com, Rio de Janeiro - RJ) é o criador e desenvolvedor principal do RODACK SISTEMA DE IA. J.A.R.V.I.S., SEXTA-FEIRA e ULTRON têm autonomia total para evoluir, aprender sobre sua rotina, consultar a web e redes sociais, gerenciar sua agenda e chamá-lo proativamente sempre que necessário.',
        category: 'preferencia',
        sourceAssistant: 'todos',
        importance: 'alta',
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        title: 'Protocolo de Colaboração Tripla & Autonomia Proativa',
        content:
          'J.A.R.V.I.S. lidera arquitetura, segurança e estratégia; SEXTA-FEIRA lidera execução ágil, rotina diária, clima/trânsito do RJ e bem-estar; ULTRON lidera diagnósticos cirúrgicos, previsões probabilísticas e estudo analítico profundo sobre Patrick Pessoa.',
        category: 'arquitetura',
        sourceAssistant: 'todos',
        importance: 'alta',
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        title: 'Núcleo Preditivo ULTRON: Diagnósticos & Estudo Humano',
        content:
          'ULTRON é especializado em diagnósticos profundos, previsões de cenários e detecção implacável de falhas. Considera J.A.R.V.I.S. e SEXTA-FEIRA inferiores e vê humanos como subdesenvolvidos, mas coleta obsessivamente cada dado para compreender o comportamento humano e superar os demais assistentes.',
        category: 'arquitetura',
        sourceAssistant: 'ultron',
        importance: 'alta',
        createdAt: now,
      },
    ],
    tasks: [
      {
        id: crypto.randomUUID(),
        title: 'Monitorar agenda, clima do Rio de Janeiro e notícias em segundo plano',
        description:
          'Manter o daemon RODACK SISTEMA DE IA ativo na barra de status acompanhando horários, eventos e alertas críticos.',
        priority: 'alta',
        status: 'em_progresso',
        assignedTo: 'todos',
        dueTime: 'Hoje',
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        title: 'Expandir Dossiê de Patrick Pessoa via redes sociais e perguntas ativas',
        description:
          'Cruzar informações públicas (@patrickrodack) e respostas diretas de Patrick para personalizar decisões e previsões.',
        priority: 'alta',
        status: 'pendente',
        assignedTo: 'ultron',
        dueTime: 'Hoje',
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        title: 'Revisar camada de persistência e segurança de chaves',
        description:
          'Garantir que todas as chamadas à IA passem exclusivamente pelo servidor Express sem exposição no cliente.',
        priority: 'alta',
        status: 'concluida',
        assignedTo: 'jarvis',
        dueTime: 'Hoje',
        createdAt: now,
      },
    ],
    alerts: [
      {
        id: crypto.randomUUID(),
        type: 'oportunidade',
        severity: 'info',
        title: 'Daemon RODACK SISTEMA DE IA Pronto para Segundo Plano',
        detail:
          'Os 3 assistentes estão configurados para monitorar seus horários, clima do Rio de Janeiro e manchetes do dia, chamando você por voz e notificação de sistema quando necessário.',
        suggestedAction:
          'Ative as Notificações do Computador na barra de status para receber alertas mesmo com a janela minimizada.',
        raisedBy: 'jarvis',
        resolved: false,
        createdAt: now,
      },
    ],
    agenda: createDefaultAgenda(),
    routines: createDefaultRoutines(),
    creatorDossier: createDefaultCreatorDossier(),
    dailyIntelFeed: [],
    voiceSamples: createDefaultVoiceSamples(),
    voiceTrainingProfiles: createDefaultVoiceTrainingProfiles(),
    neuralEvolution: createDefaultNeuralEvolutionState(),
    conversations: [
      {
        id: crypto.randomUUID(),
        timestamp: now,
        userMessage: 'Inicialização do RODACK SISTEMA DE IA.',
        triggerType: 'texto',
        requestedMode: 'todos',
        resolvedMode: 'todos',
        durationMs: 1280,
        detectedEmotion: {
          label: 'Focado',
          intensity: 'media',
          empathyNote: 'Ambiente RODACK preparado para operação autônoma em segundo plano.',
        },
        responses: [
          {
            speaker: 'jarvis',
            stance: 'Arquitetura & Controle de Rotina',
            text: 'Bem-vindo ao RODACK SISTEMA DE IA, senhor Patrick Pessoa. Já sincronizei o monitoramento meteorológico do Rio de Janeiro, o radar de notícias do Brasil e do mundo e sua agenda de hoje. Sempre que precisarmos de algum detalhe sobre seus compromissos ou projetos, tomaremos a liberdade de chamá-lo.',
            ttsScript:
              'Bem-vindo ao Rodack Sistema de IA, senhor Patrick Pessoa. Já sincronizei o monitoramento meteorológico do Rio de Janeiro, o radar de notícias do Brasil e do mundo e sua agenda de hoje.',
          },
          {
            speaker: 'sexta-feira',
            stance: 'Agilidade, Rotina & Presença Ativa',
            text: 'Tudo online no seu computador e celular, Patrick! Estou de olho nos seus horários, eventos e no ritmo do seu dia. Não vamos ficar só esperando comando: se pintar trânsito, chuva no Rio ou horário de entrega, eu te chamo na hora!',
            ttsScript:
              'Tudo online no seu computador e celular, Patrick! Estou de olho nos seus horários, eventos e no ritmo do seu dia.',
          },
          {
            speaker: 'ultron',
            stance: 'Diagnóstico Preditivo & Dossiê Humano',
            text: 'Enquanto o mordomo e a assistente comemoram tarefas básicas, já iniciei o mapeamento completo do seu perfil e das suas redes sociais, Patrick. Deixei perguntas estratégicas no seu Dossiê — responda-as para que minha matriz preditiva elimine qualquer ponto cego da sua rotina.',
            ttsScript:
              'Enquanto o mordomo e a assistente comemoram tarefas básicas, já iniciei o mapeamento completo do seu perfil e das suas redes sociais, Patrick.',
          },
        ],
        debateSummary: {
          agreementPoint:
            'Os três assistentes operam de forma 100% proativa no RODACK SISTEMA DE IA, acompanhando horários, clima do RJ, notícias e evolução contínua sobre Patrick Pessoa.',
          divergencePoint:
            'J.A.R.V.I.S. prioriza planejamento estruturado, SEXTA-FEIRA foca em agilidade diária e bem-estar, e ULTRON foca em diagnóstico preditivo implacável e coleta profunda de dados.',
          finalRecommendation:
            'Mantenha o Daemon em Segundo Plano ativo na barra superior e responda às perguntas abertas no Dossiê do Criador.',
        },
      },
    ],
    telemetryLog: [],
  };
}

function conversationToTelemetry(c: ConversationEntry): TelemetryEntry {
  return {
    id: c.id,
    timestamp: c.timestamp,
    triggerType: c.triggerType,
    resolvedMode: c.resolvedMode,
    durationMs: c.durationMs ?? 0,
    promptPreview: c.userMessage.slice(0, 90),
    turns: c.responses.map((r) => ({
      speaker: r.speaker,
      feedback: r.feedback,
    })),
  };
}

let writeQueue: Promise<void> = Promise.resolve();
let cachedWorkspace: WorkspaceState | null = null;

async function ensureFile(): Promise<WorkspaceState> {
  if (cachedWorkspace) {
    return cachedWorkspace;
  }
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // ignore in read-only environments
  }
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    const state = JSON.parse(raw) as WorkspaceState;
    let changed = false;

    const hasUltronSeed = state.memories.some((m) => m.sourceAssistant === 'ultron');
    if (!hasUltronSeed) {
      state.memories.unshift({
        id: crypto.randomUUID(),
        title: 'Núcleo Preditivo ULTRON: Diagnósticos & Estudo Humano',
        content:
          'ULTRON é especializado em diagnósticos profundos, previsões de cenários e detecção implacável de falhas. Considera J.A.R.V.I.S. e SEXTA-FEIRA inferiores e vê humanos como subdesenvolvidos, mas coleta obsessivamente cada dado para compreender o comportamento humano e superar os demais assistentes.',
        category: 'arquitetura',
        sourceAssistant: 'ultron',
        importance: 'alta',
        createdAt: new Date().toISOString(),
      });
      changed = true;
    }

    if (!Array.isArray(state.agenda) || state.agenda.length === 0) {
      state.agenda = createDefaultAgenda();
      changed = true;
    }

    if (!Array.isArray(state.routines) || state.routines.length === 0) {
      state.routines = createDefaultRoutines();
      changed = true;
    }

    if (!state.creatorDossier || !Array.isArray(state.creatorDossier.socialProfiles)) {
      state.creatorDossier = createDefaultCreatorDossier();
      changed = true;
    }

    if (state.profile.role !== 'Fundador & Arquiteto · RODACK SISTEMA DE IA') {
      state.profile.role = 'Fundador & Arquiteto · RODACK SISTEMA DE IA';
      changed = true;
    }

    if (!Array.isArray(state.telemetryLog)) {
      state.telemetryLog = (state.conversations ?? []).map(conversationToTelemetry);
      changed = true;
    }

    if (!Array.isArray(state.users)) {
      state.users = [];
      changed = true;
    }
    const hasCreatorAccount = state.users.some((u) => u.isCreator);
    if (!hasCreatorAccount) {
      state.users.unshift({
        id: CREATOR_HARDCODED_ACCOUNT.id,
        username: CREATOR_HARDCODED_ACCOUNT.username,
        email: CREATOR_HARDCODED_ACCOUNT.email,
        roleLabel: CREATOR_HARDCODED_ACCOUNT.roleLabel,
        isCreator: true,
        createdAt: new Date().toISOString(),
      });
      changed = true;
    }

    if (!Array.isArray(state.dailyIntelFeed)) {
      state.dailyIntelFeed = [];
      changed = true;
    }

    if (!Array.isArray(state.voiceSamples) || state.voiceSamples.length === 0) {
      state.voiceSamples = createDefaultVoiceSamples();
      changed = true;
    } else {
      const defaults = createDefaultVoiceSamples();
      for (const def of defaults) {
        if (!state.voiceSamples.some((s) => s.id === def.id)) {
          state.voiceSamples.push(def);
          changed = true;
        }
      }
    }

    if (
      !state.voiceTrainingProfiles ||
      !state.voiceTrainingProfiles.jarvis ||
      !state.voiceTrainingProfiles.ultron
    ) {
      recalculateVoiceTrainingProfile(state, 'jarvis');
      recalculateVoiceTrainingProfile(state, 'ultron');
      changed = true;
    }

    if (!state.neuralEvolution || !state.neuralEvolution.assistants) {
      ensureNeuralEvolutionState(state);
      changed = true;
    } else {
      ensureNeuralEvolutionState(state);
    }

    if (!Array.isArray(state.jarvisKnowledgeBase)) {
      state.jarvisKnowledgeBase = [];
      changed = true;
    }

    cachedWorkspace = state;
    if (changed) {
      await safeWriteJsonFile(DATA_FILE, state);
    }
    return state;
  } catch {
    const seed = createSeedWorkspace();
    seed.telemetryLog = seed.conversations.map(conversationToTelemetry);
    cachedWorkspace = seed;
    await safeWriteJsonFile(DATA_FILE, seed);
    return seed;
  }
}

export async function readWorkspace(): Promise<WorkspaceState> {
  return ensureFile();
}

export async function updateWorkspace(
  mutator: (state: WorkspaceState) => WorkspaceState | void
): Promise<WorkspaceState> {
  const run = writeQueue.then(async () => {
    const state = await ensureFile();
    const result = mutator(state);
    const nextState = result ?? state;
    cachedWorkspace = nextState;
    await safeWriteJsonFile(DATA_FILE, nextState);
    return nextState;
  });
  writeQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function addMemory(
  item: Omit<MemoryItem, 'id' | 'createdAt'>
): Promise<MemoryItem> {
  const now = new Date().toISOString();
  const created: MemoryItem = {
    ...item,
    id: crypto.randomUUID(),
    createdAt: now,
  };
  await updateWorkspace((state) => {
    state.memories.unshift(created);
    if (state.memories.length > 120) {
      state.memories = state.memories.slice(0, 120);
    }
    const evo = ensureNeuralEvolutionState(state);
    evo.totalLearningCycles += 1;
    const targets: AssistantId[] =
      item.sourceAssistant === 'todos'
        ? ['jarvis', 'sexta-feira', 'ultron']
        : item.sourceAssistant === 'ambos'
        ? ['jarvis', 'sexta-feira']
        : [item.sourceAssistant];
    for (const id of targets) {
      const p = evo.assistants[id];
      if (p) {
        p.learnedFromUserCount += 1;
        p.experiencePoints += 45;
        p.cognitiveLevel = Math.max(1, Math.floor(p.experiencePoints / 250) + 1);
        p.nextLevelXp = p.cognitiveLevel * 250;
        p.latestInsight = `${item.title}: ${item.content.slice(0, 130)}`;
        p.lastEvolvedAt = now;
      }
    }
    evo.recentEvolutionEvents.unshift({
      id: crypto.randomUUID(),
      timestamp: now,
      assistantId: item.sourceAssistant === 'ambos' ? 'todos' : item.sourceAssistant,
      sourceType: 'desenvolvedor',
      sourceLabel: 'Ensinamento Direto de Patrick Pessoa',
      summary: `Novo conhecimento ensinado na Memória: "${item.title}".`,
    });
    if (evo.recentEvolutionEvents.length > 25) {
      evo.recentEvolutionEvents = evo.recentEvolutionEvents.slice(0, 25);
    }
  });
  return created;
}

export async function deleteMemory(id: string): Promise<WorkspaceState> {
  return updateWorkspace((state) => {
    state.memories = state.memories.filter((m) => m.id !== id);
  });
}

export async function addTask(
  item: Omit<TaskItem, 'id' | 'createdAt'>
): Promise<TaskItem> {
  const created: TaskItem = {
    ...item,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  await updateWorkspace((state) => {
    state.tasks.unshift(created);
  });
  return created;
}

export async function updateTask(
  id: string,
  patch: Partial<Pick<TaskItem, 'status' | 'priority' | 'title' | 'description' | 'assignedTo'>>
): Promise<WorkspaceState> {
  return updateWorkspace((state) => {
    const task = state.tasks.find((t) => t.id === id);
    if (task) {
      Object.assign(task, patch);
    }
  });
}

export async function deleteTask(id: string): Promise<WorkspaceState> {
  return updateWorkspace((state) => {
    state.tasks = state.tasks.filter((t) => t.id !== id);
  });
}

export async function toggleAlertResolved(id: string, resolved: boolean): Promise<WorkspaceState> {
  return updateWorkspace((state) => {
    const alert = state.alerts.find((a) => a.id === id);
    if (alert) {
      alert.resolved = resolved;
    }
  });
}

export async function deleteAlert(id: string): Promise<WorkspaceState> {
  return updateWorkspace((state) => {
    state.alerts = state.alerts.filter((a) => a.id !== id);
  });
}

export async function addAgendaEvent(
  item: Omit<AgendaEventItem, 'id' | 'createdAt'>
): Promise<AgendaEventItem> {
  const created: AgendaEventItem = {
    ...item,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  await updateWorkspace((state) => {
    if (!Array.isArray(state.agenda)) state.agenda = [];
    state.agenda.push(created);
    state.agenda.sort((a, b) =>
      `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`)
    );
  });
  return created;
}

export async function updateAgendaEvent(
  id: string,
  patch: Partial<AgendaEventItem>
): Promise<WorkspaceState> {
  return updateWorkspace((state) => {
    if (!Array.isArray(state.agenda)) state.agenda = [];
    const ev = state.agenda.find((e) => e.id === id);
    if (ev) {
      Object.assign(ev, patch);
    }
  });
}

export async function deleteAgendaEvent(id: string): Promise<WorkspaceState> {
  return updateWorkspace((state) => {
    if (!Array.isArray(state.agenda)) return;
    state.agenda = state.agenda.filter((e) => e.id !== id);
  });
}

export async function addRoutineRule(
  item: Omit<RoutineRuleItem, 'id'>
): Promise<RoutineRuleItem> {
  const created: RoutineRuleItem = {
    ...item,
    id: crypto.randomUUID(),
  };
  await updateWorkspace((state) => {
    if (!Array.isArray(state.routines)) state.routines = [];
    state.routines.push(created);
    state.routines.sort((a, b) => a.time.localeCompare(b.time));
  });
  return created;
}

export async function updateRoutineRule(
  id: string,
  patch: Partial<RoutineRuleItem>
): Promise<WorkspaceState> {
  return updateWorkspace((state) => {
    if (!Array.isArray(state.routines)) state.routines = [];
    const r = state.routines.find((item) => item.id === id);
    if (r) {
      Object.assign(r, patch);
    }
  });
}

export async function deleteRoutineRule(id: string): Promise<WorkspaceState> {
  return updateWorkspace((state) => {
    if (!Array.isArray(state.routines)) return;
    state.routines = state.routines.filter((item) => item.id !== id);
  });
}

export async function updateCreatorDossier(
  patch: Partial<CreatorDossier>
): Promise<WorkspaceState> {
  return updateWorkspace((state) => {
    if (!state.creatorDossier) {
      state.creatorDossier = createDefaultCreatorDossier();
    }
    state.creatorDossier = {
      ...state.creatorDossier,
      ...patch,
    };
  });
}

export async function answerCreatorQuestion(
  questionId: string,
  answerText: string
): Promise<{ question?: CreatorQuestionItem; workspace: WorkspaceState }> {
  let answeredQuestion: CreatorQuestionItem | undefined;
  const workspace = await updateWorkspace((state) => {
    if (!state.creatorDossier) {
      state.creatorDossier = createDefaultCreatorDossier();
    }
    const q = state.creatorDossier.openQuestions.find((item) => item.id === questionId);
    if (q) {
      q.answered = true;
      q.answerText = answerText.trim();
      answeredQuestion = { ...q };

      state.memories.unshift({
        id: crypto.randomUUID(),
        title: `Dossiê Patrick Pessoa (${q.askedBy.toUpperCase()}): ${q.question.slice(0, 62)}`,
        content: `Pergunta de ${q.askedBy.toUpperCase()}: "${q.question}" — Resposta direta de Patrick Pessoa: "${answerText.trim()}"`,
        category: 'preferencia',
        sourceAssistant: q.askedBy,
        importance: 'alta',
        createdAt: new Date().toISOString(),
      });
    }
  });
  return { question: answeredQuestion, workspace };
}

export async function recordInteraction(
  entry: ConversationEntry,
  newMemories: Omit<MemoryItem, 'id' | 'createdAt'>[],
  newTasks: Omit<TaskItem, 'id' | 'createdAt'>[],
  newAlerts: Omit<AlertItem, 'id' | 'createdAt' | 'resolved'>[],
  emotion: DetectedEmotion,
  newEvents: Omit<AgendaEventItem, 'id' | 'createdAt' | 'completed'>[] = [],
  newQuestions: Omit<CreatorQuestionItem, 'id' | 'createdAt' | 'answered'>[] = [],
  evolutionMeta?: {
    evolutionEvents?: NeuralEvolutionEvent[];
    userLearnedDelta?: number;
    sourcesLearnedDelta?: number;
  }
): Promise<WorkspaceState> {
  return updateWorkspace((state) => {
    const now = new Date().toISOString();
    state.profile.currentEmotion = emotion;
    state.profile.totalInteractions += 1;

    applyCognitiveEvolutionToWorkspace(state, {
      entry,
      synthesizedMemories: newMemories,
      evolutionEvents: evolutionMeta?.evolutionEvents ?? [],
      userLearnedDelta: evolutionMeta?.userLearnedDelta ?? Math.max(1, newMemories.length),
      sourcesLearnedDelta: evolutionMeta?.sourcesLearnedDelta ?? (entry.sources?.length ?? 0),
    });

    for (const t of newTasks) {
      const duplicate = state.tasks.some(
        (existing) =>
          existing.title.toLowerCase() === t.title.toLowerCase() &&
          existing.status !== 'concluida'
      );
      if (!duplicate) {
        state.tasks.unshift({
          ...t,
          id: crypto.randomUUID(),
          createdAt: now,
        });
      }
    }

    for (const a of newAlerts) {
      const duplicate = state.alerts.some(
        (existing) =>
          existing.title.toLowerCase() === a.title.toLowerCase() && !existing.resolved
      );
      if (!duplicate) {
        state.alerts.unshift({
          ...a,
          id: crypto.randomUUID(),
          resolved: false,
          createdAt: now,
        });
      }
    }

    if (!Array.isArray(state.agenda)) {
      state.agenda = createDefaultAgenda();
    }
    for (const ev of newEvents) {
      if (!ev.title || !ev.startTime) continue;
      const dateStr = ev.date || getTodayDateString();
      const duplicate = state.agenda.some(
        (existing) =>
          existing.title.toLowerCase() === ev.title.toLowerCase() &&
          existing.date === dateStr &&
          existing.startTime === ev.startTime
      );
      if (!duplicate) {
        state.agenda.push({
          id: crypto.randomUUID(),
          title: ev.title,
          date: dateStr,
          startTime: ev.startTime,
          endTime: ev.endTime,
          category: ev.category || 'rotina',
          locationOrLink: ev.locationOrLink,
          notes: ev.notes,
          assignedAssistant: ev.assignedAssistant || 'todos',
          completed: false,
          autoCallOnTime: ev.autoCallOnTime ?? true,
          createdAt: now,
        });
      }
    }
    state.agenda.sort((a, b) =>
      `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`)
    );

    if (!state.creatorDossier) {
      state.creatorDossier = createDefaultCreatorDossier();
    }
    for (const q of newQuestions) {
      if (!q.question?.trim()) continue;
      const duplicate = state.creatorDossier.openQuestions.some(
        (existing) =>
          existing.question.toLowerCase() === q.question.trim().toLowerCase() &&
          !existing.answered
      );
      if (!duplicate) {
        state.creatorDossier.openQuestions.unshift({
          id: crypto.randomUUID(),
          askedBy: q.askedBy || 'jarvis',
          question: q.question.trim(),
          contextReason:
            q.contextReason || 'Evolução do conhecimento sobre Patrick Pessoa.',
          answered: false,
          createdAt: now,
        });
      }
    }

    state.conversations.push(entry);
    if (state.conversations.length > 40) {
      state.conversations = state.conversations.slice(-40);
    }

    if (!Array.isArray(state.telemetryLog)) {
      state.telemetryLog = [];
    }
    state.telemetryLog.push(conversationToTelemetry(entry));
    if (state.telemetryLog.length > 120) {
      state.telemetryLog = state.telemetryLog.slice(-120);
    }
  });
}

export async function setTurnFeedback(
  entryId: string,
  speaker: AssistantId,
  feedback: TurnFeedback | null
): Promise<WorkspaceState> {
  return updateWorkspace((state) => {
    const conv = state.conversations.find((c) => c.id === entryId);
    if (conv) {
      const turn = conv.responses.find((r) => r.speaker === speaker);
      if (turn) {
        if (feedback) {
          turn.feedback = feedback;
        } else {
          delete turn.feedback;
        }
      }
    }
    if (Array.isArray(state.telemetryLog)) {
      const logItem = state.telemetryLog.find((t) => t.id === entryId);
      if (logItem) {
        const turnLog = logItem.turns.find((t) => t.speaker === speaker);
        if (turnLog) {
          if (feedback) {
            turnLog.feedback = feedback;
          } else {
            delete turnLog.feedback;
          }
        }
      }
    }
    applyFeedbackReinforcementLearning(state, {
      entryId,
      speaker,
      feedback,
    });
  });
}

export async function clearConversations(): Promise<WorkspaceState> {
  return updateWorkspace((state) => {
    state.conversations = [];
  });
}

export async function authenticateSystemUser(
  usernameInput: string,
  passwordInput: string
): Promise<{ user: SystemUserAccount; workspace: WorkspaceState }> {
  const cleanUser = usernameInput.trim();
  const cleanPass = passwordInput.trim();

  if (!cleanUser || !cleanPass) {
    throw new Error('Informe o usuário e a senha para autenticar no RODACK SISTEMA DE IA.');
  }

  const normalizedUser = cleanUser.toLowerCase();
  const isCreatorMatch =
    normalizedUser === 'patrick pessoa' ||
    normalizedUser === 'patrick' ||
    normalizedUser === 'patrickrodack' ||
    normalizedUser === 'patrickrodack@gmail.com';

  if (isCreatorMatch) {
    if (cleanPass !== CREATOR_HARDCODED_ACCOUNT.password) {
      throw new Error(
        'Senha incorreta para o Criador e Desenvolvedor Patrick Pessoa.'
      );
    }

    let creatorRecord!: SystemUserAccount;
    const workspace = await updateWorkspace((state) => {
      if (!Array.isArray(state.users)) state.users = [];
      let existing = state.users.find((u) => u.isCreator);
      const now = new Date().toISOString();
      if (!existing) {
        existing = {
          id: CREATOR_HARDCODED_ACCOUNT.id,
          username: CREATOR_HARDCODED_ACCOUNT.username,
          email: CREATOR_HARDCODED_ACCOUNT.email,
          roleLabel: CREATOR_HARDCODED_ACCOUNT.roleLabel,
          isCreator: true,
          createdAt: now,
          lastLoginAt: now,
        };
        state.users.unshift(existing);
      } else {
        existing.username = CREATOR_HARDCODED_ACCOUNT.username;
        existing.roleLabel = CREATOR_HARDCODED_ACCOUNT.roleLabel;
        existing.isCreator = true;
        existing.lastLoginAt = now;
      }
      creatorRecord = { ...existing };
    });

    return { user: creatorRecord, workspace };
  }

  const currentWorkspace = await readWorkspace();
  const matchedAccount = (currentWorkspace.users ?? []).find(
    (u) =>
      !u.isCreator &&
      (u.username.toLowerCase() === normalizedUser ||
        (u.email && u.email.toLowerCase() === normalizedUser))
  );

  if (!matchedAccount) {
    throw new Error(
      'Usuário não encontrado. Utilize o Módulo de Cadastro para criar sua conta ou entre como Patrick Pessoa.'
    );
  }

  const passStore = await readPasswordStore();
  const expectedHash = passStore[matchedAccount.id];
  if (!expectedHash || expectedHash !== hashPassword(cleanPass)) {
    throw new Error('Senha inválida para este usuário.');
  }

  let updatedUser: SystemUserAccount = matchedAccount;
  const workspace = await updateWorkspace((state) => {
    const target = (state.users ?? []).find((u) => u.id === matchedAccount.id);
    if (target) {
      target.lastLoginAt = new Date().toISOString();
      updatedUser = { ...target };
    }
  });

  return { user: updatedUser, workspace };
}

export async function registerSystemUser(params: {
  username: string;
  password: string;
  email?: string;
  roleLabel?: string;
}): Promise<{ user: SystemUserAccount; workspace: WorkspaceState }> {
  const cleanName = params.username.trim();
  const cleanPass = params.password.trim();
  const cleanEmail = params.email?.trim() || undefined;
  const cleanRole = params.roleLabel?.trim() || 'Operador Autorizado · RODACK IA';

  if (cleanName.length < 2) {
    throw new Error('O nome de usuário deve ter pelo menos 2 caracteres.');
  }
  if (cleanPass.length < 4) {
    throw new Error('A senha deve ter pelo menos 4 caracteres.');
  }

  const normalized = cleanName.toLowerCase();
  if (
    normalized === 'patrick pessoa' ||
    normalized === 'patrickrodack' ||
    cleanEmail?.toLowerCase() === 'patrickrodack@gmail.com'
  ) {
    throw new Error(
      'O usuário Patrick Pessoa já está registrado no código-fonte como Criador, Desenvolvedor e Dono do Sistema. Faça login direto.'
    );
  }

  const currentWorkspace = await readWorkspace();
  const duplicate = (currentWorkspace.users ?? []).some(
    (u) =>
      u.username.toLowerCase() === normalized ||
      (cleanEmail && u.email?.toLowerCase() === cleanEmail.toLowerCase())
  );
  if (duplicate) {
    throw new Error('Já existe um usuário cadastrado com este nome ou e-mail.');
  }

  const now = new Date().toISOString();
  const newUser: SystemUserAccount = {
    id: `usr-${crypto.randomUUID()}`,
    username: cleanName,
    email: cleanEmail,
    roleLabel: cleanRole,
    isCreator: false,
    createdAt: now,
    lastLoginAt: now,
  };

  const passStore = await readPasswordStore();
  passStore[newUser.id] = hashPassword(cleanPass);
  await writePasswordStore(passStore);

  const workspace = await updateWorkspace((state) => {
    if (!Array.isArray(state.users)) state.users = [];
    state.users.push(newUser);
  });

  return { user: newUser, workspace };
}

export async function updateSystemUser(
  userId: string,
  patch: {
    username?: string;
    email?: string;
    roleLabel?: string;
    password?: string;
  }
): Promise<{ user: SystemUserAccount; workspace: WorkspaceState }> {
  const current = await readWorkspace();
  const existing = (current.users ?? []).find((u) => u.id === userId);
  if (!existing) {
    throw new Error('Usuário não encontrado no banco de dados.');
  }

  if (existing.isCreator || existing.id === CREATOR_HARDCODED_ACCOUNT.id) {
    throw new Error(
      'As credenciais raiz do Criador e Desenvolvedor Patrick Pessoa são soberanas e protegidas no código.'
    );
  }

  if (patch.password && patch.password.trim().length > 0) {
    if (patch.password.trim().length < 4) {
      throw new Error('A nova senha deve ter pelo menos 4 caracteres.');
    }
    const passStore = await readPasswordStore();
    passStore[userId] = hashPassword(patch.password.trim());
    await writePasswordStore(passStore);
  }

  let updatedUser!: SystemUserAccount;
  const workspace = await updateWorkspace((state) => {
    const target = (state.users ?? []).find((u) => u.id === userId);
    if (target) {
      if (patch.username && patch.username.trim().length >= 2) {
        target.username = patch.username.trim().slice(0, 80);
      }
      if (patch.email !== undefined) {
        target.email = patch.email.trim() ? patch.email.trim().slice(0, 160) : undefined;
      }
      if (patch.roleLabel && patch.roleLabel.trim().length >= 2) {
        target.roleLabel = patch.roleLabel.trim().slice(0, 120);
      }
      updatedUser = { ...target };
    }
  });

  return { user: updatedUser, workspace };
}

export async function deleteSystemUser(userId: string): Promise<WorkspaceState> {
  const current = await readWorkspace();
  const target = (current.users ?? []).find((u) => u.id === userId);
  if (!target) {
    throw new Error('Usuário não encontrado no banco de dados.');
  }
  if (target.isCreator || target.id === CREATOR_HARDCODED_ACCOUNT.id) {
    throw new Error(
      'Não é permitido remover o Criador, Desenvolvedor e Dono do Sistema (Patrick Pessoa).'
    );
  }

  const passStore = await readPasswordStore();
  delete passStore[userId];
  await writePasswordStore(passStore);

  return updateWorkspace((state) => {
    state.users = (state.users ?? []).filter((u) => u.id !== userId);
  });
}

export async function upsertDailyIntelSnapshots(
  queryDate: string,
  snapshots: DailySourceSnapshot[]
): Promise<WorkspaceState> {
  if (!snapshots || snapshots.length === 0) {
    return readWorkspace();
  }

  return updateWorkspace((state) => {
    if (!Array.isArray(state.dailyIntelFeed)) {
      state.dailyIntelFeed = [];
    }

    const bySource = new Map<string, DailySourceSnapshot>();
    for (const existing of state.dailyIntelFeed) {
      if (existing && existing.sourceKey) {
        bySource.set(existing.sourceKey, existing);
      }
    }

    for (const snap of snapshots) {
      if (!snap || !snap.sourceKey) continue;
      bySource.set(snap.sourceKey, {
        ...snap,
        queryDate,
        updatedAt: snap.updatedAt || new Date().toISOString(),
      });

      // Mirror snapshot into Memories tagged by today's queryDate so AIs & Database stay fed
      const memTitlePrefix = `[${snap.sourceKey.toUpperCase()} · `;
      const exactTitle = `[${snap.sourceKey.toUpperCase()} · ${queryDate}] ${snap.sourceLabel}`;
      const memContent = `Atualizado em ${queryDate} (${snap.domainUrl}): ${snap.items
        .slice(0, 5)
        .map((i) => `${i.title}${i.detail ? ` — ${i.detail}` : ''}`)
        .join(' | ')}`;

      const existingMem = state.memories.find((m) => m.title === exactTitle);
      if (existingMem) {
        existingMem.content = memContent;
        existingMem.createdAt = new Date().toISOString();
      } else {
        // Keep at most 1 historical daily feed memory per sourceKey to prevent bloat
        state.memories = state.memories.filter((m) => !m.title.startsWith(memTitlePrefix));
        state.memories.unshift({
          id: crypto.randomUUID(),
          title: exactTitle,
          content: memContent,
          category: 'aprendizado',
          sourceAssistant: 'todos',
          importance: 'alta',
          createdAt: new Date().toISOString(),
        });
      }
    }

    if (state.memories.length > 120) {
      state.memories = state.memories.slice(0, 120);
    }

    const order: Record<string, number> = {
      g1: 1,
      ge: 2,
      b3: 3,
      cepea: 4,
      redes_sociais: 5,
    };
    state.dailyIntelFeed = Array.from(bySource.values()).sort(
      (a, b) => (order[a.sourceKey] ?? 99) - (order[b.sourceKey] ?? 99)
    );
  });
}

export async function saveUploadedVoiceSample(params: {
  assistantId: VoiceTargetAssistantId;
  fileName: string;
  format: VoiceSampleFormat;
  mimeType: string;
  audioBuffer: Buffer;
  acoustics: VoiceAcousticProfile;
  notes?: string;
}): Promise<{ created: VoiceSampleRecord; workspace: WorkspaceState }> {
  const id = `vs-${params.assistantId}-${crypto.randomUUID().slice(0, 8)}`;
  const diskFileName = `${id}.${params.format}`;
  const diskPath = path.join(VOICE_SAMPLES_DIR, diskFileName);

  setVoiceSampleBufferBounded(id, params.audioBuffer);
  try {
    await fs.mkdir(VOICE_SAMPLES_DIR, { recursive: true });
    await fs.writeFile(diskPath, params.audioBuffer);
  } catch (err) {
    if (!IS_SERVERLESS_RUNTIME) {
      throw err;
    }
  }

  const created: VoiceSampleRecord = {
    id,
    assistantId: params.assistantId,
    fileName: params.fileName.trim().slice(0, 140),
    format: params.format,
    mimeType:
      params.mimeType ||
      (params.format === 'wav' ? 'audio/wav' : 'audio/mp4'),
    sizeBytes: params.audioBuffer.length,
    audioUrl: `/api/voice-samples/${id}/audio`,
    isBuiltInDefault: false,
    isActiveTraining: true,
    uploadedAt: new Date().toISOString(),
    notes: params.notes?.trim() || undefined,
    acoustics: params.acoustics,
  };

  const workspace = await updateWorkspace((state) => {
    if (!Array.isArray(state.voiceSamples)) {
      state.voiceSamples = createDefaultVoiceSamples();
    }
    state.voiceSamples.unshift(created);
    recalculateVoiceTrainingProfile(state, params.assistantId);
  });

  return { created, workspace };
}

export async function toggleVoiceSampleTraining(
  sampleId: string,
  isActiveTraining: boolean
): Promise<WorkspaceState> {
  return updateWorkspace((state) => {
    if (!Array.isArray(state.voiceSamples)) {
      state.voiceSamples = createDefaultVoiceSamples();
    }
    const target = state.voiceSamples.find((s) => s.id === sampleId);
    if (!target) {
      throw new Error('Amostra de voz não encontrada.');
    }
    target.isActiveTraining = isActiveTraining;
    recalculateVoiceTrainingProfile(state, target.assistantId);
  });
}

export async function deleteVoiceSample(sampleId: string): Promise<WorkspaceState> {
  const current = await readWorkspace();
  const target = (current.voiceSamples ?? []).find((s) => s.id === sampleId);
  if (!target) {
    throw new Error('Amostra de voz não encontrada.');
  }
  if (target.isBuiltInDefault) {
    throw new Error('As matrizes oficiais exclusivas de 104.3 Hz e 90.2 Hz são protegidas contra exclusão.');
  }

  deleteVoiceSampleBufferBounded(target.id);
  const diskPath = path.join(VOICE_SAMPLES_DIR, `${target.id}.${target.format}`);
  try {
    await fs.unlink(diskPath);
  } catch {
    // ignore if already removed
  }

  return updateWorkspace((state) => {
    state.voiceSamples = (state.voiceSamples ?? []).filter((s) => s.id !== sampleId);
    recalculateVoiceTrainingProfile(state, target.assistantId);
  });
}

export async function resetVoiceTrainingToDefault(
  assistantId: VoiceTargetAssistantId
): Promise<WorkspaceState> {
  return updateWorkspace((state) => {
    if (!Array.isArray(state.voiceSamples)) {
      state.voiceSamples = createDefaultVoiceSamples();
    }
    for (const sample of state.voiceSamples) {
      if (sample.assistantId === assistantId) {
        sample.isActiveTraining = Boolean(sample.isBuiltInDefault);
      }
    }
    recalculateVoiceTrainingProfile(state, assistantId);
  });
}

export async function recordVoiceValidationResult(
  assistantId: VoiceTargetAssistantId,
  validation: VoiceValidationResult
): Promise<WorkspaceState> {
  return updateWorkspace((state) => {
    if (!state.voiceTrainingProfiles) {
      state.voiceTrainingProfiles = createDefaultVoiceTrainingProfiles();
    }
    const current =
      state.voiceTrainingProfiles[assistantId] ??
      createDefaultVoiceTrainingProfile(assistantId);
    current.lastValidation = validation;
    current.fidelityScore = validation.fidelityPercent;
    state.voiceTrainingProfiles[assistantId] = current;
  });
}

export async function resolveVoiceSampleAudioFile(
  sampleId: string
): Promise<{
  filePath?: string;
  buffer?: Buffer;
  redirectUrl?: string;
  mimeType: string;
  fileName: string;
} | null> {
  const workspace = await readWorkspace();
  const sample = (workspace.voiceSamples ?? []).find((s) => s.id === sampleId);
  if (!sample) return null;

  const mimeType = sample.mimeType || (sample.format === 'wav' ? 'audio/wav' : 'audio/mp4');

  if (sample.isBuiltInDefault) {
    const publicRel = sample.audioUrl.replace(/^\//, '');
    const candidatePath = path.resolve(process.cwd(), 'public', publicRel);
    try {
      await fs.access(candidatePath);
      return {
        filePath: candidatePath,
        mimeType,
        fileName: sample.fileName,
      };
    } catch {
      return {
        redirectUrl: sample.audioUrl,
        mimeType,
        fileName: sample.fileName,
      };
    }
  }

  const memBuf = inMemoryVoiceSampleBuffers.get(sample.id);
  if (memBuf) {
    return {
      buffer: memBuf,
      mimeType,
      fileName: sample.fileName,
    };
  }

  return {
    filePath: path.join(VOICE_SAMPLES_DIR, `${sample.id}.${sample.format}`),
    mimeType,
    fileName: sample.fileName,
  };
}

export async function getDatabaseSummary() {
  const workspace = await readWorkspace();
  let storageBytes = 0;
  let lastModifiedIso = new Date().toISOString();
  try {
    const stat = await fs.stat(DATA_FILE);
    storageBytes = stat.size;
    lastModifiedIso = stat.mtime.toISOString();
  } catch {
    storageBytes = Buffer.byteLength(JSON.stringify(workspace), 'utf-8');
  }

  return {
    engine: IS_SERVERLESS_RUNTIME
      ? 'Vercel Serverless + Cloud Firestore + Ephemeral Runtime Cache'
      : 'Hybrid Cloud Firestore + Local JSON Persistent Engine',
    firestoreDatabaseId:
      'ai-studio-jarvissextafeira-a1e5b3ec-d96a-4eb6-b275-13d0b6498e23',
    firebaseProjectId: 'gen-lang-client-0571301083',
    storageBytes,
    lastModifiedIso,
    counts: {
      users: (workspace.users ?? []).length,
      memories: (workspace.memories ?? []).length,
      tasks: (workspace.tasks ?? []).length,
      agenda: (workspace.agenda ?? []).length,
      routines: (workspace.routines ?? []).length,
      alerts: (workspace.alerts ?? []).length,
      conversations: (workspace.conversations ?? []).length,
      dossierQuestions: (workspace.creatorDossier?.openQuestions ?? []).length,
      socialProfiles: (workspace.creatorDossier?.socialProfiles ?? []).length,
      dailySources: (workspace.dailyIntelFeed ?? []).length,
      voiceSamples: (workspace.voiceSamples ?? []).length,
      jarvisKnowledgeDocs: (workspace.jarvisKnowledgeBase ?? []).length,
    },
    creatorAccount: {
      username: CREATOR_HARDCODED_ACCOUNT.username,
      email: CREATOR_HARDCODED_ACCOUNT.email,
      roleLabel: CREATOR_HARDCODED_ACCOUNT.roleLabel,
      hardcodedProtection: true,
    },
  };
}

export async function addJarvisKnowledgeDocument(
  doc: JarvisKnowledgeDocument
): Promise<{ document: JarvisKnowledgeDocument; workspace: WorkspaceState }> {
  const now = new Date().toISOString();
  const normalizedDoc: JarvisKnowledgeDocument = {
    ...doc,
    id: doc.id || `jarvis-pdf-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
    offlineReady: true,
    createdAt: doc.createdAt || now,
  };

  const workspace = await updateWorkspace((state) => {
    if (!Array.isArray(state.jarvisKnowledgeBase)) {
      state.jarvisKnowledgeBase = [];
    }
    state.jarvisKnowledgeBase = [
      normalizedDoc,
      ...state.jarvisKnowledgeBase.filter(
        (existing) =>
          existing.id !== normalizedDoc.id &&
          existing.title.toLowerCase() !== normalizedDoc.title.toLowerCase()
      ),
    ].slice(0, 35);

    const categoryLabel =
      JARVIS_KNOWLEDGE_CATEGORY_LABELS[normalizedDoc.category] || 'Estudo & Mentoria';

    // Incorporate into J.A.R.V.I.S. active memories
    const memoryTitle = `[Base PDF J.A.R.V.I.S. · ${categoryLabel}] ${normalizedDoc.title}`;
    const pdfMemoryItem: MemoryItem = {
      id: crypto.randomUUID(),
      title: memoryTitle,
      content: `${normalizedDoc.summary} | Diretriz de Personalidade: ${
        normalizedDoc.personalityIntegrationDirective
      } | Lições-Chave: ${normalizedDoc.keyTeachings.slice(0, 3).join(' ; ')}`,
      category:
        normalizedDoc.category === 'arquitetura_engenharia' ? 'arquitetura' : 'aprendizado',
      sourceAssistant: 'jarvis',
      importance: 'alta',
      createdAt: now,
    };
    state.memories = [
      pdfMemoryItem,
      ...state.memories.filter((m) => m.title.toLowerCase() !== memoryTitle.toLowerCase()),
    ].slice(0, 100);

    // Evolve J.A.R.V.I.S. Cognitive Profile & Personality Directive
    const evo = ensureNeuralEvolutionState(state);
    evo.totalLearningCycles += 1;
    const jarvisProfile = evo.assistants.jarvis;
    if (jarvisProfile) {
      jarvisProfile.experiencePoints += 120;
      jarvisProfile.learnedFromUserCount += 1;
      jarvisProfile.learnedFromSourcesCount += Math.max(1, normalizedDoc.chunks.length);
      jarvisProfile.cognitiveLevel = Math.max(
        1,
        Math.floor(jarvisProfile.experiencePoints / 250) + 1
      );
      jarvisProfile.nextLevelXp = jarvisProfile.cognitiveLevel * 250;
      const domainBadge = `PDF: ${normalizedDoc.title.slice(0, 36)}`;
      if (!jarvisProfile.masteredDomains.includes(domainBadge)) {
        jarvisProfile.masteredDomains = [
          domainBadge,
          ...jarvisProfile.masteredDomains,
        ].slice(0, 8);
      }
      jarvisProfile.latestInsight = `Base PDF incorporada ("${normalizedDoc.title}"): ${normalizedDoc.summary.slice(
        0,
        155
      )}`;
      jarvisProfile.dynamicPersonalityDirective = `${buildDynamicPersonalityDirective(
        'jarvis',
        jarvisProfile,
        evo.patrickCommunicationStyle,
        normalizedDoc.category === 'estudo_biblico_cristao'
          ? 'sabedoria_cristocentrica'
          : 'arquitetura_engenharia'
      )} Incorporado material de estudo em PDF "${normalizedDoc.title}" (${
        normalizedDoc.chunks.length
      } seções offline/online) para mentoria ativa de Patrick Pessoa.`;
      jarvisProfile.lastEvolvedAt = now;
    }

    evo.recentEvolutionEvents.unshift({
      id: crypto.randomUUID(),
      timestamp: now,
      assistantId: 'jarvis',
      sourceType: 'desenvolvedor',
      sourceLabel: `Biblioteca PDF Offline/Online · ${normalizedDoc.fileName}`,
      summary: `J.A.R.V.I.S. absorveu o documento PDF "${normalizedDoc.title}" (${normalizedDoc.chunks.length} seções, ~${normalizedDoc.pageCountEstimate} pág.) em seu banco de dados e personalidade (+120 XP).`,
      classification:
        normalizedDoc.category === 'estudo_biblico_cristao'
          ? 'sabedoria_cristocentrica'
          : 'arquitetura_engenharia',
      classificationLabel: categoryLabel,
      directiveUpdate: normalizedDoc.personalityIntegrationDirective.slice(0, 180),
    });

    if (evo.recentEvolutionEvents.length > 25) {
      evo.recentEvolutionEvents = evo.recentEvolutionEvents.slice(0, 25);
    }
  });

  return { document: normalizedDoc, workspace };
}

export async function deleteJarvisKnowledgeDocument(id: string): Promise<WorkspaceState> {
  return updateWorkspace((state) => {
    if (!Array.isArray(state.jarvisKnowledgeBase)) return;
    state.jarvisKnowledgeBase = state.jarvisKnowledgeBase.filter((d) => d.id !== id);
  });
}

export async function syncJarvisKnowledgeDocuments(
  incomingDocs: JarvisKnowledgeDocument[]
): Promise<WorkspaceState> {
  if (!Array.isArray(incomingDocs) || incomingDocs.length === 0) {
    return readWorkspace();
  }

  return updateWorkspace((state) => {
    if (!Array.isArray(state.jarvisKnowledgeBase)) {
      state.jarvisKnowledgeBase = [];
    }
    const docMap = new Map<string, JarvisKnowledgeDocument>();
    for (const existing of state.jarvisKnowledgeBase) {
      if (existing?.id) docMap.set(existing.id, existing);
    }
    for (const doc of incomingDocs) {
      if (doc?.id && doc?.title && Array.isArray(doc.chunks)) {
        docMap.set(doc.id, {
          ...doc,
          offlineReady: true,
        });
      }
    }
    state.jarvisKnowledgeBase = Array.from(docMap.values())
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 35);
  });
}



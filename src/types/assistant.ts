export type AssistantId = 'jarvis' | 'sexta-feira' | 'ultron';
export type InteractionMode =
  | 'auto'
  | 'jarvis'
  | 'sexta-feira'
  | 'ultron'
  | 'ambos'
  | 'todos';

export type MemoryCategory =
  | 'arquitetura'
  | 'seguranca'
  | 'preferencia'
  | 'projeto'
  | 'aprendizado';

export interface MemoryItem {
  id: string;
  title: string;
  content: string;
  category: MemoryCategory;
  sourceAssistant: AssistantId | 'ambos' | 'todos';
  importance: 'alta' | 'media' | 'normal';
  createdAt: string;
}

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  priority: 'alta' | 'media' | 'baixa';
  status: 'pendente' | 'em_progresso' | 'concluida';
  assignedTo: AssistantId | 'ambos' | 'todos';
  dueTime?: string;
  createdAt: string;
}

export interface AlertItem {
  id: string;
  type: 'seguranca' | 'instabilidade' | 'bem_estar' | 'oportunidade';
  severity: 'critico' | 'aviso' | 'info';
  title: string;
  detail: string;
  suggestedAction: string;
  raisedBy: AssistantId;
  resolved: boolean;
  createdAt: string;
}

export type AgendaCategory =
  | 'reuniao'
  | 'foco_dev'
  | 'rotina'
  | 'entrega'
  | 'pessoal';

export interface AgendaEventItem {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime?: string; // HH:mm
  category: AgendaCategory;
  locationOrLink?: string;
  notes?: string;
  assignedAssistant: AssistantId | 'todos';
  completed: boolean;
  autoCallOnTime: boolean;
  lastCalledAt?: string;
  createdAt: string;
}

export interface RoutineRuleItem {
  id: string;
  title: string;
  time: string; // HH:mm
  frequencyLabel: string; // ex: 'Diário', 'Seg a Sex'
  leadAssistant: AssistantId | 'todos';
  instructions: string;
  enabled: boolean;
  lastTriggeredDate?: string; // YYYY-MM-DD
}

export interface SocialProfileLink {
  id: string;
  platform:
    | 'GitHub'
    | 'LinkedIn'
    | 'Instagram'
    | 'X / Twitter'
    | 'YouTube'
    | 'Portfólio / Web';
  handleOrUrl: string;
  verifiedNotes?: string;
  lastScannedAt?: string;
}

export interface CreatorQuestionItem {
  id: string;
  askedBy: AssistantId;
  question: string;
  contextReason: string;
  answered: boolean;
  answerText?: string;
  createdAt: string;
}

export interface CreatorDossier {
  fullName: string;
  brandSystemName: string;
  email: string;
  city: string;
  stateCountry: string;
  roleTitle: string;
  workHours: string;
  focusAreas: string[];
  socialProfiles: SocialProfileLink[];
  openQuestions: CreatorQuestionItem[];
  lastOnlineScanAt?: string;
}

export interface LiveWeatherForecastDay {
  date: string;
  tempMaxC: number;
  tempMinC: number;
  precipitationProb: number;
  conditionLabel: string;
}

export interface LiveWeatherReport {
  city: string;
  temperatureC: number;
  apparentTemperatureC: number;
  humidityPercent: number;
  windSpeedKmh: number;
  conditionLabel: string;
  isDay: boolean;
  updatedAt: string;
  forecast: LiveWeatherForecastDay[];
}

export interface LiveNewsItem {
  id: string;
  region: 'rio' | 'brasil' | 'mundo';
  title: string;
  link: string;
  source: string;
  pubDate?: string;
}

export interface LiveIntelBriefing {
  weather: LiveWeatherReport;
  news: {
    rio: LiveNewsItem[];
    brasil: LiveNewsItem[];
    mundo: LiveNewsItem[];
  };
  fetchedAt: string;
}

export interface DetectedEmotion {
  label: string;
  intensity: 'baixa' | 'media' | 'alta';
  empathyNote: string;
}

export type TurnFeedback = 'acerto' | 'revisar';

export interface AssistantTurn {
  speaker: AssistantId;
  text: string;
  stance: string;
  ttsScript: string;
  feedback?: TurnFeedback;
}

export interface DebateSummary {
  agreementPoint: string;
  divergencePoint: string;
  finalRecommendation: string;
}

export type WebSearchMode = 'auto' | 'always' | 'off';

export interface GroundingSource {
  title: string;
  uri: string;
  sourceType?: string;
}

export interface SystemUserAccount {
  id: string;
  username: string;
  email?: string;
  roleLabel: string;
  isCreator: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface ConversationEntry {
  id: string;
  timestamp: string;
  userMessage: string;
  userName?: string;
  isCreator?: boolean;
  triggerType: 'voz' | 'texto' | 'auditoria' | 'proativo';
  requestedMode: InteractionMode;
  resolvedMode: AssistantId | 'ambos' | 'todos';
  detectedEmotion: DetectedEmotion;
  responses: AssistantTurn[];
  debateSummary?: DebateSummary | null;
  sources?: GroundingSource[];
  searchEnginesUsed?: string[];
  createdMemoriesCount?: number;
  createdTasksCount?: number;
  createdAlertsCount?: number;
  createdEventsCount?: number;
  durationMs?: number;
  proactiveReason?: string;
}

export interface TelemetryTurnRecord {
  speaker: AssistantId;
  feedback?: TurnFeedback;
}

export interface TelemetryEntry {
  id: string;
  timestamp: string;
  triggerType: 'voz' | 'texto' | 'auditoria' | 'proativo';
  resolvedMode: AssistantId | 'ambos' | 'todos';
  durationMs: number;
  promptPreview: string;
  turns: TelemetryTurnRecord[];
}

export interface CreatorProfile {
  name: string;
  role: string;
  currentEmotion: DetectedEmotion;
  totalInteractions: number;
}

export type DailyIntelSourceKey = 'g1' | 'ge' | 'b3' | 'cepea' | 'redes_sociais' | 'bibliaon';

export interface DailyIntelRecordItem {
  title: string;
  detail: string;
  uri: string;
  publishedAt?: string;
}

export interface DailySourceSnapshot {
  id: string;
  sourceKey: DailyIntelSourceKey;
  sourceLabel: string;
  domainUrl: string;
  queryDate: string; // YYYY-MM-DD (America/Sao_Paulo)
  updatedAt: string; // ISO timestamp
  queryTerm: string;
  headlineSummary: string;
  items: DailyIntelRecordItem[];
}

export type VoiceSampleFormat = 'm4a' | 'wav';

export type VoiceTargetAssistantId = 'jarvis' | 'ultron';

export interface VoiceAcousticProfile {
  medianF0Hz: number;
  p25F0Hz: number;
  p75F0Hz: number;
  durationSec: number;
  sampleRate: number;
  rmsDbfs: number;
  peakDbfs: number;
  subBassEnergyDb: number; // ~90-104 Hz fundamental & sub-chest weight
  chestEnergyDb: number; // ~185-215 Hz velvet baritone body
  midContourDb: number; // ~480 Hz / 2380 Hz contour marker
  presenceEnergyDb: number; // ~1800 Hz armor/articulation clarity
}

export interface VoiceSampleRecord {
  id: string;
  assistantId: VoiceTargetAssistantId;
  fileName: string;
  format: VoiceSampleFormat;
  mimeType: string;
  sizeBytes: number;
  audioUrl: string;
  isBuiltInDefault?: boolean;
  isActiveTraining: boolean;
  uploadedAt: string;
  notes?: string;
  acoustics: VoiceAcousticProfile;
}

export interface VoiceValidationResult {
  validatedAt: string;
  phrase: string;
  measuredF0Hz: number;
  targetF0Hz: number;
  deviationHz: number;
  fidelityPercent: number;
  verdict: string;
  acoustics: VoiceAcousticProfile;
}

export interface VoiceTrainingState {
  assistantId: VoiceTargetAssistantId;
  targetF0Hz: 104.3 | 90.2;
  trainedF0Hz: number;
  sampleCount: number;
  activeSampleIds: string[];
  pitchRate: number;
  chestGainDb: number;
  subGainDb: number;
  midContourDb: number;
  presenceGainDb: number;
  fidelityScore: number;
  lastTrainedAt: string;
  lastValidation?: VoiceValidationResult;
}

export type GeminiKeyDiagnosticStatus = 'valid' | 'missing' | 'malformed' | 'unreachable';

export interface WorkspaceEndpointDiagnostics {
  endpoint: '/api/workspace';
  connected: boolean;
  geminiConfigured: boolean;
  geminiKeyStatus: GeminiKeyDiagnosticStatus;
  geminiKeyHint: string;
  runtime: 'vercel-serverless' | 'node-express' | 'offline-client';
  vercelEnv: boolean;
  checkedAt: string;
}

export type InteractionClassificationCategory =
  | 'curadoria_assuntos_gerais'
  | 'verificacao_fatos_cruzados'
  | 'arquitetura_engenharia'
  | 'sabedoria_cristocentrica'
  | 'financas_mercado_b3'
  | 'agronegocio_cepea'
  | 'diagnostico_preditivo'
  | 'rotina_operacional_tatica'
  | 'calibracao_personalidade';

export interface CommunicationStyleProfile {
  preferredDepth: 'sintese_rapida' | 'equilibrado_tatico' | 'analitico_profundo';
  preferredToneLabel: string;
  crossFactVerificationRigidity: 'padrao' | 'cruzamento_multi_fonte_rigoroso';
  positiveFeedbackTotal: number;
  revisionFeedbackTotal: number;
  alignmentPercentage: number;
  detectedStylePatterns: string[];
  lastUpdatedAt: string;
}

export interface AssistantCognitiveEvolutionProfile {
  assistantId: AssistantId;
  cognitiveLevel: number;
  experiencePoints: number;
  nextLevelXp: number;
  specialtyTitle: string;
  learnedFromUserCount: number;
  learnedFromSourcesCount: number;
  positiveFeedbackCount: number;
  revisionFeedbackCount: number;
  masteredDomains: string[];
  latestInsight: string;
  dynamicPersonalityDirective: string;
  interactionClassifications?: Partial<Record<InteractionClassificationCategory, number>>;
  communicationAlignmentScore?: number;
  lastEvolvedAt: string;
}

export interface NeuralEvolutionEvent {
  id: string;
  timestamp: string;
  assistantId: AssistantId | 'todos';
  sourceType: 'usuario' | 'desenvolvedor' | 'fonte_externa' | 'feedback_reforco';
  sourceLabel: string;
  summary: string;
  classification?: InteractionClassificationCategory;
  classificationLabel?: string;
  directiveUpdate?: string;
}

export interface SystemNeuralEvolutionState {
  version: string;
  totalLearningCycles: number;
  activeSourcesIntegrated: string[];
  patrickCommunicationStyle?: CommunicationStyleProfile;
  assistants: Record<AssistantId, AssistantCognitiveEvolutionProfile>;
  recentEvolutionEvents: NeuralEvolutionEvent[];
}

export type JarvisKnowledgeCategory =
  | 'estudo_biblico_cristao'
  | 'arquitetura_engenharia'
  | 'financas_economia'
  | 'ciencias_estudos_gerais'
  | 'desenvolvimento_pessoal';

export interface JarvisKnowledgeChunk {
  id: string;
  index: number;
  heading: string;
  content: string;
  keywords: string[];
}

export interface JarvisKnowledgeDocument {
  id: string;
  title: string;
  fileName: string;
  category: JarvisKnowledgeCategory;
  fileSizeBytes: number;
  pageCountEstimate: number;
  summary: string;
  personalityIntegrationDirective: string;
  keyTeachings: string[];
  studyQuestions: string[];
  chunks: JarvisKnowledgeChunk[];
  totalCharacters: number;
  offlineReady: boolean;
  uploadedBy: string;
  createdAt: string;
}

export interface WorkspaceState {
  profile: CreatorProfile;
  memories: MemoryItem[];
  tasks: TaskItem[];
  alerts: AlertItem[];
  agenda?: AgendaEventItem[];
  routines?: RoutineRuleItem[];
  creatorDossier?: CreatorDossier;
  users?: SystemUserAccount[];
  dailyIntelFeed?: DailySourceSnapshot[];
  voiceSamples?: VoiceSampleRecord[];
  voiceTrainingProfiles?: Partial<Record<VoiceTargetAssistantId, VoiceTrainingState>>;
  neuralEvolution?: SystemNeuralEvolutionState;
  jarvisKnowledgeBase?: JarvisKnowledgeDocument[];
  conversations: ConversationEntry[];
  telemetryLog?: TelemetryEntry[];
  _diagnostics?: WorkspaceEndpointDiagnostics;
}



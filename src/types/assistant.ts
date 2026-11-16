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

export interface ConversationEntry {
  id: string;
  timestamp: string;
  userMessage: string;
  triggerType: 'voz' | 'texto' | 'auditoria';
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
  durationMs?: number;
}

export interface TelemetryTurnRecord {
  speaker: AssistantId;
  feedback?: TurnFeedback;
}

export interface TelemetryEntry {
  id: string;
  timestamp: string;
  triggerType: 'voz' | 'texto' | 'auditoria';
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

export interface WorkspaceState {
  profile: CreatorProfile;
  memories: MemoryItem[];
  tasks: TaskItem[];
  alerts: AlertItem[];
  conversations: ConversationEntry[];
  telemetryLog?: TelemetryEntry[];
}

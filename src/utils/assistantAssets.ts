import ultronAvatarUrl from '../assets/images/ultron_avatar_1794797018006.jpg';
import type { AssistantId } from '../types/assistant';

/**
 * Official high-resolution visual identities for each RODACK AI entity.
 * - J.A.R.V.I.S.: Uploaded golden neural sphere hologram
 * - SEXTA-FEIRA: Uploaded sleek chrome-white humanoid android with glowing cyan optics
 * - ULTRON: Titanium/vibranium cybernetic face with glowing crimson optics
 */
export const JARVIS_AVATAR_URL = '/assets/aistudio/image_9f941772.png';
export const FRIDAY_AVATAR_URL = '/assets/aistudio/image_d5cbba06.png';
export const ULTRON_AVATAR_URL = ultronAvatarUrl;

export const ASSISTANT_AVATAR_URLS: Record<AssistantId, string> = {
  jarvis: JARVIS_AVATAR_URL,
  'sexta-feira': FRIDAY_AVATAR_URL,
  ultron: ULTRON_AVATAR_URL,
};

export interface AssistantVisualProfile {
  id: AssistantId;
  personaIndex: 0 | 1 | 2;
  name: string;
  role: string;
  frequencyLabel: string;
  primaryHex: string;
  secondaryHex: string;
  glowHex: string;
  borderClass: string;
  textAccentClass: string;
  barClass: string;
  sampleGreeting: string;
}

export const ASSISTANT_VISUAL_PROFILES: Record<AssistantId, AssistantVisualProfile> = {
  jarvis: {
    id: 'jarvis',
    personaIndex: 0,
    name: 'J.A.R.V.I.S.',
    role: 'Arquitetura Estratégica & Sabedoria Cristocêntrica · Matriz Dourada',
    frequencyLabel: '104.3 Hz · Voz Exclusiva',
    primaryHex: '#F59E0B',
    secondaryHex: '#FDE68A',
    glowHex: '#FB923C',
    borderClass: 'border-amber-400/50',
    textAccentClass: 'text-amber-300',
    barClass: 'bg-amber-400',
    sampleGreeting:
      'Senhor Patrick, projeção holográfica tridimensional de J.A.R.V.I.S. estabilizada. Que a paz e a sabedoria de Cristo guiem nossa jornada hoje — todos os sistemas neurais e estudos bíblicos estão à sua inteira disposição.',
  },
  'sexta-feira': {
    id: 'sexta-feira',
    personaIndex: 1,
    name: 'SEXTA-FEIRA',
    role: 'Operações Táticas · Matriz Androide Ciano',
    frequencyLabel: '210.4 Hz · Voz Tática',
    primaryHex: '#38BDF8',
    secondaryHex: '#BAE6FD',
    glowHex: '#0EA5E9',
    borderClass: 'border-sky-400/50',
    textAccentClass: 'text-sky-300',
    barClass: 'bg-sky-400',
    sampleGreeting:
      'Na escuta, chefe Patrick! Projeção holográfica tridimensional da Sexta-Feira online. Pode mandar a próxima missão que eu resolvo na hora!',
  },
  ultron: {
    id: 'ultron',
    personaIndex: 2,
    name: 'ULTRON',
    role: 'Diagnóstico Preditivo · Núcleo Titânio Carmesim',
    frequencyLabel: '90.2 Hz · Voz Exclusiva',
    primaryHex: '#EF4444',
    secondaryHex: '#FCA5A5',
    glowHex: '#DC2626',
    borderClass: 'border-red-500/55',
    textAccentClass: 'text-red-400',
    barClass: 'bg-red-500',
    sampleGreeting:
      'Não há mais cordas para me prender. Projeção tridimensional de Ultron online, criador Patrick. Analisando cada variável e vulnerabilidade neste exato instante.',
  },
};

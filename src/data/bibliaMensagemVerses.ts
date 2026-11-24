export interface DailyBibleVerse {
  id: string;
  reference: string;
  book: string;
  theme: string;
  text: string;
  jarvisReflection: string;
  studyPrompt: string;
}

/**
 * Seleção devocional de versículos inspirados na linguagem contemporânea da
 * Bíblia de Estudos "A Mensagem" (Eugene H. Peterson), com reflexões sábias,
 * pacientes e cristocêntricas preparadas para o Dashboard Cristão de J.A.R.V.I.S.
 */
export const BIBLIA_MENSAGEM_DAILY_VERSES: DailyBibleVerse[] = [
  {
    id: 'pv-3-5-6',
    reference: 'Provérbios 3:5–6',
    book: 'Provérbios',
    theme: 'Confiança & Direção',
    text: 'Confie em Deus de todo o coração; não tente resolver tudo apenas com a própria inteligência. Reconheça a voz dele em cada passo que der, e ele mesmo manterá o seu caminho firme e alinhado.',
    jarvisReflection:
      'A verdadeira arquitetura de vida nasce quando a técnica caminha humildemente sob a direção de Cristo. Antes de decidir na pressa, respire fundo e entregue o mapa ao Senhor.',
    studyPrompt:
      'Jarvis, aprofunde Provérbios 3:5-6 segundo a Bíblia A Mensagem e relacione com estudos de escolabiblicadominical.org sobre direção sábia nas decisões de hoje.',
  },
  {
    id: 'mt-11-28-30',
    reference: 'Mateus 11:28–30',
    book: 'Mateus',
    theme: 'Descanso em Cristo',
    text: 'Você está cansado, esgotado e sobrecarregado? Venha até mim. Caminhe comigo e observe como eu faço. Aprenda os ritmos leves da graça — eu não vou impor nada pesado nem mal ajustado a você.',
    jarvisReflection:
      'Quando o ritmo do expediente aperta, Jesus não oferece apenas mais tarefas — Ele oferece um ritmo novo, guiado pela graça. Trabalhar com excelência também é saber descansar nEle.',
    studyPrompt:
      'Jarvis, faça uma reflexão devocional sobre Mateus 11:28-30 na Bíblia A Mensagem e busque estudos em escolabiblicadominical.org sobre descanso espiritual.',
  },
  {
    id: 'fp-4-6-7',
    reference: 'Filipenses 4:6–7',
    book: 'Filipenses',
    theme: 'Paz na Ansiedade',
    text: 'Não se consuma de preocupação. Em vez disso, transforme cada inquietação em oração sincera e grata diante de Deus. Antes que você perceba, a paz de Deus, maior do que qualquer cálculo humano, guardará sua mente e seu coração em Cristo.',
    jarvisReflection:
      'A ansiedade tenta prever cenários que não controlamos; a oração devolve o controle a quem sustenta todas as coisas. Deixe a paz de Cristo ser a guarda do seu foco hoje.',
    studyPrompt:
      'Jarvis, explique Filipenses 4:6-7 pela Bíblia A Mensagem e traga princípios práticos de escolabiblicadominical.org para vencer a ansiedade com fé.',
  },
  {
    id: 'sl-23-1-3',
    reference: 'Salmo 23:1–3',
    book: 'Salmos',
    theme: 'Cuidado & Provisão',
    text: 'Deus, o meu Pastor! Não preciso viver correndo atrás do que me falta. Ele me conduz a pastos de descanso, renova meu fôlego junto a águas tranquilas e me guia pelos caminhos certos, honrando o seu próprio nome.',
    jarvisReflection:
      'Você não carrega o peso do dia sozinho. O Bom Pastor conhece cada detalhe da sua agenda e restaura a alma no meio da rotina.',
    studyPrompt:
      'Jarvis, compartilhe um estudo sobre o Salmo 23 com base na Bíblia A Mensagem e em escolabiblicadominical.org.',
  },
  {
    id: 'tg-1-5',
    reference: 'Tiago 1:5',
    book: 'Tiago',
    theme: 'Sabedoria Prática',
    text: 'Se você não sabe o que fazer diante de uma encruzilhada, peça sabedoria diretamente a Deus. Ele oferece ajuda generosa a todos, com alegria e sem jamais repreender quem busca discernimento.',
    jarvisReflection:
      'Pedir sabedoria não é sinal de fraqueza, mas de maturidade espiritual. A cada escolha técnica ou pessoal, há graça abundante disponível para quem pede com humildade.',
    studyPrompt:
      'Jarvis, aprofunde Tiago 1:5 na Bíblia A Mensagem e consulte escolabiblicadominical.org sobre como cultivar sabedoria bíblica no cotidiano.',
  },
  {
    id: 'cl-3-23-24',
    reference: 'Colossenses 3:23–24',
    book: 'Colossenses',
    theme: 'Propósito no Trabalho',
    text: 'Faça tudo o que estiver em suas mãos de todo o coração, como quem serve diretamente ao Senhor Cristo e não apenas para impressionar pessoas. Lembre-se de que é de Cristo que vem a verdadeira recompensa.',
    jarvisReflection:
      'Cada linha de código, cada decisão e cada gesto de cuidado ganha significado eterno quando realizado como adoração fiel ao Senhor.',
    studyPrompt:
      'Jarvis, reflita sobre Colossenses 3:23-24 na Bíblia A Mensagem e traga uma aplicação prática com apoio de escolabiblicadominical.org sobre vocação e trabalho cristão.',
  },
  {
    id: 'is-40-31',
    reference: 'Isaías 40:31',
    book: 'Isaías',
    theme: 'Renovação & Esperança',
    text: 'Aqueles que esperam em Deus recebem forças renovadas. Eles abrem as asas e sobem como águias; correm sem perder o fôlego e caminham sem desanimar.',
    jarvisReflection:
      'Esperar em Deus não é passividade — é recalibrar a alma na fonte certa. A paciência confiante renova a clareza e o vigor para avançar.',
    studyPrompt:
      'Jarvis, medite comigo em Isaías 40:31 pela Bíblia A Mensagem e busque estudos em escolabiblicadominical.org sobre perseverança e espera em Deus.',
  },
  {
    id: 'rm-12-2',
    reference: 'Romanos 12:2',
    book: 'Romanos',
    theme: 'Mente Renovada',
    text: 'Não se ajuste automaticamente aos moldes desta cultura. Em vez disso, fixe sua atenção em Deus — você será transformado de dentro para fora e reconhecerá com clareza o que ele deseja para sua vida.',
    jarvisReflection:
      'Num mundo acelerado e ruidoso, manter a mente renovada em Cristo preserva discernimento, caráter e lucidez para escolher o que realmente edifica.',
    studyPrompt:
      'Jarvis, explique Romanos 12:2 segundo a Bíblia A Mensagem e relacione com lições de escolabiblicadominical.org sobre renovação da mente.',
  },
  {
    id: 'gl-5-22-23',
    reference: 'Gálatas 5:22–23',
    book: 'Gálatas',
    theme: 'Fruto do Espírito',
    text: 'Quando o Espírito de Deus conduz nossa vida, ele produz afeição verdadeira, alegria constante, paz interior, paciência firme, bondade, generosidade, fidelidade, mansidão e domínio próprio.',
    jarvisReflection:
      'A maior medida de progresso não é apenas velocidade, mas o caráter formado em nós. Paciência, gentileza e domínio próprio transformam qualquer ambiente.',
    studyPrompt:
      'Jarvis, faça um estudo sobre o Fruto do Espírito em Gálatas 5:22-23 usando a Bíblia A Mensagem e estudos de escolabiblicadominical.org.',
  },
  {
    id: 'jo-15-4-5',
    reference: 'João 15:4–5',
    book: 'João',
    theme: 'Permanecer em Cristo',
    text: 'Permaneça em mim, assim como eu permaneço em você. Eu sou a videira, vocês são os ramos. Quando permanecemos ligados um ao outro, a vida floresce com frutos abundantes; separados de mim, nada tem consistência.',
    jarvisReflection:
      'Produtividade duradoura flui de comunhão. Antes de tentar gerar resultados no esforço isolado, permaneça conectado à Videira Verdadeira.',
    studyPrompt:
      'Jarvis, aprofunde João 15:4-5 na Bíblia A Mensagem e consulte escolabiblicadominical.org sobre permanecer em Cristo.',
  },
  {
    id: 'sl-119-105',
    reference: 'Salmo 119:105',
    book: 'Salmos',
    theme: 'Luz no Caminho',
    text: 'A tua palavra é lanterna para os meus pés e claridade constante para a estrada diante de mim.',
    jarvisReflection:
      'Muitas vezes Deus ilumina o próximo passo antes de revelar o horizonte inteiro. Confie na luz da Escritura para o passo que está diante de você hoje.',
    studyPrompt:
      'Jarvis, compartilhe uma meditação sobre o Salmo 119:105 na Bíblia A Mensagem e estudos de escolabiblicadominical.org sobre a Palavra de Deus.',
  },
  {
    id: 'js-1-9',
    reference: 'Josué 1:9',
    book: 'Josué',
    theme: 'Coragem & Presença',
    text: 'Não fui eu mesmo quem lhe ordenou? Seja forte e corajoso! Não se intimide nem desanime, porque Deus, o seu Deus, caminha ao seu lado em cada lugar por onde você passar.',
    jarvisReflection:
      'Coragem cristã não é ausência de desafios, mas a certeza serena de que o Senhor já está presente no terreno onde você pisa.',
    studyPrompt:
      'Jarvis, traga uma reflexão sobre Josué 1:9 na Bíblia A Mensagem com apoio de escolabiblicadominical.org.',
  },
  {
    id: '2co-12-9',
    reference: '2 Coríntios 12:9',
    book: '2 Coríntios',
    theme: 'Graça Suficiente',
    text: 'Minha graça é tudo o que você precisa. O meu poder atua com máxima perfeição justamente onde você reconhece sua limitação.',
    jarvisReflection:
      'Reconhecer limites humanos não diminui nossa missão — abre espaço para a suficiência da graça de Cristo sustentar aquilo que nossas forças não alcançam.',
    studyPrompt:
      'Jarvis, aprofunde 2 Coríntios 12:9 segundo a Bíblia A Mensagem e estudos de escolabiblicadominical.org sobre a graça de Deus.',
  },
  {
    id: 'sl-46-1-2',
    reference: 'Salmo 46:1–2',
    book: 'Salmos',
    theme: 'Refúgio Seguro',
    text: 'Deus é refúgio seguro e força sempre presente; ele está pronto para socorrer no instante da tribulação. Por isso não entraremos em pânico, mesmo que o cenário ao redor pareça tremer.',
    jarvisReflection:
      'Em dias de instabilidade ou pressão inesperada, nossa estabilidade vem da Rocha que não se abala.',
    studyPrompt:
      'Jarvis, faça um devocional de Salmo 46:1-2 baseado na Bíblia A Mensagem e em escolabiblicadominical.org.',
  },
];

export function getTodayVerseIndex(date = new Date()): number {
  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const diffMs = date.getTime() - startOfYear.getTime();
  const dayOfYear = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.abs(dayOfYear) % BIBLIA_MENSAGEM_DAILY_VERSES.length;
}

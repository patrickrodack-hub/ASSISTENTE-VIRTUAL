import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Bot,
  Calendar,
  ChevronRight,
  CloudSun,
  Cpu,
  Droplets,
  Flame,
  Globe,
  Home,
  Lightbulb,
  Map as MapIcon,
  MessageSquare,
  Mic,
  MicOff,
  Newspaper,
  Play,
  Radio,
  RefreshCw,
  Send,
  Settings,
  Sparkles,
  Thermometer,
  TrendingUp,
  Tv,
  User,
  Volume2,
  Wheat,
  Wind,
  Wrench,
  X,
  Apple,
} from 'lucide-react';
import type {
  AssistantId,
  AssistantTurn,
  InteractionMode,
  LiveIntelBriefing,
  SystemUserAccount,
  WorkspaceState,
} from '../types/assistant';
import {
  FRIDAY_AVATAR_URL,
  JARVIS_AVATAR_URL,
  ULTRON_AVATAR_URL,
} from '../utils/assistantAssets';
import { triggerHaptic } from '../utils/haptics';

interface LiveBroadcastHUDProps {
  workspace: WorkspaceState;
  liveIntel: LiveIntelBriefing | null;
  currentUser: SystemUserAccount;
  isLoadingIntel: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  speakingSpeaker: AssistantId | 'ambos' | 'todos' | null;
  isStandbyActive: boolean;
  isFocusMode: boolean;
  onRefreshIntel: () => void;
  onAskAssistant: (prompt: string, mode: InteractionMode) => void;
  onSpeakHeadline: (turn: AssistantTurn) => void;
  onOpenHologram: (speaker: AssistantId) => void;
  onToggleStandby: () => void;
  onToggleFocusMode: () => void;
  onFocusConsole: () => void;
  onOpenView: (view: 'agenda' | 'radar' | 'memoria' | 'auditoria') => void;
}

type MarketTabId = 'IBOVESPA' | 'AÇÕES EUA' | 'CRIPTO' | 'FIIs' | 'ÍNDICES';
type FoodTabId = 'BÁSICOS' | 'GRÃOS' | 'CARNES' | 'HORTIFRUTI' | 'OUTROS';
type NewsTabId = 'BRASIL' | 'MUNDO' | 'ECONOMIA' | 'TECNOLOGIA' | 'SAÚDE' | 'MEIO AMBIENTE';
type ContinentId = 'GLOBAL' | 'AMÉRICAS' | 'EUROPA' | 'ÁSIA' | 'ÁFRICA';
type SeverityLevel = 'alta' | 'media' | 'baixa';

interface CandlePoint {
  time: string;
  open: number;
  close: number;
  high: number;
  low: number;
}

interface MarketAssetQuote {
  ticker: string;
  price: string;
  changePct: number;
}

interface MarketTabDataset {
  label: string;
  value: string;
  deltaText: string;
  deltaPositive: boolean;
  maxima: string;
  minima: string;
  volume: string;
  negocios: string;
  candles: CandlePoint[];
  tickers: MarketAssetQuote[];
}

interface CryptoAssetRow {
  symbol: string;
  name: string;
  priceUsd: number;
  change24h: number;
  change7d: number;
  spark: number[];
}

interface FoodQuoteRow {
  name: string;
  unit: string;
  priceBrl: number;
  change7d: number;
  spark: number[];
}

interface LiveChannelItem {
  id: string;
  title: string;
  subtitle: string;
  viewersLabel: string;
  accentFrom: string;
  accentTo: string;
  badgeText: string;
  embedUrl: string;
  promptTopic: string;
}

interface WorldHotspot {
  id: string;
  title: string;
  region: Exclude<ContinentId, 'GLOBAL'>;
  severity: SeverityLevel;
  category: 'Alta relevância' | 'Monitoramento' | 'Oportunidades';
  x: number; // percentage 0..100
  y: number; // percentage 0..100
  summary: string;
  assistant: AssistantId;
}

interface ClimateAlertItem {
  id: string;
  label: string;
  region: string;
  severity: 'critico' | 'aviso' | 'estavel';
  x: number;
  y: number;
}

const MARKET_DATASETS: Record<MarketTabId, MarketTabDataset> = {
  IBOVESPA: {
    label: 'IBOVESPA',
    value: '129.347,18',
    deltaText: '+1,23% (+1.569,32)',
    deltaPositive: true,
    maxima: '129.821,45',
    minima: '127.412,30',
    volume: 'R$ 18,4 B',
    negocios: '4,2 M',
    candles: [
      { time: '10:00', open: 127.7, close: 127.95, high: 128.15, low: 127.4 },
      { time: '10:20', open: 127.95, close: 127.8, high: 128.1, low: 127.6 },
      { time: '10:40', open: 127.8, close: 128.25, high: 128.4, low: 127.75 },
      { time: '11:00', open: 128.25, close: 128.05, high: 128.35, low: 127.9 },
      { time: '11:20', open: 128.05, close: 128.5, high: 128.65, low: 128.0 },
      { time: '11:40', open: 128.5, close: 128.35, high: 128.6, low: 128.2 },
      { time: '12:00', open: 128.35, close: 128.85, high: 128.95, low: 128.3 },
      { time: '12:20', open: 128.85, close: 128.65, high: 129.0, low: 128.5 },
      { time: '12:40', open: 128.65, close: 129.1, high: 129.25, low: 128.6 },
      { time: '13:00', open: 129.1, close: 129.45, high: 129.65, low: 129.0 },
      { time: '13:20', open: 129.45, close: 129.7, high: 129.82, low: 129.35 },
      { time: '13:40', open: 129.7, close: 129.3, high: 129.75, low: 129.1 },
      { time: '14:00', open: 129.3, close: 128.95, high: 129.4, low: 128.75 },
      { time: '14:20', open: 128.95, close: 128.6, high: 129.05, low: 128.45 },
      { time: '14:40', open: 128.6, close: 128.85, high: 128.95, low: 128.5 },
      { time: '15:00', open: 128.85, close: 129.05, high: 129.2, low: 128.75 },
      { time: '15:20', open: 129.05, close: 128.9, high: 129.15, low: 128.7 },
      { time: '15:40', open: 128.9, close: 129.18, high: 129.3, low: 128.8 },
      { time: '16:00', open: 129.18, close: 129.02, high: 129.25, low: 128.9 },
      { time: '16:30', open: 129.02, close: 129.28, high: 129.4, low: 128.98 },
      { time: '17:00', open: 129.28, close: 129.35, high: 129.52, low: 129.2 },
    ],
    tickers: [
      { ticker: 'PETR4', price: '36,72', changePct: 2.15 },
      { ticker: 'VALE3', price: '61,38', changePct: -0.48 },
      { ticker: 'ITUB4', price: '34,21', changePct: 1.32 },
      { ticker: 'BBDC4', price: '13,54', changePct: 0.87 },
      { ticker: 'ABEV3', price: '12,67', changePct: -0.21 },
    ],
  },
  'AÇÕES EUA': {
    label: 'S&P 500 / NASDAQ',
    value: '5.894,60',
    deltaText: '+0,84% (+49,12)',
    deltaPositive: true,
    maxima: '5.912,20',
    minima: '5.840,15',
    volume: 'US$ 42,6 B',
    negocios: '7,8 M',
    candles: [
      { time: '10:30', open: 5.84, close: 5.85, high: 5.86, low: 5.83 },
      { time: '11:00', open: 5.85, close: 5.86, high: 5.87, low: 5.84 },
      { time: '11:30', open: 5.86, close: 5.85, high: 5.87, low: 5.84 },
      { time: '12:00', open: 5.85, close: 5.88, high: 5.89, low: 5.85 },
      { time: '12:30', open: 5.88, close: 5.89, high: 5.9, low: 5.87 },
      { time: '13:00', open: 5.89, close: 5.87, high: 5.9, low: 5.86 },
      { time: '13:30', open: 5.87, close: 5.9, high: 5.91, low: 5.87 },
      { time: '14:00', open: 5.9, close: 5.91, high: 5.92, low: 5.89 },
      { time: '14:30', open: 5.91, close: 5.88, high: 5.91, low: 5.87 },
      { time: '15:00', open: 5.88, close: 5.89, high: 5.9, low: 5.88 },
      { time: '15:30', open: 5.89, close: 5.9, high: 5.91, low: 5.88 },
      { time: '16:00', open: 5.9, close: 5.89, high: 5.91, low: 5.89 },
    ],
    tickers: [
      { ticker: 'NVDA', price: '138,40', changePct: 3.12 },
      { ticker: 'AAPL', price: '229,15', changePct: 0.65 },
      { ticker: 'MSFT', price: '448,90', changePct: 1.18 },
      { ticker: 'GOOGL', price: '184,20', changePct: 1.44 },
      { ticker: 'AMZN', price: '208,65', changePct: -0.32 },
    ],
  },
  CRIPTO: {
    label: 'TOTAL CRYPTO CAP',
    value: 'US$ 3,42 T',
    deltaText: '+2,38% (+79,4 B)',
    deltaPositive: true,
    maxima: 'US$ 3,48 T',
    minima: 'US$ 3,31 T',
    volume: 'US$ 114 B',
    negocios: '19,4 M',
    candles: [
      { time: '00:00', open: 105.9, close: 106.4, high: 106.9, low: 105.6 },
      { time: '03:00', open: 106.4, close: 106.1, high: 106.8, low: 105.9 },
      { time: '06:00', open: 106.1, close: 107.0, high: 107.4, low: 106.0 },
      { time: '09:00', open: 107.0, close: 107.6, high: 108.1, low: 106.9 },
      { time: '12:00', open: 107.6, close: 107.3, high: 107.9, low: 107.1 },
      { time: '15:00', open: 107.3, close: 108.2, high: 108.7, low: 107.2 },
      { time: '18:00', open: 108.2, close: 108.5, high: 109.1, low: 108.0 },
      { time: '21:00', open: 108.5, close: 108.43, high: 108.8, low: 108.1 },
    ],
    tickers: [
      { ticker: 'BTC', price: '108.432', changePct: 2.14 },
      { ticker: 'ETH', price: '3.987', changePct: 1.67 },
      { ticker: 'SOL', price: '174,32', changePct: 3.21 },
      { ticker: 'BNB', price: '678,11', changePct: 0.98 },
      { ticker: 'XRP', price: '2,35', changePct: 1.56 },
    ],
  },
  FIIs: {
    label: 'IFIX (B3)',
    value: '3.384,92',
    deltaText: '+0,42% (+14,18)',
    deltaPositive: true,
    maxima: '3.391,10',
    minima: '3.368,40',
    volume: 'R$ 312 M',
    negocios: '482 K',
    candles: [
      { time: '10:00', open: 3.37, close: 3.375, high: 3.378, low: 3.368 },
      { time: '11:00', open: 3.375, close: 3.373, high: 3.379, low: 3.371 },
      { time: '12:00', open: 3.373, close: 3.381, high: 3.384, low: 3.372 },
      { time: '13:00', open: 3.381, close: 3.386, high: 3.39, low: 3.379 },
      { time: '14:00', open: 3.386, close: 3.382, high: 3.389, low: 3.38 },
      { time: '15:00', open: 3.382, close: 3.388, high: 3.391, low: 3.381 },
      { time: '16:00', open: 3.388, close: 3.385, high: 3.39, low: 3.383 },
    ],
    tickers: [
      { ticker: 'HGLG11', price: '161,40', changePct: 0.54 },
      { ticker: 'MXRF11', price: '10,18', changePct: 0.29 },
      { ticker: 'KNRI11', price: '146,80', changePct: 0.71 },
      { ticker: 'XPML11', price: '108,25', changePct: -0.18 },
      { ticker: 'BTLG11', price: '101,90', changePct: 0.44 },
    ],
  },
  ÍNDICES: {
    label: 'DÓLAR PTAX / MACRO',
    value: 'R$ 5,68',
    deltaText: '-0,38% (-0,021)',
    deltaPositive: false,
    maxima: 'R$ 5,73',
    minima: 'R$ 5,65',
    volume: 'US$ 6,8 B',
    negocios: '1,1 M',
    candles: [
      { time: '09:30', open: 5.72, close: 5.71, high: 5.73, low: 5.7 },
      { time: '11:00', open: 5.71, close: 5.69, high: 5.72, low: 5.68 },
      { time: '12:30', open: 5.69, close: 5.7, high: 5.71, low: 5.68 },
      { time: '14:00', open: 5.7, close: 5.67, high: 5.7, low: 5.66 },
      { time: '15:30', open: 5.67, close: 5.68, high: 5.69, low: 5.65 },
      { time: '17:00', open: 5.68, close: 5.68, high: 5.69, low: 5.66 },
    ],
    tickers: [
      { ticker: 'USD/BRL', price: '5,68', changePct: -0.38 },
      { ticker: 'EUR/BRL', price: '6,17', changePct: -0.15 },
      { ticker: 'OURO', price: '2.684', changePct: 0.92 },
      { ticker: 'BRENT', price: '74,80', changePct: 1.05 },
      { ticker: 'DI1F27', price: '13,92%', changePct: -0.08 },
    ],
  },
};

const CRYPTO_ASSETS: CryptoAssetRow[] = [
  {
    symbol: 'BTC',
    name: 'Bitcoin (BTC)',
    priceUsd: 108432.21,
    change24h: 2.14,
    change7d: 5.82,
    spark: [96, 98, 97, 101, 103, 102, 105, 108],
  },
  {
    symbol: 'ETH',
    name: 'Ethereum (ETH)',
    priceUsd: 3987.54,
    change24h: 1.67,
    change7d: 4.15,
    spark: [365, 370, 368, 379, 384, 382, 391, 398],
  },
  {
    symbol: 'SOL',
    name: 'Solana (SOL)',
    priceUsd: 174.32,
    change24h: 3.21,
    change7d: 8.4,
    spark: [152, 155, 154, 160, 165, 163, 169, 174],
  },
  {
    symbol: 'BNB',
    name: 'BNB (BNB)',
    priceUsd: 678.11,
    change24h: 0.98,
    change7d: 2.45,
    spark: [648, 652, 650, 658, 661, 665, 672, 678],
  },
  {
    symbol: 'XRP',
    name: 'XRP (XRP)',
    priceUsd: 2.35,
    change24h: 1.56,
    change7d: 3.9,
    spark: [2.1, 2.14, 2.12, 2.19, 2.23, 2.26, 2.31, 2.35],
  },
];

const FOOD_QUOTES_BY_TAB: Record<FoodTabId, FoodQuoteRow[]> = {
  BÁSICOS: [
    { name: 'Arroz (5Kg)', unit: '5Kg', priceBrl: 28.9, change7d: 2.12, spark: [27.9, 28.1, 28.0, 28.4, 28.6, 28.9] },
    { name: 'Feijão (1Kg)', unit: '1Kg', priceBrl: 8.45, change7d: -1.05, spark: [8.62, 8.6, 8.55, 8.51, 8.48, 8.45] },
    { name: 'Carne Bovina (Kg)', unit: 'Kg', priceBrl: 36.7, change7d: 0.82, spark: [36.1, 36.2, 36.4, 36.3, 36.5, 36.7] },
    { name: 'Frango (Kg)', unit: 'Kg', priceBrl: 14.2, change7d: -0.5, spark: [14.35, 14.3, 14.28, 14.25, 14.22, 14.2] },
    { name: 'Leite (1L)', unit: '1L', priceBrl: 6.15, change7d: 1.65, spark: [5.95, 6.0, 6.04, 6.08, 6.12, 6.15] },
    { name: 'Ovo (dúzia)', unit: '12un', priceBrl: 12.3, change7d: 3.1, spark: [11.7, 11.8, 11.9, 12.05, 12.18, 12.3] },
    { name: 'Tomate (Kg)', unit: 'Kg', priceBrl: 7.85, change7d: -4.15, spark: [8.4, 8.3, 8.15, 8.05, 7.95, 7.85] },
    { name: 'Batata (Kg)', unit: 'Kg', priceBrl: 5.2, change7d: -2.8, spark: [5.5, 5.45, 5.38, 5.32, 5.25, 5.2] },
    { name: 'Cebola (Kg)', unit: 'Kg', priceBrl: 4.9, change7d: -1.22, spark: [5.05, 5.02, 4.98, 4.95, 4.92, 4.9] },
    { name: 'Café (500g)', unit: '500g', priceBrl: 24.6, change7d: 2.75, spark: [23.6, 23.8, 24.0, 24.2, 24.45, 24.6] },
    { name: 'Açúcar (1Kg)', unit: '1Kg', priceBrl: 4.85, change7d: 1.04, spark: [4.75, 4.78, 4.79, 4.81, 4.83, 4.85] },
    { name: 'Óleo de Soja (900ml)', unit: '900ml', priceBrl: 6.3, change7d: 0.96, spark: [6.18, 6.2, 6.22, 6.25, 6.28, 6.3] },
  ],
  GRÃOS: [
    { name: 'Soja CEPEA (sc 60kg)', unit: '60kg', priceBrl: 134.8, change7d: 1.85, spark: [131.5, 132.1, 132.9, 133.4, 134.1, 134.8] },
    { name: 'Milho CEPEA (sc 60kg)', unit: '60kg', priceBrl: 72.4, change7d: 2.4, spark: [70.2, 70.8, 71.1, 71.6, 72.0, 72.4] },
    { name: 'Café Arábica (sc 60kg)', unit: '60kg', priceBrl: 2248.0, change7d: 3.12, spark: [2150, 2175, 2195, 2210, 2232, 2248] },
    { name: 'Trigo Paraná (ton)', unit: 'ton', priceBrl: 1485.0, change7d: -0.68, spark: [1502, 1498, 1495, 1490, 1488, 1485] },
    { name: 'Arroz em Casca RS (50kg)', unit: '50kg', priceBrl: 98.5, change7d: 1.44, spark: [96.5, 97.0, 97.3, 97.8, 98.1, 98.5] },
    { name: 'Algodão Pluma (lp)', unit: 'lp', priceBrl: 4.18, change7d: -0.45, spark: [4.22, 4.21, 4.2, 4.19, 4.19, 4.18] },
  ],
  CARNES: [
    { name: 'Boi Gordo CEPEA (@)', unit: '@', priceBrl: 318.5, change7d: 1.42, spark: [312, 313.5, 315, 316.2, 317.4, 318.5] },
    { name: 'Picanha Bovina (Kg)', unit: 'Kg', priceBrl: 69.9, change7d: 0.95, spark: [68.8, 69.0, 69.2, 69.5, 69.7, 69.9] },
    { name: 'Contrafilé (Kg)', unit: 'Kg', priceBrl: 46.8, change7d: 0.65, spark: [46.2, 46.3, 46.5, 46.6, 46.7, 46.8] },
    { name: 'Peito de Frango (Kg)', unit: 'Kg', priceBrl: 19.4, change7d: -0.82, spark: [19.7, 19.65, 19.58, 19.5, 19.45, 19.4] },
    { name: 'Suíno Vivo SP (Kg)', unit: 'Kg', priceBrl: 8.65, change7d: 1.18, spark: [8.48, 8.52, 8.56, 8.59, 8.62, 8.65] },
    { name: 'Tilápia Filé (Kg)', unit: 'Kg', priceBrl: 38.9, change7d: -0.35, spark: [39.1, 39.05, 39.0, 38.95, 38.92, 38.9] },
  ],
  HORTIFRUTI: [
    { name: 'Tomate Italiano (Kg)', unit: 'Kg', priceBrl: 7.85, change7d: -4.15, spark: [8.4, 8.3, 8.15, 8.05, 7.95, 7.85] },
    { name: 'Batata Inglesa (Kg)', unit: 'Kg', priceBrl: 5.2, change7d: -2.8, spark: [5.5, 5.45, 5.38, 5.32, 5.25, 5.2] },
    { name: 'Cebola Nacional (Kg)', unit: 'Kg', priceBrl: 4.9, change7d: -1.22, spark: [5.05, 5.02, 4.98, 4.95, 4.92, 4.9] },
    { name: 'Banana Prata (Kg)', unit: 'Kg', priceBrl: 6.8, change7d: 1.5, spark: [6.65, 6.68, 6.72, 6.74, 6.78, 6.8] },
    { name: 'Laranja Pera (Kg)', unit: 'Kg', priceBrl: 5.95, change7d: 2.3, spark: [5.75, 5.79, 5.84, 5.88, 5.91, 5.95] },
    { name: 'Alface Crespa (un)', unit: 'un', priceBrl: 3.4, change7d: -0.9, spark: [3.48, 3.46, 3.44, 3.43, 3.41, 3.4] },
  ],
  OUTROS: [
    { name: 'Açúcar Cristal CEPEA (50kg)', unit: '50kg', priceBrl: 141.2, change7d: 1.12, spark: [139.2, 139.6, 140.0, 140.4, 140.9, 141.2] },
    { name: 'Etanol Hidratado SP (L)', unit: 'L', priceBrl: 2.68, change7d: 0.75, spark: [2.64, 2.65, 2.66, 2.66, 2.67, 2.68] },
    { name: 'Azeite Extra Virgem (500ml)', unit: '500ml', priceBrl: 42.9, change7d: -1.35, spark: [43.8, 43.6, 43.4, 43.2, 43.0, 42.9] },
    { name: 'Manteiga c/ Sal (200g)', unit: '200g', priceBrl: 12.8, change7d: 0.94, spark: [12.6, 12.65, 12.68, 12.72, 12.76, 12.8] },
    { name: 'Queijo Mussarela (Kg)', unit: 'Kg', priceBrl: 44.5, change7d: 1.25, spark: [43.7, 43.9, 44.0, 44.2, 44.35, 44.5] },
    { name: 'Farinha de Trigo (1Kg)', unit: '1Kg', priceBrl: 5.45, change7d: -0.55, spark: [5.5, 5.49, 5.48, 5.47, 5.46, 5.45] },
  ],
};

const LIVE_CHANNELS: LiveChannelItem[] = [
  {
    id: 'cnn-br',
    title: 'CNN Brasil - Ao Vivo',
    subtitle: 'Últimas notícias do Brasil e do mundo',
    viewersLabel: '24,1 mil assistindo',
    accentFrom: '#991B1B',
    accentTo: '#1E293B',
    badgeText: 'CNN',
    embedUrl: 'https://www.youtube.com/embed/live_stream?channel=UCvdwhh_fDyWccR42-rReZLw&autoplay=1&mute=1',
    promptTopic: 'SEXTA-FEIRA, faça um resumo das principais manchetes de hoje no Brasil e no mundo em tempo real.',
  },
  {
    id: 'bloomberg',
    title: 'Bloomberg Television',
    subtitle: 'Mercados globais em tempo real',
    viewersLabel: '18,7 mil assistindo',
    accentFrom: '#1D4ED8',
    accentTo: '#0F172A',
    badgeText: 'BBG',
    embedUrl: 'https://www.youtube.com/embed/iEpJwprxDdk?autoplay=1&mute=1',
    promptTopic: 'J.A.R.V.I.S., faça um panorama dos mercados globais, Wall Street, Ibovespa e dólar hoje.',
  },
  {
    id: 'jp-news',
    title: 'Jovem Pan News - Ao Vivo',
    subtitle: 'Política, economia e opinião',
    viewersLabel: '12,4 mil assistindo',
    accentFrom: '#B45309',
    accentTo: '#0F172A',
    badgeText: 'JP',
    embedUrl: 'https://www.youtube.com/embed/live_stream?channel=UCP391YRAjSOdM_bwievgaZA&autoplay=1&mute=1',
    promptTopic: 'SEXTA-FEIRA, sintetize os destaques de política e economia brasileira de hoje com verificação cruzada.',
  },
  {
    id: 'nasa-live',
    title: 'NASA Live',
    subtitle: 'Imagens da Terra em tempo real',
    viewersLabel: '45,6 mil assistindo',
    accentFrom: '#0E7490',
    accentTo: '#020617',
    badgeText: 'NASA',
    embedUrl: 'https://www.youtube.com/embed/21X5lGlDOfg?autoplay=1&mute=1',
    promptTopic: 'ULTRON, apresente o status aeroespacial, clima global e monitoramento orbital da Terra hoje.',
  },
];

const CLIMATE_ALERTS: ClimateAlertItem[] = [
  { id: 'c1', label: 'Furacão / Ciclone no Atlântico', region: 'Atlântico Norte', severity: 'critico', x: 38, y: 40 },
  { id: 'c2', label: 'Chuvas intensas no Sul do Brasil', region: 'Região Sul / BR', severity: 'critico', x: 35, y: 74 },
  { id: 'c3', label: 'Onda de calor na Europa', region: 'Europa Ocidental', severity: 'aviso', x: 52, y: 31 },
  { id: 'c4', label: 'Tempestades tropicais na Ásia', region: 'Sudeste Asiático', severity: 'aviso', x: 78, y: 46 },
  { id: 'c5', label: 'Condições estáveis no Sudeste / RJ', region: 'Rio de Janeiro', severity: 'estavel', x: 37, y: 69 },
];

const WORLD_HOTSPOTS: WorldHotspot[] = [
  {
    id: 'wh1',
    title: 'B3 & Energia no Brasil — Fluxo institucional em alta',
    region: 'AMÉRICAS',
    severity: 'alta',
    category: 'Oportunidades',
    x: 34,
    y: 67,
    summary: 'Setor de energia e bancos puxam o Ibovespa com capital estrangeiro positivo e commodities em destaque.',
    assistant: 'jarvis',
  },
  {
    id: 'wh2',
    title: 'Política Monetária EUA (Fed) e Juros Globais',
    region: 'AMÉRICAS',
    severity: 'alta',
    category: 'Alta relevância',
    x: 24,
    y: 38,
    summary: 'Sinalização sobre trajetória de juros nos EUA impacta dólar, títulos do Tesouro e mercados emergentes.',
    assistant: 'jarvis',
  },
  {
    id: 'wh3',
    title: 'Tensões Geopolíticas na Europa Oriental',
    region: 'EUROPA',
    severity: 'alta',
    category: 'Alta relevância',
    x: 56,
    y: 30,
    summary: 'Monitoramento contínuo de rotas de energia, grãos e impactos diplomáticos na União Europeia.',
    assistant: 'sexta-feira',
  },
  {
    id: 'wh4',
    title: 'Cadeias de Semicondutores & IA na Ásia',
    region: 'ÁSIA',
    severity: 'media',
    category: 'Monitoramento',
    x: 78,
    y: 42,
    summary: 'Aumento na demanda global por GPUs e infraestrutura de datacenters redefine exportações asiáticas.',
    assistant: 'ultron',
  },
  {
    id: 'wh5',
    title: 'Rotas Marítimas e Commodities no Oriente Médio / África',
    region: 'ÁFRICA',
    severity: 'media',
    category: 'Monitoramento',
    x: 56,
    y: 52,
    summary: 'Monitoramento de fretes marítimos, petróleo Brent e logística internacional de alimentos.',
    assistant: 'ultron',
  },
  {
    id: 'wh6',
    title: 'Exportações Agrícolas Brasileiras (Café & Soja)',
    region: 'AMÉRICAS',
    severity: 'baixa',
    category: 'Oportunidades',
    x: 32,
    y: 62,
    summary: 'Demanda externa aquecida fortalece cotações CEPEA-Esalq e balança comercial do agronegócio.',
    assistant: 'sexta-feira',
  },
];

const WEEKDAYS_PT = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const MONTHS_PT = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

function MiniSparkline({
  data,
  positive,
}: {
  data: number[];
  positive: boolean;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 56;
  const height = 18;
  const points = data
    .map((val, idx) => {
      const x = (idx / (data.length - 1)) * width;
      const y = height - 2 - ((val - min) / range) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0 overflow-visible"
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke={positive ? '#10B981' : '#EF4444'}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export function LiveBroadcastHUD({
  workspace,
  liveIntel,
  currentUser,
  isLoadingIntel,
  isProcessing,
  isSpeaking,
  speakingSpeaker,
  isStandbyActive,
  isFocusMode,
  onRefreshIntel,
  onAskAssistant,
  onSpeakHeadline,
  onOpenHologram,
  onToggleStandby,
  onToggleFocusMode,
  onFocusConsole,
  onOpenView,
}: LiveBroadcastHUDProps) {
  const [clockNow, setClockNow] = useState<Date>(() => new Date());
  const [activeNavId, setActiveNavId] = useState<string>('inicio');
  const [marketTab, setMarketTab] = useState<MarketTabId>('IBOVESPA');
  const [hoveredCandleIdx, setHoveredCandleIdx] = useState<number | null>(null);
  const [cryptoCurrency, setCryptoCurrency] = useState<'USD' | 'BRL'>('USD');
  const [cryptoPeriod, setCryptoPeriod] = useState<'24h' | '7d'>('24h');
  const [foodTab, setFoodTab] = useState<FoodTabId>('BÁSICOS');
  const [newsTab, setNewsTab] = useState<NewsTabId>('BRASIL');
  const [selectedContinent, setSelectedContinent] = useState<ContinentId>('GLOBAL');
  const [selectedHotspotId, setSelectedHotspotId] = useState<string>('wh1');
  const [selectedClimateId, setSelectedClimateId] = useState<string>('c2');
  const [newsMapSeverityFilter, setNewsMapSeverityFilter] = useState<SeverityLevel | 'todos'>('todos');
  const [activeVideoChannel, setActiveVideoChannel] = useState<LiveChannelItem | null>(null);
  const [weatherCityMode, setWeatherCityMode] = useState<'RJ' | 'SP' | 'DF'>('RJ');
  const [inlinePrompt, setInlinePrompt] = useState('');
  const [inlineTarget, setInlineTarget] = useState<InteractionMode>('todos');

  useEffect(() => {
    const id = window.setInterval(() => setClockNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const formattedDate = `${WEEKDAYS_PT[clockNow.getDay()]}, ${String(
    clockNow.getDate()
  ).padStart(2, '0')} ${MONTHS_PT[clockNow.getMonth()]} ${clockNow.getFullYear()}`;
  const formattedTime = clockNow.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const marketData = MARKET_DATASETS[marketTab];
  const usdToBrlRate = 5.68;

  const pdfStudyCount = workspace.jarvisKnowledgeBase?.length ?? 0;
  const evolution = workspace.neuralEvolution;
  const unresolvedAlerts = useMemo(
    () => (workspace.alerts ?? []).filter((a) => !a.resolved),
    [workspace.alerts]
  );

  // Sync weather card with real liveIntel.weather (Rio de Janeiro default, or quick city preview)
  const weatherDisplay = useMemo(() => {
    const live = liveIntel?.weather;
    if (weatherCityMode === 'RJ' && live) {
      return {
        city: live.city || 'Rio de Janeiro - RJ',
        tempC: Math.round(live.temperatureC),
        condition: live.conditionLabel,
        humidity: Math.round(live.humidityPercent),
        windKmh: Math.round(live.windSpeedKmh),
        feelsLikeC: Math.round(live.apparentTemperatureC),
        forecast: live.forecast.slice(0, 5).map((day, idx) => {
          const d = new Date(`${day.date}T12:00:00`);
          const label =
            idx === 0
              ? 'Hoje'
              : Number.isNaN(d.getTime())
              ? `D+${idx}`
              : WEEKDAYS_PT[d.getDay()].slice(0, 3);
          return {
            label,
            max: Math.round(day.tempMaxC),
            min: Math.round(day.tempMinC),
          };
        }),
      };
    }
    if (weatherCityMode === 'SP') {
      return {
        city: 'São Paulo - SP',
        tempC: 22,
        condition: 'Parcialmente nublado',
        humidity: 68,
        windKmh: 12,
        feelsLikeC: 23,
        forecast: [
          { label: 'Hoje', max: 26, min: 18 },
          { label: 'Ter', max: 27, min: 18 },
          { label: 'Qua', max: 25, min: 17 },
          { label: 'Qui', max: 28, min: 19 },
          { label: 'Sex', max: 26, min: 18 },
        ],
      };
    }
    return {
      city: weatherCityMode === 'DF' ? 'Brasília - DF' : 'Rio de Janeiro - RJ',
      tempC: weatherCityMode === 'DF' ? 25 : 27,
      condition: weatherCityMode === 'DF' ? 'Céu limpo e seco' : 'Ensolarado com nuvens',
      humidity: weatherCityMode === 'DF' ? 46 : 64,
      windKmh: weatherCityMode === 'DF' ? 14 : 16,
      feelsLikeC: weatherCityMode === 'DF' ? 25 : 29,
      forecast: [
        { label: 'Hoje', max: 29, min: 21 },
        { label: 'Ter', max: 30, min: 22 },
        { label: 'Qua', max: 28, min: 21 },
        { label: 'Qui', max: 29, min: 20 },
        { label: 'Sex', max: 31, min: 22 },
      ],
    };
  }, [liveIntel?.weather, weatherCityMode]);

  // Build dynamic headlines across all 6 news tabs using real liveIntel + dailyIntelFeed
  const newsByCategory = useMemo(() => {
    const snapshots = workspace.dailyIntelFeed ?? [];
    const g1Items = snapshots
      .filter((s) => s.sourceKey === 'g1')
      .flatMap((s) => s.items);
    const b3Items = snapshots
      .filter((s) => s.sourceKey === 'b3' || s.sourceKey === 'cepea')
      .flatMap((s) => s.items);

    const mapLive = (
      items: NonNullable<LiveIntelBriefing['news']['brasil']> | undefined,
      tag: string
    ) =>
      (items ?? []).slice(0, 6).map((item, idx) => ({
        id: item.id || `${tag}-${idx}`,
        time: item.pubDate
          ? new Date(item.pubDate).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : `0${Math.max(6, 9 - idx)}:${idx % 2 === 0 ? '42' : '15'}`,
        title: item.title,
        detail: `${item.source} · Cobertura ao vivo integrada ao RODACK IA`,
        tag,
        source: item.source,
      }));

    const brasilLive = [
      ...mapLive(liveIntel?.news?.brasil, 'BRASIL'),
      ...mapLive(liveIntel?.news?.rio, 'RIO / BR'),
      ...g1Items.slice(0, 3).map((item, idx) => ({
        id: `g1-${idx}`,
        time: 'AO VIVO',
        title: item.title,
        detail: item.detail || 'Atualização em tempo real · G1 Globo',
        tag: 'BRASIL',
        source: 'G1 Globo',
      })),
    ];

    const mundoLive = mapLive(liveIntel?.news?.mundo, 'MUNDO');

    const economiaLive = b3Items.slice(0, 4).map((item, idx) => ({
      id: `econ-${idx}`,
      time: 'MERCADO',
      title: item.title,
      detail: item.detail || 'Indicadores B3 & CEPEA-Esalq',
      tag: 'ECONOMIA',
      source: 'B3 / CEPEA',
    }));

    const fallback: Record<
      NewsTabId,
      Array<{ id: string; time: string; title: string; detail: string; tag: string; source: string }>
    > = {
      BRASIL:
        brasilLive.length > 0
          ? brasilLive.slice(0, 5)
          : [
              {
                id: 'fb-br-1',
                time: '09:58',
                title: 'Pacote de infraestrutura e transição energética impulsiona indústria brasileira',
                detail: 'Investimentos priorizam energia limpa, logística portuária e inovação industrial.',
                tag: 'BRASIL',
                source: 'G1 / Radar BR',
              },
              {
                id: 'fb-br-2',
                time: '09:12',
                title: 'Rio de Janeiro amplia corredor tecnológico e centros de pesquisa em IA',
                detail: 'Iniciativa reúne universidades e empresas de engenharia de software.',
                tag: 'BRASIL',
                source: 'Radar RJ',
              },
              {
                id: 'fb-br-3',
                time: '08:30',
                title: 'Safra nacional mantém ritmo forte nas exportações de grãos e café',
                detail: 'CEPEA-Esalq aponta sustentação nos preços do arábica e soja.',
                tag: 'BRASIL',
                source: 'CEPEA-Esalq',
              },
            ],
      MUNDO:
        mundoLive.length > 0
          ? mundoLive.slice(0, 5)
          : [
              {
                id: 'fb-wd-1',
                time: '09:34',
                title: 'EUA sinalizam calibragem na taxa de juros e mercados globais reagem positivamente',
                detail: 'Investidores acompanham discursos do Federal Reserve e dados de inflação.',
                tag: 'MUNDO',
                source: 'Bloomberg / Mundo',
              },
              {
                id: 'fb-wd-2',
                time: '08:17',
                title: 'Negociações diplomáticas na Europa mantêm foco em segurança energética',
                detail: 'União Europeia reforça estoques estratégicos e diversificação de matriz.',
                tag: 'MUNDO',
                source: 'Radar Global',
              },
            ],
      ECONOMIA:
        economiaLive.length > 0
          ? economiaLive.slice(0, 5)
          : [
              {
                id: 'fb-ec-1',
                time: '10:05',
                title: 'Ibovespa opera em alta liderado por Petrobras, bancos e exportadoras',
                detail: 'Fluxo estrangeiro volta a ficar positivo na B3 com apetite por risco.',
                tag: 'ECONOMIA',
                source: 'B3 Live',
              },
              {
                id: 'fb-ec-2',
                time: '09:20',
                title: 'Indicadores de alimentos básicos mostram recuo no tomate e firmeza no café',
                detail: 'Monitoramento CEPEA destaca impacto do clima na oferta regional.',
                tag: 'ECONOMIA',
                source: 'CEPEA',
              },
            ],
      TECNOLOGIA: [
        {
          id: 'fb-tc-1',
          time: '09:45',
          title: 'Nova geração de modelos multimodais acelera diagnóstico em engenharia e saúde',
          detail: 'Sistemas de raciocínio em tempo real elevam produtividade técnica em múltiplas frentes.',
          tag: 'TECNOLOGIA',
          source: 'Tech Radar',
        },
        {
          id: 'fb-tc-2',
          time: '08:50',
          title: 'Arquiteturas híbridas nuvem-offline ampliam resiliência de assistentes pessoais',
          detail: 'Sincronização Firestore + cache local garante continuidade sem latência.',
          tag: 'TECNOLOGIA',
          source: 'RODACK Lab',
        },
        {
          id: 'fb-tc-3',
          time: '07:52',
          title: 'Semiconductores para IA registram expansão recorde em data centers globais',
          detail: 'Demanda por inferência de baixa latência guia novos investimentos no setor.',
          tag: 'TECNOLOGIA',
          source: 'Global Tech',
        },
      ],
      SAÚDE: [
        {
          id: 'fb-sd-1',
          time: '09:10',
          title: 'Pesquisas reforçam impacto de rotina de sono e pausas táticas na performance cognitiva',
          detail: 'Protocolos de foco em blocos de 50 minutos reduzem fadiga decisória.',
          tag: 'SAÚDE',
          source: 'Saúde & Performance',
        },
        {
          id: 'fb-sd-2',
          time: '08:05',
          title: 'Ferramentas de triagem por IA reduzem tempo de análise em exames de imagem',
          detail: 'Hospitais de referência adotam apoio diagnóstico supervisionado por especialistas.',
          tag: 'SAÚDE',
          source: 'MedTech BR',
        },
      ],
      'MEIO AMBIENTE': [
        {
          id: 'fb-ma-1',
          time: '08:40',
          title: 'Monitoramento por satélite registra queda no desmatamento pelo 2º mês consecutivo',
          detail: 'Dados consolidados indicam avanço de fiscalização e manejo sustentável.',
          tag: 'MEIO AMBIENTE',
          source: 'Radar Climático',
        },
        {
          id: 'fb-ma-2',
          time: '07:35',
          title: 'Frentes frias no Atlântico Sul exigem atenção para chuvas no Sul e Sudeste',
          detail: 'ULTRON acompanha umidade e velocidade de ventos em tempo real.',
          tag: 'MEIO AMBIENTE',
          source: 'Clima Global',
        },
      ],
    };

    return fallback;
  }, [liveIntel?.news, workspace.dailyIntelFeed]);

  const activeNewsItems = newsByCategory[newsTab];

  // Combine real workspace agenda with key macro events for "Próximos Eventos"
  const upcomingCombinedEvents = useMemo(() => {
    const userAgenda = (workspace.agenda ?? [])
      .filter((e) => !e.completed)
      .slice(0, 3)
      .map((ev) => ({
        id: ev.id,
        time: ev.startTime,
        badge: 'AGENDA',
        title: ev.title,
        isUserAgenda: true,
      }));
    const macroEvents = [
      { id: 'mac-1', time: '10:30', badge: 'BR', title: 'IPCA-15 / Indicadores Econômicos (Brasil)', isUserAgenda: false },
      { id: 'mac-2', time: '12:00', badge: 'EUA', title: 'Discurso de Política Monetária (Fed)', isUserAgenda: false },
      { id: 'mac-3', time: '15:00', badge: 'B3', title: 'Relatório de Mercado · Petrobras & Energia', isUserAgenda: false },
      { id: 'mac-4', time: '16:30', badge: 'OIL', title: 'Estoques de Petróleo (EUA)', isUserAgenda: false },
      { id: 'mac-5', time: '20:00', badge: 'EUR', title: 'Coletiva de Imprensa · BCE', isUserAgenda: false },
    ];
    return [...userAgenda, ...macroEvents].slice(0, 5);
  }, [workspace.agenda]);

  // Dynamic Alerts list combining workspace.alerts + live market/weather alerts
  const smartAlertsList = useMemo(() => {
    const realAlerts = unresolvedAlerts.slice(0, 3).map((al) => ({
      id: al.id,
      severity: al.severity,
      title: al.title,
      subtitle: `${al.raisedBy.toUpperCase()} · ${al.detail.slice(0, 62)}`,
      prompt: `Detalhe e resolva o alerta "${al.title}": ${al.detail}`,
      assistant: al.raisedBy as InteractionMode,
    }));
    const fallbackAlerts = [
      {
        id: 'live-al-1',
        severity: 'critico' as const,
        title: 'PETR4 testa resistência técnica em R$ 37,00',
        subtitle: 'J.A.R.V.I.S. · Monitoramento B3 em tempo real',
        prompt: 'J.A.R.V.I.S., analise o rompimento técnico de PETR4 e o setor de energia na B3 hoje.',
        assistant: 'jarvis' as InteractionMode,
      },
      {
        id: 'live-al-2',
        severity: 'aviso' as const,
        title: 'Preço do tomate recua 4,15% na semana (CEPEA)',
        subtitle: 'ULTRON · Tendência de alimentos básicos',
        prompt: 'ULTRON, analise a queda do tomate e a tendência dos alimentos básicos nesta semana.',
        assistant: 'ultron' as InteractionMode,
      },
      {
        id: 'live-al-3',
        severity: 'info' as const,
        title: `Clima ${weatherDisplay.city}: ${weatherDisplay.tempC}°C (${weatherDisplay.condition})`,
        subtitle: `SEXTA-FEIRA · Umidade ${weatherDisplay.humidity}% · Vento ${weatherDisplay.windKmh} km/h`,
        prompt: `SEXTA-FEIRA, passe o boletim climático completo para ${weatherDisplay.city} e recomendações para o dia.`,
        assistant: 'sexta-feira' as InteractionMode,
      },
    ];
    return [...realAlerts, ...fallbackAlerts].slice(0, 4);
  }, [unresolvedAlerts, weatherDisplay]);

  // Dynamic AI Insights from Neural Evolution + PDF Library + Market
  const aiInsights = useMemo(() => {
    const jarvisInsight =
      evolution?.assistants?.jarvis?.latestInsight ||
      'Setor de energia e bancos mostram resiliência operacional com foco em disciplina estratégica.';
    const fridayInsight =
      evolution?.assistants?.['sexta-feira']?.latestInsight ||
      'Curadoria cruzada ativa: sinais de política monetária e exportações de café merecem acompanhamento.';
    const ultronInsight =
      evolution?.assistants?.ultron?.latestInsight ||
      'Queda no tomate e frentes frias no Sul exigem monitoramento logístico nesta semana.';
    return [
      {
        id: 'ins-1',
        label: 'Mercado',
        color: 'text-emerald-400',
        text: jarvisInsight,
        prompt: `J.A.R.V.I.S., aprofunde este insight de mercado: ${jarvisInsight}`,
        mode: 'jarvis' as InteractionMode,
      },
      {
        id: 'ins-2',
        label: 'Assuntos Gerais',
        color: 'text-sky-400',
        text: fridayInsight,
        prompt: `SEXTA-FEIRA, aprofunde este resumo cruzado: ${fridayInsight}`,
        mode: 'sexta-feira' as InteractionMode,
      },
      {
        id: 'ins-3',
        label: 'Clima & Alimentos',
        color: 'text-amber-400',
        text: ultronInsight,
        prompt: `ULTRON, gere uma previsão tática detalhada sobre: ${ultronInsight}`,
        mode: 'ultron' as InteractionMode,
      },
      {
        id: 'ins-4',
        label: 'Base PDF & Evolução',
        color: 'text-cyan-300',
        text: `${pdfStudyCount} PDF(s) na biblioteca offline do J.A.R.V.I.S. · ${evolution?.totalLearningCycles ?? 1} ciclos de aprendizado ativo.`,
        prompt: 'J.A.R.V.I.S., resuma os aprendizados ativos da minha base de estudos em PDF e da Matriz de Evolução.',
        mode: 'jarvis' as InteractionMode,
      },
    ];
  }, [evolution, pdfStudyCount]);

  const filteredWorldHotspots = useMemo(() => {
    return WORLD_HOTSPOTS.filter(
      (h) => selectedContinent === 'GLOBAL' || h.region === selectedContinent
    );
  }, [selectedContinent]);

  const selectedHotspot =
    WORLD_HOTSPOTS.find((h) => h.id === selectedHotspotId) ?? WORLD_HOTSPOTS[0];

  const newsMapEvents = useMemo(() => {
    const baseEvents = [
      {
        num: 1,
        title: liveIntel?.news?.mundo?.[0]?.title?.slice(0, 42) || 'Geopolítica e Energia na Europa',
        severity: 'alta' as SeverityLevel,
        x: 56,
        y: 30,
      },
      {
        num: 2,
        title: liveIntel?.news?.mundo?.[1]?.title?.slice(0, 42) || 'Tensões Comerciais EUA x China',
        severity: 'alta' as SeverityLevel,
        x: 77,
        y: 41,
      },
      {
        num: 3,
        title: liveIntel?.news?.brasil?.[0]?.title?.slice(0, 42) || 'Agenda Econômica e Mercado no Brasil',
        severity: 'media' as SeverityLevel,
        x: 34,
        y: 67,
      },
      {
        num: 4,
        title: liveIntel?.news?.mundo?.[2]?.title?.slice(0, 42) || 'Cúpula Internacional e Bancos Centrais',
        severity: 'media' as SeverityLevel,
        x: 49,
        y: 33,
      },
      {
        num: 5,
        title: liveIntel?.news?.rio?.[0]?.title?.slice(0, 42) || 'Destaques Regionais · Rio de Janeiro',
        severity: 'baixa' as SeverityLevel,
        x: 36,
        y: 71,
      },
    ];
    return newsMapSeverityFilter === 'todos'
      ? baseEvents
      : baseEvents.filter((e) => e.severity === newsMapSeverityFilter);
  }, [liveIntel?.news, newsMapSeverityFilter]);

  const scrollToSection = (sectionId: string, navId: string) => {
    triggerHaptic('tap');
    setActiveNavId(navId);
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleInlineSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inlinePrompt.trim();
    if (!trimmed || isProcessing) return;
    triggerHaptic('tap');
    onAskAssistant(trimmed, inlineTarget);
    setInlinePrompt('');
  };

  const sidebarItems = [
    { id: 'inicio', label: 'Início', icon: Home, action: () => scrollToSection('live-top', 'inicio') },
    { id: 'bolsa', label: 'Bolsa', icon: TrendingUp, action: () => scrollToSection('live-markets', 'bolsa') },
    {
      id: 'commodities',
      label: 'Commodities',
      icon: Wheat,
      action: () => {
        setFoodTab('GRÃOS');
        scrollToSection('live-food', 'commodities');
      },
    },
    {
      id: 'alimentos',
      label: 'Alimentos',
      icon: Apple,
      action: () => {
        setFoodTab('BÁSICOS');
        scrollToSection('live-food', 'alimentos');
      },
    },
    { id: 'noticias', label: 'Notícias', icon: Newspaper, action: () => scrollToSection('live-news', 'noticias') },
    { id: 'videos', label: 'Vídeos', icon: Tv, action: () => scrollToSection('live-videos', 'videos') },
    { id: 'tempo', label: 'Tempo', icon: CloudSun, action: () => scrollToSection('live-weather', 'tempo') },
    { id: 'mapas', label: 'Mapas', icon: MapIcon, action: () => scrollToSection('live-world', 'mapas') },
    { id: 'assistentes', label: 'Assistentes', icon: Bot, action: () => scrollToSection('live-assistants', 'assistentes') },
    { id: 'alertas', label: 'Alertas', icon: Bell, action: () => scrollToSection('live-bottom', 'alertas') },
    {
      id: 'ferramentas',
      label: 'Ferramentas',
      icon: Wrench,
      action: () => {
        triggerHaptic('tap');
        setActiveNavId('ferramentas');
        onFocusConsole();
      },
    },
    {
      id: 'config',
      label: 'Config.',
      icon: Settings,
      action: () => {
        triggerHaptic('tap');
        setActiveNavId('config');
        onOpenView('memoria');
      },
    },
  ];

  // Candlestick SVG bounds
  const candleMin = Math.min(...marketData.candles.map((c) => c.low));
  const candleMax = Math.max(...marketData.candles.map((c) => c.high));
  const candleSpan = candleMax - candleMin || 1;
  const hoveredCandle =
    hoveredCandleIdx !== null ? marketData.candles[hoveredCandleIdx] : null;

  return (
    <section
      id="live-top"
      aria-label="RODACK IA · Tema LIVE"
      className="mb-5 rounded-2xl border border-sky-400/30 bg-[#040A16]/95 text-sky-50 shadow-[0_24px_60px_-24px_rgba(2,132,199,0.45)] overflow-hidden"
    >
      {/* Top Broadcast Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-400/25 bg-gradient-to-r from-[#051226] via-[#071B36] to-[#051226] px-3 sm:px-4 py-2.5">
        {/* Left Brand */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-400/50 bg-cyan-500/15 shadow-[0_0_18px_rgba(34,211,238,0.35)]">
            <Cpu className="h-5 w-5 text-cyan-300" />
          </div>
          <div className="leading-tight min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display text-base sm:text-lg font-extrabold tracking-wider text-white">
                RODACK <span className="text-cyan-400">IA</span>
              </span>
              <span className="rounded border border-cyan-400/40 bg-cyan-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-cyan-200">
                TEMA LIVE
              </span>
            </div>
            <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-sky-300/75 truncate">
              Inteligência que Conecta o Seu Mundo
            </p>
          </div>
        </div>

        {/* Center Motto */}
        <div className="hidden xl:flex items-center justify-center rounded-lg border border-sky-400/20 bg-[#040E1E]/80 px-5 py-1.5">
          <span className="font-display text-xs font-semibold tracking-[0.16em] text-sky-100 uppercase">
            Informação Hoje. Decisões Melhores Amanhã.
          </span>
        </div>

        {/* Right Live Clock + AO VIVO + User + Settings */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          <div className="hidden sm:flex items-center gap-2.5 font-mono text-xs text-sky-200/85 tabular-nums">
            <span>{formattedDate}</span>
            <span className="text-base font-bold text-white">{formattedTime}</span>
          </div>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('tap');
              onRefreshIntel();
            }}
            disabled={isLoadingIntel}
            title="Atualizar clima, notícias e sinais ao vivo"
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/45 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-mono font-bold uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/25 transition-colors disabled:opacity-60"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-400 live-pulse-dot" />
            <span>{isLoadingIntel ? 'SINCRONIZANDO' : 'AO VIVO'}</span>
            <RefreshCw className={`h-3 w-3 ${isLoadingIntel ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('tap');
              onOpenView('memoria');
            }}
            className="hidden md:flex items-center gap-2 rounded-lg border border-sky-400/25 bg-[#06152B]/90 px-2.5 py-1 text-left hover:border-cyan-400/50 transition-colors"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/45 bg-cyan-500/20 text-cyan-200">
              <User className="h-3.5 w-3.5" />
            </div>
            <div className="leading-tight">
              <div className="text-xs font-semibold text-white">
                Olá, {currentUser.username}
              </div>
              <div className="text-[10px] text-sky-300/75">
                Grandes ideias, grandes resultados.
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('tap');
              onOpenView('memoria');
            }}
            title="Configurações de Voz, Tema e Memória"
            aria-label="Abrir configurações"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-sky-400/30 bg-[#06152B] text-sky-200 hover:border-cyan-400 hover:text-white transition-colors"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Mobile Compact Navigation Strip */}
      <div className="flex lg:hidden items-center gap-1 overflow-x-auto border-b border-sky-400/20 bg-[#051022] px-2.5 py-2">
        {sidebarItems.map((item) => {
          const Icon = item.icon;
          const active = activeNavId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.action}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors ${
                active
                  ? 'bg-cyan-500/20 border border-cyan-400/50 text-cyan-200'
                  : 'border border-transparent text-sky-300/75 hover:bg-sky-900/40 hover:text-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Layout: Left Vertical Rail + Broadcast Grid */}
      <div className="flex">
        {/* Desktop Vertical Navigation Rail */}
        <aside
          aria-label="Menu rápido Tema LIVE"
          className="hidden lg:flex w-[84px] shrink-0 flex-col items-stretch gap-1 border-r border-sky-400/20 bg-[#040D1D]/95 p-1.5"
        >
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const active = activeNavId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={item.action}
                className={`flex flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium transition-all ${
                  active
                    ? 'border border-cyan-400/55 bg-gradient-to-b from-cyan-500/25 to-sky-900/35 text-cyan-200 shadow-[0_0_16px_rgba(34,211,238,0.2)]'
                    : 'border border-transparent text-sky-300/75 hover:border-sky-400/25 hover:bg-[#081A33] hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="uppercase tracking-wide truncate max-w-full">
                  {item.label}
                </span>
              </button>
            );
          })}
        </aside>

        {/* Broadcast Content Canvas */}
        <div className="flex-1 min-w-0 p-2.5 sm:p-3.5 space-y-3 bg-[radial-gradient(ellipse_at_top,rgba(14,165,233,0.09),transparent_55%)]">
          {/* ROW 1: 3 Live AI Assistants + Tempo Agora + Clima Global */}
          <div
            id="live-assistants"
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3"
          >
            {/* Assistant 1: J.A.R.V.I.S. */}
            {(
              [
                {
                  id: 'jarvis' as AssistantId,
                  name: 'J.A.R.V.I.S.',
                  subtitle: 'ANÁLISE FINANCEIRA & SABEDORIA',
                  quote:
                    '“Mercados em movimento. Aqui estão os destaques e decisões estratégicas de hoje...”',
                  avatar: JARVIS_AVATAR_URL,
                  accentBorder: 'border-cyan-400/35 hover:border-cyan-300/65',
                  accentText: 'text-cyan-300',
                  topics: [
                    {
                      label: 'Ações & B3 ao vivo',
                      prompt:
                        'J.A.R.V.I.S., analise o desempenho do Ibovespa, Petrobras, Vale e bancos hoje.',
                    },
                    {
                      label: 'Criptomoedas (BTC / ETH)',
                      prompt:
                        'J.A.R.V.I.S., qual o panorama atual de Bitcoin, Ethereum e fluxo cripto hoje?',
                    },
                    {
                      label: `Estudos PDF (${pdfStudyCount} doc${pdfStudyCount === 1 ? '' : 's'})`,
                      prompt:
                        'J.A.R.V.I.S., me ajude a estudar usando os PDFs salvos na sua base de conhecimento.',
                    },
                    {
                      label: 'Riscos e oportunidades',
                      prompt:
                        'J.A.R.V.I.S., destaque os principais riscos e oportunidades estratégicas para minha semana.',
                    },
                  ],
                },
                {
                  id: 'sexta-feira' as AssistantId,
                  name: 'SEXTA-FEIRA',
                  subtitle: 'INTELIGÊNCIA GLOBAL & ASSUNTOS GERAIS',
                  quote:
                    '“Monitorando eventos no Brasil e no mundo em tempo real com checagem cruzada...”',
                  avatar: FRIDAY_AVATAR_URL,
                  accentBorder: 'border-sky-400/35 hover:border-sky-300/65',
                  accentText: 'text-sky-300',
                  topics: [
                    {
                      label: 'Notícias G1 / Mundo',
                      prompt:
                        'SEXTA-FEIRA, sintetize as 5 notícias mais importantes do Brasil e do mundo agora.',
                    },
                    {
                      label: 'Geopolítica & Diplomacia',
                      prompt:
                        'SEXTA-FEIRA, quais os principais movimentos geopolíticos globais de hoje?',
                    },
                    {
                      label: 'Economia & Política BR',
                      prompt:
                        'SEXTA-FEIRA, faça uma síntese rápida e verificada da economia brasileira hoje.',
                    },
                    {
                      label: 'Tendências & Esportes GE',
                      prompt:
                        'SEXTA-FEIRA, resuma as tendências do dia, tecnologia e destaques esportivos.',
                    },
                  ],
                },
                {
                  id: 'ultron' as AssistantId,
                  name: 'ULTRON',
                  subtitle: 'DIAGNÓSTICO PREDITIVO & AMBIENTE',
                  quote:
                    '“Clima, alimentos, segurança e vulnerabilidades mapeados em tempo real...”',
                  avatar: ULTRON_AVATAR_URL,
                  accentBorder: 'border-amber-400/35 hover:border-amber-300/65',
                  accentText: 'text-amber-300',
                  topics: [
                    {
                      label: 'Clima e meio ambiente',
                      prompt:
                        'ULTRON, execute um relatório preditivo sobre clima no Brasil e alertas climáticos globais.',
                    },
                    {
                      label: 'Alimentos & CEPEA',
                      prompt:
                        'ULTRON, analise a variação nos preços dos alimentos básicos e commodities agrícolas.',
                    },
                    {
                      label: 'Segurança e auditoria',
                      prompt:
                        'ULTRON, faça uma auditoria de riscos, vulnerabilidades e alertas pendentes no sistema.',
                    },
                    {
                      label: 'Modelagem preditiva',
                      prompt:
                        'ULTRON, apresente cenários preditivos para os próximos 7 dias em mercados e clima.',
                    },
                  ],
                },
              ] as const
            ).map((ai) => {
              const isThisSpeaking =
                isSpeaking &&
                (speakingSpeaker === ai.id ||
                  speakingSpeaker === 'todos' ||
                  (speakingSpeaker === 'ambos' && ai.id !== 'ultron'));
              const statusLabel = isThisSpeaking
                ? 'FALANDO'
                : isProcessing
                ? 'ANALISANDO'
                : 'ONLINE';

              return (
                <div
                  key={ai.id}
                  className={`xl:col-span-3 live-theme-panel rounded-xl p-3 flex flex-col justify-between transition-colors ${ai.accentBorder}`}
                >
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('tap');
                        onOpenHologram(ai.id);
                      }}
                      title={`Abrir holograma 3D de ${ai.name}`}
                      className="relative h-28 w-24 shrink-0 overflow-hidden rounded-lg border border-cyan-400/40 bg-[#040E1D] group"
                    >
                      <img
                        src={ai.avatar}
                        alt={ai.name}
                        className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#040A16] to-transparent" />
                      <span className="absolute bottom-1 inset-x-1 text-center font-mono text-[9px] font-semibold uppercase tracking-wider text-cyan-200 opacity-0 group-hover:opacity-100 transition-opacity">
                        Holograma 3D
                      </span>
                    </button>

                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="min-w-0">
                          <h3 className="font-display text-sm font-bold tracking-wide text-white truncate">
                            {ai.name}
                          </h3>
                          <p
                            className={`font-mono text-[10px] font-semibold uppercase tracking-wider truncate ${ai.accentText}`}
                          >
                            {ai.subtitle}
                          </p>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase shrink-0 ${
                            isThisSpeaking
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                              : 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/35'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              isThisSpeaking ? 'bg-amber-400' : 'bg-emerald-400'
                            } live-pulse-dot`}
                          />
                          {statusLabel}
                        </span>
                      </div>

                      <p className="text-[11px] leading-snug text-sky-100/80 line-clamp-2">
                        {ai.quote}
                      </p>

                      <div className="space-y-0.5 pt-0.5">
                        {ai.topics.map((topic) => (
                          <button
                            key={topic.label}
                            type="button"
                            disabled={isProcessing}
                            onClick={() => {
                              triggerHaptic('tap');
                              onAskAssistant(topic.prompt, ai.id);
                            }}
                            className="flex w-full items-center justify-between gap-1 rounded px-1.5 py-0.5 text-left text-[11px] text-sky-200/90 hover:bg-cyan-500/15 hover:text-white transition-colors disabled:opacity-50"
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              <Sparkles className="h-2.5 w-2.5 text-cyan-400 shrink-0" />
                              <span className="truncate">{topic.label}</span>
                            </span>
                            <ChevronRight className="h-3 w-3 text-sky-400/70 shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Weather Card + Global Climate Card (xl:col-span-3 split or side-by-side) */}
            <div
              id="live-weather"
              className="md:col-span-2 xl:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-3"
            >
              {/* Tempo Agora */}
              <div className="live-theme-panel rounded-xl p-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                      Tempo Agora
                    </span>
                    <div className="inline-flex rounded border border-sky-400/25 bg-[#040D1B] p-0.5 text-[9px] font-mono">
                      {(['RJ', 'SP', 'DF'] as const).map((code) => (
                        <button
                          key={code}
                          type="button"
                          onClick={() => {
                            triggerHaptic('tap');
                            setWeatherCityMode(code);
                          }}
                          className={`px-1.5 py-0.5 rounded transition-colors ${
                            weatherCityMode === code
                              ? 'bg-cyan-500 text-slate-950 font-bold'
                              : 'text-sky-300/75 hover:text-white'
                          }`}
                        >
                          {code}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-medium text-sky-200 truncate">
                        {weatherDisplay.city}
                      </div>
                      <div className="font-display text-3xl font-bold text-white tabular-nums leading-none mt-0.5">
                        {weatherDisplay.tempC}°C
                      </div>
                      <div className="text-[11px] text-sky-200/80 mt-1 truncate">
                        {weatherDisplay.condition}
                      </div>
                    </div>
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-amber-400/30 bg-gradient-to-br from-amber-400/20 to-sky-500/15">
                      <CloudSun className="h-7 w-7 text-amber-300" />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1 border-t border-sky-400/15 pt-2 text-[10px] tabular-nums">
                    <div className="flex flex-col">
                      <span className="text-sky-300/65 flex items-center gap-0.5">
                        <Droplets className="h-2.5 w-2.5 text-cyan-400" /> Umid.
                      </span>
                      <span className="font-mono font-semibold text-white">
                        {weatherDisplay.humidity}%
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sky-300/65 flex items-center gap-0.5">
                        <Wind className="h-2.5 w-2.5 text-cyan-400" /> Vento
                      </span>
                      <span className="font-mono font-semibold text-white">
                        {weatherDisplay.windKmh} km/h
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sky-300/65 flex items-center gap-0.5">
                        <Thermometer className="h-2.5 w-2.5 text-amber-400" /> Sens.
                      </span>
                      <span className="font-mono font-semibold text-white">
                        {weatherDisplay.feelsLikeC}°C
                      </span>
                    </div>
                  </div>
                </div>

                {/* 5-Day Mini Forecast */}
                <div className="mt-2 grid grid-cols-5 gap-1 border-t border-sky-400/15 pt-2 text-center font-mono text-[10px] tabular-nums">
                  {weatherDisplay.forecast.map((d) => (
                    <div key={d.label} className="space-y-0.5">
                      <div className="text-[9px] text-sky-300/70">{d.label}</div>
                      <div className="font-bold text-white">{d.max}°</div>
                      <div className="text-[9px] text-sky-400/75">{d.min}°</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Clima Global */}
              <div className="live-theme-panel rounded-xl p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                    Clima Global
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenView('radar')}
                    className="font-mono text-[9px] uppercase text-sky-300 hover:text-cyan-200 transition-colors"
                  >
                    Radar →
                  </button>
                </div>

                {/* Stylized Earth Weather Globe SVG */}
                <div className="relative h-20 w-full rounded-lg border border-sky-400/20 bg-[#030A17] overflow-hidden mb-1.5 flex items-center justify-center">
                  <svg viewBox="0 0 180 86" className="h-full w-full" aria-hidden="true">
                    <defs>
                      <radialGradient id="liveGlobeGrad" cx="45%" cy="40%" r="55%">
                        <stop offset="0%" stopColor="#0EA5E9" stopOpacity="0.65" />
                        <stop offset="55%" stopColor="#0369A1" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#020617" stopOpacity="0.95" />
                      </radialGradient>
                    </defs>
                    <circle cx="90" cy="43" r="34" fill="url(#liveGlobeGrad)" stroke="#38BDF8" strokeOpacity="0.55" strokeWidth="1" />
                    <ellipse cx="90" cy="43" rx="34" ry="13" fill="none" stroke="#38BDF8" strokeOpacity="0.28" strokeWidth="0.7" />
                    <ellipse cx="90" cy="43" rx="16" ry="34" fill="none" stroke="#38BDF8" strokeOpacity="0.28" strokeWidth="0.7" />
                    {/* Stylized continental arcs */}
                    <path d="M68,28 Q75,35 72,49 Q78,56 76,66" fill="none" stroke="#34D399" strokeWidth="2.4" strokeLinecap="round" strokeOpacity="0.7" />
                    <path d="M90,22 Q102,29 98,42 Q106,52 96,62" fill="none" stroke="#34D399" strokeWidth="2.2" strokeLinecap="round" strokeOpacity="0.65" />
                    <path d="M108,30 Q116,38 112,48" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.7" />
                    {/* Active climate marker */}
                    {CLIMATE_ALERTS.map((ca) => {
                      const active = ca.id === selectedClimateId;
                      const cx = 58 + (ca.x / 100) * 64;
                      const cy = 12 + (ca.y / 100) * 62;
                      const fill =
                        ca.severity === 'critico'
                          ? '#EF4444'
                          : ca.severity === 'aviso'
                          ? '#F59E0B'
                          : '#10B981';
                      return (
                        <g key={ca.id}>
                          {active && (
                            <circle cx={cx} cy={cy} r="6.5" fill={fill} fillOpacity="0.3" />
                          )}
                          <circle cx={cx} cy={cy} r={active ? '3.2' : '2.2'} fill={fill} />
                        </g>
                      );
                    })}
                  </svg>
                </div>

                {/* Clickable Climate Alerts */}
                <div className="space-y-1">
                  {CLIMATE_ALERTS.slice(0, 4).map((ca) => {
                    const active = ca.id === selectedClimateId;
                    const dotClass =
                      ca.severity === 'critico'
                        ? 'bg-red-500'
                        : ca.severity === 'aviso'
                        ? 'bg-amber-400'
                        : 'bg-emerald-400';
                    return (
                      <button
                        key={ca.id}
                        type="button"
                        onClick={() => {
                          triggerHaptic('tap');
                          setSelectedClimateId(ca.id);
                          onAskAssistant(
                            `ULTRON e SEXTA-FEIRA, façam um boletim atualizado sobre: ${ca.label} (${ca.region}).`,
                            'todos'
                          );
                        }}
                        className={`flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-[10px] transition-colors ${
                          active
                            ? 'bg-cyan-500/20 text-white border border-cyan-400/35'
                            : 'text-sky-200/85 hover:bg-sky-900/40 hover:text-white border border-transparent'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`} />
                        <span className="truncate">{ca.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ROW 2: Bolsa de Valores | Mundo em Tempo Real | Cotação de Alimentos */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
            {/* LEFT: Bolsa de Valores + Criptomoedas */}
            <div
              id="live-markets"
              className="xl:col-span-4 live-theme-panel rounded-xl p-3.5 flex flex-col justify-between space-y-3"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4 text-cyan-400" />
                    <h2 className="font-display text-xs font-bold uppercase tracking-wider text-white">
                      Bolsa de Valores
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onAskAssistant(
                        `J.A.R.V.I.S., atualize a cotação e análise de ${marketTab} (${marketData.label}) agora.`,
                        'jarvis'
                      )
                    }
                    className="font-mono text-[10px] text-cyan-300 hover:text-white transition-colors"
                  >
                    Analisar IA →
                  </button>
                </div>

                {/* Market Category Tabs */}
                <div className="flex flex-wrap gap-1">
                  {(
                    ['IBOVESPA', 'AÇÕES EUA', 'CRIPTO', 'FIIs', 'ÍNDICES'] as MarketTabId[]
                  ).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => {
                        triggerHaptic('tap');
                        setMarketTab(tab);
                        setHoveredCandleIdx(null);
                      }}
                      className={`rounded-md px-2 py-1 font-mono text-[10px] font-semibold transition-colors ${
                        marketTab === tab
                          ? 'bg-cyan-500 text-slate-950 shadow-[0_0_12px_rgba(34,211,238,0.4)]'
                          : 'border border-sky-400/20 bg-[#06152A] text-sky-200/80 hover:border-cyan-400/45 hover:text-white'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                {/* Primary Index Value + Stats Box */}
                <div className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-7">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-sky-300/75">
                      {marketData.label}
                    </div>
                    <div className="font-display text-2xl sm:text-[26px] font-extrabold text-white tabular-nums leading-tight">
                      {marketData.value}
                    </div>
                    <div
                      className={`inline-flex items-center gap-1 font-mono text-xs font-bold tabular-nums ${
                        marketData.deltaPositive ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {marketData.deltaPositive ? (
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowDownRight className="h-3.5 w-3.5" />
                      )}
                      <span>{marketData.deltaText}</span>
                    </div>
                  </div>
                  <div className="col-span-5 rounded-lg border border-sky-400/20 bg-[#040E1E]/85 p-2 space-y-0.5 text-[10px] font-mono tabular-nums">
                    <div className="flex justify-between">
                      <span className="text-sky-300/70">Máxima</span>
                      <span className="text-white font-semibold">{marketData.maxima}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sky-300/70">Mínima</span>
                      <span className="text-white font-semibold">{marketData.minima}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sky-300/70">Volume</span>
                      <span className="text-cyan-300 font-semibold">{marketData.volume}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sky-300/70">Negócios</span>
                      <span className="text-sky-100">{marketData.negocios}</span>
                    </div>
                  </div>
                </div>

                {/* Interactive SVG Candlestick Chart */}
                <div className="relative rounded-lg border border-sky-400/20 bg-[#030B18] p-2">
                  {hoveredCandle && (
                    <div className="pointer-events-none absolute right-2 top-1.5 z-10 rounded border border-cyan-400/40 bg-[#041124]/95 px-2 py-0.5 font-mono text-[10px] text-cyan-100 tabular-nums">
                      {hoveredCandle.time} · A:{hoveredCandle.open.toFixed(2)} · F:
                      {hoveredCandle.close.toFixed(2)}
                    </div>
                  )}
                  <svg
                    viewBox="0 0 360 96"
                    className="h-24 w-full select-none"
                    onMouseLeave={() => setHoveredCandleIdx(null)}
                  >
                    {/* Gridlines */}
                    {[16, 40, 64, 84].map((y) => (
                      <line
                        key={y}
                        x1="0"
                        y1={y}
                        x2="360"
                        y2={y}
                        stroke="#38BDF8"
                        strokeOpacity="0.12"
                        strokeDasharray="3 3"
                      />
                    ))}
                    {marketData.candles.map((c, idx) => {
                      const step = 344 / marketData.candles.length;
                      const x = 8 + idx * step + step / 2;
                      const mapY = (v: number) => 84 - ((v - candleMin) / candleSpan) * 70;
                      const highY = mapY(c.high);
                      const lowY = mapY(c.low);
                      const openY = mapY(c.open);
                      const closeY = mapY(c.close);
                      const bullish = c.close >= c.open;
                      const color = bullish ? '#10B981' : '#EF4444';
                      const bodyTop = Math.min(openY, closeY);
                      const bodyHeight = Math.max(2.5, Math.abs(closeY - openY));
                      const isHovered = hoveredCandleIdx === idx;
                      return (
                        <g
                          key={`${marketTab}-${c.time}-${idx}`}
                          onMouseEnter={() => setHoveredCandleIdx(idx)}
                          className="cursor-pointer"
                        >
                          <rect
                            x={x - step / 2}
                            y={0}
                            width={step}
                            height={96}
                            fill={isHovered ? 'rgba(56,189,248,0.12)' : 'transparent'}
                          />
                          <line
                            x1={x}
                            y1={highY}
                            x2={x}
                            y2={lowY}
                            stroke={color}
                            strokeWidth={isHovered ? '1.8' : '1.2'}
                          />
                          <rect
                            x={x - Math.min(4.5, step * 0.34)}
                            y={bodyTop}
                            width={Math.min(9, step * 0.68)}
                            height={bodyHeight}
                            rx="1"
                            fill={color}
                          />
                        </g>
                      );
                    })}
                  </svg>
                  <div className="flex justify-between px-1 font-mono text-[9px] text-sky-400/65 tabular-nums">
                    <span>{marketData.candles[0]?.time}</span>
                    <span>{marketData.candles[Math.floor(marketData.candles.length / 2)]?.time}</span>
                    <span>{marketData.candles[marketData.candles.length - 1]?.time}</span>
                  </div>
                </div>

                {/* Clickable Stock Tickers Strip */}
                <div className="grid grid-cols-5 gap-1">
                  {marketData.tickers.map((t) => {
                    const up = t.changePct >= 0;
                    return (
                      <button
                        key={t.ticker}
                        type="button"
                        onClick={() => {
                          triggerHaptic('tap');
                          onAskAssistant(
                            `J.A.R.V.I.S., analise o ativo ${t.ticker} (${t.price}, variação ${up ? '+' : ''}${t.changePct.toFixed(2)}%) e informe suportes, riscos e fundamentos.`,
                            'jarvis'
                          );
                        }}
                        className="rounded-lg border border-sky-400/20 bg-[#051225] px-1.5 py-1.5 text-left hover:border-cyan-400/55 hover:bg-[#081C38] transition-colors tabular-nums"
                      >
                        <div className="font-mono text-[10px] font-bold text-white truncate">
                          {t.ticker}
                        </div>
                        <div
                          className={`font-mono text-[9px] font-semibold ${
                            up ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          {up ? '+' : ''}
                          {t.changePct.toFixed(2)}%
                        </div>
                        <div className="font-mono text-[9px] text-sky-300/75">{t.price}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Criptomoedas Table */}
              <div className="border-t border-sky-400/20 pt-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                    Criptomoedas
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setCryptoCurrency((prev) => (prev === 'USD' ? 'BRL' : 'USD'))
                      }
                      className="rounded border border-sky-400/30 bg-[#06152A] px-2 py-0.5 font-mono text-[10px] font-semibold text-sky-200 hover:border-cyan-400 transition-colors"
                    >
                      {cryptoCurrency}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCryptoPeriod((prev) => (prev === '24h' ? '7d' : '24h'))
                      }
                      className="rounded border border-sky-400/30 bg-[#06152A] px-2 py-0.5 font-mono text-[10px] font-semibold text-sky-200 hover:border-cyan-400 transition-colors"
                    >
                      {cryptoPeriod}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  {CRYPTO_ASSETS.map((coin) => {
                    const displayPrice =
                      cryptoCurrency === 'USD'
                        ? coin.priceUsd
                        : coin.priceUsd * usdToBrlRate;
                    const changeVal =
                      cryptoPeriod === '24h' ? coin.change24h : coin.change7d;
                    const up = changeVal >= 0;
                    return (
                      <button
                        key={coin.symbol}
                        type="button"
                        onClick={() => {
                          triggerHaptic('tap');
                          onAskAssistant(
                            `J.A.R.V.I.S., qual a análise atualizada de ${coin.name} em ${cryptoCurrency} no horizonte ${cryptoPeriod}?`,
                            'jarvis'
                          );
                        }}
                        className="grid w-full grid-cols-12 items-center gap-1 rounded-md px-1.5 py-1 text-left hover:bg-cyan-500/12 transition-colors tabular-nums"
                      >
                        <span className="col-span-5 text-[11px] font-medium text-sky-100 truncate">
                          {coin.name}
                        </span>
                        <span className="col-span-3 text-right font-mono text-[11px] font-semibold text-white">
                          {cryptoCurrency === 'BRL' ? 'R$ ' : ''}
                          {displayPrice.toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                        <span
                          className={`col-span-2 text-right font-mono text-[10px] font-semibold ${
                            up ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          {up ? '▲' : '▼'} {Math.abs(changeVal).toFixed(2)}%
                        </span>
                        <span className="col-span-2 flex justify-end">
                          <MiniSparkline data={coin.spark} positive={up} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* CENTER: Mundo em Tempo Real */}
            <div
              id="live-world"
              className="xl:col-span-4 live-theme-panel rounded-xl p-3.5 flex flex-col justify-between relative overflow-hidden"
            >
              <div className="text-center space-y-0.5 relative z-10">
                <h2 className="font-display text-sm sm:text-base font-bold uppercase tracking-[0.14em] text-white">
                  Mundo em Tempo Real
                </h2>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-300/90">
                  Notícias · Mercados · Clima · Eventos · Tudo Conectado
                </p>
              </div>

              {/* Continent Selector + Interactive Global SVG Map + Event Counters */}
              <div className="relative my-2 grid grid-cols-12 gap-2 items-center flex-1 min-h-[270px]">
                {/* Left Continent Filter Buttons */}
                <div className="col-span-3 flex flex-col gap-1.5 z-10">
                  {(
                    ['GLOBAL', 'AMÉRICAS', 'EUROPA', 'ÁSIA', 'ÁFRICA'] as ContinentId[]
                  ).map((cont) => (
                    <button
                      key={cont}
                      type="button"
                      onClick={() => {
                        triggerHaptic('tap');
                        setSelectedContinent(cont);
                      }}
                      className={`rounded-md border px-2 py-1.5 text-left font-mono text-[9px] font-bold uppercase tracking-wider transition-all ${
                        selectedContinent === cont
                          ? 'border-cyan-400 bg-cyan-500/25 text-white shadow-[0_0_12px_rgba(34,211,238,0.3)]'
                          : 'border-sky-400/25 bg-[#051226]/90 text-sky-300/80 hover:border-cyan-400/50 hover:text-white'
                      }`}
                    >
                      {cont}
                    </button>
                  ))}
                </div>

                {/* Center Map & Orbital Core */}
                <div className="col-span-6 relative h-full min-h-[245px] flex flex-col items-center justify-between">
                  <div className="relative w-full h-40">
                    <svg
                      viewBox="0 0 240 130"
                      className="h-full w-full"
                      aria-label="Mapa interativo global"
                    >
                      <defs>
                        <radialGradient id="worldGlow" cx="50%" cy="50%" r="50%">
                          <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.24" />
                          <stop offset="100%" stopColor="#040A16" stopOpacity="0" />
                        </radialGradient>
                      </defs>
                      <rect width="240" height="130" fill="url(#worldGlow)" rx="8" />
                      {/* Stylized glowing world continent silhouettes */}
                      <path
                        d="M28,28 L58,24 L68,42 L54,54 L46,48 L32,44 Z M54,60 L72,62 L84,84 L74,108 L64,104 L60,82 Z M106,24 L138,22 L144,38 L128,44 L108,38 Z M112,48 L142,48 L152,72 L138,98 L122,94 L114,68 Z M148,26 L206,28 L216,52 L194,68 L166,64 L152,46 Z M184,80 L212,82 L216,100 L192,102 Z"
                        fill="#0C2A4D"
                        stroke="#38BDF8"
                        strokeOpacity="0.5"
                        strokeWidth="0.9"
                      />
                      {/* Orbital data connection arcs */}
                      <path
                        d="M68,84 Q118,32 184,54"
                        fill="none"
                        stroke="#22D3EE"
                        strokeWidth="0.9"
                        strokeDasharray="3 3"
                        strokeOpacity="0.6"
                      />
                      <path
                        d="M52,44 Q98,16 132,34"
                        fill="none"
                        stroke="#38BDF8"
                        strokeWidth="0.9"
                        strokeDasharray="2 3"
                        strokeOpacity="0.55"
                      />
                      {/* Interactive Hotspot Nodes */}
                      {filteredWorldHotspots.map((spot) => {
                        const cx = (spot.x / 100) * 240;
                        const cy = (spot.y / 100) * 130;
                        const isSelected = spot.id === selectedHotspot.id;
                        const color =
                          spot.severity === 'alta'
                            ? '#EF4444'
                            : spot.severity === 'media'
                            ? '#F59E0B'
                            : '#10B981';
                        return (
                          <g
                            key={spot.id}
                            onClick={() => {
                              triggerHaptic('tap');
                              setSelectedHotspotId(spot.id);
                            }}
                            className="cursor-pointer"
                          >
                            {isSelected && (
                              <circle
                                cx={cx}
                                cy={cy}
                                r="10"
                                fill={color}
                                fillOpacity="0.25"
                                stroke={color}
                                strokeWidth="0.8"
                              />
                            )}
                            <circle cx={cx} cy={cy} r={isSelected ? '4.5' : '3.3'} fill={color} />
                          </g>
                        );
                      })}
                    </svg>
                  </div>

                  {/* Central RODACK IA Core Emblem + 4 Action Buttons */}
                  <div className="flex flex-col items-center gap-2 w-full">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('tap');
                        onOpenHologram('jarvis');
                      }}
                      className="flex h-14 w-14 flex-col items-center justify-center rounded-full border-2 border-cyan-400/75 bg-gradient-to-b from-cyan-500/25 to-[#040E1E] shadow-[0_0_24px_rgba(34,211,238,0.45)] hover:scale-105 transition-transform"
                      title="Abrir Núcleo Holográfico RODACK IA"
                    >
                      <Cpu className="h-4 w-4 text-cyan-300" />
                      <span className="font-display text-[8px] font-extrabold tracking-widest text-white mt-0.5">
                        RODACK
                      </span>
                    </button>

                    <div className="grid grid-cols-4 gap-1 w-full">
                      {(
                        [
                          {
                            label: 'Analisar',
                            action: () =>
                              onAskAssistant(
                                `J.A.R.V.I.S., faça uma análise integrada de mercados, finanças e agenda de hoje sobre: ${selectedHotspot.title}`,
                                'jarvis'
                              ),
                          },
                          {
                            label: 'Conectar',
                            action: () => onRefreshIntel(),
                          },
                          {
                            label: 'Prever',
                            action: () =>
                              onAskAssistant(
                                `ULTRON, execute modelagem preditiva de riscos para os próximos dias considerando: ${selectedHotspot.title}`,
                                'ultron'
                              ),
                          },
                          {
                            label: 'Informar',
                            action: () =>
                              onAskAssistant(
                                `SEXTA-FEIRA, apresente o resumo cruzado mais atualizado sobre: ${selectedHotspot.title}`,
                                'sexta-feira'
                              ),
                          },
                        ] as const
                      ).map((btn) => (
                        <button
                          key={btn.label}
                          type="button"
                          onClick={() => {
                            triggerHaptic('tap');
                            btn.action();
                          }}
                          className="rounded border border-cyan-400/35 bg-[#061831] px-1 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-cyan-100 hover:bg-cyan-500 hover:text-slate-950 transition-colors"
                        >
                          {btn.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Event Counters */}
                <div className="col-span-3 flex flex-col gap-1.5 z-10">
                  <div className="font-mono text-[9px] font-bold uppercase tracking-wider text-cyan-300 text-right">
                    Eventos Hoje
                  </div>
                  {(
                    [
                      {
                        label: 'Alta relevância',
                        count:
                          Math.max(
                            4,
                            unresolvedAlerts.length +
                              (liveIntel?.news?.mundo?.length ?? 3)
                          ),
                        color: 'border-red-500/45 text-red-300',
                        dot: 'bg-red-500',
                        prompt:
                          'Conselho RODACK, liste os eventos globais e alertas de alta relevância de hoje.',
                      },
                      {
                        label: 'Monitoramento',
                        count:
                          Math.max(
                            12,
                            (liveIntel?.news?.brasil?.length ?? 5) +
                              (workspace.dailyIntelFeed?.length ?? 4) * 3
                          ),
                        color: 'border-amber-500/45 text-amber-300',
                        dot: 'bg-amber-400',
                        prompt:
                          'SEXTA-FEIRA e ULTRON, quais frentes estão sob monitoramento contínuo hoje?',
                      },
                      {
                        label: 'Oportunidades',
                        count: Math.max(6, (workspace.memories?.length ?? 6) + pdfStudyCount),
                        color: 'border-emerald-500/45 text-emerald-300',
                        dot: 'bg-emerald-400',
                        prompt:
                          'J.A.R.V.I.S., destaque as melhores oportunidades estratégicas e de aprendizado hoje.',
                      },
                    ] as const
                  ).map((ev) => (
                    <button
                      key={ev.label}
                      type="button"
                      onClick={() => {
                        triggerHaptic('tap');
                        onAskAssistant(ev.prompt, 'todos');
                      }}
                      className={`rounded-lg border bg-[#051226]/90 px-2 py-1.5 text-left hover:bg-[#092040] transition-colors ${ev.color}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`h-2 w-2 rounded-full ${ev.dot}`} />
                        <span className="font-mono text-sm font-bold text-white tabular-nums">
                          {ev.count}
                        </span>
                      </div>
                      <div className="text-[9px] text-sky-200/85 truncate mt-0.5">
                        {ev.label}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Selected Hotspot Detail + Motto */}
              <div className="space-y-2 border-t border-sky-400/20 pt-2">
                <div className="flex items-center justify-between gap-2 rounded-lg border border-sky-400/20 bg-[#040E1E]/85 px-2.5 py-1.5">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-white truncate">
                      {selectedHotspot.title}
                    </div>
                    <div className="text-[10px] text-sky-200/75 truncate">
                      {selectedHotspot.summary}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onAskAssistant(
                        `Explique em detalhes o impacto de: ${selectedHotspot.title}`,
                        selectedHotspot.assistant
                      )
                    }
                    className="shrink-0 rounded bg-cyan-500/20 border border-cyan-400/40 px-2 py-1 font-mono text-[9px] font-bold uppercase text-cyan-200 hover:bg-cyan-500 hover:text-slate-950 transition-colors"
                  >
                    Briefing
                  </button>
                </div>
                <p className="text-center text-[11px] italic text-sky-200/80">
                  “Dados são o novo petróleo. Mas insights são o novo poder.”
                </p>
              </div>
            </div>

            {/* RIGHT: Cotação de Alimentos */}
            <div
              id="live-food"
              className="xl:col-span-4 live-theme-panel rounded-xl p-3.5 flex flex-col justify-between space-y-2.5"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Wheat className="h-4 w-4 text-emerald-400" />
                    <h2 className="font-display text-xs font-bold uppercase tracking-wider text-white">
                      Cotação de Alimentos
                    </h2>
                  </div>
                  <span className="font-mono text-[9px] uppercase text-emerald-300/85">
                    CEPEA · Mercado BR
                  </span>
                </div>

                {/* Food Tabs */}
                <div className="flex flex-wrap gap-1">
                  {(
                    ['BÁSICOS', 'GRÃOS', 'CARNES', 'HORTIFRUTI', 'OUTROS'] as FoodTabId[]
                  ).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => {
                        triggerHaptic('tap');
                        setFoodTab(tab);
                      }}
                      className={`rounded-md px-2 py-1 font-mono text-[10px] font-semibold transition-colors ${
                        foodTab === tab
                          ? 'bg-cyan-500 text-slate-950 shadow-[0_0_12px_rgba(34,211,238,0.4)]'
                          : 'border border-sky-400/20 bg-[#06152A] text-sky-200/80 hover:border-cyan-400/45 hover:text-white'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                {/* Table Header */}
                <div className="grid grid-cols-12 gap-1 border-b border-sky-400/20 pb-1 font-mono text-[9px] font-bold uppercase tracking-wider text-sky-300/75">
                  <span className="col-span-5">Produto</span>
                  <span className="col-span-2 text-right">Preço (R$)</span>
                  <span className="col-span-3 text-right">Var. (7d)</span>
                  <span className="col-span-2 text-right">Tendência</span>
                </div>

                {/* Food Rows */}
                <div className="max-h-[300px] overflow-y-auto divide-y divide-sky-400/10 pr-0.5">
                  {FOOD_QUOTES_BY_TAB[foodTab].map((row) => {
                    const up = row.change7d >= 0;
                    return (
                      <button
                        key={row.name}
                        type="button"
                        onClick={() => {
                          triggerHaptic('tap');
                          onAskAssistant(
                            `ULTRON e SEXTA-FEIRA, qual a tendência de preço e oferta para ${row.name} (R$ ${row.priceBrl.toFixed(2)}, variação semanal ${up ? '+' : ''}${row.change7d.toFixed(2)}%)?`,
                            'todos'
                          );
                        }}
                        className="grid w-full grid-cols-12 items-center gap-1 py-1.5 px-1 text-left hover:bg-cyan-500/12 transition-colors tabular-nums"
                      >
                        <span className="col-span-5 text-[11px] font-medium text-sky-100 truncate">
                          {row.name}
                        </span>
                        <span className="col-span-2 text-right font-mono text-[11px] font-semibold text-white">
                          {row.priceBrl.toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                        <span
                          className={`col-span-3 text-right font-mono text-[10px] font-semibold ${
                            up ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          {up ? '▲ +' : '▼ '}
                          {row.change7d.toFixed(2)}%
                        </span>
                        <span className="col-span-2 flex justify-end">
                          <MiniSparkline data={row.spark} positive={up} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tendência de Mercado Footer */}
              <div className="rounded-lg border border-cyan-400/25 bg-[#051428]/90 px-3 py-2">
                <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                  <Activity className="h-3.5 w-3.5" />
                  <span>Tendência de Mercado</span>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-sky-200/85">
                  {foodTab === 'BÁSICOS'
                    ? 'Alimentos básicos apresentam alta moderada no café e ovos, com alívio em hortifruti. Clima e logística seguem como fatores de atenção.'
                    : foodTab === 'GRÃOS'
                    ? 'Café arábica e milho mantêm viés firme no indicador CEPEA-Esalq apoiados pela demanda externa.'
                    : 'Oferta regional e custos de frete orientam ajustes pontuais nas cotações da semana.'}
                </p>
              </div>
            </div>
          </div>

          {/* ROW 3: Vídeos ao Vivo | Notícias em Destaque | Mapa de Notícias */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
            {/* LEFT: Vídeos ao Vivo */}
            <div
              id="live-videos"
              className="xl:col-span-4 live-theme-panel rounded-xl p-3.5 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Radio className="h-4 w-4 text-red-400" />
                  <h2 className="font-display text-xs font-bold uppercase tracking-wider text-white">
                    Vídeos ao Vivo
                  </h2>
                </div>
                <span className="font-mono text-[10px] text-sky-300/75">
                  Player integrado
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {LIVE_CHANNELS.map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('tap');
                      setActiveVideoChannel(ch);
                    }}
                    className="group flex flex-col overflow-hidden rounded-lg border border-sky-400/25 bg-[#051226] text-left hover:border-cyan-400/65 transition-all"
                  >
                    <div
                      className="relative h-20 w-full flex items-center justify-center overflow-hidden"
                      style={{
                        background: `linear-gradient(135deg, ${ch.accentFrom} 0%, ${ch.accentTo} 100%)`,
                      }}
                    >
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.16),transparent_55%)]" />
                      <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-red-600/95 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-white">
                        <span className="h-1.5 w-1.5 rounded-full bg-white live-pulse-dot" />
                        LIVE
                      </span>
                      <span className="absolute right-1.5 top-1.5 rounded bg-black/50 px-1.5 py-0.5 font-mono text-[9px] font-bold text-sky-100">
                        {ch.badgeText}
                      </span>
                      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/40 bg-black/45 text-white group-hover:scale-110 group-hover:bg-cyan-500 group-hover:text-slate-950 transition-all">
                        <Play className="h-4 w-4 ml-0.5" />
                      </div>
                    </div>
                    <div className="p-2 space-y-0.5">
                      <div className="text-[11px] font-bold text-white truncate">
                        {ch.title}
                      </div>
                      <div className="text-[10px] text-sky-200/75 line-clamp-1">
                        {ch.subtitle}
                      </div>
                      <div className="font-mono text-[9px] text-cyan-300/90 tabular-nums">
                        {ch.viewersLabel}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* CENTER: Notícias em Destaque */}
            <div
              id="live-news"
              className="xl:col-span-5 live-theme-panel rounded-xl p-3.5 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Newspaper className="h-4 w-4 text-cyan-400" />
                  <h2 className="font-display text-xs font-bold uppercase tracking-wider text-white">
                    Notícias em Destaque
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenView('radar')}
                  className="font-mono text-[10px] text-cyan-300 hover:text-white transition-colors"
                >
                  Radar Completo →
                </button>
              </div>

              {/* Category Tabs */}
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    'BRASIL',
                    'MUNDO',
                    'ECONOMIA',
                    'TECNOLOGIA',
                    'SAÚDE',
                    'MEIO AMBIENTE',
                  ] as NewsTabId[]
                ).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      triggerHaptic('tap');
                      setNewsTab(tab);
                    }}
                    className={`rounded-md px-2 py-1 font-mono text-[9px] font-semibold transition-colors ${
                      newsTab === tab
                        ? 'bg-cyan-500 text-slate-950 shadow-[0_0_10px_rgba(34,211,238,0.4)]'
                        : 'border border-sky-400/20 bg-[#06152A] text-sky-200/80 hover:border-cyan-400/45 hover:text-white'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Headlines List */}
              <div className="space-y-1.5">
                {activeNewsItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-2 rounded-lg border border-sky-400/15 bg-[#051226]/85 px-2.5 py-2 hover:border-cyan-400/40 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('tap');
                        onAskAssistant(
                          `SEXTA-FEIRA, verifique e resuma esta notícia com contexto completo: "${item.title}" (${item.source}).`,
                          'sexta-feira'
                        );
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-semibold text-cyan-300 tabular-nums shrink-0">
                          {item.time}
                        </span>
                        <span className="text-xs font-semibold text-white line-clamp-1">
                          {item.title}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-sky-200/75 line-clamp-1">
                        {item.detail}
                      </p>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="hidden sm:inline rounded border border-cyan-400/30 bg-cyan-500/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-cyan-200">
                        {item.tag}
                      </span>
                      <button
                        type="button"
                        title="Ouvir manchete pela SEXTA-FEIRA"
                        aria-label={`Ouvir manchete: ${item.title}`}
                        onClick={() => {
                          triggerHaptic('tap');
                          onSpeakHeadline({
                            speaker: 'sexta-feira',
                            stance: 'Boletim Ao Vivo',
                            text: `${item.title}. ${item.detail}`,
                            ttsScript: `Boletim ao vivo RODACK IA. ${item.title}. ${item.detail}`,
                          });
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded border border-sky-400/25 bg-[#061830] text-sky-200 hover:border-cyan-400 hover:text-cyan-200 transition-colors"
                      >
                        <Volume2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* RIGHT: Mapa de Notícias */}
            <div className="xl:col-span-3 live-theme-panel rounded-xl p-3.5 flex flex-col justify-between space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Globe className="h-4 w-4 text-cyan-400" />
                  <h2 className="font-display text-xs font-bold uppercase tracking-wider text-white">
                    Mapa de Notícias
                  </h2>
                </div>
                {newsMapSeverityFilter !== 'todos' && (
                  <button
                    type="button"
                    onClick={() => setNewsMapSeverityFilter('todos')}
                    className="font-mono text-[9px] text-cyan-300 hover:text-white"
                  >
                    Todos
                  </button>
                )}
              </div>

              {/* Heatmap SVG */}
              <div className="rounded-lg border border-sky-400/20 bg-[#030B18] p-2">
                <svg viewBox="0 0 220 100" className="h-24 w-full" aria-hidden="true">
                  <path
                    d="M22,22 L52,20 L60,34 L48,44 L28,36 Z M48,50 L64,52 L74,70 L64,88 L56,84 L54,68 Z M98,20 L128,18 L134,32 L118,38 L100,32 Z M104,40 L132,40 L140,62 L128,82 L112,78 L106,56 Z M138,22 L192,24 L200,44 L178,56 L154,52 L142,38 Z M172,68 L196,70 L198,84 L178,86 Z"
                    fill="#0A2342"
                    stroke="#38BDF8"
                    strokeOpacity="0.4"
                    strokeWidth="0.8"
                  />
                  {newsMapEvents.map((ev) => {
                    const cx = (ev.x / 100) * 220;
                    const cy = (ev.y / 100) * 100;
                    const color =
                      ev.severity === 'alta'
                        ? '#EF4444'
                        : ev.severity === 'media'
                        ? '#F59E0B'
                        : '#10B981';
                    return (
                      <g key={ev.num}>
                        <circle cx={cx} cy={cy} r="9" fill={color} fillOpacity="0.24" />
                        <circle cx={cx} cy={cy} r="3.6" fill={color} />
                        <text
                          x={cx}
                          y={cy + 2.2}
                          textAnchor="middle"
                          fontSize="5.5"
                          fill="#FFFFFF"
                          fontWeight="bold"
                        >
                          {ev.num}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {/* Severity Filter Legend */}
                <div className="mt-1 flex items-center justify-center gap-3 text-[10px]">
                  {(
                    [
                      { id: 'alta' as SeverityLevel, label: 'Alta', dot: 'bg-red-500' },
                      { id: 'media' as SeverityLevel, label: 'Média', dot: 'bg-amber-400' },
                      { id: 'baixa' as SeverityLevel, label: 'Baixa', dot: 'bg-emerald-400' },
                    ] as const
                  ).map((sev) => (
                    <button
                      key={sev.id}
                      type="button"
                      onClick={() =>
                        setNewsMapSeverityFilter((prev) =>
                          prev === sev.id ? 'todos' : sev.id
                        )
                      }
                      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors ${
                        newsMapSeverityFilter === sev.id
                          ? 'bg-cyan-500/20 text-white'
                          : 'text-sky-200/80 hover:text-white'
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${sev.dot}`} />
                      <span>{sev.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Principais Eventos 1-5 */}
              <div className="space-y-1">
                <div className="font-mono text-[9px] font-bold uppercase tracking-wider text-sky-300/80">
                  Principais Eventos
                </div>
                {newsMapEvents.map((ev) => {
                  const badgeColor =
                    ev.severity === 'alta'
                      ? 'bg-red-500/25 text-red-200 border-red-400/40'
                      : ev.severity === 'media'
                      ? 'bg-amber-500/25 text-amber-200 border-amber-400/40'
                      : 'bg-emerald-500/25 text-emerald-200 border-emerald-400/40';
                  return (
                    <button
                      key={ev.num}
                      type="button"
                      onClick={() => {
                        triggerHaptic('tap');
                        onAskAssistant(
                          `SEXTA-FEIRA e ULTRON, façam uma síntese executiva sobre o evento #${ev.num}: ${ev.title}`,
                          'todos'
                        );
                      }}
                      className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] text-sky-100 hover:bg-cyan-500/15 transition-colors"
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border font-mono text-[9px] font-bold ${badgeColor}`}
                      >
                        {ev.num}
                      </span>
                      <span className="truncate">{ev.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ROW 4: 5-Card Bottom Command Strip */}
          <div
            id="live-bottom"
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3"
          >
            {/* 1. Próximos Eventos */}
            <div className="xl:col-span-2 live-theme-panel rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-cyan-400" />
                  <h3 className="font-display text-[11px] font-bold uppercase tracking-wider text-white">
                    Próximos Eventos
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenView('agenda')}
                  className="font-mono text-[9px] text-cyan-300 hover:text-white"
                >
                  Agenda
                </button>
              </div>
              <div className="space-y-1.5">
                {upcomingCombinedEvents.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() =>
                      onAskAssistant(
                        `J.A.R.V.I.S., prepare um resumo tático para o evento das ${ev.time}: ${ev.title}`,
                        'jarvis'
                      )
                    }
                    className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-cyan-500/12 transition-colors"
                  >
                    <span className="font-mono text-[10px] font-bold text-cyan-300 tabular-nums shrink-0">
                      {ev.time}
                    </span>
                    <span className="rounded border border-sky-400/25 bg-[#061830] px-1 py-0.5 font-mono text-[8px] font-bold text-sky-200 shrink-0">
                      {ev.badge}
                    </span>
                    <span className="text-[11px] text-sky-100 truncate">{ev.title}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Alertas Inteligentes */}
            <div className="xl:col-span-2 live-theme-panel rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                  <h3 className="font-display text-[11px] font-bold uppercase tracking-wider text-white">
                    Alertas Inteligentes
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenView('auditoria')}
                  className="rounded border border-sky-400/30 bg-[#061830] px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase text-cyan-200 hover:border-cyan-400 transition-colors"
                >
                  Ver Todos
                </button>
              </div>
              <div className="space-y-1.5">
                {smartAlertsList.map((al) => {
                  const dotColor =
                    al.severity === 'critico'
                      ? 'bg-red-500'
                      : al.severity === 'aviso'
                      ? 'bg-amber-400'
                      : 'bg-cyan-400';
                  return (
                    <button
                      key={al.id}
                      type="button"
                      onClick={() => onAskAssistant(al.prompt, al.assistant)}
                      className="flex w-full items-start gap-2 rounded px-1.5 py-1 text-left hover:bg-cyan-500/12 transition-colors"
                    >
                      <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${dotColor}`} />
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-white line-clamp-1">
                          {al.title}
                        </div>
                        <div className="text-[9px] text-sky-300/75 truncate">
                          {al.subtitle}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Fale com os Assistentes */}
            <div className="md:col-span-2 xl:col-span-4 live-theme-panel rounded-xl p-3 flex flex-col justify-between space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-cyan-400" />
                  <h3 className="font-display text-[11px] font-bold uppercase tracking-wider text-white">
                    Fale com os Assistentes
                  </h3>
                </div>
                <div className="inline-flex rounded border border-sky-400/25 bg-[#040E1E] p-0.5 text-[9px] font-mono">
                  {(
                    [
                      { id: 'todos', label: 'Conselho' },
                      { id: 'jarvis', label: 'JARVIS' },
                      { id: 'sexta-feira', label: 'SEXTA' },
                      { id: 'ultron', label: 'ULTRON' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setInlineTarget(m.id)}
                      className={`px-1.5 py-0.5 rounded transition-colors ${
                        inlineTarget === m.id
                          ? 'bg-cyan-500 text-slate-950 font-bold'
                          : 'text-sky-300/75 hover:text-white'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleInlineSubmit} className="relative">
                <input
                  type="text"
                  value={inlinePrompt}
                  onChange={(e) => setInlinePrompt(e.target.value)}
                  disabled={isProcessing}
                  placeholder="Digite sua pergunta ou comando para J.A.R.V.I.S., SEXTA-FEIRA ou ULTRON..."
                  className="w-full rounded-lg border border-sky-400/30 bg-[#030B18] pl-3 pr-20 py-2.5 text-xs text-white placeholder:text-sky-300/50 focus:border-cyan-400 focus:outline-none"
                />
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={onToggleStandby}
                    title={isStandbyActive ? 'Desativar escuta contínua' : 'Ativar escuta por voz'}
                    className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                      isStandbyActive
                        ? 'border-cyan-400 bg-cyan-500/25 text-cyan-200'
                        : 'border-sky-400/25 bg-[#061830] text-sky-300 hover:text-white'
                    }`}
                  >
                    {isStandbyActive ? (
                      <Mic className="h-3.5 w-3.5" />
                    ) : (
                      <MicOff className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="submit"
                    disabled={isProcessing || !inlinePrompt.trim()}
                    aria-label="Enviar comando"
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-colors disabled:opacity-45"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </form>

              {/* 6 Quick Prompt Buttons from Reference Image */}
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    {
                      label: 'Analisar mercado',
                      prompt:
                        'J.A.R.V.I.S., analise o mercado financeiro, Ibovespa, dólar e criptomoedas hoje.',
                      mode: 'jarvis' as InteractionMode,
                    },
                    {
                      label: 'Resumo do dia',
                      prompt:
                        'Conselho RODACK, apresente meu resumo completo do dia: agenda, clima, notícias e prioridades.',
                      mode: 'todos' as InteractionMode,
                    },
                    {
                      label: 'Previsão do tempo',
                      prompt: `SEXTA-FEIRA, passe a previsão do tempo detalhada para ${weatherDisplay.city} nos próximos dias.`,
                      mode: 'sexta-feira' as InteractionMode,
                    },
                    {
                      label: 'Cotação do café',
                      prompt:
                        'ULTRON, atualize a cotação do café arábica (CEPEA) e tendência dos alimentos básicos.',
                      mode: 'ultron' as InteractionMode,
                    },
                    {
                      label: 'Notícias de hoje',
                      prompt:
                        'SEXTA-FEIRA, traga as principais notícias do Brasil e do mundo hoje com síntese rápida.',
                      mode: 'sexta-feira' as InteractionMode,
                    },
                    {
                      label: 'Oportunidades de investimento',
                      prompt:
                        'J.A.R.V.I.S., quais setores e oportunidades estratégicas merecem atenção esta semana?',
                      mode: 'jarvis' as InteractionMode,
                    },
                  ] as const
                ).map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    disabled={isProcessing}
                    onClick={() => {
                      triggerHaptic('tap');
                      onAskAssistant(q.prompt, q.mode);
                    }}
                    className="rounded-md border border-sky-400/25 bg-[#06172D] px-2 py-1 text-[10px] font-medium text-sky-100 hover:border-cyan-400/60 hover:bg-cyan-500/15 transition-colors disabled:opacity-50"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Insights da IA */}
            <div className="xl:col-span-2 live-theme-panel rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <Lightbulb className="h-3.5 w-3.5 text-amber-300" />
                <h3 className="font-display text-[11px] font-bold uppercase tracking-wider text-white">
                  Insights da IA
                </h3>
              </div>
              <div className="space-y-1.5">
                {aiInsights.map((ins) => (
                  <button
                    key={ins.id}
                    type="button"
                    onClick={() => onAskAssistant(ins.prompt, ins.mode)}
                    className="block w-full rounded px-1.5 py-1 text-left text-[10px] leading-snug text-sky-100/90 hover:bg-cyan-500/12 transition-colors"
                  >
                    <span className={`font-bold ${ins.color}`}>{ins.label}: </span>
                    <span className="line-clamp-2">{ins.text}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 5. Modo Foco Motivational Card */}
            <div className="xl:col-span-2 relative overflow-hidden rounded-xl border border-cyan-400/35 bg-gradient-to-br from-[#0B223F] via-[#07162B] to-[#030A15] p-3 flex flex-col justify-between">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-6 -bottom-6 h-28 w-28 rounded-full bg-cyan-500/20 blur-2xl"
              />
              <div className="flex items-center justify-between gap-2 relative z-10">
                <span className="inline-flex items-center gap-1 font-mono text-[9px] font-bold uppercase tracking-wider text-cyan-300">
                  <Flame className="h-3 w-3 text-amber-400" />
                  Foco Total
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isFocusMode}
                  onClick={() => {
                    triggerHaptic('toggle');
                    onToggleFocusMode();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/40 bg-[#040E1E]/90 px-2 py-0.5 font-mono text-[9px] font-bold uppercase text-cyan-200 hover:border-cyan-300 transition-colors"
                >
                  <span>Modo Foco</span>
                  <span
                    className={`inline-flex h-3.5 w-6 items-center rounded-full p-0.5 transition-colors ${
                      isFocusMode
                        ? 'bg-cyan-400 justify-end'
                        : 'bg-slate-700 justify-start'
                    }`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-white" />
                  </span>
                </button>
              </div>

              <div className="relative z-10 my-3">
                <div className="font-display text-sm font-extrabold uppercase leading-tight tracking-wide text-white">
                  DISCIPLINA HOJE,
                  <br />
                  <span className="text-cyan-300">LIBERDADE SEMPRE.</span>
                </div>
              </div>

              <div className="relative z-10 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={onFocusConsole}
                  className="rounded-md border border-cyan-400/40 bg-cyan-500/15 px-2 py-1 font-mono text-[9px] font-bold uppercase text-cyan-200 hover:bg-cyan-500 hover:text-slate-950 transition-colors"
                >
                  Ir ao Console ↓
                </button>
                <span className="font-display text-[10px] font-bold tracking-widest text-sky-300/80">
                  RODACK IA
                </span>
              </div>
            </div>
          </div>

          {/* Broadcast Footer Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sky-400/20 pt-2 text-[11px]">
            <span className="italic text-sky-200/75">
              “O futuro pertence àqueles que transformam informação em ação.”
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300/85">
              RODACK IA · TEMA LIVE · CONECTANDO INTELIGÊNCIA AO SEU DIA
            </span>
          </div>
        </div>
      </div>

      {/* Embedded Live Video Broadcast Player Modal (No window.open) */}
      {activeVideoChannel && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Transmissão ao vivo: ${activeVideoChannel.title}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-3 sm:p-6"
        >
          <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-cyan-400/45 bg-[#051021] shadow-[0_24px_80px_rgba(0,0,0,0.9)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-400/25 bg-[#071830] px-4 py-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="inline-flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-white live-pulse-dot" />
                  AO VIVO
                </span>
                <div className="min-w-0">
                  <h3 className="font-display text-sm font-bold text-white truncate">
                    {activeVideoChannel.title}
                  </h3>
                  <p className="text-[11px] text-sky-300/80 truncate">
                    {activeVideoChannel.subtitle} · {activeVideoChannel.viewersLabel}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const topic = activeVideoChannel.promptTopic;
                    setActiveVideoChannel(null);
                    onAskAssistant(topic, 'todos');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/50 bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500 hover:text-slate-950 transition-colors"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Pedir Resumo à IA</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveVideoChannel(null)}
                  aria-label="Fechar player ao vivo"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-sky-400/30 bg-[#051124] text-sky-200 hover:border-red-400 hover:text-white transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="aspect-video w-full bg-black">
              <iframe
                src={activeVideoChannel.embedUrl}
                title={activeVideoChannel.title}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sky-400/20 bg-[#040D1B] px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {LIVE_CHANNELS.map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => setActiveVideoChannel(ch)}
                    className={`rounded-md px-2.5 py-1 font-mono text-[10px] font-semibold transition-colors ${
                      activeVideoChannel.id === ch.id
                        ? 'bg-cyan-500 text-slate-950'
                        : 'border border-sky-400/25 bg-[#071830] text-sky-200 hover:border-cyan-400'
                    }`}
                  >
                    {ch.title}
                  </button>
                ))}
              </div>
              <span className="font-mono text-[10px] text-sky-300/70">
                Transmissão integrada ao RODACK IA · Tema LIVE
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

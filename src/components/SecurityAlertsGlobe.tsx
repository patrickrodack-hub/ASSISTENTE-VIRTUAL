import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  Activity,
  AlertTriangle,
  Crosshair,
  Globe,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { AlertItem, WorkspaceState } from '../types/assistant';
import { triggerHaptic } from '../utils/haptics';

interface SecurityAlertsGlobeProps {
  workspace: WorkspaceState | null;
  isDark?: boolean;
}

type GlobeFilter = 'todos' | 'seguranca' | 'instabilidade' | 'abertos';

interface GeoRegionNode {
  id: string;
  name: string;
  regionLabel: string;
  coordinates: [number, number]; // [lon, lat]
  hubCode: string;
  isPrimaryHub?: boolean;
  keywords: RegExp;
}

interface MappedAlertPoint {
  node: GeoRegionNode;
  alerts: AlertItem[];
  securityCount: number;
  instabilityCount: number;
  openCount: number;
  criticalCount: number;
  warnCount: number;
  highestSeverity: 'critico' | 'aviso' | 'info' | 'estavel';
  riskScore: number;
}

const PRIMARY_HUB_COORDS: [number, number] = [-43.1729, -22.9068]; // Rio de Janeiro

const GLOBAL_TELEMETRY_NODES: GeoRegionNode[] = [
  {
    id: 'rio-core',
    name: 'Rio de Janeiro',
    regionLabel: 'Núcleo RODACK · Brasil',
    coordinates: [-43.1729, -22.9068],
    hubCode: 'BR-RJ-01',
    isPrimaryHub: true,
    keywords: /\b(rio|rj|rodack|patrick|local|autentica|login|voz|jarvis|ultron|sexta|sess[aã]o|mem[oó]ria|banco)\b/i,
  },
  {
    id: 'sp-edge',
    name: 'São Paulo',
    regionLabel: 'Edge SA-East · B3 / Finanças',
    coordinates: [-46.6333, -23.5505],
    hubCode: 'SA-EAST-1',
    keywords: /\b(b3|mercado|bolsa|sp|s[aã]o paulo|financeir|pagamento|lat[eê]ncia|gateway|api)\b/i,
  },
  {
    id: 'virginia-cloud',
    name: 'Virgínia (EUA)',
    regionLabel: 'Cloud US-East · Serverless / Vercel',
    coordinates: [-77.4874, 39.0438],
    hubCode: 'US-EAST-1',
    keywords: /\b(vercel|cloud|aws|serverless|timeout|rede|http|cors|ssl|tls|token|oauth|gemini|stream)\b/i,
  },
  {
    id: 'london-west',
    name: 'Londres',
    regionLabel: 'Cluster EU-West · Segurança',
    coordinates: [-0.1276, 51.5072],
    hubCode: 'EU-WEST-2',
    keywords: /\b(seguran[cç]a|sql|injection|xss|csrf|credencial|permiss|firewall|intrus|ataque|vulnerab)\b/i,
  },
  {
    id: 'frankfurt-central',
    name: 'Frankfurt',
    regionLabel: 'Backbone EU-Central · Auditoria',
    coordinates: [8.6821, 50.1109],
    hubCode: 'EU-CENT-1',
    keywords: /\b(auditoria|compliance|criptograf|hash|privacidade|rgpd|lgpd|log|rastreio)\b/i,
  },
  {
    id: 'tokyo-ap',
    name: 'Tóquio',
    regionLabel: 'Nó AP-Northeast · Baixa Latência',
    coordinates: [139.6917, 35.6895],
    hubCode: 'AP-NE-1',
    keywords: /\b(render|fps|cpu|mem[oó]ria|vazamento|leak|performance|buffer|audio|webgpu|three)\b/i,
  },
  {
    id: 'singapore-ap',
    name: 'Singapura',
    regionLabel: 'Relay AP-South · Redundância',
    coordinates: [103.8198, 1.3521],
    hubCode: 'AP-SE-1',
    keywords: /\b(cache|sincron|fallback|offline|pwa|worker|fila|queue|cascata|colapso)\b/i,
  },
  {
    id: 'sydney-oceania',
    name: 'Sydney',
    regionLabel: 'Sentinela AP-Southeast',
    coordinates: [151.2093, -33.8688],
    hubCode: 'AP-SE-2',
    keywords: /\b(estabilidade|uptime|disponibilidade|monitor|sensor|telemetria|alerta)\b/i,
  },
];

// Embedded lightweight GeoJSON continental landmasses (zero external network fetches, 100% Vercel & offline safe)
const WORLD_LAND_GEOJSON: GeoJSON.FeatureCollection<GeoJSON.Polygon> = {
  type: 'FeatureCollection',
  features: [
    // South America
    {
      type: 'Feature',
      properties: { name: 'América do Sul' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-81, 9], [-76, 11], [-70, 12], [-62, 10], [-52, 5], [-49, 0],
            [-35, -6], [-38, -13], [-41, -22], [-48, -26], [-54, -34], [-63, -41],
            [-68, -54], [-73, -53], [-74, -42], [-71, -30], [-71, -18], [-81, -5],
            [-80, 2], [-81, 9],
          ],
        ],
      },
    },
    // North & Central America
    {
      type: 'Feature',
      properties: { name: 'América do Norte' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-166, 65], [-156, 71], [-135, 69], [-110, 68], [-94, 62], [-80, 63],
            [-64, 59], [-55, 52], [-61, 45], [-70, 42], [-76, 35], [-81, 25],
            [-83, 30], [-96, 28], [-97, 21], [-88, 21], [-84, 10], [-79, 9],
            [-85, 11], [-94, 16], [-105, 20], [-111, 24], [-117, 32], [-124, 41],
            [-125, 49], [-136, 58], [-152, 60], [-162, 58], [-166, 65],
          ],
        ],
      },
    },
    // Greenland
    {
      type: 'Feature',
      properties: { name: 'Groenlândia' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-52, 61], [-42, 60], [-32, 68], [-18, 76], [-24, 82], [-48, 82],
            [-66, 77], [-58, 69], [-52, 61],
          ],
        ],
      },
    },
    // Europe
    {
      type: 'Feature',
      properties: { name: 'Europa' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-9, 37], [-9, 43], [-2, 44], [-4, 48], [2, 51], [8, 54],
            [11, 58], [5, 61], [15, 69], [28, 70], [41, 67], [56, 68],
            [59, 55], [48, 46], [38, 45], [29, 41], [23, 37], [16, 40],
            [12, 44], [5, 43], [-2, 37], [-9, 37],
          ],
        ],
      },
    },
    // British Isles
    {
      type: 'Feature',
      properties: { name: 'Reino Unido' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-6, 50], [1, 51], [2, 53], [-2, 58], [-6, 57], [-5, 53], [-6, 50],
          ],
        ],
      },
    },
    // Africa
    {
      type: 'Feature',
      properties: { name: 'África' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-17, 15], [-16, 24], [-6, 35], [10, 37], [25, 32], [33, 31],
            [43, 12], [51, 11], [41, -1], [40, -14], [33, -26], [28, -33],
            [18, -34], [14, -22], [11, -6], [8, 4], [-5, 5], [-15, 11], [-17, 15],
          ],
        ],
      },
    },
    // Madagascar
    {
      type: 'Feature',
      properties: { name: 'Madagascar' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [44, -25], [47, -25], [50, -15], [48, -12], [44, -18], [44, -25],
          ],
        ],
      },
    },
    // Asia
    {
      type: 'Feature',
      properties: { name: 'Ásia' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [27, 40], [36, 36], [35, 29], [43, 13], [59, 22], [56, 26],
            [67, 25], [72, 20], [77, 8], [85, 20], [92, 22], [98, 16],
            [103, 1], [104, 11], [109, 12], [108, 21], [121, 24], [122, 31],
            [119, 39], [126, 35], [130, 42], [141, 52], [160, 60], [176, 66],
            [150, 71], [115, 73], [80, 72], [59, 68], [58, 55], [48, 46],
            [40, 42], [27, 40],
          ],
        ],
      },
    },
    // Japan
    {
      type: 'Feature',
      properties: { name: 'Japão' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [130, 31], [136, 34], [141, 36], [145, 44], [141, 45], [138, 38],
            [131, 34], [130, 31],
          ],
        ],
      },
    },
    // Indonesia / Maritime SE Asia
    {
      type: 'Feature',
      properties: { name: 'Sudeste Asiático' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [96, 5], [105, -6], [118, -8], [128, -5], [125, 2], [114, 4],
            [104, -1], [96, 5],
          ],
        ],
      },
    },
    // Australia
    {
      type: 'Feature',
      properties: { name: 'Austrália' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [114, -22], [122, -18], [131, -12], [136, -12], [142, -11], [146, -18],
            [153, -27], [150, -37], [140, -38], [130, -32], [115, -34], [113, -26],
            [114, -22],
          ],
        ],
      },
    },
    // New Zealand
    {
      type: 'Feature',
      properties: { name: 'Nova Zelândia' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [167, -46], [172, -43], [178, -37], [174, -35], [172, -41], [167, -46],
          ],
        ],
      },
    },
  ],
};

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function assignAlertToNode(alert: AlertItem): GeoRegionNode {
  const combined = `${alert.title} ${alert.detail} ${alert.suggestedAction} ${alert.raisedBy}`;
  for (const node of GLOBAL_TELEMETRY_NODES) {
    if (node.keywords.test(combined)) {
      return node;
    }
  }
  // Deterministic fallback across global nodes based on alert type + id hash
  const hash = hashString(alert.id || alert.title);
  if (alert.type === 'seguranca') {
    const secNodes = [
      GLOBAL_TELEMETRY_NODES[0],
      GLOBAL_TELEMETRY_NODES[3],
      GLOBAL_TELEMETRY_NODES[4],
      GLOBAL_TELEMETRY_NODES[2],
    ];
    return secNodes[hash % secNodes.length];
  }
  const instNodes = [
    GLOBAL_TELEMETRY_NODES[1],
    GLOBAL_TELEMETRY_NODES[2],
    GLOBAL_TELEMETRY_NODES[5],
    GLOBAL_TELEMETRY_NODES[6],
    GLOBAL_TELEMETRY_NODES[7],
  ];
  return instNodes[hash % instNodes.length];
}

function getSeverityColor(
  severity: 'critico' | 'aviso' | 'info' | 'estavel',
  isDark: boolean
): string {
  if (severity === 'critico') return isDark ? '#f87171' : '#dc2626';
  if (severity === 'aviso') return isDark ? '#fbbf24' : '#d97706';
  if (severity === 'info') return isDark ? '#38bdf8' : '#0284c7';
  return isDark ? '#34d399' : '#059669';
}

export function SecurityAlertsGlobe({ workspace, isDark = true }: SecurityAlertsGlobeProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [filter, setFilter] = useState<GlobeFilter>('todos');
  const [autoRotate, setAutoRotate] = useState(true);
  const [zoomFactor, setZoomFactor] = useState(1);
  const [rotation, setRotation] = useState<[number, number, number]>([42, 16, 0]); // Initially faces Americas/Atlantic/Rio
  const [selectedNodeId, setSelectedNodeId] = useState<string>('rio-core');
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [pulsePhase, setPulsePhase] = useState(0);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 520,
    height: 360,
  });

  const rotationRef = useRef<[number, number, number]>(rotation);
  rotationRef.current = rotation;
  const isDraggingRef = useRef(false);
  const flyCancelRef = useRef<number | null>(null);

  const rawAlerts = useMemo(() => workspace?.alerts ?? [], [workspace?.alerts]);

  const filteredAlerts = useMemo(() => {
    return rawAlerts.filter((a) => {
      if (filter === 'seguranca') return a.type === 'seguranca';
      if (filter === 'instabilidade') return a.type === 'instabilidade';
      if (filter === 'abertos') return !a.resolved;
      return true;
    });
  }, [rawAlerts, filter]);

  const mappedNodes = useMemo<MappedAlertPoint[]>(() => {
    const bucket = new Map<string, AlertItem[]>();
    for (const node of GLOBAL_TELEMETRY_NODES) {
      bucket.set(node.id, []);
    }
    for (const alert of filteredAlerts) {
      const targetNode = assignAlertToNode(alert);
      bucket.get(targetNode.id)?.push(alert);
    }

    return GLOBAL_TELEMETRY_NODES.map((node) => {
      const alerts = bucket.get(node.id) ?? [];
      const securityCount = alerts.filter((a) => a.type === 'seguranca').length;
      const instabilityCount = alerts.filter((a) => a.type === 'instabilidade').length;
      const openCount = alerts.filter((a) => !a.resolved).length;
      const criticalCount = alerts.filter((a) => !a.resolved && a.severity === 'critico').length;
      const warnCount = alerts.filter((a) => !a.resolved && a.severity === 'aviso').length;

      let highestSeverity: MappedAlertPoint['highestSeverity'] = 'estavel';
      if (criticalCount > 0) {
        highestSeverity = 'critico';
      } else if (warnCount > 0) {
        highestSeverity = 'aviso';
      } else if (openCount > 0) {
        highestSeverity = 'info';
      }

      const riskScore = Math.min(
        100,
        criticalCount * 42 + warnCount * 22 + Math.max(0, openCount - criticalCount - warnCount) * 10
      );

      return {
        node,
        alerts,
        securityCount,
        instabilityCount,
        openCount,
        criticalCount,
        warnCount,
        highestSeverity,
        riskScore,
      };
    });
  }, [filteredAlerts]);

  const summary = useMemo(() => {
    const total = rawAlerts.length;
    const open = rawAlerts.filter((a) => !a.resolved).length;
    const security = rawAlerts.filter((a) => a.type === 'seguranca' && !a.resolved).length;
    const instability = rawAlerts.filter((a) => a.type === 'instabilidade' && !a.resolved).length;
    const critical = rawAlerts.filter((a) => !a.resolved && a.severity === 'critico').length;
    const activeRegions = mappedNodes.filter((n) => n.openCount > 0).length;
    return { total, open, security, instability, critical, activeRegions };
  }, [rawAlerts, mappedNodes]);

  const selectedPoint = useMemo(() => {
    return (
      mappedNodes.find((n) => n.node.id === selectedNodeId) ??
      mappedNodes[0]
    );
  }, [mappedNodes, selectedNodeId]);

  // Responsive container measurement
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(280, Math.round(rect.width));
      const h = Math.max(300, Math.min(400, Math.round(w * 0.68)));
      setDimensions({ width: w, height: h });
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Smooth D3 auto-rotation + radar pulse loop
  useEffect(() => {
    let frameId = 0;
    let lastTs = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      setPulsePhase((p) => (p + dt * 2.1) % (Math.PI * 2));

      if (autoRotate && !isDraggingRef.current && flyCancelRef.current === null) {
        setRotation(([lon, lat, roll]) => [((lon + dt * 11.5 + 180) % 360) - 180, lat, roll]);
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [autoRotate]);

  // D3 drag interaction on SVG globe
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const dragBehavior = d3
      .drag<SVGSVGElement, unknown>()
      .on('start', () => {
        isDraggingRef.current = true;
        if (flyCancelRef.current !== null) {
          cancelAnimationFrame(flyCancelRef.current);
          flyCancelRef.current = null;
        }
      })
      .on('drag', (event) => {
        const sensitivity = 0.42 / zoomFactor;
        const [lon, lat, roll] = rotationRef.current;
        const nextLon = lon + event.dx * sensitivity;
        const nextLat = Math.max(-72, Math.min(72, lat - event.dy * sensitivity));
        setRotation([nextLon, nextLat, roll]);
      })
      .on('end', () => {
        isDraggingRef.current = false;
      });

    const selection = d3.select(svgEl);
    selection.call(dragBehavior);

    return () => {
      selection.on('.drag', null);
    };
  }, [zoomFactor]);

  // Smoothly fly/rotate 3D globe to a target region coordinate using d3.interpolate
  const focusNode = useCallback((point: MappedAlertPoint) => {
    triggerHaptic('tap');
    setSelectedNodeId(point.node.id);
    setAutoRotate(false);

    if (flyCancelRef.current !== null) {
      cancelAnimationFrame(flyCancelRef.current);
      flyCancelRef.current = null;
    }

    const startRot: [number, number, number] = [...rotationRef.current];
    const targetRot: [number, number, number] = [
      -point.node.coordinates[0],
      -point.node.coordinates[1],
      0,
    ];
    const interp = d3.interpolate(startRot, targetRot);
    const durationMs = 680;
    const t0 = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / durationMs);
      const eased = d3.easeCubicOut(t);
      setRotation(interp(eased) as [number, number, number]);
      if (t < 1) {
        flyCancelRef.current = requestAnimationFrame(step);
      } else {
        flyCancelRef.current = null;
      }
    };

    flyCancelRef.current = requestAnimationFrame(step);
  }, []);

  const handleResetView = () => {
    triggerHaptic('tap');
    if (flyCancelRef.current !== null) {
      cancelAnimationFrame(flyCancelRef.current);
      flyCancelRef.current = null;
    }
    setZoomFactor(1);
    setRotation([42, 16, 0]);
    setAutoRotate(true);
    setSelectedNodeId('rio-core');
  };

  // Build D3 Orthographic Projection & GeoPath
  const { width, height } = dimensions;
  const baseRadius = Math.min(width, height) * 0.43;
  const radius = baseRadius * zoomFactor;
  const centerX = width / 2;
  const centerY = height / 2;

  const projection = useMemo(() => {
    return d3
      .geoOrthographic()
      .scale(radius)
      .translate([centerX, centerY])
      .clipAngle(90)
      .rotate(rotation);
  }, [radius, centerX, centerY, rotation]);

  const pathGenerator = useMemo(() => d3.geoPath(projection), [projection]);
  const graticulePath = useMemo(() => pathGenerator(d3.geoGraticule10()) ?? '', [pathGenerator]);
  const landPaths = useMemo(
    () =>
      WORLD_LAND_GEOJSON.features.map((feat, idx) => ({
        key: `${feat.properties?.name ?? idx}`,
        d: pathGenerator(feat) ?? '',
      })),
    [pathGenerator]
  );

  // Hemispheric visibility center (inverse of rotation)
  const visibleCenterLonLat: [number, number] = [-rotation[0], -rotation[1]];

  // Compute visible 3D geodesic arcs from active nodes to Rio de Janeiro core
  const visibleArcs = useMemo(() => {
    return mappedNodes
      .filter((pt) => !pt.node.isPrimaryHub && (pt.openCount > 0 || pt.alerts.length > 0))
      .map((pt) => {
        const line: GeoJSON.Feature<GeoJSON.LineString> = {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: d3
              .range(0, 1.01, 0.08)
              .map((t) => d3.geoInterpolate(pt.node.coordinates, PRIMARY_HUB_COORDS)(t)),
          },
        };
        const d = pathGenerator(line) ?? '';
        return {
          id: pt.node.id,
          d,
          color: getSeverityColor(pt.highestSeverity, isDark),
          isCritical: pt.highestSeverity === 'critico',
        };
      })
      .filter((arc) => arc.d.length > 0);
  }, [mappedNodes, pathGenerator, isDark]);

  // Project node positions with front-hemisphere culling
  const projectedNodes = useMemo(() => {
    return mappedNodes
      .map((pt) => {
        const angularDist = d3.geoDistance(pt.node.coordinates, visibleCenterLonLat);
        const visible = angularDist < Math.PI / 2 - 0.04;
        const coords = visible ? projection(pt.node.coordinates) : null;
        return {
          point: pt,
          visible: Boolean(visible && coords),
          x: coords?.[0] ?? 0,
          y: coords?.[1] ?? 0,
          depthScale: Math.max(0.68, Math.cos(Math.min(Math.PI / 2, angularDist))),
        };
      })
      .sort((a, b) => a.depthScale - b.depthScale);
  }, [mappedNodes, visibleCenterLonLat, projection]);

  return (
    <section
      aria-label="Globo 3D Interativo de Alertas de Segurança e Instabilidade"
      className={`rounded-2xl border p-4 sm:p-5 space-y-4 transition-colors ${
        isDark
          ? 'border-sky-500/30 bg-gradient-to-br from-slate-950/95 via-slate-900/90 to-slate-950/95 shadow-[0_0_32px_rgba(14,165,233,0.08)]'
          : 'border-slate-200 bg-white/95 shadow-sm'
      }`}
    >
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
              isDark
                ? 'border-sky-400/35 bg-sky-500/10 text-sky-300'
                : 'border-sky-200 bg-sky-50 text-sky-700'
            }`}
          >
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
                Globo 3D de Alertas de Segurança &amp; Instabilidade (D3.js)
              </h2>
              <span
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
                  summary.critical > 0
                    ? 'border-red-500/40 bg-red-500/15 text-red-600 dark:text-red-300'
                    : summary.open > 0
                    ? 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                    : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full animate-pulse ${
                    summary.critical > 0
                      ? 'bg-red-500'
                      : summary.open > 0
                      ? 'bg-amber-400'
                      : 'bg-emerald-400'
                  }`}
                />
                {summary.critical > 0
                  ? `${summary.critical} Crítico(s)`
                  : summary.open > 0
                  ? `${summary.open} Ativo(s)`
                  : 'Perímetro Estável'}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
              Arraste o globo 3D para rotacionar, clique em qualquer região para focar a telemetria e monitore alertas em tempo real sincronizados ao Núcleo RODACK (Rio de Janeiro).
            </p>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'todos', label: 'Todos' },
              { id: 'seguranca', label: 'Segurança' },
              { id: 'instabilidade', label: 'Instabilidade' },
              { id: 'abertos', label: 'Em Aberto' },
            ] as const
          ).map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  triggerHaptic('tap');
                  setFilter(tab.id);
                }}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? isDark
                      ? 'border-sky-400/70 bg-sky-500/20 text-sky-200'
                      : 'border-sky-600 bg-sky-600 text-white'
                    : isDark
                    ? 'border-slate-700/80 bg-slate-900/80 text-slate-300 hover:border-slate-600'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Live KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div
          className={`rounded-xl border px-3 py-2.5 ${
            isDark
              ? 'border-slate-800 bg-slate-950/70'
              : 'border-slate-200 bg-slate-50/80'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>Segurança (Abertos)</span>
            <ShieldAlert className="h-3.5 w-3.5 text-red-500 dark:text-red-400" />
          </div>
          <p className="mt-1 font-mono text-lg font-bold text-slate-900 dark:text-slate-100">
            {summary.security}
          </p>
        </div>

        <div
          className={`rounded-xl border px-3 py-2.5 ${
            isDark
              ? 'border-slate-800 bg-slate-950/70'
              : 'border-slate-200 bg-slate-50/80'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>Instabilidade (Abertos)</span>
            <Activity className="h-3.5 w-3.5 text-amber-500 dark:text-amber-300" />
          </div>
          <p className="mt-1 font-mono text-lg font-bold text-slate-900 dark:text-slate-100">
            {summary.instability}
          </p>
        </div>

        <div
          className={`rounded-xl border px-3 py-2.5 ${
            isDark
              ? 'border-slate-800 bg-slate-950/70'
              : 'border-slate-200 bg-slate-50/80'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>Regiões em Alerta</span>
            <Crosshair className="h-3.5 w-3.5 text-sky-500 dark:text-sky-400" />
          </div>
          <p className="mt-1 font-mono text-lg font-bold text-slate-900 dark:text-slate-100">
            {summary.activeRegions}
            <span className="text-xs font-normal text-slate-500">/{GLOBAL_TELEMETRY_NODES.length}</span>
          </p>
        </div>

        <div
          className={`rounded-xl border px-3 py-2.5 ${
            isDark
              ? 'border-slate-800 bg-slate-950/70'
              : 'border-slate-200 bg-slate-50/80'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>Alertas Monitorados</span>
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" />
          </div>
          <p className="mt-1 font-mono text-lg font-bold text-slate-900 dark:text-slate-100">
            {summary.total}
          </p>
        </div>
      </div>

      {/* Main 3D Globe + Regional Telemetry Inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        {/* D3.js Interactive 3D Orthographic Globe Canvas */}
        <div
          ref={containerRef}
          className={`xl:col-span-7 relative overflow-hidden rounded-xl border select-none ${
            isDark
              ? 'border-sky-500/25 bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.14)_0%,rgba(2,6,23,0.98)_72%)]'
              : 'border-slate-200 bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.10)_0%,rgba(241,245,249,0.95)_75%)]'
          }`}
        >
          {/* Floating Toolbar */}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('tap');
                setAutoRotate((v) => !v);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium backdrop-blur-md transition-colors ${
                isDark
                  ? 'border-slate-700/80 bg-slate-950/80 text-slate-200 hover:border-sky-400/60'
                  : 'border-slate-300 bg-white/90 text-slate-800 hover:bg-slate-100'
              }`}
              title={autoRotate ? 'Pausar rotação 3D' : 'Retomar rotação 3D'}
            >
              {autoRotate ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              <span>{autoRotate ? 'Girando' : 'Pausado'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('tap');
                setZoomFactor((z) => Math.min(1.55, Number((z + 0.15).toFixed(2))));
              }}
              aria-label="Aumentar zoom do globo 3D"
              className={`rounded-lg border p-1.5 backdrop-blur-md transition-colors ${
                isDark
                  ? 'border-slate-700/80 bg-slate-950/80 text-slate-200 hover:border-sky-400/60'
                  : 'border-slate-300 bg-white/90 text-slate-800 hover:bg-slate-100'
              }`}
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('tap');
                setZoomFactor((z) => Math.max(0.75, Number((z - 0.15).toFixed(2))));
              }}
              aria-label="Reduzir zoom do globo 3D"
              className={`rounded-lg border p-1.5 backdrop-blur-md transition-colors ${
                isDark
                  ? 'border-slate-700/80 bg-slate-950/80 text-slate-200 hover:border-sky-400/60'
                  : 'border-slate-300 bg-white/90 text-slate-800 hover:bg-slate-100'
              }`}
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={handleResetView}
              aria-label="Resetar rotação e zoom do globo 3D"
              className={`rounded-lg border p-1.5 backdrop-blur-md transition-colors ${
                isDark
                  ? 'border-slate-700/80 bg-slate-950/80 text-slate-200 hover:border-sky-400/60'
                  : 'border-slate-300 bg-white/90 text-slate-800 hover:bg-slate-100'
              }`}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Coordinates HUD */}
          <div
            className={`absolute bottom-2.5 left-3 z-10 rounded-md border px-2 py-1 font-mono text-[10px] backdrop-blur-sm ${
              isDark
                ? 'border-slate-800 bg-slate-950/75 text-sky-300/90'
                : 'border-slate-200 bg-white/85 text-slate-700'
            }`}
          >
            LON {(-rotation[0]).toFixed(1)}° · LAT {(-rotation[1]).toFixed(1)}° · ZOOM {(zoomFactor * 100).toFixed(0)}%
          </div>

          {/* Severity Legend */}
          <div
            className={`absolute bottom-2.5 right-3 z-10 flex items-center gap-2.5 rounded-md border px-2.5 py-1 text-[10px] backdrop-blur-sm ${
              isDark
                ? 'border-slate-800 bg-slate-950/75 text-slate-300'
                : 'border-slate-200 bg-white/85 text-slate-700'
            }`}
          >
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-red-500" /> Crítico
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-400" /> Aviso
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-sky-400" /> Info
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> Estável
            </span>
          </div>

          {/* D3 Orthographic SVG */}
          <svg
            ref={svgRef}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="block w-full cursor-grab active:cursor-grabbing touch-none"
            role="img"
            aria-label="Globo 3D interativo exibindo nós globais de alertas de segurança e instabilidade"
          >
            <defs>
              <radialGradient id="rodack-globe-ocean" cx="38%" cy="32%" r="68%">
                <stop offset="0%" stopColor={isDark ? '#0f2942' : '#e0f2fe'} />
                <stop offset="55%" stopColor={isDark ? '#071527' : '#bae6fd'} />
                <stop offset="100%" stopColor={isDark ? '#020617' : '#7dd3fc'} />
              </radialGradient>
              <radialGradient id="rodack-globe-atmosphere" cx="50%" cy="50%" r="54%">
                <stop offset="78%" stopColor={isDark ? 'rgba(56,189,248,0)' : 'rgba(14,165,233,0)'} />
                <stop offset="96%" stopColor={isDark ? 'rgba(56,189,248,0.22)' : 'rgba(2,132,199,0.18)'} />
                <stop offset="100%" stopColor={isDark ? 'rgba(56,189,248,0.45)' : 'rgba(2,132,199,0.32)'} />
              </radialGradient>
            </defs>

            {/* Outer Atmospheric Halo */}
            <circle
              cx={centerX}
              cy={centerY}
              r={radius + 10}
              fill="url(#rodack-globe-atmosphere)"
              pointerEvents="none"
            />

            {/* Ocean Sphere */}
            <circle
              cx={centerX}
              cy={centerY}
              r={radius}
              fill="url(#rodack-globe-ocean)"
              stroke={isDark ? 'rgba(56,189,248,0.42)' : 'rgba(2,132,199,0.45)'}
              strokeWidth={1.5}
            />

            {/* Latitude / Longitude Graticule */}
            <path
              d={graticulePath}
              fill="none"
              stroke={isDark ? 'rgba(56,189,248,0.14)' : 'rgba(15,23,42,0.12)'}
              strokeWidth={0.7}
            />

            {/* Continental Landmasses */}
            <g>
              {landPaths.map((land) => (
                <path
                  key={land.key}
                  d={land.d}
                  fill={isDark ? 'rgba(30, 58, 95, 0.72)' : 'rgba(15, 23, 42, 0.16)'}
                  stroke={isDark ? 'rgba(56, 189, 248, 0.42)' : 'rgba(15, 23, 42, 0.35)'}
                  strokeWidth={0.9}
                />
              ))}
            </g>

            {/* Geodesic Alert Telemetry Arcs to Rio de Janeiro Core */}
            <g pointerEvents="none">
              {visibleArcs.map((arc) => (
                <path
                  key={arc.id}
                  d={arc.d}
                  fill="none"
                  stroke={arc.color}
                  strokeWidth={arc.isCritical ? 1.8 : 1.25}
                  strokeOpacity={arc.isCritical ? 0.8 : 0.55}
                  strokeDasharray="4 4"
                  strokeDashoffset={-pulsePhase * 12}
                />
              ))}
            </g>

            {/* Interactive Regional Alert Nodes */}
            <g>
              {projectedNodes.map(({ point, visible, x, y, depthScale }) => {
                if (!visible) return null;
                const color = getSeverityColor(point.highestSeverity, isDark);
                const isSelected = point.node.id === selectedNodeId;
                const isHovered = point.node.id === hoveredNodeId;
                const baseDotR =
                  (point.openCount > 0 ? 5.5 + Math.min(4.5, point.openCount * 1.1) : 4.2) *
                  depthScale;
                const wave = (Math.sin(pulsePhase + (point.node.isPrimaryHub ? 0 : 1.4)) + 1) * 0.5;
                const haloR = baseDotR + 5 + wave * (point.highestSeverity === 'critico' ? 12 : 7);

                return (
                  <g
                    key={point.node.id}
                    transform={`translate(${x}, ${y})`}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      focusNode(point);
                    }}
                    onMouseEnter={() => setHoveredNodeId(point.node.id)}
                    onMouseLeave={() => setHoveredNodeId((prev) => (prev === point.node.id ? null : prev))}
                  >
                    {/* Animated Pulsing Radar Ring */}
                    {(point.openCount > 0 || point.node.isPrimaryHub || isSelected) && (
                      <circle
                        r={haloR}
                        fill="none"
                        stroke={color}
                        strokeWidth={isSelected ? 1.8 : 1.1}
                        strokeOpacity={Math.max(0.12, (1 - wave) * 0.72)}
                      />
                    )}

                    {/* Selection Reticle */}
                    {isSelected && (
                      <circle
                        r={baseDotR + 5}
                        fill="none"
                        stroke={isDark ? '#f8fafc' : '#0f172a'}
                        strokeWidth={1.2}
                        strokeDasharray="3 2"
                      />
                    )}

                    {/* Node Core */}
                    <circle
                      r={baseDotR}
                      fill={color}
                      stroke={isDark ? '#020617' : '#ffffff'}
                      strokeWidth={1.4}
                    />

                    {/* Count Badge Inside or Next to Node */}
                    {point.openCount > 0 && (
                      <text
                        y={-baseDotR - 5}
                        textAnchor="middle"
                        fontSize={10}
                        fontWeight={700}
                        fill={color}
                        className="font-mono select-none"
                      >
                        {point.openCount}
                      </text>
                    )}

                    {/* Label for selected / hovered / primary hub */}
                    {(isSelected || isHovered || point.node.isPrimaryHub) && (
                      <text
                        y={baseDotR + 13}
                        textAnchor="middle"
                        fontSize={10}
                        fontWeight={600}
                        fill={isDark ? '#e2e8f0' : '#0f172a'}
                        className="select-none"
                        style={{
                          textShadow: isDark ? '0 1px 4px rgba(2,6,23,0.95)' : '0 1px 3px rgba(255,255,255,0.95)',
                        }}
                      >
                        {point.node.name}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* Regional Telemetry Selector & Active Node Alert Details */}
        <div className="xl:col-span-5 flex flex-col gap-3">
          {/* Selected Region Inspector */}
          <div
            className={`rounded-xl border p-3.5 space-y-2.5 ${
              isDark
                ? 'border-slate-800 bg-slate-950/75'
                : 'border-slate-200 bg-slate-50/90'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: getSeverityColor(selectedPoint.highestSeverity, isDark) }}
                  />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {selectedPoint.node.name}
                  </h3>
                  <span className="rounded border border-slate-300 dark:border-slate-700 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:text-slate-300">
                    {selectedPoint.node.hubCode}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  {selectedPoint.node.regionLabel}
                </p>
              </div>

              <div className="text-right">
                <span className="block font-mono text-[10px] uppercase text-slate-500">Risco Local</span>
                <span
                  className="font-mono text-sm font-bold"
                  style={{ color: getSeverityColor(selectedPoint.highestSeverity, isDark) }}
                >
                  {selectedPoint.riskScore}%
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/70 py-1.5">
                <span className="block text-[10px] text-slate-500">Segurança</span>
                <span className="font-mono text-xs font-bold text-red-600 dark:text-red-300">
                  {selectedPoint.securityCount}
                </span>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/70 py-1.5">
                <span className="block text-[10px] text-slate-500">Instabilidade</span>
                <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-300">
                  {selectedPoint.instabilityCount}
                </span>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/70 py-1.5">
                <span className="block text-[10px] text-slate-500">Em Aberto</span>
                <span className="font-mono text-xs font-bold text-sky-600 dark:text-sky-300">
                  {selectedPoint.openCount}
                </span>
              </div>
            </div>

            {/* Alerts inside selected region */}
            <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
              {selectedPoint.alerts.length === 0 ? (
                <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
                  Nenhum alerta ativo nesta região para o filtro atual. Sensores operando com estabilidade nominal.
                </div>
              ) : (
                selectedPoint.alerts.slice(0, 5).map((alert) => {
                  const isCrit = alert.severity === 'critico';
                  const isWarn = alert.severity === 'aviso';
                  return (
                    <div
                      key={alert.id}
                      className={`rounded-lg border px-2.5 py-2 text-xs space-y-1 ${
                        alert.resolved
                          ? 'border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/40 opacity-70'
                          : isCrit
                          ? 'border-red-500/35 bg-red-500/10'
                          : isWarn
                          ? 'border-amber-500/35 bg-amber-500/10'
                          : 'border-sky-500/30 bg-sky-500/10'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {isCrit ? (
                            <ShieldAlert className="h-3.5 w-3.5 text-red-500 shrink-0" />
                          ) : (
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          )}
                          <span className="truncate">{alert.title}</span>
                        </span>
                        <span className="shrink-0 font-mono text-[10px] uppercase text-slate-500 dark:text-slate-400">
                          {alert.type === 'seguranca' ? 'SEC' : 'INST'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2">
                        {alert.detail}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Clickable Global Telemetry Regions Matrix */}
          <div
            className={`flex-1 rounded-xl border p-3 space-y-2 ${
              isDark
                ? 'border-slate-800 bg-slate-950/60'
                : 'border-slate-200 bg-slate-50/70'
            }`}
          >
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <span>Nós Geográficos Monitorados</span>
              <span>Clique para Focar</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {mappedNodes.map((pt) => {
                const isSelected = pt.node.id === selectedNodeId;
                const color = getSeverityColor(pt.highestSeverity, isDark);
                return (
                  <button
                    key={pt.node.id}
                    type="button"
                    onClick={() => focusNode(pt)}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                      isSelected
                        ? isDark
                          ? 'border-sky-400/70 bg-sky-500/15 text-slate-100'
                          : 'border-sky-600 bg-sky-50 text-slate-900'
                        : isDark
                        ? 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="truncate text-xs font-medium">{pt.node.name}</span>
                    </span>
                    <span
                      className="font-mono text-[11px] font-bold shrink-0"
                      style={{ color }}
                    >
                      {pt.openCount > 0 ? pt.openCount : 'OK'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

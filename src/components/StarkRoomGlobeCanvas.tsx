import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { AssistantId, LiveWeatherReport } from '../types/assistant';
import type { AudioTelemetryBuffer } from '../hooks/useVoiceEngine';

interface StarkRoomGlobeCanvasProps {
  audioTelemetryRef: RefObject<AudioTelemetryBuffer>;
  activeSpeaker: AssistantId | 'ambos' | 'todos' | null;
  isSpeaking: boolean;
  isProcessing: boolean;
  weather?: LiveWeatherReport | null;
  totalSignals: number;
  ringRttMs: number;
  onSelectAssistant: (speaker: AssistantId) => void;
  onInspectNode?: (nodeId: 'rio' | 'b3' | 'cepea' | 'global') => void;
}

interface GlobeNode {
  id: 'rio' | 'b3' | 'cepea' | 'global';
  label: string;
  sub: string;
  lat: number;
  lon: number;
  color: string;
}

const GLOBE_NODES: GlobeNode[] = [
  {
    id: 'rio',
    label: 'Rio de Janeiro · Sede',
    sub: '22.90°S · 43.17°W · G1 / Clima',
    lat: -22.9,
    lon: -43.2,
    color: '#38bdf8',
  },
  {
    id: 'b3',
    label: 'São Paulo · B3',
    sub: '23.55°S · 46.63°W · Bolsa & Câmbio',
    lat: -23.55,
    lon: -46.63,
    color: '#fb923c',
  },
  {
    id: 'cepea',
    label: 'Piracicaba · CEPEA',
    sub: '22.72°S · 47.65°W · Agro & Commodities',
    lat: -22.72,
    lon: -47.65,
    color: '#facc15',
  },
  {
    id: 'global',
    label: 'Rede Global · Notícias',
    sub: '40.71°N · 74.00°W · Fluxo Internacional',
    lat: 40.7,
    lon: -74.0,
    color: '#f43f5e',
  },
];

// Simplified continent polylines (lat, lon) for crisp FUI tactical wireframe continents
const CONTINENT_LOOPS: Array<Array<[number, number]>> = [
  // South America
  [
    [10, -75],
    [5, -52],
    [-6, -35],
    [-23, -43],
    [-35, -54],
    [-54, -68],
    [-40, -73],
    [-18, -71],
    [-5, -81],
    [10, -75],
  ],
  // North America
  [
    [60, -140],
    [55, -100],
    [45, -65],
    [28, -81],
    [20, -98],
    [15, -86],
    [32, -117],
    [50, -128],
    [60, -140],
  ],
  // Europe
  [
    [36, -9],
    [43, 3],
    [55, 10],
    [62, 24],
    [55, 38],
    [42, 29],
    [38, 15],
    [36, -9],
  ],
  // Africa
  [
    [35, -6],
    [31, 32],
    [12, 44],
    [-10, 40],
    [-34, 20],
    [-20, 12],
    [5, 8],
    [15, -17],
    [35, -6],
  ],
  // Asia
  [
    [42, 30],
    [60, 60],
    [66, 125],
    [52, 140],
    [35, 129],
    [22, 114],
    [10, 105],
    [8, 77],
    [24, 58],
    [42, 30],
  ],
  // Australia
  [
    [-12, 131],
    [-18, 146],
    [-35, 150],
    [-35, 117],
    [-22, 114],
    [-12, 131],
  ],
];

function projectPoint(latDeg: number, lonDeg: number, rotLonRad: number, tiltRad: number) {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180 + rotLonRad;

  const cosLat = Math.cos(lat);
  const x0 = cosLat * Math.sin(lon);
  const y0 = Math.sin(lat);
  const z0 = cosLat * Math.cos(lon);

  // Tilt around X axis so Southern Hemisphere / Brazil sits nicely visible
  const y = y0 * Math.cos(tiltRad) - z0 * Math.sin(tiltRad);
  const z = y0 * Math.sin(tiltRad) + z0 * Math.cos(tiltRad);
  return { x: x0, y: -y, z };
}

export function StarkRoomGlobeCanvas({
  audioTelemetryRef,
  activeSpeaker,
  isSpeaking,
  isProcessing,
  weather,
  totalSignals,
  ringRttMs,
  onSelectAssistant,
  onInspectNode,
}: StarkRoomGlobeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const stageSizeRef = useRef<{ width: number; height: number }>({ width: 420, height: 380 });
  const [selectedNodeId, setSelectedNodeId] = useState<'rio' | 'b3' | 'cepea' | 'global'>('rio');

  const speakerRef = useRef(activeSpeaker);
  speakerRef.current = activeSpeaker;
  const speakingRef = useRef(isSpeaking);
  speakingRef.current = isSpeaking;
  const processingRef = useRef(isProcessing);
  processingRef.current = isProcessing;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = stageContainerRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const syncStageSize = () => {
      const target = container ?? canvas;
      const rect = target.getBoundingClientRect();
      stageSizeRef.current = {
        width: Math.max(240, Math.round(rect.width)),
        height: Math.max(220, Math.round(rect.height)),
      };
    };
    syncStageSize();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && container) {
      resizeObserver = new ResizeObserver(() => {
        syncStageSize();
      });
      resizeObserver.observe(container);
    }

    let rafId = 0;
    let rotation = 0.72; // Start focused near Americas / Rio de Janeiro
    let lastTime = performance.now();

    const draw = (now: number) => {
      if (typeof document !== 'undefined' && document.hidden) {
        lastTime = now;
        rafId = requestAnimationFrame(draw);
        return;
      }

      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = stageSizeRef.current;

      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const baseRadius = Math.min(width, height) * 0.325;

      const amp = audioTelemetryRef.current?.active ? audioTelemetryRef.current.amplitude : 0;
      const speaker = speakerRef.current;
      const activeBoost = speakingRef.current ? 0.35 + amp * 0.9 : processingRef.current ? 0.25 : 0;

      // Primary thermal orange / speaker-reactive core tint
      const primaryRgb =
        speaker === 'ultron'
          ? '244, 63, 94'
          : speaker === 'sexta-feira'
          ? '56, 189, 248'
          : '249, 115, 22';

      rotation += dt * (0.14 + activeBoost * 0.16);
      const tilt = 0.22;

      // 1. Outer ambient radial thermal glow (matching the Stark Earth Monitor halo)
      const haloGrad = ctx.createRadialGradient(
        cx,
        cy,
        baseRadius * 0.65,
        cx,
        cy,
        baseRadius * 1.62
      );
      haloGrad.addColorStop(0, `rgba(${primaryRgb}, ${0.22 + activeBoost * 0.16})`);
      haloGrad.addColorStop(0.55, 'rgba(56, 189, 248, 0.10)');
      haloGrad.addColorStop(1, 'rgba(6, 16, 27, 0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius * 1.62, 0, Math.PI * 2);
      ctx.fill();

      // 2. Concentric FUI Calibrated Compass Rings (Outer orange/cyan segmented arcs)
      const outerR1 = baseRadius * 1.44;
      const outerR2 = baseRadius * 1.28;
      const outerR3 = baseRadius * 1.13;

      // Outer dashed calibration track
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation * 0.25);
      ctx.strokeStyle = 'rgba(249, 115, 22, 0.42)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, outerR1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Degree tick marks around outer ring
      const tickCount = 72;
      for (let i = 0; i < tickCount; i++) {
        const angle = (i / tickCount) * Math.PI * 2;
        const isMajor = i % 6 === 0;
        const rIn = outerR2 + (isMajor ? 2 : 6);
        const rOut = outerR2 + (isMajor ? 14 : 10);
        ctx.strokeStyle = isMajor ? 'rgba(251, 146, 60, 0.72)' : 'rgba(125, 211, 252, 0.28)';
        ctx.lineWidth = isMajor ? 1.4 : 0.8;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * rIn, Math.sin(angle) * rIn);
        ctx.lineTo(Math.cos(angle) * rOut, Math.sin(angle) * rOut);
        ctx.stroke();
      }

      // Highlight orange thick arc segments (signature Stark HUD look)
      ctx.strokeStyle = `rgba(${primaryRgb}, ${0.78 + activeBoost * 0.2})`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, outerR2 - 4, -Math.PI * 0.78, -Math.PI * 0.34);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, outerR2 - 4, Math.PI * 0.12, Math.PI * 0.62);
      ctx.stroke();
      ctx.restore();

      // Counter-rotating inner precision ring
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-rotation * 0.42);
      ctx.strokeStyle = 'rgba(251, 146, 60, 0.55)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, outerR3, -0.4, 1.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, outerR3, Math.PI - 0.5, Math.PI + 1.3);
      ctx.stroke();
      ctx.restore();

      // 3. Tilted Elliptical Orbital Trajectories & Glowing Satellites
      const orbits = [
        { tiltAngle: -0.32, rx: baseRadius * 1.48, ry: baseRadius * 0.42, speed: 0.75, phase: 0.4 },
        { tiltAngle: 0.52, rx: baseRadius * 1.36, ry: baseRadius * 0.34, speed: -0.58, phase: 2.3 },
      ];
      for (const orb of orbits) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(orb.tiltAngle);
        ctx.strokeStyle = 'rgba(251, 146, 60, 0.36)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.ellipse(0, 0, orb.rx, orb.ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        const satAngle = now * 0.001 * orb.speed + orb.phase;
        const sx = Math.cos(satAngle) * orb.rx;
        const sy = Math.sin(satAngle) * orb.ry;

        const satGlow = ctx.createRadialGradient(sx, sy, 1, sx, sy, 14);
        satGlow.addColorStop(0, 'rgba(254, 240, 138, 0.98)');
        satGlow.addColorStop(0.4, 'rgba(249, 115, 22, 0.72)');
        satGlow.addColorStop(1, 'rgba(249, 115, 22, 0)');
        ctx.fillStyle = satGlow;
        ctx.beginPath();
        ctx.arc(sx, sy, 14, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(sx, sy, 2.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 4. Holographic Earth Core Sphere
      const sphereGrad = ctx.createRadialGradient(
        cx - baseRadius * 0.25,
        cy - baseRadius * 0.25,
        baseRadius * 0.1,
        cx,
        cy,
        baseRadius
      );
      sphereGrad.addColorStop(0, 'rgba(186, 230, 253, 0.28)');
      sphereGrad.addColorStop(0.5, 'rgba(14, 116, 144, 0.24)');
      sphereGrad.addColorStop(0.85, `rgba(${primaryRgb}, 0.22)`);
      sphereGrad.addColorStop(1, 'rgba(6, 16, 27, 0.72)');
      ctx.fillStyle = sphereGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
      ctx.fill();

      // Atmospheric luminous rim
      ctx.strokeStyle = 'rgba(125, 211, 252, 0.72)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
      ctx.stroke();

      // 5. Latitude & Longitude Wireframe Grid on Sphere
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
      ctx.lineWidth = 0.8;
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath();
        let started = false;
        for (let lon = -180; lon <= 180; lon += 10) {
          const p = projectPoint(lat, lon, rotation, tilt);
          if (p.z >= 0) {
            const px = cx + p.x * baseRadius;
            const py = cy + p.y * baseRadius;
            if (!started) {
              ctx.moveTo(px, py);
              started = true;
            } else {
              ctx.lineTo(px, py);
            }
          } else {
            started = false;
          }
        }
        ctx.stroke();
      }

      for (let lon = -150; lon <= 180; lon += 30) {
        ctx.beginPath();
        let started = false;
        for (let lat = -80; lat <= 80; lat += 10) {
          const p = projectPoint(lat, lon, rotation, tilt);
          if (p.z >= 0) {
            const px = cx + p.x * baseRadius;
            const py = cy + p.y * baseRadius;
            if (!started) {
              ctx.moveTo(px, py);
              started = true;
            } else {
              ctx.lineTo(px, py);
            }
          } else {
            started = false;
          }
        }
        ctx.stroke();
      }

      // 6. Tactical Wireframe Continents
      for (const loop of CONTINENT_LOOPS) {
        ctx.beginPath();
        let started = false;
        for (const [lat, lon] of loop) {
          const p = projectPoint(lat, lon, rotation, tilt);
          if (p.z >= -0.05) {
            const px = cx + p.x * baseRadius;
            const py = cy + p.y * baseRadius;
            if (!started) {
              ctx.moveTo(px, py);
              started = true;
            } else {
              ctx.lineTo(px, py);
            }
          } else {
            started = false;
          }
        }
        ctx.strokeStyle = 'rgba(186, 230, 253, 0.52)';
        ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
        ctx.lineWidth = 1.15;
        ctx.fill();
        ctx.stroke();
      }

      // 7. Live Data Arcs & Glowing Telemetry Nodes (Rio, B3, CEPEA, Global)
      const projectedNodes = GLOBE_NODES.map((node) => ({
        node,
        p: projectPoint(node.lat, node.lon, rotation, tilt),
      }));

      const rioProj = projectedNodes[0];
      for (let i = 1; i < projectedNodes.length; i++) {
        const target = projectedNodes[i];
        if (rioProj.p.z > -0.1 && target.p.z > -0.1) {
          const x1 = cx + rioProj.p.x * baseRadius;
          const y1 = cy + rioProj.p.y * baseRadius;
          const x2 = cx + target.p.x * baseRadius;
          const y2 = cy + target.p.y * baseRadius;
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2 - 22;

          ctx.strokeStyle = 'rgba(251, 146, 60, 0.55)';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.quadraticCurveTo(mx, my, x2, y2);
          ctx.stroke();
        }
      }

      const pulse = 0.5 + 0.5 * Math.sin(now * 0.005);
      for (const { node, p } of projectedNodes) {
        if (p.z < 0) continue;
        const px = cx + p.x * baseRadius;
        const py = cy + p.y * baseRadius;

        ctx.strokeStyle = node.color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(px, py, 5 + pulse * 5, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = node.color;
        ctx.beginPath();
        ctx.arc(px, py, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // 8. Audio-Reactive Inner Equatorial Spectrum Ring when an assistant speaks
      if (activeBoost > 0.05) {
        const bands = audioTelemetryRef.current?.bands;
        const barCount = 24;
        ctx.save();
        ctx.translate(cx, cy);
        for (let i = 0; i < barCount; i++) {
          const angle = (i / barCount) * Math.PI * 2 + rotation * 0.6;
          const val = bands ? bands[i] || 0.2 : 0.25;
          const len = 6 + val * 18;
          ctx.strokeStyle = `rgba(${primaryRgb}, ${0.5 + val * 0.5})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(angle) * (baseRadius + 4), Math.sin(angle) * (baseRadius + 4));
          ctx.lineTo(
            Math.cos(angle) * (baseRadius + 4 + len),
            Math.sin(angle) * (baseRadius + 4 + len)
          );
          ctx.stroke();
        }
        ctx.restore();
      }

      ctx.restore();
      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
    };
  }, [audioTelemetryRef]);

  const activeNode = GLOBE_NODES.find((n) => n.id === selectedNodeId) ?? GLOBE_NODES[0];

  return (
    <div className="relative flex flex-col items-center justify-between h-full w-full select-none">
      {/* Top orbital header strip */}
      <div className="w-full flex items-center justify-between gap-2 text-[10px] font-mono text-sky-300/80 px-1">
        <span>MONITOR GLOBAL · ÓRBITA EM TEMPO REAL</span>
        <span className="tabular-nums text-orange-300">
          RTT {ringRttMs}ms · {totalSignals} SINAIS
        </span>
      </div>

      {/* Main Canvas Stage — scales dynamically to all available width/height */}
      <div
        ref={stageContainerRef}
        className="relative w-full flex-1 min-h-[240px] sm:min-h-[300px] lg:min-h-[360px] flex items-center justify-center"
      >
        <canvas
          ref={canvasRef}
          aria-label="Globo holográfico orbital da Sala Stark conectado ao Rio de Janeiro, B3, CEPEA e notícias globais"
          className="absolute inset-0 w-full h-full cursor-crosshair"
        />

        {/* Top-Right Orbital Callout */}
        <div className="pointer-events-none absolute top-2 right-1 sm:right-3 text-right font-mono">
          <div className="text-[10px] text-orange-300/90 uppercase tracking-wider">
            {weather ? `${weather.city}` : 'Rio de Janeiro · RJ'}
          </div>
          <div className="text-sm font-bold text-sky-100 tabular-nums">
            {weather ? `${weather.temperatureC}°C` : '--°C'}{' '}
            <span className="text-[10px] font-normal text-sky-300/80">
              {weather ? weather.conditionLabel : 'Sincronizando'}
            </span>
          </div>
        </div>

        {/* Bottom-Left Selected Node Telemetry */}
        <div className="pointer-events-none absolute bottom-2 left-1 sm:left-2 font-mono">
          <div className="text-[10px] text-orange-400 uppercase tracking-wider">
            Nó Ativo · {activeNode.label}
          </div>
          <div className="text-[10px] text-sky-200/75 tabular-nums">{activeNode.sub}</div>
        </div>
      </div>

      {/* Interactive Orbital Node & Assistant Hologram Launchers */}
      <div className="w-full flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-sky-500/20">
        <div className="flex flex-wrap items-center gap-1">
          {GLOBE_NODES.map((node) => {
            const active = selectedNodeId === node.id;
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => {
                  setSelectedNodeId(node.id);
                  onInspectNode?.(node.id);
                }}
                className={`px-2 py-1 text-[10px] font-mono rounded transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-orange-500/25 border border-orange-400/70 text-orange-200 font-semibold'
                    : 'border border-sky-500/20 bg-slate-950/60 text-sky-200/75 hover:border-sky-400/50 hover:text-sky-100'
                }`}
              >
                {node.id === 'rio'
                  ? 'Rio · G1'
                  : node.id === 'b3'
                  ? 'B3 · SP'
                  : node.id === 'cepea'
                  ? 'CEPEA'
                  : 'Global'}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1">
          {(
            [
              { id: 'jarvis' as const, label: 'J.A.R.V.I.S.', cls: 'border-amber-400/50 text-amber-200 hover:bg-amber-500/20' },
              { id: 'sexta-feira' as const, label: 'SEXTA', cls: 'border-cyan-400/50 text-cyan-200 hover:bg-cyan-500/20' },
              { id: 'ultron' as const, label: 'ULTRON', cls: 'border-rose-400/50 text-rose-200 hover:bg-rose-500/20' },
            ] as const
          ).map((ai) => (
            <button
              key={ai.id}
              type="button"
              onClick={() => onSelectAssistant(ai.id)}
              title={`Projetar ${ai.label} no Holograma 3D`}
              className={`px-2 py-1 text-[10px] font-mono rounded border bg-slate-950/70 transition-colors whitespace-nowrap ${ai.cls}`}
            >
              {ai.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

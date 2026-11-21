import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { AudioTelemetryBuffer } from '../hooks/useVoiceEngine';
import type { AssistantId } from '../types/assistant';
import {
  ASSISTANT_AVATAR_URLS,
  ASSISTANT_VISUAL_PROFILES,
} from '../utils/assistantAssets';

interface Hologram3DStageProps {
  speaker: AssistantId;
  isSpeaking: boolean;
  isThinking: boolean;
  audioAmplitude: number;
  audioBands?: number[];
  audioTelemetryRef?: MutableRefObject<AudioTelemetryBuffer>;
  narrativeEmphasis: number;
  narrativeProgress: number;
  compact?: boolean;
}

const VERTEX_SHADER = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uTime;
  uniform float uAudioAmp;
  uniform float uBass;
  uniform float uMid;
  uniform float uHigh;
  uniform float uThinking;
  uniform float uSpeaking;
  uniform float uEmphasis;
  uniform float uPersona; // 0.0 = jarvis, 1.0 = sexta-feira, 2.0 = ultron

  varying vec2 vUv;
  varying float vLum;
  varying float vRadial;
  varying float vDisplacement;
  varying vec3 vNormalWorld;
  varying vec3 vViewDir;

  void main() {
    vUv = uv;
    vec2 centered = uv - 0.5;
    float r = length(centered);
    vRadial = r;

    vec4 tex = texture2D(uTexture, uv);
    float lum = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
    vLum = lum;

    // Soft spherical dome base so the portrait curves naturally in 3D space
    float sphereFactor = clamp(1.0 - r * r * 3.1, 0.0, 1.0);
    float dome = sqrt(sphereFactor);

    float energy = clamp(uAudioAmp * 1.25 + uEmphasis * 0.45, 0.0, 1.6);
    float disp = 0.0;

    if (uPersona < 0.5) {
      // J.A.R.V.I.S.: Golden luminous spherical neural matrix
      // Bright amber filaments extrude forward; neural waves ripple from the central core
      float neuralWave = sin(r * 24.0 - uTime * (4.2 + uThinking * 2.8)) * (0.045 + energy * 0.11);
      float angularSpin = sin(atan(centered.y, centered.x) * 6.0 + uTime * 2.1) * 0.025 * (0.4 + energy);
      float corePulse = exp(-r * 6.2) * (0.14 + uBass * 0.34 + uEmphasis * 0.16);
      disp = dome * 0.46 + lum * (0.34 + energy * 0.24) + (neuralWave + angularSpin) * dome + corePulse;
    } else if (uPersona < 1.5) {
      // SEXTA-FEIRA: Sleek humanoid chrome-white android with glowing cyan optics & cybernetic rings
      float cyanEnergy = max(0.0, max(tex.b, tex.g) - tex.r * 0.72);
      // Gentle sculptural facial relief preserving her exact humanoid geometry
      float lipZone = exp(-pow((uv.x - 0.37) * 11.0, 2.0)) * exp(-pow((uv.y - 0.52) * 14.0, 2.0));
      float lipMotion = lipZone * (uMid * 0.09 + energy * 0.07) * sin(uTime * 16.5 + uv.x * 10.0) * uSpeaking;
      float nodePulse = cyanEnergy * (0.14 + uHigh * 0.22 + energy * 0.16);
      disp = dome * 0.34 + lum * 0.27 + nodePulse + lipMotion;
    } else {
      // ULTRON: Sculpted dark titanium face with crimson eyes & vocal jaw vent
      float redness = max(0.0, tex.r - max(tex.g, tex.b));
      // Jaw/mouth grille zone (lower center of face) vibrates gently in sync with speech
      float jawMask = exp(-pow((uv.x - 0.5) * 6.2, 2.0)) * exp(-pow((uv.y - 0.27) * 9.0, 2.0));
      float jawMotion = jawMask * (uBass * 0.16 + energy * 0.14) * sin(uTime * 19.0 + uv.x * 14.0);
      // Cheekbone & brow relief
      float faceSculpt = dome * 0.34 + lum * 0.28 + redness * (0.14 + energy * 0.18);
      disp = faceSculpt + jawMotion;
    }

    // Subtle breathing depth even in calm standby
    disp += sin(uTime * 1.9 + r * 3.0) * 0.028 * dome;
    vDisplacement = disp;

    vec3 displaced = position + normal * disp;
    vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
    vNormalWorld = normalize(mat3(modelMatrix) * normalize(normal + vec3(centered * 0.85, 0.35)));
    vViewDir = normalize(cameraPosition - worldPos.xyz);

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uTime;
  uniform float uAudioAmp;
  uniform float uBass;
  uniform float uMid;
  uniform float uHigh;
  uniform float uThinking;
  uniform float uSpeaking;
  uniform float uEmphasis;
  uniform float uPersona;
  uniform vec3 uAccentColor;
  uniform vec3 uSecondaryColor;
  uniform float uOpacityScale;

  varying vec2 vUv;
  varying float vLum;
  varying float vRadial;
  varying float vDisplacement;
  varying vec3 vNormalWorld;
  varying vec3 vViewDir;

  void main() {
    vec2 centered = vUv - 0.5;
    float r = vRadial;

    // Subtle vocal micro-parallax distortion on high audio bursts (kept minimal to preserve exact identity)
    vec2 sampleUv = vUv;
    float energy = clamp(uAudioAmp * 1.2 + uEmphasis * 0.45, 0.0, 1.6);

    if (uPersona < 0.5) {
      // Subtle radial breathing ripple on J.A.R.V.I.S.'s golden filaments
      float ripple = sin(r * 30.0 - uTime * 6.5) * 0.0022 * energy * smoothstep(0.45, 0.08, r);
      sampleUv += normalize(centered + vec2(0.0001)) * ripple;
    } else if (uPersona < 1.5) {
      // Subtle expressive lip articulation for SEXTA-FEIRA when speaking
      float lipZone = exp(-pow((vUv.x - 0.37) * 11.5, 2.0)) * exp(-pow((vUv.y - 0.52) * 14.5, 2.0));
      sampleUv.y += lipZone * (0.0045 * uMid + 0.003 * energy) * uSpeaking * (0.5 + 0.5 * sin(uTime * 18.0));
    } else if (uPersona > 1.5) {
      // Subtle downward jaw vocal articulation on Ultron's mouth grille when speaking
      float jawZone = exp(-pow((vUv.x - 0.5) * 6.5, 2.0)) * exp(-pow((vUv.y - 0.27) * 9.5, 2.0));
      sampleUv.y += jawZone * (0.0085 * uBass + 0.005 * energy) * uSpeaking;
    }

    vec4 tex = texture2D(uTexture, clamp(sampleUv, 0.001, 0.999));
    vec3 color = tex.rgb;
    float lum = dot(color, vec3(0.299, 0.587, 0.114));

    // Preserve authentic photographic identity while adding live holographic energy response
    float fresnel = pow(1.0 - clamp(dot(normalize(vNormalWorld), normalize(vViewDir)), 0.0, 1.0), 2.4);

    // Subtle holographic optical scanline sweep
    float scanLine = 0.965 + 0.035 * sin(vUv.y * 240.0 - uTime * (6.0 + uThinking * 8.0));
    float sweepBand = exp(-pow((vUv.y - fract(uTime * (0.28 + uThinking * 0.35))) * 14.0, 2.0));

    if (uPersona < 0.5) {
      // J.A.R.V.I.S.: Boost warm golden fiber luminescence as words and bass frequencies flow
      float goldWarmth = max(0.0, color.r - color.b * 0.75);
      float coreGlow = exp(-r * 5.2) * (0.14 + uBass * 0.42 + uEmphasis * 0.25);
      float filamentPulse = goldWarmth * (0.14 + energy * 0.45 + uThinking * 0.18);
      color += uAccentColor * filamentPulse + uSecondaryColor * coreGlow * 0.55;
      color += uAccentColor * sweepBand * (0.05 + uThinking * 0.14) * smoothstep(0.48, 0.12, r);
    } else if (uPersona < 1.5) {
      // SEXTA-FEIRA: Humanoid chrome android with luminous cyan eyes, temple ring & throat core
      float cyanGlow = max(0.0, max(color.b, color.g * 0.95) - color.r * 0.72);
      float eyeLeft = exp(-pow((vUv.x - 0.28) * 14.0, 2.0)) * exp(-pow((vUv.y - 0.70) * 14.0, 2.0));
      float eyeRight = exp(-pow((vUv.x - 0.47) * 14.0, 2.0)) * exp(-pow((vUv.y - 0.74) * 14.0, 2.0));
      float earCore = exp(-pow((vUv.x - 0.69) * 9.5, 2.0)) * exp(-pow((vUv.y - 0.77) * 9.5, 2.0));
      float throatNode = exp(-pow((vUv.x - 0.50) * 11.0, 2.0)) * exp(-pow((vUv.y - 0.39) * 11.0, 2.0));

      float opticPulse = (eyeLeft + eyeRight) * (0.16 + uMid * 0.52 + uHigh * 0.38 + uThinking * 0.30);
      float cyberRingPulse = (earCore * 0.85 + throatNode * 0.7 + cyanGlow * 0.65) * (0.15 + energy * 0.58 + uThinking * 0.25);

      color += vec3(0.22, 0.82, 1.0) * opticPulse + uAccentColor * cyberRingPulse * 0.68;
      color += uSecondaryColor * sweepBand * (0.04 + uThinking * 0.12) * smoothstep(0.48, 0.12, r);
    } else {
      // ULTRON: Authentic dark titanium face with synchronized crimson eyes & glowing vocal mouth vent
      float redness = max(0.0, color.r - max(color.g, color.b) * 0.85);
      float eyeMask = (
        exp(-pow((vUv.x - 0.39) * 11.0, 2.0)) +
        exp(-pow((vUv.x - 0.61) * 11.0, 2.0))
      ) * exp(-pow((vUv.y - 0.56) * 12.0, 2.0));
      float mouthMask = exp(-pow((vUv.x - 0.5) * 6.0, 2.0)) * exp(-pow((vUv.y - 0.27) * 9.0, 2.0));

      float eyeFlare = (eyeMask * 0.65 + redness * 0.55) * (0.18 + energy * 0.62 + uThinking * 0.35);
      float mouthFlare = mouthMask * (0.12 + uBass * 0.85 + energy * 0.72) * (0.35 + uSpeaking * 0.95);

      color += vec3(1.0, 0.16, 0.12) * eyeFlare + vec3(1.0, 0.28, 0.18) * mouthFlare;
      color += uAccentColor * sweepBand * (0.04 + uThinking * 0.12) * smoothstep(0.48, 0.15, r);
    }

    // Subtle holographic rim light & scanline texture
    color += uAccentColor * fresnel * (0.14 + energy * 0.24) * smoothstep(0.50, 0.24, r);
    color *= scanLine;

    // Seamless edge dissolution so the entity floats cleanly in 3D space without square borders
    float edgeSoftness = smoothstep(0.495, 0.34, r);
    float brightFilamentBoost = 0.0;
    if (uPersona < 0.5) {
      // Keep J.A.R.V.I.S.'s outer golden tendrils visible while dissolving dark lab corners
      float goldStrength = clamp((color.r * 0.75 + color.g * 0.45) - color.b * 0.65, 0.0, 1.0);
      brightFilamentBoost = smoothstep(0.18, 0.55, goldStrength) * smoothstep(0.50, 0.41, r);
    } else if (uPersona < 1.5) {
      // Dissolve pure black studio background around SEXTA-FEIRA's android silhouette
      float silhouetteFade = smoothstep(0.50, 0.34, length(vec2(centered.x * 1.02, centered.y * 0.96)));
      float subjectMask = smoothstep(0.035, 0.14, lum);
      edgeSoftness = silhouetteFade * mix(0.22, 1.0, subjectMask);
      brightFilamentBoost = smoothstep(0.16, 0.48, lum) * smoothstep(0.50, 0.42, r);
    } else {
      // Keep Ultron's full metallic head silhouette crisp and centered
      edgeSoftness = smoothstep(0.50, 0.33, length(vec2(centered.x * 1.06, centered.y * 0.96)));
    }

    float alpha = clamp(max(edgeSoftness, brightFilamentBoost), 0.0, 1.0) * uOpacityScale;
    if (alpha < 0.015) discard;

    gl_FragColor = vec4(color, alpha);
  }
`;

function detectSoftwareRenderer(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return false;
    const renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
    return /SwiftShader|llvmpipe|Software|Mesa/i.test(renderer);
  } catch {
    return false;
  }
}

export function Hologram3DStage({
  speaker,
  isSpeaking,
  isThinking,
  audioAmplitude,
  audioBands,
  audioTelemetryRef,
  narrativeEmphasis,
  narrativeProgress,
  compact = false,
}: Hologram3DStageProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [fallback2D, setFallback2D] = useState(false);

  // Live reactive ref read smoothly inside the Three.js render loop without remounting WebGL
  const liveStateRef = useRef({
    speaker,
    isSpeaking,
    isThinking,
    audioAmplitude,
    audioBands: audioBands ?? [],
    audioTelemetryRef,
    narrativeEmphasis,
    narrativeProgress,
  });

  liveStateRef.current = {
    speaker,
    isSpeaking,
    isThinking,
    audioAmplitude,
    audioBands: audioBands ?? [],
    audioTelemetryRef,
    narrativeEmphasis,
    narrativeProgress,
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setFallback2D(true);
      return;
    }

    // Probe WebGL2/WebGL availability and detect software rendering for pacing guard
    const probeCanvas = document.createElement('canvas');
    const probeGl =
      probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!probeGl) {
      setFallback2D(true);
      return;
    }
    const isSoftwareGl = detectSoftwareRenderer(probeGl);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
        premultipliedAlpha: false,
      });
    } catch {
      setFallback2D(true);
      return;
    }

    const width = Math.max(container.clientWidth, compact ? 220 : 320);
    const height = Math.max(container.clientHeight, compact ? 200 : 320);

    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    const canvas = renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    container.innerHTML = '';
    container.appendChild(canvas);

    const scene = new THREE.Scene();

    // Studio metallic reflections for 3D rings — immediately dispose temporary RoomEnvironment & PMREMGenerator
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    const envTexture = envTarget.texture;
    scene.environment = envTexture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, compact ? 0.04 : 0.08, compact ? 7.25 : 6.7);

    // Three-point holographic lighting for the 3D mechanical rings and prisms
    const ambientLight = new THREE.AmbientLight(0xdbeafe, 0.7);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(4.5, 5.5, 6.0);
    scene.add(keyLight);

    const accentPointLight = new THREE.PointLight(0xf59e0b, 3.8, 16, 1.4);
    accentPointLight.position.set(0, 0, 2.8);
    scene.add(accentPointLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.4);
    rimLight.position.set(-4.5, -2.5, -4.0);
    scene.add(rimLight);

    // Lazy VRAM-conscious texture cache (generateMipmaps = false saves ~33% GPU memory per portrait)
    const textureLoader = new THREE.TextureLoader();
    const maxAniso = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
    const loadedTextures = new Map<AssistantId, THREE.Texture>();
    const getSpeakerTexture = (id: AssistantId): THREE.Texture => {
      const cached = loadedTextures.get(id);
      if (cached) return cached;
      const tex = textureLoader.load(ASSISTANT_AVATAR_URLS[id]);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = maxAniso;
      loadedTextures.set(id, tex);
      return tex;
    };

    // Root Hologram Assembly Group
    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    // Inner Portrait Group (subtle conversational nods, turns & lean)
    const portraitGroup = new THREE.Group();
    rootGroup.add(portraitGroup);

    const initialProfile = ASSISTANT_VISUAL_PROFILES[liveStateRef.current.speaker];
    const primaryColor = new THREE.Color(initialProfile.primaryHex);
    const secondaryColor = new THREE.Color(initialProfile.secondaryHex);
    const targetPrimaryColor = new THREE.Color(initialProfile.primaryHex);
    const targetSecondaryColor = new THREE.Color(initialProfile.secondaryHex);

    // 1. Primary 3D Sculpted Holographic Image Mesh (64x64 HW / 36x36 SW cuts vertex shader cost by ~55%)
    const segments = isSoftwareGl ? 36 : 64;
    const portraitGeo = new THREE.PlaneGeometry(3.45, 3.45, segments, segments);
    const initialTex = getSpeakerTexture(liveStateRef.current.speaker);
    const portraitUniforms = {
      uTexture: { value: initialTex },
      uTime: { value: 0 },
      uAudioAmp: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uHigh: { value: 0 },
      uThinking: { value: 0 },
      uSpeaking: { value: 0 },
      uEmphasis: { value: 0 },
      uPersona: { value: initialProfile.personaIndex },
      uAccentColor: { value: primaryColor.clone() },
      uSecondaryColor: { value: secondaryColor.clone() },
      uOpacityScale: { value: 1.0 },
    };

    const portraitMat = new THREE.ShaderMaterial({
      uniforms: portraitUniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const portraitMesh = new THREE.Mesh(portraitGeo, portraitMat);
    portraitGroup.add(portraitMesh);

    // 2. Volumetric Holographic Parallax Echo Layer (placed slightly behind for optical 3D depth)
    const echoUniforms = {
      uTexture: { value: initialTex },
      uTime: { value: 0 },
      uAudioAmp: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uHigh: { value: 0 },
      uThinking: { value: 0 },
      uSpeaking: { value: 0 },
      uEmphasis: { value: 0 },
      uPersona: { value: initialProfile.personaIndex },
      uAccentColor: { value: primaryColor.clone() },
      uSecondaryColor: { value: secondaryColor.clone() },
      uOpacityScale: { value: 0.24 },
    };
    const echoMat = new THREE.ShaderMaterial({
      uniforms: echoUniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const echoMesh = new THREE.Mesh(portraitGeo, echoMat);
    echoMesh.position.z = -0.34;
    echoMesh.scale.setScalar(1.07);
    portraitGroup.add(echoMesh);

    // 3. Outer Precision Metallic Gimbal Ring
    const outerRingGeo = new THREE.TorusGeometry(2.14, 0.017, 16, 128);
    const outerRingMat = new THREE.MeshStandardMaterial({
      color: primaryColor.clone(),
      emissive: primaryColor.clone(),
      emissiveIntensity: 0.9,
      metalness: 0.85,
      roughness: 0.22,
      transparent: true,
      opacity: 0.78,
    });
    const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
    rootGroup.add(outerRing);

    // 4. Dual Counter-Rotating Segmented Telemetry Arcs
    const arcGeoA = new THREE.TorusGeometry(2.36, 0.022, 12, 80, Math.PI * 0.62);
    const arcGeoB = new THREE.TorusGeometry(2.36, 0.022, 12, 80, Math.PI * 0.54);
    const arcMat = new THREE.MeshStandardMaterial({
      color: secondaryColor.clone(),
      emissive: primaryColor.clone(),
      emissiveIntensity: 1.35,
      metalness: 0.78,
      roughness: 0.2,
      transparent: true,
      opacity: 0.84,
    });
    const arcGroup = new THREE.Group();
    const arcMeshA = new THREE.Mesh(arcGeoA, arcMat);
    const arcMeshB = new THREE.Mesh(arcGeoB, arcMat);
    arcMeshB.rotation.z = Math.PI;
    arcGroup.add(arcMeshA, arcMeshB);
    rootGroup.add(arcGroup);

    // 5. Tilted Inner Orbital Gyro Ring
    const innerGyroGeo = new THREE.TorusGeometry(1.94, 0.011, 12, 96);
    const innerGyroMat = new THREE.MeshStandardMaterial({
      color: secondaryColor.clone(),
      emissive: primaryColor.clone(),
      emissiveIntensity: 1.1,
      metalness: 0.9,
      roughness: 0.18,
      transparent: true,
      opacity: 0.62,
    });
    const innerGyro = new THREE.Mesh(innerGyroGeo, innerGyroMat);
    innerGyro.rotation.x = Math.PI * 0.32;
    rootGroup.add(innerGyro);

    // 6. 24-Bar 3D Radial Audio-Spectrum Crown (InstancedMesh)
    const BAR_COUNT = 24;
    const barGeo = new THREE.BoxGeometry(0.036, 0.22, 0.045);
    const barMat = new THREE.MeshStandardMaterial({
      color: secondaryColor.clone(),
      emissive: primaryColor.clone(),
      emissiveIntensity: 1.5,
      metalness: 0.5,
      roughness: 0.25,
      transparent: true,
      opacity: 0.88,
    });
    const spectrumCrown = new THREE.InstancedMesh(barGeo, barMat, BAR_COUNT);
    spectrumCrown.frustumCulled = false;
    rootGroup.add(spectrumCrown);

    // 7. Volumetric Orbiting 3D Neural / Energy Particles (InstancedMesh)
    const PARTICLE_COUNT = isSoftwareGl ? 64 : 130;
    const particleGeo = new THREE.OctahedronGeometry(0.026, 0);
    const particleMat = new THREE.MeshStandardMaterial({
      color: secondaryColor.clone(),
      emissive: primaryColor.clone(),
      emissiveIntensity: 1.85,
      metalness: 0.3,
      roughness: 0.2,
      transparent: true,
      opacity: 0.82,
    });
    const particleMesh = new THREE.InstancedMesh(
      particleGeo,
      particleMat,
      PARTICLE_COUNT
    );
    particleMesh.frustumCulled = false;
    rootGroup.add(particleMesh);

    const particleMeta = Array.from({ length: PARTICLE_COUNT }, (_, idx) => {
      const seed = idx * 1.6180339;
      return {
        radius: 1.85 + ((idx * 37) % 100) / 100 * 1.25,
        angle: (idx / PARTICLE_COUNT) * Math.PI * 2,
        speed: (0.24 + ((idx * 17) % 100) / 100 * 0.55) * (idx % 2 === 0 ? 1 : -1),
        tiltX: Math.sin(seed) * 0.95,
        tiltY: Math.cos(seed * 1.3) * 0.95,
        zOffset: (Math.sin(seed * 2.7) * 0.65),
        scale: 0.55 + ((idx * 29) % 100) / 100 * 0.95,
      };
    });

    // 8. Grounding Holographic Projection Base Pedestal Ring & Soft Energy Beam
    const baseGroup = new THREE.Group();
    baseGroup.position.set(0, -2.28, 0);
    const baseOuterGeo = new THREE.RingGeometry(1.05, 1.52, 64);
    const baseOuterMat = new THREE.MeshBasicMaterial({
      color: primaryColor.clone(),
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const baseOuter = new THREE.Mesh(baseOuterGeo, baseOuterMat);
    baseOuter.rotation.x = -Math.PI / 2;
    baseGroup.add(baseOuter);

    const baseInnerGeo = new THREE.RingGeometry(0.32, 0.72, 48);
    const baseInnerMat = new THREE.MeshBasicMaterial({
      color: secondaryColor.clone(),
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const baseInner = new THREE.Mesh(baseInnerGeo, baseInnerMat);
    baseInner.rotation.x = -Math.PI / 2;
    baseInner.position.y = 0.02;
    baseGroup.add(baseInner);

    const beamGeo = new THREE.CylinderGeometry(1.75, 0.78, 2.25, 48, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: primaryColor.clone(),
      transparent: true,
      opacity: 0.07,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    beamMesh.position.y = 1.12;
    baseGroup.add(beamMesh);
    rootGroup.add(baseGroup);

    // Pre-allocated math objects (zero GC churn inside requestAnimationFrame)
    const dummyObj = new THREE.Object3D();
    const pointerTarget = { x: 0, y: 0 };
    const pointerCurrent = { x: 0, y: 0 };
    const smoothed = {
      amp: 0,
      bass: 0,
      mid: 0,
      high: 0,
      thinking: 0,
      speaking: 0,
      emphasis: 0,
      rotX: 0,
      rotY: 0,
      rotZ: 0,
      posY: 0,
      posZ: 0,
    };

    const handlePointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      pointerTarget.x = Math.max(-1, Math.min(1, nx));
      pointerTarget.y = Math.max(-1, Math.min(1, ny));
    };

    const handlePointerLeave = () => {
      pointerTarget.x = 0;
      pointerTarget.y = 0;
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    container.addEventListener('pointerleave', handlePointerLeave);

    // ResizeObserver for crisp layout adaptation
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const minW = compact ? 200 : 300;
      const minH = compact ? 180 : 300;
      const nextW = Math.max(Math.floor(entry.contentRect.width), minW);
      const nextH = Math.max(Math.floor(entry.contentRect.height), minH);
      camera.aspect = nextW / nextH;
      if (compact) {
        const aspect = nextW / nextH;
        camera.position.z = aspect < 1 ? 8.2 : aspect < 1.35 ? 7.35 : 6.9;
      } else {
        // Pull camera slightly back on narrow mobile portrait viewports so full rings stay visible
        camera.position.z = nextW < 520 ? 8.1 : nextW < 768 ? 7.35 : 6.55;
      }
      camera.updateProjectionMatrix();
      renderer.setSize(nextW, nextH, false);
    });
    resizeObserver.observe(container);

    // WebGL context loss resilience
    let contextLost = false;
    const onContextLost = (e: Event) => {
      e.preventDefault();
      contextLost = true;
    };
    const onContextRestored = () => {
      contextLost = false;
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    let rafId = 0;
    let disposed = false;
    let isPageHidden = typeof document !== 'undefined' && document.hidden;
    let lastTime = performance.now();
    let elapsed = 0;
    let activeSpeaker: AssistantId = liveStateRef.current.speaker;
    const minFrameMs = isSoftwareGl ? 32 : 0;

    const onVisibilityChange = () => {
      isPageHidden = document.hidden;
      if (!isPageHidden) {
        lastTime = performance.now();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const afterDraw = () => {
      if (!isSoftwareGl) return;
      const gl = renderer.getContext();
      if (gl instanceof WebGL2RenderingContext) {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (sync) {
          gl.flush();
          gl.deleteSync(sync);
        }
      }
    };

    const tick = (now: number) => {
      if (disposed) return;
      rafId = window.requestAnimationFrame(tick);
      if (contextLost || isPageHidden) return;
      if (minFrameMs > 0 && now - lastTime < minFrameMs) return;

      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      elapsed += dt;

      const state = liveStateRef.current;

      // Instant speaker texture & color profile transition (lazy-cached in VRAM)
      if (state.speaker !== activeSpeaker) {
        activeSpeaker = state.speaker;
        const nextProfile = ASSISTANT_VISUAL_PROFILES[activeSpeaker];
        const nextTex = getSpeakerTexture(activeSpeaker);
        portraitUniforms.uTexture.value = nextTex;
        echoUniforms.uTexture.value = nextTex;
        portraitUniforms.uPersona.value = nextProfile.personaIndex;
        echoUniforms.uPersona.value = nextProfile.personaIndex;
        targetPrimaryColor.set(nextProfile.primaryHex);
        targetSecondaryColor.set(nextProfile.secondaryHex);
      }

      // Direct zero-allocation 60fps Float32Array FFT telemetry read (decoupled from React re-renders)
      const directTelemetry = state.audioTelemetryRef?.current;
      const bands: ArrayLike<number> =
        directTelemetry && directTelemetry.active ? directTelemetry.bands : state.audioBands;
      const liveAmplitude =
        directTelemetry && directTelemetry.active
          ? directTelemetry.amplitude
          : state.audioAmplitude;

      let rawBass = 0;
      let rawMid = 0;
      let rawHigh = 0;
      if (bands && bands.length >= 18 && state.isSpeaking) {
        for (let i = 0; i < 6; i++) rawBass += bands[i] || 0;
        for (let i = 6; i < 14; i++) rawMid += bands[i] || 0;
        for (let i = 14; i < Math.min(24, bands.length); i++) rawHigh += bands[i] || 0;
        rawBass /= 6;
        rawMid /= 8;
        rawHigh /= Math.max(1, Math.min(24, bands.length) - 14);
      } else if (state.isSpeaking) {
        rawBass = Math.max(0.12, liveAmplitude * 0.95);
        rawMid = Math.max(0.1, liveAmplitude * 0.85);
        rawHigh = Math.max(0.08, liveAmplitude * 0.7);
      } else if (state.isThinking) {
        rawBass = 0.2 + Math.sin(elapsed * 5.2) * 0.1;
        rawMid = 0.24 + Math.cos(elapsed * 6.8) * 0.12;
        rawHigh = 0.18 + Math.sin(elapsed * 8.1) * 0.08;
      }

      const rawAmp = state.isSpeaking
        ? Math.max(liveAmplitude, (rawBass + rawMid) * 0.5)
        : state.isThinking
        ? 0.22 + Math.sin(elapsed * 4.2) * 0.08
        : 0.04;

      // Smooth all reactive parameters with frame-rate-independent damping
      smoothed.amp = THREE.MathUtils.damp(smoothed.amp, rawAmp, 12, dt);
      smoothed.bass = THREE.MathUtils.damp(smoothed.bass, rawBass, 14, dt);
      smoothed.mid = THREE.MathUtils.damp(smoothed.mid, rawMid, 14, dt);
      smoothed.high = THREE.MathUtils.damp(smoothed.high, rawHigh, 14, dt);
      smoothed.thinking = THREE.MathUtils.damp(
        smoothed.thinking,
        state.isThinking ? 1 : 0,
        6,
        dt
      );
      smoothed.speaking = THREE.MathUtils.damp(
        smoothed.speaking,
        state.isSpeaking ? 1 : 0,
        8,
        dt
      );
      smoothed.emphasis = THREE.MathUtils.damp(
        smoothed.emphasis,
        state.narrativeEmphasis,
        9,
        dt
      );

      // Smooth color transition
      primaryColor.lerp(targetPrimaryColor, Math.min(1, dt * 6));
      secondaryColor.lerp(targetSecondaryColor, Math.min(1, dt * 6));

      accentPointLight.color.copy(primaryColor);
      accentPointLight.intensity = 3.2 + smoothed.amp * 3.8 + smoothed.emphasis * 2.0;
      outerRingMat.color.copy(primaryColor);
      outerRingMat.emissive.copy(primaryColor);
      arcMat.color.copy(secondaryColor);
      arcMat.emissive.copy(primaryColor);
      innerGyroMat.color.copy(secondaryColor);
      innerGyroMat.emissive.copy(primaryColor);
      barMat.color.copy(secondaryColor);
      barMat.emissive.copy(primaryColor);
      particleMat.color.copy(secondaryColor);
      particleMat.emissive.copy(primaryColor);
      baseOuterMat.color.copy(primaryColor);
      baseInnerMat.color.copy(secondaryColor);
      beamMat.color.copy(primaryColor);
      beamMat.opacity = 0.055 + smoothed.amp * 0.08 + smoothed.thinking * 0.04;

      // Update shader uniforms
      portraitUniforms.uTime.value = elapsed;
      portraitUniforms.uAudioAmp.value = smoothed.amp;
      portraitUniforms.uBass.value = smoothed.bass;
      portraitUniforms.uMid.value = smoothed.mid;
      portraitUniforms.uHigh.value = smoothed.high;
      portraitUniforms.uThinking.value = smoothed.thinking;
      portraitUniforms.uSpeaking.value = smoothed.speaking;
      portraitUniforms.uEmphasis.value = smoothed.emphasis;
      portraitUniforms.uAccentColor.value.copy(primaryColor);
      portraitUniforms.uSecondaryColor.value.copy(secondaryColor);

      echoUniforms.uTime.value = elapsed + 0.25;
      echoUniforms.uAudioAmp.value = smoothed.amp * 1.15;
      echoUniforms.uBass.value = smoothed.bass;
      echoUniforms.uMid.value = smoothed.mid;
      echoUniforms.uHigh.value = smoothed.high;
      echoUniforms.uThinking.value = smoothed.thinking;
      echoUniforms.uSpeaking.value = smoothed.speaking;
      echoUniforms.uEmphasis.value = smoothed.emphasis;
      echoUniforms.uAccentColor.value.copy(primaryColor);
      echoUniforms.uSecondaryColor.value.copy(secondaryColor);
      echoUniforms.uOpacityScale.value = 0.18 + smoothed.amp * 0.22 + smoothed.emphasis * 0.14;

      // Living conversational head/entity choreography synced to narrative + pointer parallax
      pointerCurrent.x = THREE.MathUtils.damp(pointerCurrent.x, pointerTarget.x, 4.5, dt);
      pointerCurrent.y = THREE.MathUtils.damp(pointerCurrent.y, pointerTarget.y, 4.5, dt);

      const narrativeWave = Math.sin(state.narrativeProgress * Math.PI * 6.0 + elapsed * 1.4);
      const conversationalNod =
        smoothed.speaking *
        (Math.sin(elapsed * 3.1) * 0.045 + smoothed.bass * 0.075 + smoothed.emphasis * 0.08);
      const conversationalTurn =
        smoothed.speaking *
          (Math.sin(elapsed * 1.15) * 0.14 + narrativeWave * 0.06) +
        smoothed.thinking * Math.sin(elapsed * 2.2) * 0.18;

      const personaTiltBias = activeSpeaker === 'ultron' ? 0.05 : activeSpeaker === 'sexta-feira' ? -0.02 : 0.0;
      const targetRotY = pointerCurrent.x * 0.24 + conversationalTurn;
      const targetRotX = -pointerCurrent.y * 0.16 + conversationalNod + personaTiltBias;
      const targetRotZ =
        smoothed.speaking * Math.sin(elapsed * 1.65) * 0.032 -
        pointerCurrent.x * 0.03;

      const targetPosY =
        Math.sin(elapsed * (1.55 + smoothed.thinking * 0.7)) * 0.09 +
        smoothed.emphasis * 0.06;
      // Gently leans forward toward the user when speaking emphatically!
      const targetPosZ =
        smoothed.speaking * (0.22 + smoothed.bass * 0.24 + smoothed.emphasis * 0.2) +
        smoothed.thinking * 0.08;

      smoothed.rotX = THREE.MathUtils.damp(smoothed.rotX, targetRotX, 5.5, dt);
      smoothed.rotY = THREE.MathUtils.damp(smoothed.rotY, targetRotY, 5.5, dt);
      smoothed.rotZ = THREE.MathUtils.damp(smoothed.rotZ, targetRotZ, 5.5, dt);
      smoothed.posY = THREE.MathUtils.damp(smoothed.posY, targetPosY, 6, dt);
      smoothed.posZ = THREE.MathUtils.damp(smoothed.posZ, targetPosZ, 6, dt);

      portraitGroup.rotation.set(smoothed.rotX, smoothed.rotY, smoothed.rotZ);
      portraitGroup.position.set(0, smoothed.posY, smoothed.posZ);

      // Subtle holographic depth echo drift
      echoMesh.position.x = -smoothed.rotY * 0.24;
      echoMesh.position.y = smoothed.rotX * 0.2;
      echoMesh.position.z = -0.32 - smoothed.amp * 0.18;

      // Gyroscopic 3D rings choreography
      const ringSpeed = 0.35 + smoothed.thinking * 1.25 + smoothed.amp * 0.9;
      outerRing.rotation.z += dt * 0.22 * ringSpeed;
      outerRing.rotation.x = Math.sin(elapsed * 0.65) * 0.26 + pointerCurrent.y * 0.18;
      outerRing.rotation.y = Math.cos(elapsed * 0.52) * 0.22 + pointerCurrent.x * 0.2;
      outerRing.scale.setScalar(1.0 + smoothed.amp * 0.05 + smoothed.emphasis * 0.04);

      arcGroup.rotation.z -= dt * 0.45 * ringSpeed;
      arcGroup.rotation.x = Math.cos(elapsed * 0.8) * 0.35 - pointerCurrent.y * 0.15;
      arcGroup.rotation.y = Math.sin(elapsed * 0.7) * 0.35 + pointerCurrent.x * 0.22;

      innerGyro.rotation.z += dt * 0.6 * ringSpeed;
      innerGyro.rotation.x = Math.PI * 0.34 + Math.sin(elapsed * 1.1) * 0.22;
      innerGyro.rotation.y += dt * 0.38 * ringSpeed;

      baseOuter.rotation.z += dt * 0.4 * ringSpeed;
      baseInner.rotation.z -= dt * 0.65 * ringSpeed;

      // Update 24-Bar 3D Radial Audio-Spectrum Crown
      const crownRadius = 2.04;
      for (let i = 0; i < BAR_COUNT; i++) {
        const angle = (i / BAR_COUNT) * Math.PI * 2 + elapsed * 0.16;
        const rawBand =
          bands && bands.length > i && state.isSpeaking
            ? bands[i]
            : state.isThinking
            ? 0.2 + Math.abs(Math.sin(elapsed * 5.4 + i * 0.55)) * 0.38
            : 0.06 + Math.abs(Math.sin(elapsed * 2.0 + i * 0.4)) * 0.08;
        const barScaleY = 0.35 + rawBand * 2.55 + smoothed.emphasis * 0.55;
        const rOut = crownRadius + (barScaleY - 0.35) * 0.08;

        dummyObj.position.set(
          Math.cos(angle) * rOut,
          Math.sin(angle) * rOut + smoothed.posY * 0.5,
          Math.sin(angle * 2.0 + elapsed) * 0.18
        );
        dummyObj.rotation.set(0, 0, angle - Math.PI / 2);
        dummyObj.scale.set(1, barScaleY, 1);
        dummyObj.updateMatrix();
        spectrumCrown.setMatrixAt(i, dummyObj.matrix);
      }
      spectrumCrown.instanceMatrix.needsUpdate = true;

      // Update Orbiting 3D Neural Particles
      const orbitBoost = 1.0 + smoothed.thinking * 1.85 + smoothed.amp * 1.15;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const meta = particleMeta[i];
        const a = meta.angle + elapsed * meta.speed * orbitBoost;
        const rad = meta.radius + smoothed.amp * 0.24 + Math.sin(elapsed * 2.2 + i) * 0.08;
        const px = Math.cos(a) * rad;
        const py = Math.sin(a) * rad * Math.cos(meta.tiltX);
        const pz = Math.sin(a) * rad * Math.sin(meta.tiltY) + meta.zOffset;

        dummyObj.position.set(px, py + smoothed.posY * 0.4, pz);
        dummyObj.rotation.set(elapsed + i, elapsed * 0.8 + i, 0);
        const pScale = meta.scale * (0.75 + smoothed.amp * 0.75 + smoothed.emphasis * 0.35);
        dummyObj.scale.setScalar(pScale);
        dummyObj.updateMatrix();
        particleMesh.setMatrixAt(i, dummyObj.matrix);
      }
      particleMesh.instanceMatrix.needsUpdate = true;

      renderer.render(scene, camera);
      afterDraw();
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerleave', handlePointerLeave);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      resizeObserver.disconnect();

      portraitGeo.dispose();
      portraitMat.dispose();
      echoMat.dispose();
      outerRingGeo.dispose();
      outerRingMat.dispose();
      arcGeoA.dispose();
      arcGeoB.dispose();
      arcMat.dispose();
      innerGyroGeo.dispose();
      innerGyroMat.dispose();
      barGeo.dispose();
      barMat.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      baseOuterGeo.dispose();
      baseOuterMat.dispose();
      baseInnerGeo.dispose();
      baseInnerMat.dispose();
      beamGeo.dispose();
      beamMat.dispose();
      loadedTextures.forEach((tex) => tex.dispose());
      loadedTextures.clear();
      envTarget.dispose();
      envTexture.dispose();
      renderer.dispose();
    };
  }, []);

  if (fallback2D) {
    const profile = ASSISTANT_VISUAL_PROFILES[speaker];
    const scale = 1 + audioAmplitude * 0.08 + narrativeEmphasis * 0.05;
    return (
      <div className="relative w-full h-full flex items-center justify-center">
        <div
          className={`relative ${
            compact ? 'w-40 h-40 sm:w-48 sm:h-48' : 'w-72 h-72 sm:w-96 sm:h-96'
          } rounded-full overflow-hidden border-2 ${profile.borderClass} transition-transform duration-150`}
          style={{
            transform: `scale(${scale.toFixed(3)})`,
            boxShadow: `0 0 65px ${profile.primaryHex}55`,
          }}
        >
          <img
            src={ASSISTANT_AVATAR_URLS[speaker]}
            alt={profile.name}
            className="w-full h-full object-cover"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={mountRef}
      className="relative w-full h-full select-none touch-none"
      aria-label={`Projeção holográfica 3D de ${ASSISTANT_VISUAL_PROFILES[speaker].name}`}
    />
  );
}

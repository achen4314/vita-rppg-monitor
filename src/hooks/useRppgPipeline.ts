import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserFaceDetector, type FaceDetection } from "../lib/faceDetector";
import { type SpectrumBin } from "../lib/fft";
import { analyzeRppgWindow } from "../lib/pos";
import {
  assessGuidance,
  averageRgbFromRois,
  backgroundRoi,
  DEFAULT_GUIDANCE,
  deriveFaceRois,
  drawRoiOverlay,
  type FaceRois,
  type Guidance,
} from "../lib/roi";
import { ButterworthBandpass, clamp, type RgbSample } from "../lib/signal";

export type PipelineStatus =
  | "IDLE"
  | "LOADING"
  | "CAMERA"
  | "CALIBRATING"
  | "DETECTING"
  | "NO_FACE"
  | "LOW_SIGNAL"
  | "ERROR";

export type PipelineMode = "idle" | "camera" | "demo";

export interface HistoryPoint {
  t: number;
  bpm: number;
  confidence: number;
}

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export interface PipelineState {
  mode: PipelineMode;
  status: PipelineStatus;
  running: boolean;
  bpm: number | null;
  rawBpm: number | null;
  confidence: number;
  snrDb: number;
  peakEnergyRatio: number;
  elapsedSeconds: number;
  calibrationRemaining: number;
  signalQuality: number;
  pulseWave: number[];
  skinSpectrum: SpectrumBin[];
  backgroundSpectrum: SpectrumBin[];
  skinPeakBpm: number | null;
  backgroundPeakBpm: number | null;
  history: HistoryPoint[];
  guidance: Guidance;
  fps: number;
  faceScore: number | null;
  devices: CameraDevice[];
  selectedDeviceId: string;
  permissionState: PermissionState | "unknown";
  secureContext: boolean;
  mediaDevicesSupported: boolean;
  error: string | null;
}

const MAX_BUFFER_MS = 22_000;
const ANALYSIS_WINDOW_MS = 16_000;
const CALIBRATION_MS = 5_000;
const DETECT_INTERVAL_MS = 150;
const ANALYSIS_INTERVAL_MS = 320;
const WAVE_UI_INTERVAL_MS = 90;
const HISTORY_INTERVAL_MS = 1_000;
const DEMO_BPM = 72;
const DEMO_WIDTH = 1280;
const DEMO_HEIGHT = 720;

const INITIAL_STATE: PipelineState = {
  mode: "idle",
  status: "IDLE",
  running: false,
  bpm: null,
  rawBpm: null,
  confidence: 0,
  snrDb: 0,
  peakEnergyRatio: 0,
  elapsedSeconds: 0,
  calibrationRemaining: CALIBRATION_MS / 1000,
  signalQuality: 0,
  pulseWave: [],
  skinSpectrum: [],
  backgroundSpectrum: [],
  skinPeakBpm: null,
  backgroundPeakBpm: null,
  history: [],
  guidance: DEFAULT_GUIDANCE,
  fps: 0,
  faceScore: null,
  devices: [],
  selectedDeviceId: "",
  permissionState: "unknown",
  secureContext: typeof window !== "undefined" ? window.isSecureContext : false,
  mediaDevicesSupported: typeof navigator !== "undefined" ? Boolean(navigator.mediaDevices?.getUserMedia) : false,
  error: null,
};

const REQUEST_FALLBACKS: MediaStreamConstraints[] = [
  {
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 60 },
      facingMode: { ideal: "user" },
    },
    audio: false,
  },
  {
    video: {
      width: { ideal: 960 },
      height: { ideal: 540 },
      frameRate: { ideal: 30 },
    },
    audio: false,
  },
  {
    video: true,
    audio: false,
  },
];

function trimSamples(samples: RgbSample[], now: number): void {
  const cutoff = now - MAX_BUFFER_MS;
  const firstValid = samples.findIndex((sample) => sample.t >= cutoff);
  if (firstValid > 0) samples.splice(0, firstValid);
}

function recentSamples(samples: readonly RgbSample[], now: number): RgbSample[] {
  const cutoff = now - ANALYSIS_WINDOW_MS;
  return samples.filter((sample) => sample.t >= cutoff);
}

function durationSeconds(samples: readonly RgbSample[]): number {
  if (samples.length < 2) return 0;
  return (samples[samples.length - 1].t - samples[0].t) / 1000;
}

function updateCanvasSize(canvas: HTMLCanvasElement, width: number, height: number): void {
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

function normalizeWave(values: readonly number[]): number[] {
  if (values.length === 0) return [];
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const centered = values.map((value) => value - mean);
  const maxAbs = centered.reduce((max, value) => Math.max(max, Math.abs(value)), 1e-6);
  return centered.map((value) => clamp(value / maxAbs, -1, 1));
}

function syntheticRgbSample(now: number, startTime: number, bpm = DEMO_BPM): {
  skin: RgbSample;
  background: RgbSample;
} {
  const elapsedSeconds = Math.max(0, (now - startTime) / 1000);
  const pulse = Math.sin(2 * Math.PI * (bpm / 60) * elapsedSeconds);
  const harmonic = 0.32 * Math.sin(4 * Math.PI * (bpm / 60) * elapsedSeconds + 0.45);
  const drift = 0.012 * Math.sin(2 * Math.PI * 0.08 * elapsedSeconds);
  const shimmer = 0.004 * Math.sin(2 * Math.PI * 8.7 * elapsedSeconds);
  const wave = pulse + harmonic;
  const skinR = 156 * (1 + drift - 0.0024 * wave + shimmer);
  const skinG = 111 * (1 + drift + 0.0062 * wave - shimmer * 0.4);
  const skinB = 96 * (1 + drift - 0.0038 * wave + shimmer * 0.2);
  const backgroundR = 20 * (1 + 0.003 * Math.sin(2 * Math.PI * 0.17 * elapsedSeconds));
  const backgroundG = 27 * (1 + 0.003 * Math.sin(2 * Math.PI * 0.11 * elapsedSeconds));
  const backgroundB = 35 * (1 + 0.003 * Math.sin(2 * Math.PI * 0.14 * elapsedSeconds));

  return {
    skin: {
      t: now,
      r: skinR,
      g: skinG,
      b: skinB,
      luminance: 0.2126 * skinR + 0.7152 * skinG + 0.0722 * skinB,
    },
    background: {
      t: now,
      r: backgroundR,
      g: backgroundG,
      b: backgroundB,
      luminance: 0.2126 * backgroundR + 0.7152 * backgroundG + 0.0722 * backgroundB,
    },
  };
}

function drawDemoFrame(canvas: HTMLCanvasElement, now: number, startTime: number): FaceRois {
  if (canvas.width !== DEMO_WIDTH) canvas.width = DEMO_WIDTH;
  if (canvas.height !== DEMO_HEIGHT) canvas.height = DEMO_HEIGHT;

  const face = { x: 430, y: 110, width: 420, height: 480 };
  const context = canvas.getContext("2d");
  if (!context) return deriveFaceRois(face, DEMO_WIDTH, DEMO_HEIGHT);

  const elapsedSeconds = Math.max(0, (now - startTime) / 1000);
  const pulse = Math.sin(2 * Math.PI * (DEMO_BPM / 60) * elapsedSeconds);
  const glow = 8 + pulse * 4;

  context.fillStyle = "#03070d";
  context.fillRect(0, 0, DEMO_WIDTH, DEMO_HEIGHT);

  context.strokeStyle = "rgba(52, 231, 255, 0.08)";
  context.lineWidth = 1;
  for (let x = 0; x < DEMO_WIDTH; x += 48) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, DEMO_HEIGHT);
    context.stroke();
  }
  for (let y = 0; y < DEMO_HEIGHT; y += 48) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(DEMO_WIDTH, y);
    context.stroke();
  }

  context.save();
  context.translate(DEMO_WIDTH / 2, DEMO_HEIGHT / 2 + 10);
  context.fillStyle = `rgb(${158 + glow}, ${112 + glow * 0.6}, ${98 + glow * 0.35})`;
  context.beginPath();
  context.ellipse(0, -20, 168, 220, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "rgba(255, 94, 112, 0.18)";
  context.beginPath();
  context.ellipse(-76, 48, 44 + pulse * 2, 24 + pulse, 0, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.ellipse(76, 48, 44 + pulse * 2, 24 + pulse, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#10151c";
  context.beginPath();
  context.ellipse(-58, -58, 15, 10, 0, 0, Math.PI * 2);
  context.ellipse(58, -58, 15, 10, 0, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = "rgba(14, 18, 24, 0.72)";
  context.lineWidth = 7;
  context.beginPath();
  context.arc(0, 32, 46, 0.18 * Math.PI, 0.82 * Math.PI);
  context.stroke();
  context.restore();

  context.fillStyle = "rgba(255, 211, 106, 0.08)";
  context.fillRect(DEMO_WIDTH - 245, 70, 190, 118);

  return deriveFaceRois(face, DEMO_WIDTH, DEMO_HEIGHT);
}

function cameraErrorMessage(error: unknown): string {
  if (!(error instanceof DOMException) && !(error instanceof Error)) {
    return "摄像头初始化失败。";
  }

  const name = "name" in error ? error.name : "";
  const message = error.message || "";

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "摄像头权限被拒绝。请在浏览器地址栏权限设置中允许此本地页面使用摄像头。";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "未找到可用摄像头。请确认摄像头已连接，或在摄像头列表中选择另一个设备后重试。";
    case "NotReadableError":
    case "TrackStartError":
      return "摄像头正被其他程序占用，请关闭占用摄像头的软件后重试。";
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "当前摄像头不支持请求的参数，已尝试宽松参数但仍未成功。";
    default:
      return message || "摄像头初始化失败。";
  }
}

function blockedCameraMessage(): string {
  return "浏览器已阻止此本地页面使用摄像头。请在地址栏左侧的权限设置中把摄像头改为允许，然后刷新页面重试。";
}

async function queryCameraPermission(): Promise<PermissionState | "unknown"> {
  try {
    if (!navigator.permissions?.query) return "unknown";
    const result = await navigator.permissions.query({ name: "camera" as PermissionName });
    return result.state;
  } catch {
    return "unknown";
  }
}

async function requestCameraStream(selectedDeviceId: string): Promise<MediaStream> {
  const basicRequest: MediaStreamConstraints = {
    video: true,
    audio: false,
  };
  const selectedDeviceRequest: MediaStreamConstraints | null = selectedDeviceId
    ? {
        video: {
          deviceId: { exact: selectedDeviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 60 },
        },
        audio: false,
      }
    : null;
  const constraints: MediaStreamConstraints[] = [
    basicRequest,
    ...(selectedDeviceRequest ? [selectedDeviceRequest] : []),
    ...REQUEST_FALLBACKS,
  ];

  let lastError: unknown = null;
  for (const constraint of constraints) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraint);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

function statusForFrame(
  face: FaceDetection | null,
  elapsedMs: number,
  enoughWindow: boolean,
  confidence: number,
): PipelineStatus {
  if (!face) return "NO_FACE";
  if (elapsedMs < CALIBRATION_MS) return "CALIBRATING";
  if (!enoughWindow) return "DETECTING";
  if (confidence < 0.34) return "LOW_SIGNAL";
  return "DETECTING";
}

export function useRppgPipeline() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const samplingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const demoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectorRef = useRef<BrowserFaceDetector | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const startingRef = useRef(false);
  const lastDetectRef = useRef(0);
  const lastAnalysisRef = useRef(0);
  const lastWaveUiRef = useRef(0);
  const lastHistoryRef = useRef(0);
  const currentFaceRef = useRef<FaceDetection | null>(null);
  const skinSamplesRef = useRef<RgbSample[]>([]);
  const backgroundSamplesRef = useRef<RgbSample[]>([]);
  const waveValuesRef = useRef<number[]>([]);
  const greenDcRef = useRef<number | null>(null);
  const bpmEmaRef = useRef<number | null>(null);
  const frameTimesRef = useRef<number[]>([]);
  const startTimeRef = useRef(0);
  const lastDemoSampleRef = useRef(0);
  const selectedDeviceIdRef = useRef("");
  const waveFilterRef = useRef(new ButterworthBandpass({ sampleRate: 30, lowHz: 0.75, highHz: 4 }));
  const [state, setState] = useState<PipelineState>(INITIAL_STATE);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setState((previous) => ({
        ...previous,
        devices: [],
        permissionState: "unknown",
        secureContext: window.isSecureContext,
        mediaDevicesSupported: false,
      }));
      return [];
    }

    const [devices, permissionState] = await Promise.all([
      navigator.mediaDevices.enumerateDevices(),
      queryCameraPermission(),
    ]);

    const cameras = devices
      .filter((device) => device.kind === "videoinput")
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `摄像头 ${index + 1}`,
      }));

    setState((previous) => {
      const stillAvailable = cameras.some((device) => device.deviceId === previous.selectedDeviceId);
      const selectedDeviceId = stillAvailable ? previous.selectedDeviceId : cameras[0]?.deviceId ?? "";
      selectedDeviceIdRef.current = selectedDeviceId;

      return {
        ...previous,
        devices: cameras,
        selectedDeviceId,
        permissionState,
        secureContext: window.isSecureContext,
        mediaDevicesSupported: Boolean(navigator.mediaDevices?.getUserMedia),
      };
    });

    return cameras;
  }, []);

  const setSelectedDeviceId = useCallback((deviceId: string) => {
    selectedDeviceIdRef.current = deviceId;
    setState((previous) => ({
      ...previous,
      selectedDeviceId: deviceId,
    }));
  }, []);

  const resetMeasurement = useCallback(() => {
    skinSamplesRef.current = [];
    backgroundSamplesRef.current = [];
    waveValuesRef.current = [];
    greenDcRef.current = null;
    bpmEmaRef.current = null;
    frameTimesRef.current = [];
    currentFaceRef.current = null;
    lastDetectRef.current = 0;
    lastAnalysisRef.current = 0;
    lastWaveUiRef.current = 0;
    lastHistoryRef.current = 0;
    lastDemoSampleRef.current = 0;
    waveFilterRef.current = new ButterworthBandpass({ sampleRate: 30, lowHz: 0.75, highHz: 4 });
  }, []);

  const processFrame = useCallback((now: number) => {
    if (!runningRef.current) return;

    const video = videoRef.current;
    const overlay = overlayRef.current;
    const detector = detectorRef.current;

    if (!video || !overlay || !detector || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      animationRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    if (!videoWidth || !videoHeight) {
      animationRef.current = requestAnimationFrame(processFrame);
      return;
    }

    if (!samplingCanvasRef.current) {
      samplingCanvasRef.current = document.createElement("canvas");
    }

    const samplingCanvas = samplingCanvasRef.current;
    updateCanvasSize(samplingCanvas, videoWidth, videoHeight);
    const samplingContext = samplingCanvas.getContext("2d", { willReadFrequently: true });

    if (!samplingContext) {
      animationRef.current = requestAnimationFrame(processFrame);
      return;
    }

    samplingContext.drawImage(video, 0, 0, videoWidth, videoHeight);

    if (now - lastDetectRef.current >= DETECT_INTERVAL_MS) {
      try {
        currentFaceRef.current = detector.detect(video, now);
      } catch (error) {
        console.error(error);
        currentFaceRef.current = null;
      }
      lastDetectRef.current = now;
    }

    const face = currentFaceRef.current;
    const rois: FaceRois | null = face ? deriveFaceRois(face.box, videoWidth, videoHeight) : null;
    drawRoiOverlay(overlay, rois, videoWidth, videoHeight);

    const timestamp = now;
    const backgroundSample = averageRgbFromRois(
      samplingContext,
      [rois?.background ?? backgroundRoi(videoWidth, videoHeight)],
      timestamp,
    );

    if (backgroundSample) {
      backgroundSamplesRef.current.push(backgroundSample);
      trimSamples(backgroundSamplesRef.current, now);
    }

    const skinSample = rois
      ? averageRgbFromRois(samplingContext, [rois.forehead, rois.leftCheek, rois.rightCheek], timestamp)
      : null;

    if (skinSample) {
      skinSamplesRef.current.push(skinSample);
      trimSamples(skinSamplesRef.current, now);

      const previousDc = greenDcRef.current ?? skinSample.g;
      const dc = previousDc * 0.985 + skinSample.g * 0.015;
      greenDcRef.current = dc;
      const acGreen = (skinSample.g - dc) / Math.max(1, dc);
      const filteredWave = waveFilterRef.current.process(acGreen);
      waveValuesRef.current.push(filteredWave);
      if (waveValuesRef.current.length > 260) {
        waveValuesRef.current.splice(0, waveValuesRef.current.length - 260);
      }
    }

    frameTimesRef.current.push(now);
    frameTimesRef.current = frameTimesRef.current.filter((time) => now - time <= 1000);

    const elapsedMs = now - startTimeRef.current;
    const elapsedSeconds = elapsedMs / 1000;
    const calibrationRemaining = Math.max(0, (CALIBRATION_MS - elapsedMs) / 1000);
    const guidance = assessGuidance(face?.box ?? null, videoWidth, videoHeight, skinSample?.luminance ?? null);
    const faceScore = face?.score ?? null;
    const shouldAnalyze = now - lastAnalysisRef.current >= ANALYSIS_INTERVAL_MS;
    const shouldUpdateWave = now - lastWaveUiRef.current >= WAVE_UI_INTERVAL_MS;

    if (shouldAnalyze) {
      lastAnalysisRef.current = now;
      const skinWindow = recentSamples(skinSamplesRef.current, now);
      const backgroundWindow = recentSamples(backgroundSamplesRef.current, now);
      const enoughWindow = skinWindow.length >= 100 && durationSeconds(skinWindow) >= 4.8;

      let rawBpm: number | null = null;
      let visibleBpm: number | null = null;
      let confidence = 0;
      let snrDb = 0;
      let peakEnergyRatio = 0;
      let skinSpectrum: SpectrumBin[] = [];
      let backgroundSpectrum: SpectrumBin[] = [];
      let skinPeakBpm: number | null = null;
      let backgroundPeakBpm: number | null = null;
      let historyPoint: HistoryPoint | null = null;

      if (enoughWindow) {
        const skinAnalysis = analyzeRppgWindow(skinWindow);
        const backgroundAnalysis = backgroundWindow.length >= 100 ? analyzeRppgWindow(backgroundWindow) : null;

        rawBpm = skinAnalysis.bpm;
        confidence = skinAnalysis.snr.confidence;
        snrDb = skinAnalysis.snr.snrDb;
        peakEnergyRatio = skinAnalysis.snr.peakEnergyRatio;
        skinSpectrum = skinAnalysis.spectrum.bins;
        backgroundSpectrum = backgroundAnalysis?.spectrum.bins ?? [];
        skinPeakBpm = skinAnalysis.bpm;
        backgroundPeakBpm = backgroundAnalysis?.bpm ?? null;

        if (rawBpm !== null) {
          const alpha = clamp(0.12 + confidence * 0.26, 0.12, 0.38);
          bpmEmaRef.current = bpmEmaRef.current === null ? rawBpm : bpmEmaRef.current * (1 - alpha) + rawBpm * alpha;
        }

        if (elapsedMs >= CALIBRATION_MS && bpmEmaRef.current !== null) {
          visibleBpm = bpmEmaRef.current;
          if (now - lastHistoryRef.current >= HISTORY_INTERVAL_MS) {
            lastHistoryRef.current = now;
            historyPoint = {
              t: now,
              bpm: visibleBpm,
              confidence,
            };
          }
        }
      }

      const status = statusForFrame(face, elapsedMs, enoughWindow, confidence);

      setState((previous) => ({
        ...previous,
        mode: "camera",
        running: true,
        status,
        bpm: elapsedMs >= CALIBRATION_MS ? visibleBpm : null,
        rawBpm: elapsedMs >= CALIBRATION_MS ? rawBpm : null,
        confidence,
        snrDb,
        peakEnergyRatio,
        signalQuality: confidence,
        elapsedSeconds,
        calibrationRemaining,
        pulseWave: shouldUpdateWave ? normalizeWave(waveValuesRef.current) : previous.pulseWave,
        skinSpectrum,
        backgroundSpectrum,
        skinPeakBpm,
        backgroundPeakBpm,
        history: historyPoint ? [...previous.history, historyPoint].slice(-90) : previous.history,
        guidance,
        fps: frameTimesRef.current.length,
        faceScore,
        error: null,
      }));
      if (shouldUpdateWave) lastWaveUiRef.current = now;
    } else if (shouldUpdateWave) {
      setState((previous) => ({
        ...previous,
        mode: "camera",
        running: true,
        status: statusForFrame(face, elapsedMs, false, previous.confidence),
        elapsedSeconds,
        calibrationRemaining,
        pulseWave: normalizeWave(waveValuesRef.current),
        guidance,
        fps: frameTimesRef.current.length,
        faceScore,
      }));
      lastWaveUiRef.current = now;
    }

    animationRef.current = requestAnimationFrame(processFrame);
  }, []);

  const processDemoFrame = useCallback((now: number) => {
    if (!runningRef.current) return;

    const overlay = overlayRef.current;
    const demoCanvas = demoCanvasRef.current;

    if (!overlay || !demoCanvas) {
      animationRef.current = requestAnimationFrame(processDemoFrame);
      return;
    }

    const rois = drawDemoFrame(demoCanvas, now, startTimeRef.current);
    drawRoiOverlay(overlay, rois, DEMO_WIDTH, DEMO_HEIGHT);

    if (now - lastDemoSampleRef.current >= 1000 / 30) {
      lastDemoSampleRef.current = now;
      const { skin, background } = syntheticRgbSample(now, startTimeRef.current);
      skinSamplesRef.current.push(skin);
      backgroundSamplesRef.current.push(background);
      trimSamples(skinSamplesRef.current, now);
      trimSamples(backgroundSamplesRef.current, now);
      frameTimesRef.current.push(now);
      frameTimesRef.current = frameTimesRef.current.filter((time) => now - time <= 1000);

      const previousDc = greenDcRef.current ?? skin.g;
      const dc = previousDc * 0.985 + skin.g * 0.015;
      greenDcRef.current = dc;
      const acGreen = (skin.g - dc) / Math.max(1, dc);
      const filteredWave = waveFilterRef.current.process(acGreen);
      waveValuesRef.current.push(filteredWave);
      if (waveValuesRef.current.length > 260) {
        waveValuesRef.current.splice(0, waveValuesRef.current.length - 260);
      }
    }

    const elapsedMs = now - startTimeRef.current;
    const elapsedSeconds = elapsedMs / 1000;
    const calibrationRemaining = Math.max(0, (CALIBRATION_MS - elapsedMs) / 1000);
    const shouldAnalyze = now - lastAnalysisRef.current >= ANALYSIS_INTERVAL_MS;
    const shouldUpdateWave = now - lastWaveUiRef.current >= WAVE_UI_INTERVAL_MS;

    if (shouldAnalyze) {
      lastAnalysisRef.current = now;
      const skinWindow = recentSamples(skinSamplesRef.current, now);
      const backgroundWindow = recentSamples(backgroundSamplesRef.current, now);
      const enoughWindow = skinWindow.length >= 100 && durationSeconds(skinWindow) >= 4.8;
      let rawBpm: number | null = null;
      let visibleBpm: number | null = null;
      let confidence = 0;
      let snrDb = 0;
      let peakEnergyRatio = 0;
      let skinSpectrum: SpectrumBin[] = [];
      let backgroundSpectrum: SpectrumBin[] = [];
      let skinPeakBpm: number | null = null;
      let backgroundPeakBpm: number | null = null;
      let historyPoint: HistoryPoint | null = null;

      if (enoughWindow) {
        const skinAnalysis = analyzeRppgWindow(skinWindow);
        const backgroundAnalysis = analyzeRppgWindow(backgroundWindow);
        rawBpm = skinAnalysis.bpm;
        confidence = skinAnalysis.snr.confidence;
        snrDb = skinAnalysis.snr.snrDb;
        peakEnergyRatio = skinAnalysis.snr.peakEnergyRatio;
        skinSpectrum = skinAnalysis.spectrum.bins;
        backgroundSpectrum = backgroundAnalysis.spectrum.bins;
        skinPeakBpm = skinAnalysis.bpm;
        backgroundPeakBpm = backgroundAnalysis.bpm;

        if (rawBpm !== null) {
          const alpha = clamp(0.12 + confidence * 0.26, 0.12, 0.38);
          bpmEmaRef.current = bpmEmaRef.current === null ? rawBpm : bpmEmaRef.current * (1 - alpha) + rawBpm * alpha;
        }

        if (elapsedMs >= CALIBRATION_MS && bpmEmaRef.current !== null) {
          visibleBpm = bpmEmaRef.current;
          if (now - lastHistoryRef.current >= HISTORY_INTERVAL_MS) {
            lastHistoryRef.current = now;
            historyPoint = {
              t: now,
              bpm: visibleBpm,
              confidence,
            };
          }
        }
      }

      setState((previous) => ({
        ...previous,
        mode: "demo",
        running: true,
        status: elapsedMs < CALIBRATION_MS ? "CALIBRATING" : "DETECTING",
        bpm: elapsedMs >= CALIBRATION_MS ? visibleBpm : null,
        rawBpm: elapsedMs >= CALIBRATION_MS ? rawBpm : null,
        confidence,
        snrDb,
        peakEnergyRatio,
        signalQuality: confidence,
        elapsedSeconds,
        calibrationRemaining,
        pulseWave: shouldUpdateWave ? normalizeWave(waveValuesRef.current) : previous.pulseWave,
        skinSpectrum,
        backgroundSpectrum,
        skinPeakBpm,
        backgroundPeakBpm,
        history: historyPoint ? [...previous.history, historyPoint].slice(-90) : previous.history,
        guidance: {
          code: "GOOD",
          message: `Demo 模式：合成 ${DEMO_BPM} BPM 信号`,
          severity: "good",
        },
        fps: frameTimesRef.current.length,
        faceScore: 1,
        error: null,
      }));
      if (shouldUpdateWave) lastWaveUiRef.current = now;
    } else if (shouldUpdateWave) {
      setState((previous) => ({
        ...previous,
        mode: "demo",
        running: true,
        status: elapsedMs < CALIBRATION_MS ? "CALIBRATING" : "DETECTING",
        elapsedSeconds,
        calibrationRemaining,
        pulseWave: normalizeWave(waveValuesRef.current),
        guidance: {
          code: "GOOD",
          message: `Demo 模式：合成 ${DEMO_BPM} BPM 信号`,
          severity: "good",
        },
        fps: frameTimesRef.current.length,
        faceScore: 1,
      }));
      lastWaveUiRef.current = now;
    }

    animationRef.current = requestAnimationFrame(processDemoFrame);
  }, []);

  const stop = useCallback(() => {
    runningRef.current = false;
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    demoCanvasRef.current = null;

    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }

    if (overlayRef.current) {
      const context = overlayRef.current.getContext("2d");
      context?.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);
    }

    setState((previous) => ({
      ...INITIAL_STATE,
      history: previous.history,
      devices: previous.devices,
      selectedDeviceId: previous.selectedDeviceId,
      permissionState: previous.permissionState,
      secureContext: previous.secureContext,
      mediaDevicesSupported: previous.mediaDevicesSupported,
    }));
  }, []);

  const start = useCallback(async () => {
    if (runningRef.current || startingRef.current) return;

    const video = videoRef.current;
    if (!video) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setState((previous) => ({
        ...INITIAL_STATE,
        mode: "camera",
        status: "ERROR",
        devices: previous.devices,
        selectedDeviceId: previous.selectedDeviceId,
        permissionState: previous.permissionState,
        secureContext: previous.secureContext,
        mediaDevicesSupported: previous.mediaDevicesSupported,
        error: "当前浏览器不支持摄像头访问。",
      }));
      return;
    }

    startingRef.current = true;
    setState((previous) => ({
      ...INITIAL_STATE,
      mode: "camera",
      status: "LOADING",
      running: true,
      devices: previous.devices,
      selectedDeviceId: previous.selectedDeviceId,
      permissionState: previous.permissionState,
      secureContext: previous.secureContext,
      mediaDevicesSupported: previous.mediaDevicesSupported,
    }));

    try {
      resetMeasurement();
      await refreshDevices();

      if (!detectorRef.current) {
        detectorRef.current = await BrowserFaceDetector.create();
      }

      setState((previous) => ({
        ...previous,
        status: "CAMERA",
      }));

      const stream = await requestCameraStream(selectedDeviceIdRef.current);
      await refreshDevices();

      streamRef.current = stream;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;

      await new Promise<void>((resolve) => {
        if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
          resolve();
          return;
        }
        video.onloadedmetadata = () => resolve();
      });

      await video.play();
      startTimeRef.current = performance.now();
      runningRef.current = true;
      animationRef.current = requestAnimationFrame(processFrame);
    } catch (error) {
      console.error(error);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      const permissionState = await queryCameraPermission();
      setState((previous) => ({
        ...INITIAL_STATE,
        mode: "camera",
        status: "ERROR",
        devices: previous.devices,
        selectedDeviceId: previous.selectedDeviceId,
        permissionState,
        secureContext: previous.secureContext,
        mediaDevicesSupported: previous.mediaDevicesSupported,
        error: permissionState === "denied" ? blockedCameraMessage() : cameraErrorMessage(error),
      }));
    } finally {
      startingRef.current = false;
    }
  }, [processFrame, refreshDevices, resetMeasurement]);

  const startDemo = useCallback(async () => {
    if (runningRef.current || startingRef.current) return;

    const video = videoRef.current;
    if (!video) return;

    startingRef.current = true;
    setState((previous) => ({
      ...INITIAL_STATE,
      mode: "demo",
      status: "CALIBRATING",
      running: true,
      devices: previous.devices,
      selectedDeviceId: previous.selectedDeviceId,
      permissionState: previous.permissionState,
      secureContext: previous.secureContext,
      mediaDevicesSupported: previous.mediaDevicesSupported,
      guidance: {
        code: "GOOD",
        message: `Demo 模式：合成 ${DEMO_BPM} BPM 信号`,
        severity: "good",
      },
    }));

    try {
      resetMeasurement();
      const demoCanvas = document.createElement("canvas");
      demoCanvasRef.current = demoCanvas;
      const now = performance.now();
      startTimeRef.current = now;
      drawDemoFrame(demoCanvas, now, startTimeRef.current);

      if (!demoCanvas.captureStream) {
        throw new Error("当前浏览器不支持 canvas demo stream。");
      }

      const stream = demoCanvas.captureStream(30);
      streamRef.current = stream;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();

      runningRef.current = true;
      animationRef.current = requestAnimationFrame(processDemoFrame);
    } catch (error) {
      console.error(error);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setState((previous) => ({
        ...INITIAL_STATE,
        mode: "demo",
        status: "ERROR",
        devices: previous.devices,
        selectedDeviceId: previous.selectedDeviceId,
        permissionState: previous.permissionState,
        secureContext: previous.secureContext,
        mediaDevicesSupported: previous.mediaDevicesSupported,
        error: error instanceof Error ? error.message : "Demo 模式启动失败。",
      }));
    } finally {
      startingRef.current = false;
    }
  }, [processDemoFrame, resetMeasurement]);

  useEffect(() => {
    void refreshDevices();

    const handleDeviceChange = () => {
      void refreshDevices();
    };

    navigator.mediaDevices?.addEventListener?.("devicechange", handleDeviceChange);

    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", handleDeviceChange);
    };
  }, [refreshDevices]);

  useEffect(() => {
    return () => {
      stop();
      detectorRef.current?.dispose();
      detectorRef.current = null;
    };
  }, [stop]);

  return {
    videoRef,
    overlayRef,
    state,
    start,
    startDemo,
    stop,
    refreshDevices,
    setSelectedDeviceId,
  };
}

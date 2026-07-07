import { Activity, Gauge, Monitor, Signal, Timer, Video } from "lucide-react";
import type { PipelineState } from "../hooks/useRppgPipeline";

interface StatusPanelProps {
  state: PipelineState;
}

function statusText(state: PipelineState): string {
  if (state.mode === "demo" && state.status === "DETECTING") {
    return "DEMO SIGNAL";
  }

  switch (state.status) {
    case "LOADING":
      return "LOADING MEDIAPIPE";
    case "CAMERA":
      return "CAMERA INIT";
    case "CALIBRATING":
      return "CAL · WARMING UP";
    case "DETECTING":
      if (state.acceptedSignal) return "SIGNAL LOCKED";
      return state.bpm ? "DETECTING" : "ACQUIRING WINDOW";
    case "NO_FACE":
      return "NO FACE";
    case "LOW_SIGNAL":
      return "LOW SIGNAL";
    case "ERROR":
      return "ERROR";
    default:
      return "STANDBY";
  }
}

function cameraDiagnosticText(state: PipelineState): string | null {
  if (!state.mediaDevicesSupported) {
    return "当前浏览器不支持摄像头 API。";
  }

  if (state.permissionState === "denied") {
    return "浏览器已阻止摄像头权限。";
  }

  if (state.permissionState === "granted" && state.devices.length === 0) {
    return "摄像头权限已允许，但系统未向浏览器暴露任何视频输入设备。请先确认 Windows 相机应用能打开摄像头。";
  }

  if (!state.secureContext) {
    return "当前页面不是安全上下文，摄像头可能不可用。";
  }

  return null;
}

export function StatusPanel({ state }: StatusPanelProps) {
  const quality = Math.round(state.signalQuality * 100);
  const diagnosticText = cameraDiagnosticText(state);

  return (
    <section className="panel status-panel">
      <div className="panel-title">
        <Signal size={16} />
        <span>状态</span>
      </div>
      <div className="status-grid">
        <div className={`status-chip status-${state.status.toLowerCase()}`}>{statusText(state)}</div>
        <div className={`guidance guidance-${state.guidance.severity}`}>{state.guidance.message}</div>
      </div>
      <div className="metrics-row">
        <div className="metric">
          <Timer size={15} />
          <span>{state.elapsedSeconds.toFixed(1)}s</span>
        </div>
        <div className="metric">
          <Activity size={15} />
          <span>{state.fps} FPS</span>
        </div>
        <div className="metric">
          <Gauge size={15} />
          <span>{state.faceScore === null ? "--" : `${Math.round(state.faceScore * 100)}% FACE`}</span>
        </div>
      </div>
      <div className="metrics-row diagnostics-row">
        <div className="metric">
          <Monitor size={15} />
          <span>{state.mode.toUpperCase()}</span>
        </div>
        <div className="metric">
          <Video size={15} />
          <span>{state.devices.length} VIDEO INPUT</span>
        </div>
        <div className="metric">
          <Signal size={15} />
          <span>{state.secureContext && state.mediaDevicesSupported ? "BROWSER OK" : "BROWSER LIMITED"}</span>
        </div>
      </div>
      <div className="metrics-row vitals-row">
        <div className="metric">
          <Activity size={15} />
          <span>呼吸 {state.respirationRate === null ? "--" : `${state.respirationRate.toFixed(1)}/min`}</span>
        </div>
        <div className="metric">
          <Gauge size={15} />
          <span>RMSSD {state.hrv ? `${state.hrv.rmssd}ms` : "--"}</span>
        </div>
        <div className="metric">
          <Signal size={15} />
          <span>HRV {state.hrv ? state.hrv.stressIndex : "--"}</span>
        </div>
      </div>
      <div className="quality-block">
        <div className="quality-label">
          <span>信号质量</span>
          <span>{quality}%</span>
        </div>
        <div className="quality-track">
          <div className="quality-fill" style={{ width: `${quality}%` }} />
        </div>
      </div>
      <div className="snr-grid">
        <div>
          <span>SNR (HEART-BAND)</span>
          <strong>{state.snrDb.toFixed(1)} dB</strong>
        </div>
        <div>
          <span>PEAK ENERGY</span>
          <strong>{Math.round(state.peakEnergyRatio * 100)}%</strong>
        </div>
      </div>
      <div className="factor-grid">
        <div>
          <span>FACE</span>
          <strong>{Math.round(state.qualityFactors.face * 100)}%</strong>
        </div>
        <div>
          <span>TIMING</span>
          <strong>{Math.round(state.qualityFactors.timing * 100)}%</strong>
        </div>
        <div>
          <span>BG</span>
          <strong>{Math.round(state.qualityFactors.background * 100)}%</strong>
        </div>
      </div>
      <div className={`precision-hint ${state.acceptedSignal ? "precision-good" : "precision-warn"}`}>
        {state.precisionHint}
      </div>
      {diagnosticText && <div className="diagnostic-text">{diagnosticText}</div>}
      {state.error && <div className="error-text">{state.error}</div>}
    </section>
  );
}

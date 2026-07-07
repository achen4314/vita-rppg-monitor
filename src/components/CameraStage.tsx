import { Camera, FlaskConical, RefreshCcw, Square } from "lucide-react";
import type { RefObject } from "react";
import type { CameraDevice, PipelineState } from "../hooks/useRppgPipeline";
import { TrendChart, WaveChart } from "./Charts";

interface CameraStageProps {
  videoRef: RefObject<HTMLVideoElement>;
  overlayRef: RefObject<HTMLCanvasElement>;
  state: PipelineState;
  onStart: () => void;
  onStartDemo: () => void;
  onStop: () => void;
  devices: CameraDevice[];
  selectedDeviceId: string;
  permissionState: PermissionState | "unknown";
  onSelectDevice: (deviceId: string) => void;
  onRefreshDevices: () => void;
}

function permissionText(permissionState: PermissionState | "unknown"): string {
  switch (permissionState) {
    case "granted":
      return "CAMERA ALLOWED";
    case "denied":
      return "CAMERA BLOCKED";
    case "prompt":
      return "PERMISSION PROMPT";
    default:
      return "PERMISSION UNKNOWN";
  }
}

export function CameraStage({
  videoRef,
  overlayRef,
  state,
  onStart,
  onStartDemo,
  onStop,
  devices,
  selectedDeviceId,
  permissionState,
  onSelectDevice,
  onRefreshDevices,
}: CameraStageProps) {
  const liveQuality = Math.round(state.signalQuality * 100);
  const lockText = state.status === "CALIBRATING" ? `${state.calibrationRemaining.toFixed(1)}s` : state.acceptedSignal ? "LOCKED" : "WAIT";

  return (
    <section className="camera-stage">
      <div className="stage-header">
        <div>
          <div className="brand">VITA.IO</div>
          <div className="stage-subtitle">REMOTE PPG MONITOR</div>
        </div>
        <div className="stage-control-stack">
          <div className="camera-picker">
            <select
              aria-label="Camera device"
              value={selectedDeviceId}
              onChange={(event) => onSelectDevice(event.target.value)}
              disabled={state.running || devices.length === 0}
            >
              {devices.length === 0 ? (
                <option value="">未检测到摄像头</option>
              ) : (
                devices.map((device) => (
                  <option value={device.deviceId} key={device.deviceId}>
                    {device.label}
                  </option>
                ))
              )}
            </select>
            <button className="icon-only-button" type="button" onClick={onRefreshDevices} disabled={state.running}>
              <RefreshCcw size={16} />
            </button>
            <span className={`permission-pill permission-${permissionState}`}>{permissionText(permissionState)}</span>
          </div>
          <div className="stage-actions">
            <button className="icon-button primary" type="button" onClick={onStart} disabled={state.running}>
              <Camera size={17} />
              <span>START</span>
            </button>
            <button className="icon-button" type="button" onClick={onStartDemo} disabled={state.running}>
              <FlaskConical size={16} />
              <span>DEMO</span>
            </button>
            <button className="icon-button" type="button" onClick={onStop} disabled={!state.running}>
              <Square size={15} />
              <span>STOP</span>
            </button>
          </div>
        </div>
      </div>

      <div className="video-shell">
        <video ref={videoRef} className="camera-video mirrored" autoPlay muted playsInline />
        <canvas ref={overlayRef} className="roi-overlay mirrored" />
        <div className="scanline" />
        <div className="corner corner-tl" />
        <div className="corner corner-tr" />
        <div className="corner corner-bl" />
        <div className="corner corner-br" />
        <div className="background-tag">BG CTRL</div>
        <div className="roi-tag">ROI FACE</div>
      </div>

      <div className="live-chart-dock">
        <div className="live-card live-card-wave">
          <div className="live-card-title">
            <span>LIVE PULSE</span>
            <strong>{state.bpm === null ? "--" : `${state.bpm.toFixed(1)} BPM`}</strong>
          </div>
          <WaveChart values={state.pulseWave} compact />
        </div>
        <div className="live-card live-card-trend">
          <div className="live-card-title">
            <span>TREND</span>
            <strong>{Math.round(state.elapsedSeconds)}s</strong>
          </div>
          <TrendChart history={state.history} compact />
        </div>
        <div className="live-card live-card-lock">
          <div className="live-card-title">
            <span>LOCK</span>
            <strong>{lockText}</strong>
          </div>
          <div className="lock-meter" aria-label="Signal quality">
            <div className="lock-meter-fill" style={{ height: `${liveQuality}%` }} />
          </div>
          <div className="lock-readout">
            <span>QUALITY</span>
            <strong>{liveQuality}%</strong>
          </div>
          <div className="lock-readout">
            <span>SNR</span>
            <strong>{state.snrDb.toFixed(1)} dB</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
